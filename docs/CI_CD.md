# Crownturn CI/CD Strategy & Implementation Plan

> **Status:** Approved strategy. Phase 0 and Phase 1 implemented; Phase 2 changes tracked in PR #10. Follow [Phase 2 runbook](PHASE_2.md) for current release procedures.
>
> **Agreed:** 2026-11-04  
> **Repository:** `JimmyUA/dalmuti-family`  
> **Production:** https://crownturn.com/  
> **Scope:** GitHub Actions, Cloudflare Workers, Cloudflare D1, testing, releases, recovery.
>
> **IMPORTANT — transition safety:** The current `.github/workflows/ci.yml` still deploys to production on a passing `main` push while `DEPLOY_ENABLED=true`. **Even merging a documentation-only pull request can trigger a production deployment.** Before merging this plan or other changes into `main`, confirm `DEPLOY_ENABLED=false` and that running/queued deployments have completed. Do not interpret creating this file as implementing the strategy.

## 1. Goals and agreed decisions

We want to deliver features and fixes frequently **without accidental production disruption**, and to recover a known-working Worker version when a release fails.

1. All work is done on a feature/fix branch and validated via a pull request.
2. A passing merge to `main` automatically deploys to **one permanently isolated staging environment**.
3. A **manual, explicitly approved** production release promotes one previously validated commit/artifact.
4. Releases are identifiable and auditable by full Git SHA, artifact digest and Cloudflare Worker version UUID.
5. Production deployment and recovery cannot race; a recovery pause blocks new releases.
6. Staging uses an independent Worker, D1 database, credentials and test data. **Never point staging at production D1.**
7. Preserve the existing production recovery protections throughout the transition.
8. Introduce per-PR previews **later**, after the core staging/release process proves reliable.
9. No promise of zero incidents: reduce risk, detect failures quickly, protect existing games, and make recovery dependable.

## 2. Current repository baseline (verified 2026-11-04)

- `.github/workflows/ci.yml`: push/PR/manual CI; runs `tests/strategy.mjs`, `tests/reliability.mjs`, `tests/recovery.mjs`, production build and `tests/production.mjs`. When not a PR and on `main` with `DEPLOY_ENABLED=true`, it prepares Cloudflare config, applies D1 migrations, deploys Worker `dalmuti-family` with `--tag "$GITHUB_SHA"`, then runs a smoke check.
- `.github/workflows/recovery.yml`: manually dispatched `verify` or `restore`; shares concurrency group `crownturn-production`; runs only from `main`.
- `scripts/recover-production.mjs`: verifies account/current/target version IDs, full commit SHA and tagged target; checks current traffic is 100% on expected version; refuses restore unless `DEPLOY_ENABLED=false`; restores an existing Worker version; performs post-restore health and API checks. No D1 mutation or migration.
- `scripts/prepare-cloudflare-deploy.mjs`: hard-codes production Worker and D1 name, so it must be made environment-aware.
- `scripts/smoke-check.mjs`: checks health/release SHA, homepage and API through the workers.dev URL; custom-domain checks should be added.
- `docs/DEPLOYMENT.md`, `docs/RECOVERY.md`, `docs/RELIABILITY.md` and `docs/MONITORING.md`: existing operational documentation.
- Production runtime uses **Cloudflare D1**, persistent room JSON, release-tagged Workers and browser-stored session/retry state; rollback of code does **not** roll back D1 or previously mutated room data.

Do not assume current Cloudflare settings, deployment variables, or version UUIDs are known merely from the repository. Capture/verify them from the actual deployment console before performing live actions.

## 3. Target delivery flow

```text
feature/fix branch
    -> pull request
    -> CI: lint / type checks / game tests / reliability / recovery / build
    -> merge to main
    -> immutable release artifact for exact commit SHA
    -> automatic staging deploy (isolated Worker + D1)
    -> staging integration, E2E and compatibility checks
    -> staging-success release record (SHA + artifact digest + test results)
    -> manually initiated production release for that exact SHA
    -> GitHub production environment approval + compatibility checks
    -> production D1 migration (only backward-compatible changes)
    -> deploy SAME application artifact, with production bindings
    -> live smoke checks and monitoring
    -> record current and last-known-good Worker version UUIDs
    -> recovery workflow if required (never automatic D1 rollback)
```

### Environments

