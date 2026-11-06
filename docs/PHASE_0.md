# Phase 0 runbook — secure existing production deployment

**Status:** Phase 0 implementation proposed on branch `ci/phase-0-production-safety`; not complete until reviewed, merged and verified.  
**Agreed strategy:** [CI/CD implementation plan, PR #7](https://github.com/JimmyUA/dalmuti-family/pull/7).  
**Production:** https://crownturn.com/ · Worker: `dalmuti-family` · D1: `dalmuti-family`.

## Purpose

Make ordinary commits/merges to `main` incapable of automatically deploying production code or running remote D1 migrations, before adding staging and manually approved release promotion. Preserve manual emergency restoration of an existing Cloudflare Worker version.

## Baseline recorded from GitHub Actions

As of **2026-11-06**, the most recent successful production deployment visible in GitHub Actions is the **2026-11-04** `Game CI` run:

| Field | Value |
|---|---|
| GitHub Actions evidence | [Run 41825660766](https://github.com/JimmyUA/dalmuti-family/actions/runs/41825660766) |
| Deployed commit SHA (per log) | `d0516b276fe07c2d28220d155e501f8d4e54ecda` |
| Cloudflare version UUID (per log) | `be2c408a-4342-4b0c-b35b-7a1fb9f2a343` |
| Deployment step | Successful |
| Production smoke check | Successful |

Earlier **historical** deployment candidates, **not yet confirmed as currently retained, known-good or rollback-compatible**:

| Evidence | Commit SHA | Version UUID |
|---|---|---|
| [Run 41824210056](https://github.com/JimmyUA/dalmuti-family/actions/runs/41824210056) | `316c79cfc1181293fb4d41b8b098652195c07051` | `bec9ce66-1641-4fa2-9111-1104cbc457e2` |
| [Run 41823247032](https://github.com/JimmyUA/dalmuti-family/actions/runs/41823247032) | `5855b8992ad89b27721400b2239937ee03b5b7f5` | `75f6d6df-57d6-4cf8-bdc6-9ccffab539e4` |

**These are log records, not an authoritative view of live Cloudflare traffic.** Before treating any version as current or recoverable, read Cloudflare **Workers & Pages → dalmuti-family → Deployments**, confirm the active deployment receives 100% traffic, inspect its version ID/tag, and check the application's release diagnostics. A previous successful deployment is not automatically a safe rollback target: verify compatibility with the *current* D1 schema, stored room JSON, client actions and bindings.

## Changes in this PR

- `.github/workflows/ci.yml`: remove the entire conditional production deployment step including remote D1 migration, Wrangler deployment and post-deploy smoke check. CI keeps the existing test/build checks.
- Keep CI concurrency independent from the `crownturn-production` recovery group; CI no longer needs to serialize against production operations.
- `tests/pipeline-safety.mjs`: fail CI if Cloudflare deployment credentials, legacy deployment commands or the production concurrency group are reintroduced into normal CI; ensure the manual recovery workflow and recovery tests still exist.
- `docs/DEPLOYMENT.md`: mark the previous automatic deployment instructions as historical while staging and approved release workflows are being introduced.
- **Leave `.github/workflows/recovery.yml`, `scripts/recover-production.mjs`, and `tests/recovery.mjs` unchanged.**

No Worker, D1 database, Cloudflare route, production secret or `DEPLOY_ENABLED` setting is modified by this PR.

## Operator handover — before merging

1. In Cloudflare, record the actual **currently active** 100%-traffic Worker version UUID, full release SHA, current D1 migration state and release diagnostics. Compare them with the historical baseline above and update your incident notes if changed.
2. Select and verify an actual **known-working rollback target** that still exists in Cloudflare history. Check its code against today's D1 schema and stored rooms; run **Production recovery → verify** with the current UUID, target UUID and target full release SHA. `verify` is read-only.
3. In GitHub, open **Settings → Secrets and variables → Actions → Variables**. Set `DEPLOY_ENABLED=false`. This is required for the existing recovery procedure and prevents any *old* workflow still running with the legacy code from starting a new deployment.
4. Check **Actions** for queued or active `Game CI` deployments and wait for them to finish or cancel as appropriate. Workflow concurrency does not guarantee queue ordering; changing a variable does not retroactively change a run's already captured state. Avoid manual Wrangler deployments during the handover.
5. Review and merge the Phase 0 PR only after the preceding safety checks. The merged version of `ci.yml` must contain **no** production deployment step.

## Operator verification — after merging

1. Inspect the `Game CI` run for the merge commit on `main`. Confirm the pipeline-safety test, strategy, table events, reliability, recovery tests, production build and Worker routing checks succeed.
2. Confirm the main workflow has **no** `Deploy production from main` step, and does not reference Cloudflare credentials or remote migrations. Running `Game CI` manually on `main` must also be check-only.
3. Confirm Cloudflare's active production Worker version UUID and full SHA **have not changed** because of the merge, and no D1 migrations have been applied.
4. Confirm the `Production recovery` manual workflow still appears in GitHub Actions and that read-only `verify` works with the recorded current and known-good versions.
5. Keep `DEPLOY_ENABLED=false` throughout the transition. The old recovery script deliberately refuses `restore` while that flag is not exactly `false`.
6. Merge the documentation plan PR #7 when ready. Then proceed to Phase 1: staging Worker and separate staging D1.

## Acceptance criteria

- [ ] Active production version confirmed from Cloudflare (not only CI logs).
- [ ] Existing known-good recovery target confirmed and compatibility checked.
- [ ] `DEPLOY_ENABLED=false` confirmed; no in-flight old deployments.
- [ ] Phase 0 PR merged to `main`.
- [ ] Successful check-only `main` CI; production Worker and D1 unchanged.
- [ ] Manual recovery verify rehearsal succeeds without production changes.

## Emergency notes

- **Do not casually revert the Phase 0 CI change**: reverting would reintroduce production auto-deployment if the legacy `DEPLOY_ENABLED` flag were enabled.
- For a Worker incident, follow [RECOVERY.md](RECOVERY.md). Its verified `restore` mode requires a paused deployment flag, expected active version, target release tag and compatibility checks; it restores a previously deployed Worker version, **not D1 data**.
- For a database incident, assess D1 Time Travel as a separate, explicitly approved recovery action. A code rollback cannot undo D1 migrations or recover deleted rooms.

## Scope boundaries

This phase intentionally does **not** create staging, introduce production releases, rotate tokens, configure branch protection, auto-rollback, or change existing games. Those tasks belong to later phases or manual GitHub administration.
