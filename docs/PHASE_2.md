# Phase 2 — automated staging and manual production promotion

**Status:** Code in PR #10; do not enable releases until operational controls below are configured. Production stays unchanged on merge.

## Pipeline

- A pull request runs check-only **Game CI**; never deploys.
- A successful push to `main` runs CI and uploads a `crownturn-build` artifact (application tarball, full commit SHA, SHA-256 manifest; 30-day retention).
- `staging.yml` triggers automatically after a successful trusted main CI run. It downloads and verifies the CI artifact, applies migrations only to the isolated staging D1, deploys the staging Worker, and runs live smoke checks **without rebuilding**.
- After success, staging uploads a `staging-proof` artifact recording the source CI run ID, SHA, artifact digest and staging Worker version UUID.
- Production can only be deployed by manually invoking `release.yml` with the release SHA, successful staging run ID and explicit `RELEASE` confirmation, followed by GitHub **production environment approval**. The job re-verifies CI/staging records, live staging SHA, artifact digest and migration checks before production writes.
- The production release uses the same application artifact with production-specific Worker/D1 bindings; then checks both workers.dev and `crownturn.com`. Record the new version UUID for recovery.

## One-time operator setup — REQUIRED

In [GitHub Environments](https://github.com/JimmyUA/dalmuti-family/settings/environments):

1. Create `production`. Enable **Required reviewers**. The workflow's `environment: production` setting alone does **not** enforce manual review without this GitHub configuration.
2. Add a **production environment secret**, not a repository secret: `CLOUDFLARE_PRODUCTION_RELEASE_API_TOKEN`. Use a separate Cloudflare token with appropriately scoped Workers Scripts Edit and D1 Edit permissions. Keep the old `CLOUDFLARE_API_TOKEN` for manual recovery unchanged.
3. Add a `production` environment variable `CLOUDFLARE_STAGING_D1_DATABASE_ID` with staging D1 UUID `7540ba1d-3240-40e3-a8fb-444186c151eb`. Production D1 UUID stays in existing repository variable `CLOUDFLARE_D1_DATABASE_ID`. Deployment refuses identical IDs.
4. Keep repository variable `DEPLOY_ENABLED=false`.
5. Add repository variable `PRODUCTION_RELEASES_ENABLED=false` or leave it unset. **Do not set it to true** until reviewers and environment-only token are actually configured and validated. Without it, manual releases fail closed. Enabling the flag alone does not deploy.

For a solo maintainer, ensure the required-reviewer configuration permits an authorized reviewer to approve the deployment (avoid enabling prevent-self-review if there is nobody else).

## First automatic staging validation

After merging PR #10, inspect the post-merge successful [Game CI](https://github.com/JimmyUA/dalmuti-family/actions/workflows/ci.yml) run, its `crownturn-build` artifact, and the automatically triggered [Staging deployment](https://github.com/JimmyUA/dalmuti-family/actions/workflows/staging.yml). Verify that staging is deployed at `https://dalmuti-family-staging.sergii-pryhodko.workers.dev/`, shows the expected SHA and passes health checks. Inspect the staging run's `staging-proof` artifact and verify a real game/reconnect.

To manually redeploy staging, provide the **successful main CI run ID** as an input to `staging.yml`. It must match the current main commit and have a valid immutable build artifact. A stale, failing or PR CI run is rejected.

## Production release procedure — only when intentionally publishing

1. Manually verify game compatibility, existing-room JSON, browser sessions and any additive D1 migrations. Static SQL checks only catch obvious destructive changes; they cannot prove full safety.
2. Enable `PRODUCTION_RELEASES_ENABLED=true` after completing the reviewer/token setup.
3. Open [Production release](https://github.com/JimmyUA/dalmuti-family/actions/workflows/release.yml), choose branch `main`, enter the tested release's **full 40-character SHA**, **successful staging run ID**, and select `RELEASE`.
4. Inspect the preflight result. Approve the **production** environment deployment only if its SHA, staging health and migration compatibility are acceptable.
5. The release repeats provenance checks, applies only approved production migrations, deploys the same built artifact, and runs smoke checks. Record the Worker version UUID and monitor actual games.
6. If a release fails after migrations or deployment, **production may already be changed**. Inspect the live Worker/D1 before retrying; never assume a code rollback reverts database data.

## Emergency recovery

First set `PRODUCTION_RELEASES_ENABLED=false`; leave `DEPLOY_ENABLED=false`. Cancel queued/pending releases and account for in-flight operations. The release deploy job and the existing recovery workflow share `crownturn-production` concurrency, but GitHub does not guarantee queue ordering; captured variables do not change retroactively.

The existing [recovery workflow](RECOVERY.md) still supports read-only `verify`. `restore` now additionally rejects operations while `PRODUCTION_RELEASES_ENABLED=true`. Review target code compatibility with current D1 and saved rooms before restoring. The recovery workflow never rolls back D1.

## Phase 2 acceptance

- [ ] Main CI produces SHA-bound artifact; only successful main CI triggers automatic staging.
- [ ] Staging deploys the verified artifact and publishes its proof.
- [ ] No PR, failed/stale CI run or mismatched artifact can be promoted.
- [ ] GitHub `production` environment has required reviewers and a separate environment-only release token.
- [ ] Production releases remain disabled by default.
- [ ] Manual promotion checks staged SHA/digest, production bindings, migration safety and both hosts.
- [ ] Emergency recovery remains available and serialized, with both pause guards.

**Deferred:** browser E2E, 8-player mobile load tests, deeper persisted-game-state compatibility, staged rollback rehearsals and per-PR previews.