| Property | Staging | Production |
|---|---|---|
| Public host | `staging.crownturn.com` (to configure) | `crownturn.com` (existing) |
| Worker | `dalmuti-family-staging` (new) | `dalmuti-family` (existing) |
| D1 | `dalmuti-family-staging` (new, separate ID) | Existing `dalmuti-family` |
| Credentials | Staging-scoped | Production-scoped |
| Deployment | Auto after main CI | Manual, approved |
| Test rooms | Synthetic/disposable | No destructive test actions |
| SEO | `noindex` everywhere | Existing public SEO |

Retain the current production Worker, database, custom domain and active rooms without renaming or migrating them merely to adopt CI/CD. Configure separate Cloudflare/GitHub environments or equivalent scoped credentials. Staging cannot use a production D1 binding even if manually configured incorrectly: add script and CI assertions that reject a matching database ID.

## 4. Phase 0 — Freeze risky production deployments

**Priority: P0. Complete before any ordinary merge to `main`.**

- [ ] Record active production Git SHA, Worker version UUID, deployed bindings and known-good rollback target.
- [ ] In GitHub Actions variables, set `DEPLOY_ENABLED=false` **before** merging any PR. Inspect/cancel queued main deployments and allow any already running deployment to finish; the variable may have been captured by an in-progress run.
- [ ] Verify production serves the expected release and keep a record of it.
- [ ] Move the production deployment steps out of `.github/workflows/ci.yml`, preserving tests and build jobs.
- [ ] Verify that push/PR/manual CI alone can no longer write to production Worker or D1.
- [ ] Preserve `recovery.yml` and its guards. No changes to live Worker or D1 are required in this phase.

**Gate:** A push to `main` can run CI, but cannot deploy to production or apply production D1 migrations.

**Transition warning:** Until the new release and recovery coordination is fully implemented, keep `DEPLOY_ENABLED=false`. Do not remove the existing recovery script's `DEPLOY_ENABLED` check prematurely.

## 5. Phase 1 — Isolated permanent staging

**Priority: P0.**

- [ ] Create Cloudflare Worker `dalmuti-family-staging` and separate D1 database `dalmuti-family-staging`.
- [ ] Configure staging Cloudflare API token, account/database ID and rate-limit bindings with least privilege. Keep tokens as GitHub secrets, never in committed files.
- [ ] Extend `scripts/prepare-cloudflare-deploy.mjs` with an explicit environment parameter, environment-specific Worker/bindings, and fail-closed checks. Reject production D1 ID in staging and staging D1 ID in production.
- [ ] Implement staging-only D1 migration step, before staging Worker deployment, using its separate database.
- [ ] Add `.github/workflows/staging.yml`, triggered only for a specific passing `main` SHA. Do not deploy arbitrary PR code with secrets.
- [ ] Configure `staging.crownturn.com` and apply a site-wide `noindex` response header (including API/room URLs); staging indexing directives must not leak to production.
- [ ] Run an end-to-end staging smoke check: health/database/release, home/assets, create room, play a round, reconnect.
- [ ] Verify staging deployment leaves production version UUID and production D1 untouched.

**Gate:** Staging can be redeployed, migrated and populated/reset with test rooms without affecting real games.

## 6. Phase 2 — Separate CI and approved production promotion

**Priority: P0.**

Workflows:

| Workflow | Trigger | Cloudflare write access? |
|---|---|---|
| `ci.yml` | PR/push to `main` | No |
| `staging.yml` | Passing CI for exact `main` SHA | Staging only |
| `release.yml` | Manual `workflow_dispatch` for an approved SHA | Production only after approval |
| `recovery.yml` | Manual verify/restore | Production recovery only |

- [ ] Use an immutable build artifact generated for the source SHA with release metadata embedded. Record a SHA-256 digest and retention policy. Avoid rebuilding application code independently for production.
- [ ] Promote the **same Worker application and static assets** from tested staging artifact. Generate environment-specific Wrangler deployment configuration/bindings without changing the application bytes.
- [ ] Make the release workflow accept a target commit SHA; reject absent/mismatched artifact, failed staging checks, stale or unreviewed SHA, or incompatible configuration. Use workflow-run provenance or an attested release manifest; do not trust an arbitrary user-entered SHA alone.
- [ ] Require manual approval through a protected GitHub `production` environment and production-scoped secrets. Configure environment restrictions appropriate to the repository.
- [ ] Keep all production-changing operations and recovery serialized using `crownturn-production` concurrency, `cancel-in-progress: false`. Concurrency alone is not a global lock, so also verify the active version and pause state immediately before deployment.
- [ ] Introduce a shared **production deployment pause** checked by both release and recovery. Migrate away from `DEPLOY_ENABLED` only after tests prove the replacement cannot be bypassed; prevent races with in-flight jobs.
- [ ] Apply approved, compatible production D1 migrations **only** inside the gated release job. Never apply them in PR checks or staging workflow against production D1.
- [ ] Tag deployed Cloudflare Worker versions with the full Git SHA, retain release metadata, and record active and last-known-good version UUIDs.
- [ ] Extend smoke checks to `https://crownturn.com` in addition to the workers.dev endpoint; verify expected SHA, API health and static assets. Production smoke tests must be read-only/non-destructive.
- [ ] Preserve a straightforward emergency forward-fix route through the same gating and release records.

