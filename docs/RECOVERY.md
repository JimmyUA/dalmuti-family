# Production recovery

Use **Actions → Production recovery → Run workflow**, selecting `main`. The default `verify` mode reads Cloudflare version metadata only. It does not change the Worker or database. Recovery uses the existing Cloudflare API token and account variable; it needs Workers Scripts Edit, but does not call D1 or apply migrations.

## Record a known-working release

After Game CI succeeds, record the full Git commit SHA and the **Cloudflare version UUID** from the deployment log/history. They are different identifiers. New deployments carry the full commit SHA as their version tag. Confirm the release in game Diagnostics, then play a round with people and computers, reconnect, and check Worker errors before treating it as known-working.

Automated recovery accepts only versions tagged by this deployment pipeline. Older untagged releases cannot be verified automatically; use Cloudflare's dashboard only after independently checking their source and compatibility. Cloudflare retains a limited version history, so do not assume an old release remains available indefinitely.

## Rehearse without changing production

1. Open the Worker's Deployments history in Cloudflare and copy the current version UUID (100% traffic).
2. Choose a known-working target version UUID and its full commit SHA.
3. Run Production recovery on `main` with mode `verify` and those three values. The run must succeed with “production unchanged.” This checks metadata and the current deployment, not runtime health or database compatibility of an inactive version.

## Restore production

1. Set the Actions repository variable `DEPLOY_ENABLED` to `false`. Cancel queued Game CI runs and let any running deployment finish; changing a variable does not retroactively change a run's captured configuration. Do not push or manually deploy during recovery. Both workflows share a production concurrency group, but GitHub does not guarantee queue order.
2. Check migration history and target source. The old code must accept today's database schema **and stored room JSON**, API actions and browser sessions. In particular, retain room expiry schema support and round-scoped action compatibility. If compatibility is uncertain, deploy a forward fix instead.
3. Review the target's bindings, secrets and room expiry variables. Versions include assets and configuration; restoring may restore old expiry settings. Database contents, deleted rooms and migrations are not restored. Deleted bindings or changed secrets may prevent recovery; the script does not force past these failures.
4. Refresh the current version UUID after deployments stop. Run `verify`, then run again with the same inputs and mode `restore`. Recovery refuses to restore while `DEPLOY_ENABLED` is anything other than `false`, when the current version changed, when traffic is split, or when the target tag disagrees with the release SHA.
5. Read the result. The script deploys the existing version to 100% traffic, then checks deployment history, health (release SHA, database and rate limits), the game page, and API release headers. Allow propagation time. If the run fails after submission, the recovery may already be live: inspect Cloudflare history and Diagnostics before retrying. It never automatically reverses a recovery.
6. Open a fresh browser tab, check Diagnostics matches the target SHA, reconnect an existing room and play a round on mobile. Check Worker errors and that the visible assets behave correctly; the automated page check establishes availability, not complete UI correctness.
7. Keep automatic deployment paused until `main` contains the corrective change or intentional revert. Test it, then re-enable `DEPLOY_ENABLED=true` and run Game CI. Otherwise the next deployment can put the broken release back.

A healthy rehearsal is safe to repeat after each known-working release. A live restore is an incident action, not a required test of this setup. No live restore was performed when adding this workflow.

## Database incidents

Worker recovery never reverses migrations or restores D1 data. Do not delete migration records or rerun old schemas. Preserve evidence and assess D1 Time Travel separately if data itself is damaged; a database restore affects all rooms and needs a separate recovery decision. Expired room deletion is intentional and cannot be undone by this workflow.

References: [Cloudflare rollback behavior](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/), [versioned resources](https://developers.cloudflare.com/workers/versions-and-deployments/), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
