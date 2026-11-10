# Crownturn product backlog

> Status: planning only; none of the unchecked items below is an implementation claim.
>
> Updated: 2026-11-09 · Game: https://crownturn.com
>
> Product goal: help one person invite a group, get them through a complete game, and give the group a reason to return.
>
> Delivery: branch → PR → checks → staging → manually approved production promotion, per [CI/CD plan](CI_CD.md). Do not bundle unreviewed gameplay changes with growth experiments.

## Growth objective and baseline

**North-star metric:** weekly active multiplayer groups — groups completing at least one game with **two or more human players** in a rolling seven-day window. Initially measure *unique rooms with multiplayer completions* as a transparent proxy; it may overcount groups that recreate rooms. Do not call this a stable group count until persistent group identity exists.

Supporting funnel:

1. Visitor → starts bot practice or creates/joins a room.
2. Room created → invite copied/shared → human invitee joins.
3. Multiplayer room → first complete game.
4. Completed game → optional result/challenge shared → another invitee joins.
5. Completed multiplayer room → same group returns for another session within seven days.

Track eligible events without storing players' names, personal messages, raw room codes, session tokens, or card data in analytics. Respect existing privacy policy and avoid adding a heavy dependency or write load to gameplay requests. Define baseline metrics *before* marketing experiments.

### Existing capabilities — enhance rather than rebuild

- Private room codes and a working **Copy invite** button currently exist in the room header.
- A bot-practice creation flow and computer seats already exist.
- Current-round ranks and **in-room cumulative scores** already exist. A *cross-session* group leaderboard would be different.
- Basic SEO/share preview and Cloudflare Web Analytics already exist; the missing piece is privacy-conscious *product funnel* measurement.

## Priority P0 — make invitations and the first game frictionless

### GROW-01 · Privacy-safe group activation funnel

Implementation is proposed in [the growth analytics design](GROWTH_ANALYTICS.md); this item is complete only after checks and staging validation, not merely a PR merge.
- [ ] Define event contract and metrics for: landing, practice started, room created, invite action, invite landing, human join, multiplayer game completed, repeat multiplayer group/room.
- [ ] Add lightweight event collection or aggregation with opt-in/consent handling wherever required; do not transmit player names, room codes, card holdings, raw URLs with room identifiers, or session credentials.
- [ ] Document event definitions, bot vs human counting, source attribution (e.g. invite vs community), and a simple dashboard/query.
- [ ] Acceptance: a test journey can be followed from visit to multiplayer completion in aggregate; no personally identifying or game-private information appears in event payloads; analytics failure cannot interrupt the game.
- **Why first:** know whether sharing creates real multiplayer sessions rather than just clicks.

### GROW-02 · One-tap mobile share for an existing room

Implementation proposed in [Invitation Sharing](INVITATION_SHARING.md); mark complete after PR CI and mobile staging acceptance.
- [ ] Extend the existing **Copy invite** control with native system sharing where available (including WhatsApp via the system share sheet); retain one-tap copy as a reliable fallback.
- [ ] Use an inviting, localized message (EN/NL/UK) containing the room link and short description; do not include players' names or game secrets.
- [ ] Place the action near available seats in the lobby and keep it accessible during play without covering cards or table actions.
- [ ] Acceptance: mobile sharing, desktop copying, browser share cancellation, and clipboard-permission fallback work; links resolve to the intended room; 4–8 seat and small-screen layouts remain usable.
- **Dependency:** none; existing invite button is the starting point.

### GROW-03 · Invitation landing and easy joining
- [ ] Improve the `?room=CODE` journey: prefill the intended room, show a clear nickname/join CTA, and explain the game briefly without forcing sign-up.
- [ ] If a saved session is already in another room, offer an **explicit** choice to return or switch; never silently abandon a seat or join a different room.
- [ ] Give actionable messages for expired, full, nonexistent, or unavailable rooms.
- [ ] Acceptance: a newcomer can join a valid invitation on mobile without manually retyping its code; returning players do not lose the saved-room recovery flow; automated link/room edge-case tests pass.
- **Dependency:** coordinate with the pre-existing recent-room-switching backlog item.

### GROW-04 · First-game onboarding and low-friction practice
- [ ] Make **Try a table with computer players** easy to find on the landing page; clarify this is a practice game with no friend invitation required.
- [ ] Provide a short, optional intro explaining the objective and first interaction; offer a clear next step to create/share a real group room after practice or results.
- [ ] Acceptance: a first-time visitor can start playing without an account; returning users are not forced to repeat onboarding; translated guidance works on mobile; onboarding does not block an invited guest.
- **Dependency:** reuse existing computer opponents and guidance.

## Priority P1 — turn a good game into another invitation