**Gate:** A merge to `main` does not change production. Only a tested SHA with explicit approval can release; any attempted unauthorized production write fails closed.

## 7. Phase 3 — Automated release gates

**Priority: P1.**

Keep current unit/scenario/reliability/recovery checks and add:

- [ ] Static checks: lint, TypeScript/type checks (if configured), dependency install from lockfile and production build.
- [ ] Staging API integration: room create/join, turns, legal/illegal play, pass, tax, revolution, bots, finish, reconnect and retries/optimistic concurrency.
- [ ] Browser E2E with Playwright: mobile viewport, two browser clients in one room, reconnect/reload, game completion and core controls.
- [ ] Production deploy artifact contract: Worker routing, health/headers, assets, release SHA, no accidental production D1 binding in staging.
- [ ] Backward compatibility: old saved room JSON on new Worker; a new-schema database accessible by the previous rollback candidate; browser sessions and pending request IDs surviving release.
- [ ] Staging upgrade simulation: leave a game active across deployment and verify clients continue (including bots).
- [ ] Migration safety checks: schema expansion before code reliance, explicit review for destructive operations, rollback compatibility check.
- [ ] Report named failures; every critical failure blocks release eligibility.

The CI integration tests must use a local/test database or staging D1 only. Production checks must never create rooms that could alter actual player experience.

**Gate:** Critical multiplayer and compatibility suites pass for the exact staging SHA and artifact.

## 8. Phase 4 — Recovery validation and observability

**Priority: P1. Preserve existing safeguards.**

The existing recovery workflow already:

1. Has read-only `verify` mode.
2. Validates Cloudflare account, current and target version UUIDs, and full target Git SHA.
3. Requires the target Worker version to carry the expected SHA tag.
4. Refuses unexpected current version changes or split traffic.
5. Requires automatic deployment to be explicitly paused before restore.
6. Restores an **existing** Worker version instead of rebuilding or redeploying source.
7. Rechecks active deployment and health/API release identity.
8. Never mutates D1 or attempts automatic schema rollback.

- [ ] Keep every safeguard above during refactoring; retain fail-closed behavior if the active version changes mid-recovery.
- [ ] Update the deployment-pause mechanism as part of the new release workflow without weakening recovery.
- [ ] Add test coverage for pause/approval races and release-versus-recovery serialization.
- [ ] Rehearse `verify` against real production version metadata (no production changes).
- [ ] Rehearse an actual rollback **in staging only** using approved version IDs, verifying old code works with its newer DB/game state.
- [ ] Record and surface known-good rollback target and full release SHA.
- [ ] Validate production `crownturn.com` and Worker health, D1 connectivity, release identity, error/CPU signals after each release; create operational alerts as a later increment.
- [ ] Update `docs/RECOVERY.md`, `docs/DEPLOYMENT.md`, `docs/MONITORING.md` and `docs/TESTING.md` with new workflows and runbooks.

**Gate:** Staging rollback rehearsal passes; production read-only recovery verification passes; a failed production smoke check is visibly marked as potentially live and requires explicit incident review.

### Incident procedure (production)

1. Pause production releases; stop or account for queued/in-flight release jobs.
2. Inspect current Worker version UUID, health, logs and recent migration history.
3. Check that the known-good target is compatible with the **current D1 schema, room JSON and client sessions**.
4. Run recovery `verify` with current UUID, target UUID and target Git SHA.
5. If safe, manually run `restore`; verify 100% target traffic and production smoke checks.
6. Verify a real mobile reconnect/game manually; monitor errors.
7. Keep releases paused until `main` and the next approved release resolve the fault.

**Never:** automatically roll back D1; delete migration history; assume a restored Worker can read future schema; retry a failed recovery write blindly (it may already be live).

For database corruption, assess Cloudflare D1 Time Travel separately, with explicit recognition that restoring the database affects all rooms and may lose recent activity.

