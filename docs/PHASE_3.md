# Phase 3 — reliability gates, mobile E2E and recovery readiness

**Status:** Phase 3 changes under review. No production deployment is automatic.

## Scope and acceptance

The first release-quality slice adds:

- A live staging D1/API test (8 players, ninth-seat rejection, no opponent-hand leakage, tax resolution, bot progression, legal play and session re-poll).
- Two independent real Chromium browser contexts at mobile 390px and 320px, testing join, eight visible seats, layout overflow, round ranks, score and round-information dialogs, and both players reconnecting after refresh.
- Legacy stored-room JSON compatibility tests using a frozen fixture missing newer progress and action-receipt fields, covering safe resume, round progression, duplicate action replay and no bot session leakage.
- A scheduled read-only synthetic health check for both production and staging (every 30 minutes plus manual run).
- A documented staging recovery rehearsal, separate from production recovery.

## Promotion gate

Both live staging tests run **after** the Worker is deployed and after the basic staging smoke check, **before** `staging-proof` is created. If any E2E test fails, the workflow is red and **no staging-proof artifact is published**, so the production release preflight cannot accept that run. The Worker may already be deployed in staging: inspect logs before rerunning.

The browser installer uses pinned `playwright@1.56.1` installed in GitHub's temporary directory, not in the application's dependency tree or release artifact. The browser tests do **not** run against production. One newly created test room per API/browser test is intentionally short-lived and cleaned up through the existing staging room-expiry policy.

Artifacts: if the browser test fails, `staging-e2e-failure` contains mobile screenshots. Screenshots contain test-only names and room codes; retain seven days and do not post into public support threads.

### CI versus staging

`Game CI` remains Cloudflare read-only: it runs unit/compatibility/safety checks but **not live staging mutations**. On a successful main CI run, the staging workflow downloads the exact artifact, deploys it, and then runs the live API/Chromium tests. Production continues promoting the same tested artifact only after manual approval.

### Local execution

```sh
node tests/room-compatibility.mjs
node tests/phase3-safety.mjs
node scripts/monitor-endpoints.mjs     # read-only; checks production and staging
# Live, destructive-to-staging-test-rooms only:
node tests/staging-api-e2e.mjs
CROWNTURN_PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node tests/staging-browser.mjs
```

Never run live E2E scripts against `crownturn.com`. Both scripts hard-code and validate the staging workers.dev origin. Do not use production credentials for these tests.

## Monitoring and notifications

The `Crownturn synthetic health monitor` GitHub Actions workflow checks `/api/health` and homepage on both hosts every 30 minutes. It verifies full release tags, D1/rate-limit availability, origin identity and non-indexing of staging. It retries transient problems twice before failing.

The monitor **does not** collect user analytics, read rooms, call mutating APIs, or send messages through external services. For notifications, enable failed-workflow notifications under your GitHub account's notification preferences and watch the repository's Actions; GitHub Actions scheduling is best-effort and not a real-time pager. For critical alerting, integrate a dedicated external uptime service with an owned notification channel in a later iteration.

## Backward compatibility guard

The frozen `tests/fixtures/legacy-room-v1.json` represents a previously valid room without `receipts`, `lastProgressAt` and newer computer scheduling fields. The test loads it into a D1-like SQLite database and processes it using the **current** server service.

When changing the room schema, add a sanitized fixture representing the prior release and extend the compatibility tests. Do not just update a failing old fixture to the newest shape. Verify old browser sessions and idempotency, and separately review D1 migration compatibility; static migration checks cannot prove room JSON compatibility.

## Recovery rehearsal

1. Record the current staging Worker version UUID, the previous known-working staging version UUID and its full release tag from Cloudflare Deployments.
2. Verify the target version remains available, is tagged with the expected full SHA, and can read the current staging D1 schema and room JSON. A Worker version restoration cannot undo D1 mutations.
3. Use the manual staging recovery verification workflow (if available) in **verify** mode first; this makes no changes.
4. For a deliberate staging rollback rehearsal, coordinate a brief staging test interruption, pause staging deployments, restore the known-good version **only on staging**, then verify health and gameplay. Re-deploy the currently validated release afterward and repeat E2E checks so production promotion proof refers to the currently healthy staging version.
5. For production, use [RECOVERY.md](RECOVERY.md). Recovery `verify` is read-only; a production `restore` is for incidents only and requires both deployment switches paused. Never do a routine rollback rehearsal against a live production game.

## Phase 3 exit criteria

- [ ] New PR CI and legacy room compatibility tests pass.
- [ ] First post-merge automatic staging run passes all live API and browser E2E tests.
- [ ] No horizontal page overflow at 320/390px with eight players.
- [ ] Staging-proof published only after the live tests pass.
- [ ] Synthetic monitoring has succeeded once and its failure-notification path is configured.
- [ ] A staging-only recovery verify succeeds; staged restore/roll-forward rehearsal is completed or documented as an explicitly deferred operational exercise.
- [ ] Production release workflow remains manual, gated and unchanged.

Current production release baseline (recorded 2026-11-06): `884d9cd5a01552da53f390b4202c3187a6770a15`, Worker version `b1b8a103-7cbf-43a8-b059-32f67e4cac00`. Verify the active deployment from Cloudflare before relying on it for recovery.