### GROW-05 · Shareable end-of-game recap and friendly challenge
- [ ] Offer a voluntary **Share result / Challenge friends** action at results (not an interrupting popup).
- [ ] Start with a compact localized text recap and reusable invitation/challenge link; consider an image card only after confirming text sharing works.
- [ ] Default to anonymous or generalized result text. Never put other players' names or their private results into public shares without clear consent.
- [ ] Acceptance: works in EN/NL/UK, copy/native share fallback, phone layout and 8-player sessions; the link opens a useful destination; no results or personal data are automatically posted.
- **Dependency:** GROW-02 and GROW-03.

### GROW-06 · Rematch and re-invite from results
- [ ] Keep the existing next-round flow intact while making **Play again** / **Invite friends to a rematch** discoverable when a completed game is shown.
- [ ] Use the current room when feasible; clearly distinguish continuing a round in the same group from starting a fresh match.
- [ ] Acceptance: two or more humans can finish and begin another session without recreating their group unnecessarily; absent-player and bot-substitution cases are handled; no one is auto-invited or spammed.
- **Dependency:** GROW-03, existing results/host flow.

### GROW-07 · Recent tables and explicit room switching
- [ ] Carry forward the previously deferred **Recent tables and room switching** item, aligning it with invitations and reconnect safety.
- [ ] Show a compact list of recently visited rooms stored locally; allow explicit return or switch, warn before leaving an active table, and handle expired entries.
- [ ] Acceptance: no accidental cross-room joins, no exposure of another room's private session or cards, and reliable recovery after refresh.
- **Dependency:** GROW-03 and existing session recovery behavior.

## Priority P2 — strengthen group retention after validating P0/P1

### GROW-08 · Persistent group identity and cross-session leaderboard
- [ ] Research a lightweight, opt-in way to identify a recurring group **without requiring accounts**, and distinguish it from the already-shipped in-room cumulative scoreboard.
- [ ] Specify privacy, nickname collisions, group ownership, retention/deletion, missing players, and what happens if the room expires before any schema change.
- [ ] Acceptance (design): clear consent/privacy rules, retention policy and data model reviewed; only then implement a cross-session group leaderboard.
- **Dependency:** validated repeat-game demand and measurement.

### GROW-09 · Optional group challenge/rematch scheduling
- [ ] Explore a user-initiated shareable reminder/challenge (e.g. calendar text/link), not unsolicited emails, notifications, or contact harvesting.
- [ ] Acceptance: users explicitly choose to share; no platform-initiated messages to other players; easy return to a valid playable room.
- **Dependency:** GROW-05/06; prioritize only if groups ask for it.

## Priority P3 — consider after there are enough players

### GROW-10 · Public matchmaking discovery
- [ ] Evaluate public tables/queue only after active concurrency and moderation/safety requirements are understood; retain private rooms as the default.
- [ ] Design for the cold-start problem: avoid empty lobbies and misleading online counts, allow bots where appropriate, and prevent harassment.
- [ ] Acceptance: a written liquidity threshold, abuse-prevention approach, and user experience plan before implementation.
- **Not part of initial growth experiment.**

## Previously deferred product work (kept visible; not new growth features)

These were recorded in earlier planning discussions; reconcile against the old local plan before treating this section as a full migration:

- [ ] Clearer turn/pass/trick-winner feedback when it improves understanding rather than adding noisy banners.
- [ ] Contextual taxation guidance.
- [ ] Optional focus/full-screen mode and nonintrusive event/history access on mobile, if still needed after the shipped table redesign.
- [ ] Contact form as an alternative to the already available help/feedback email; assess spam/privacy costs before implementing.
- [ ] Recent tables/room switching — tracked above as GROW-07.
- Staging and controlled release are **CI/CD work**, tracked in [CI_CD.md](CI_CD.md), not duplicate feature backlog entries.

## Rollout and experiment plan

**First increment:** GROW-01 → GROW-02 + GROW-03 → GROW-04. Release behind the usual staging and manual production gates. Test on mobile and desktop; EN/NL/UK; lobby, in-progress, results, full/expired rooms, offline/reconnect, 4–8 seats, and rooms containing bots.

**Next increment:** GROW-05 and GROW-06 (plus GROW-07 where needed).

**Pilot:** invite 3–5 existing social groups and compare in aggregate: rooms created, human seats per room, multiplayer completion rate, unique rooms completing a later session, and invite landing-to-join conversion. Treat web visits as a diagnostic, not the success metric. Initial directional target: 10 groups/rooms completing multiplayer games regularly; reassess after observing actual usage.

**Guardrails:** no dark patterns or unsolicited invitations; do not show personal/game-private data in shares or analytics; preserve existing room/session behavior; no public matchmaking prematurely; no production release without approval.