## 9. Game state and schema compatibility policy

Mandatory for every production release:

- Preserve room codes, player identities, game-state semantics, request IDs and replay/idempotency behaviour across a normal deployment.
- Ensure the new Worker reads rooms produced by the preceding release.
- Ensure the previous known-good Worker can read the schema after a migration, or mark Worker rollback **unsafe** and use an approved forward-fix strategy.
- Prefer **expand → migrate → contract** over destructive migrations in one release.
- Treat changes to stored room JSON, API actions or browser local storage as versioned contracts requiring tests.
- Keep current games and reconnections working across deployment whenever feasible.
- No default canary/traffic splitting in the initial rollout; avoid requests from the same live game alternating between incompatible Worker versions.

## 10. Files and changes

| Path | Work |
|---|---|
| `.github/workflows/ci.yml` | Remove production write path; retain and expand checks |
| `.github/workflows/staging.yml` | New auto staging deployment + validation |
| `.github/workflows/release.yml` | New manually approved, SHA-specific promotion |
| `.github/workflows/recovery.yml` | Preserve recovery guards; integrate shared pause |
| `scripts/prepare-cloudflare-deploy.mjs` | Explicit environment support and binding safety |
| `scripts/build-production.mjs` | Immutable artifact and release metadata |
| `scripts/smoke-check.mjs` | Staging/production host-aware verification |
| `scripts/recover-production.mjs` | Keep safeguards; adapt only necessary pause checks |
| `tests/release.mjs` | New safety, artifact, pause and promotion tests |
| `tests/e2e/` | Browser-based game smoke journeys |
| `docs/DEPLOYMENT.md` | Staging/release operational instructions |
| `docs/RECOVERY.md` | Updated verified recovery runbook |
| `docs/CI_CD.md` | This plan |

## 11. Suggested pull-request sequence

1. **PR 1 — Safety and staging foundation:** disable production auto-deploy, create staging Worker/D1 and config guards, add staging deployment/smoke checks.
2. **PR 2 — Release management:** immutable artifacts, manual approved production promotion, release manifest, production pause and audited version metadata. Keep old recovery guards effective until new ones are verified.
3. **PR 3 — Quality and recovery verification:** browser E2E, live staging scenarios, migration/room compatibility checks, staging rollback rehearsal, documentation and monitoring.

Each PR must have a written validation and rollback note. Avoid a single large refactor. After all three, run one explicitly approved controlled production release and document the known-good rollback target.

## 12. Definition of done

### Deployment safety
- [ ] No ordinary `main` push deploys production.
- [ ] Staging and production Worker/D1 identifiers and credentials are isolated.
- [ ] Deployment scripts fail on incorrect environment/database bindings.
- [ ] Production requires manual approval and validated artifact provenance.
- [ ] Same tested application artifact reaches production; staging/prod bindings remain separate.

### Quality
- [ ] Existing CI checks remain mandatory.
- [ ] Staging critical API/E2E game scenarios pass.
- [ ] Live-game room JSON, client and migration compatibility are tested.
- [ ] Both staging and production smoke checks verify the expected release SHA.

### Recovery
- [ ] Current and last-known-good Worker versions are recorded.
- [ ] Production release and recovery cannot race.
- [ ] A deployment pause prevents another release during an incident.
- [ ] Staging rollback rehearsal passes.
- [ ] Production `verify` succeeds with **zero** production writes.
- [ ] Production recovery does not roll back D1.

### Documentation
- [ ] Release runbook documents approval and deployment.
- [ ] Incident runbook documents safe recovery, limitations and live validation.
- [ ] Production release is verified, and change history is traceable to Git SHA, artifact and Cloudflare version UUID.

## 13. Out of scope for initial implementation

- Per-PR preview environments (evaluate after permanent staging/release workflow is stable).
- Automatic production rollout/canary, version affinity and progressive traffic splitting.
- Automatic production rollback without human approval.
- Automatic D1 rollback or restoring game data as part of a code deployment.
- Changing the production Worker/database identity or disrupting existing rooms merely for CI/CD adoption.

## 14. References within this repository

- [Current deployment process](DEPLOYMENT.md)
- [Current production recovery runbook](RECOVERY.md)
- [Reliability and reconnect behaviour](RELIABILITY.md)
- [Existing monitoring](MONITORING.md)
- [Testing documentation](TESTING.md)

**Implementation status:** This document records the agreed roadmap; it is not evidence that any workflow, Cloudflare environment, deployment setting or recovery behaviour has already changed.
