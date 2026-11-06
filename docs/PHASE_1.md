# Phase 1 — isolated staging environment

**Status:** Setup instructions and implementation. Phase 1 is not complete until a staging D1, staging credentials, and the first staging Worker deployment have been verified.
**Related:** [CI/CD strategy and implementation plan (PR #7)](https://github.com/JimmyUA/dalmuti-family/pull/7), [Phase 0 runbook](PHASE_0.md), [Production recovery](RECOVERY.md).

## Goal and safety contract

Introduce a permanent staging environment without changing the production Worker, its D1 database, Cloudflare routes, production API token, or production recovery procedure.

| Resource | Production (unchanged) | Staging (new) |
|---|---|---|
| Worker | `dalmuti-family` | `dalmuti-family-staging` |
| D1 database | `dalmuti-family` | `dalmuti-family-staging` |
| Worker host | `crownturn.com` / existing workers.dev | `dalmuti-family-staging.<account-subdomain>.workers.dev` |
| Custom hostname | `crownturn.com` | `staging.crownturn.com` (optional after initial bootstrap) |
| GitHub token | Existing production secret, not used in this workflow | `CLOUDFLARE_STAGING_API_TOKEN` (a **different** token) |
| GitHub workflow | None for release yet (Phase 0 keeps CI check-only) | `Staging deployment (manual bootstrap)` |
| D1 migration destination | Production only through a future approved release | Staging only via `staging-deploy.json` |
| Cloudflare Worker static assets | Existing fast path | All requests routed through staging Worker for `noindex` headers |
| Rate limiter namespace IDs | `730001` ... `730004` | `740001` ... `740004` |

**Fail-closed staging guard:** `scripts/prepare-cloudflare-deploy.mjs` requires `CROWNTURN_DEPLOY_TARGET=staging`, both production and staging D1 UUIDs, and refuses identical values. It writes `dist/server/staging-deploy.json` with the staging Worker name and DB binding `DB`. There is no default environment; the config generator must be explicitly given `staging` or `production`.

The staging workflow uses **only** the staging deployment config, not `github-deploy.json`, and **only** the `CLOUDFLARE_STAGING_API_TOKEN` secret. It never references the existing production API token.

## One-time Cloudflare setup (operator)

1. Sign in to the Cloudflare account that owns the live project. Open **Storage & databases → D1 SQL Database** (dashboard labels may vary).
2. Create a **new**, empty D1 database named exactly `dalmuti-family-staging`. Do **not** duplicate, restore, import or overwrite the production database; staging must contain test data only.
3. Record the UUID of the newly created staging database. Compare it with the production D1 UUID in the GitHub repository variable `CLOUDFLARE_D1_DATABASE_ID`. The IDs must differ.
4. Create a **new** Cloudflare API token for the same account with permission to deploy Workers and apply D1 migrations (typically Workers Scripts: Edit and D1: Edit; Wrangler may also require Account Settings: Read). Use this token for **staging only**. Avoid reusing the production token.
5. The staging Worker does not have to be created manually. The first successful Wrangler deployment creates or updates the Worker named `dalmuti-family-staging`. Leave the production Worker and routes alone.

### One-time GitHub setup (operator)

1. Open **Repository → Settings → Environments**. Create an environment named exactly `staging`. No production reviewers or secrets should be inherited into this environment.
2. Within **staging → Environment secrets**, add `CLOUDFLARE_STAGING_API_TOKEN` with the new Cloudflare token. **Do not** name it `CLOUDFLARE_API_TOKEN`; that name is reserved for legacy production usage.
3. Within **staging → Environment variables**, add `CLOUDFLARE_STAGING_D1_DATABASE_ID` containing the new staging UUID.
4. Keep existing repository variables `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_D1_DATABASE_ID` as they are. The production UUID is used by the staging generator only for mismatch detection and **is never selected for staging migrations**.
5. Keep `DEPLOY_ENABLED=false`. Manual staging uses `staging.yml`, not that legacy toggle. The production recovery runbook still needs the disabled value.

Check that the `staging` environment is configured before starting the deployment workflow.

## First staging deployment (operator)

After the Phase 1 PR is merged and the environment above is configured:

1. Open **Actions → Staging deployment (manual bootstrap) → Run workflow**.
2. Select the **main** branch, then run it. Phase 1 does not run staging deployments automatically on merge: that is planned for Phase 2.
3. The workflow checks the staging secret/IDs, runs tests, builds the Worker/assets, generates `dist/server/staging-deploy.json`, applies migrations **only to the staging D1**, deploys **only** `dalmuti-family-staging`, and runs the staging smoke check.
4. Copy the deployed staging workers.dev URL from the run log.
5. In Cloudflare, verify the newly created Worker has `DB` bound to `dalmuti-family-staging`; separately verify the production Worker remains bound to `dalmuti-family` and its active release has not changed.
6. Visit the staging URL. Verify that room creation, joining from another browser/device, play/pass, bot opponents, inter-round scoring, revolution, and reconnect all work.
7. For the staging root, a guide HTML page, and `/api/health`, confirm the `X-Robots-Tag: noindex, nofollow` and `X-Crownturn-Environment: staging` headers. The staging smoke check validates the root, health and game API automatically.
8. If desired, add `staging.crownturn.com` as a custom domain for the **staging Worker only**, then check hostname routing and those headers on the custom domain. Do not change existing `crownturn.com` or production Worker routes.

### Staging application checks (acceptance)

- A 4-player room with humans/bots can finish a round and advance to the next round.
- A maximum 8-player game works on mobile.
- A second browser can join and reconnect after reloading.
- Staging health reports an expected full release SHA and checks `database: true` and `rateLimits: true`.
- Static staging pages and the game root are not indexable; the real `crownturn.com` response behavior remains unchanged.
- No staging traffic creates, changes or deletes production rooms; Cloudflare production D1/schema/Worker have not changed.
- No automatic staging or production deployment occurs on `main` merge at this stage.
- Production `Production recovery` manual verification still works; no edits were made to the recovery workflow or script.

## For developers

Production-style build and config generation are separate steps. Both targets are **explicit**:

```sh
pnpm build:production

# Example only. Supply IDs via environment variables or GitHub settings,
# not in source files or shell history.
CROWNTURN_DEPLOY_TARGET=staging node scripts/prepare-cloudflare-deploy.mjs
# Outputs dist/server/staging-deploy.json

CROWNTURN_DEPLOY_TARGET=production node scripts/prepare-cloudflare-deploy.mjs
# Outputs dist/server/github-deploy.json
```

Before a first-time production deployment under future approved workflows, review the migration history and persisted-room backward compatibility. This phase does **not** re-enable any production deployment path.

## Troubleshooting

| Symptom | Action |
|---|---|
| Missing staging token | Configure the GitHub `staging` environment secret `CLOUDFLARE_STAGING_API_TOKEN` |
| Staging UUID missing or same as production | Create/inspect the separate D1 database and update `CLOUDFLARE_STAGING_D1_DATABASE_ID` |
| Migration error | Inspect only the **staging** D1 migration history; do not run commands against production |
| No staging workers.dev URL in logs | Verify the Worker name and Cloudflare account subdomain; check Wrangler logs |
| Staging smoke failure | Check expected release SHA, D1 tables, rate-limit bindings, and noindex headers |
| Custom domain not responding | First verify the staging workers.dev host, then check Cloudflare routing/DNS |
| Staging has obsolete test games | Clean staging data only; do not touch production D1 |

## What remains for Phase 2

- Automatically run `staging.yml` after successful `main` CI.
- Add required GitHub production environment approval and a separate `release.yml`.
- Record/promote immutable artifacts and implement release metadata.
- Preserve `crownturn-production` concurrency and the production recovery guard.

**Phase 1 exit gate:** a verified, independently hosted staging Worker with an independent D1 and working end-to-end game flow. A green code-only PR is not sufficient.
