# GROW-01: aggregate product analytics

Status: implemented on a feature branch; release still requires passing CI, isolated staging checks and manual production approval. This is not a live-data report.

## Design and privacy

Crownturn keeps using Cloudflare Web Analytics for broad traffic/performance. GROW-01 adds **anonymous, daily aggregate event counts** in its existing Cloudflare D1 database, not per-player event history. No new external analytics provider or account is required.

- One `growth_daily` row holds only **UTC day, fixed event name, fixed acquisition-source category, and integer total**. The primary key is `(day,event,source)`.
- Never write player names, emails, room codes, session/request IDs, hands, moves, scores, full URL/query strings, referrers, IPs or hashed identifiers to `growth_daily`.
- Browser events use a fixed `/api/growth` URL, `credentials:'omit'` and `referrerPolicy:'no-referrer'`. Only the strictly validated `event` and allowlisted `source` fields are sent. There are no analytics cookies, persistent visitor IDs or client analytics storage.
- The existing Cloudflare native **room-creation limiter** enforces a separate hashed-IP key for these optional requests (10 requests/minute per network/location, independent of the room-create key). The server rejects cross-site requests, unexpected payload fields/events/sources, wrong content types and bodies over 160 bytes. This is basic abuse reduction, not a fraud-proof metric.
- Game events are derived **only after a successful room insert or compare-and-swap state change**. Retries, stale actions and rejoining an already-held seat cannot increment counters again. Test-mode rooms are excluded from server game metrics.
- `growthWeekStart` and `growthLastCompletionAt` are small **private room-state markers** for deduplication; they are stripped from public snapshots and are removed when rooms expire. Room codes and IDs are never copied to the aggregate table.
- Counter writes are *best effort*. If D1 analytics writes fail, gameplay still succeeds; some totals may be missing. Analytics calls are not a source of truth for payments or enforcement.
- The existing scheduled Worker cleanup also removes aggregate rows **older than 90 UTC days**. Hosting logs and backups have separate retention.
- See the updated EN/UK/NL static privacy notice before releasing.

## Event contract

| Event | Trigger and meaning | Source |
|---|---|---|
| `landing_loaded` | Main game page loaded without a valid six-character invitation URL; reloads count again | Allowed UTM source or `direct` |
| `invite_landing` | Main game page loaded with a valid-format `?room=` parameter; not proof the code exists or a join occurred | Allowed UTM source or `invite` |
| `invite_copied` | User successfully copied an invitation from a normal room; this **does not prove it was shared** | `invite` |
| `invite_shared` | The native device share API resolved without an error; **does not prove message delivery or that anyone joined** | `invite` |
| `room_created` | Server committed a new non-practice, non-test room | `server` |
| `practice_started` | Server committed a new bot-practice room (creation, not a completed match) | `server` |
| `human_joined` | Server committed a **new** human seat in a non-test room; this might be a manually entered code | `server` |
| `multiplayer_completed` | New transition to results with at least two currently human-controlled seats; counts **completed rounds**, not distinct users | `server` |
| `weekly_active_room` | First qualifying completed multiplayer round for this room in the UTC Monday–Sunday week; counted at most once per room per UTC week | `server` |
| `return_room` | Another qualifying round completed in the same room 12 hours to 7 days after its previous completion; **rough retention proxy**, not confirmed return of the exact same people | `server` |

Browser source classification recognizes `utm_source=reddit`, `linkedin`, `community` or `other`; unknown or untrusted source values are not transmitted and use `direct` (or `invite` for room-link landings). Source cannot be used to link a join to an individual invite. Server events use only `server`.

**North-star reporting caveats:** `weekly_active_room` is an exact counter of qualifying **room-week completions that were successfully recorded**, not stable groups or rolling-seven-day distinct people. Groups may create multiple rooms. Because results rooms normally expire after 24 hours of inactivity, `return_room` only captures repeat games before room expiry; a recreated room cannot be linked without introducing group identity. Never publish a precise invitation conversion percentage or distinct-person retention rate from this anonymous data.

## Read-only reporting

After migration and deployment, use **Cloudflare dashboard → Workers & Pages → D1 → selected database → Console**, or read-only Wrangler D1 queries against the verified **staging** or **production** database. Do not run write SQL from reporting tools. Staging and production are isolated; test-mode game sessions do not add server milestones.

Last 14 UTC days by event and source:

```sql
SELECT day, event, source, SUM(total) AS events
FROM growth_daily
WHERE day >= date('now', '-13 day')
GROUP BY day, event, source
ORDER BY day DESC, event, source;
```

Current **UTC calendar-week** active multiplayer rooms (Monday through Sunday, always calculated in UTC):

```sql
WITH week AS (
  SELECT date('now', '-' || ((CAST(strftime('%w','now') AS INTEGER) + 6) % 7) || ' days') AS monday
)
SELECT COALESCE(SUM(g.total), 0) AS weekly_active_rooms
FROM growth_daily AS g, week
WHERE g.event = 'weekly_active_room'
  AND g.day >= week.monday
  AND g.day < date(week.monday, '+7 days');
```

Compare major funnel stages over the same 7-day window:

```sql
SELECT event, COALESCE(SUM(total), 0) AS events
FROM growth_daily
WHERE day >= date('now', '-6 day')
GROUP BY event ORDER BY event;
```

These are event totals, **not** a per-user linked funnel. Cloudflare Web Analytics is the complementary source for page-visit estimates and referrers.

## Migration, validation and rollback

- Additive SQL migration: `drizzle/0003_growth_daily.sql`. The application still works if the table is temporarily unavailable; counters will be incomplete until migrated. Use the existing staging migration and guarded production-release workflows; no direct production deployment is part of this work.
- Test with `node tests/growth-analytics.mjs`, `node tests/reliability.mjs`, `node tests/room-compatibility.mjs`, `pnpm build:production`, `node tests/production.mjs`. CI also runs the established safety tests.
- Staging acceptance: verify migration, produce a normal two-human multiplayer room (not test-mode), check aggregate counts increase; verify a duplicate action does not increment; confirm public API responses contain no private analytics markers; check a copied invite increments anonymously; verify staging uses its own D1 and no production writes occur.
- Release rollback restores the previous Worker version; the additive `growth_daily` table can safely remain unused. No destructive migration or schema rollback is required.
- Analytics availability must not block game actions, refresh/reconnect, computer moves or cleanups.
