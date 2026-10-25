# Deploy from GitHub to Cloudflare

Every push to `main` runs tests and a production build. Once deployment is enabled, a passing main-branch build also applies pending D1 migrations and deploys to Cloudflare Workers. Pull requests run checks only. Manual runs deploy only when run on `main`.

## One-time setup

1. Create or sign in to your Cloudflare account. In Workers & Pages, choose a workers.dev subdomain if your account does not already have one.
2. Create a D1 database named `dalmuti-family` and copy its database UUID. This is a new database; existing rooms from ChatGPT Sites are not transferred.
3. Copy the Cloudflare account ID from your dashboard.
4. Create an API token scoped to this account with **Workers Scripts: Edit** and **D1: Edit**. Store it only as a GitHub secret. Depending on account setup, Wrangler may also require **Account Settings: Read** to discover the workers.dev subdomain. Do not put the token in code or chat.
5. In this repository's Settings → Secrets and variables → Actions, add:

| Kind | Name | Value |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | The scoped API token |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Your account ID |
| Variable | `CLOUDFLARE_D1_DATABASE_ID` | Production database UUID |
| Variable | `DEPLOY_ENABLED` | `true` |

6. Open Actions → Game CI → Run workflow, choosing `main`, or push a new commit to `main`.
7. Check that tests, build, migrations and deployment pass. Wrangler prints the new workers.dev URL in the deployment log. Test creating a room and playing a round there before sharing it with your family.

The GitHub Actions workflow uses read-only repository permissions. Cloudflare credentials are supplied only to the deployment step, never to pull-request checks. Production runs are serialized so deployments cannot race each other.

## Local authenticated deployment

After configuring your account and database, and authenticating Wrangler:

```sh
pnpm install --frozen-lockfile
node tests/strategy.mjs
pnpm build:production
node tests/production.mjs
node scripts/prepare-cloudflare-deploy.mjs
pnpm exec wrangler d1 migrations apply DB --remote --config dist/server/github-deploy.json
pnpm exec wrangler deploy --config dist/server/github-deploy.json
```

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_D1_DATABASE_ID` in your environment before preparing the config. For CI-style token authentication, also set `CLOUDFLARE_API_TOKEN` securely.

## Releases and rollback

Failed tests or builds stop deployment. Pending migrations are applied before uploading the Worker. A migration can succeed even if deployment subsequently fails; inspect logs before retrying. Worker rollback does not undo database changes. Keep schema changes backward-compatible and use Cloudflare's version history for emergency Worker rollback.

Set `DEPLOY_ENABLED` to `false` to pause deployment while retaining checks. The original ChatGPT Sites URL is hosted separately; this workflow targets your Cloudflare account and cannot update that URL. Custom domain configuration can be added after the first successful deployment.

## CPU budget and production assets

GitHub Actions builds with `pnpm build:production`. The React page is a static Vite bundle served by Cloudflare Assets, so loading the page does not invoke the Worker. Only `/api/*` invokes the small production Worker, which calls the existing security, game service and health handlers directly. Preview builds may still use Vinext. No database migration or paid plan is required for this change.

Cloudflare Free enforces a 10 ms CPU budget per Worker request. Local tests cannot establish live CPU usage. After deployment, check the new release in Diagnostics and Worker logs for both page loads and game actions, including a bot-heavy round. If API requests still exceed the budget, profile and optimise the game service before considering a paid plan.

### Room expiry

Optional GitHub **Actions repository variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Default | Meaning |
| --- | --- | --- |
| `ROOM_IDLE_TTL_HOURS` | `24` | Inactivity limit for lobby/results rooms |
| `ROOM_ACTIVE_TTL_HOURS` | `168` | Inactivity limit for all other phases |

Both accept hours from 1 through 8760, including fractional hours. Missing values use defaults; invalid values fail deployment preparation. Change a variable and rerun Game CI on main to apply it. These are deployment-wide settings, not per-room controls.

A scheduled Worker deletes up to 100 expired rooms every 15 minutes. Requests also enforce expiry immediately. Authenticated member requests renew activity; successful joins renew it too. Failed joining attempts and scheduled cleanup do not. Computer state updates never renew activity themselves. An open human game tab counts as activity.

Migration `0002_room_expiry.sql` gives existing rooms a fresh grace period. Deletion removes presence atomically using a database trigger. Minimal room-code tombstones are retained for 30 days so returning clients receive an expiry message; afterward they receive room-not-found. Expired room contents cannot be restored. The health endpoint checks the new schema before deployment smoke checks succeed.

### Recovery runbook

See [Production recovery](RECOVERY.md) for the manual GitHub workflow, a read-only rehearsal, compatibility checks, and post-recovery validation. New deployments tag Cloudflare versions with the full Git release SHA. Recovery restores an existing Worker version without rebuilding source or changing D1 migrations/data.

### Public pages and search

The canonical public origin is `https://crownturn.com/`. Production builds generate static English, Ukrainian and Dutch guides at `/{en,uk,nl}/how-to-play.html`, reciprocal language links, robots.txt, sitemap.xml and a 1200×630 PNG share image. The game footer links to the selected language's guide. Submit the sitemap in your search-console account after deployment; indexing is controlled by search engines and is not immediate.

The root page now passes through a minimal Worker handler solely to set `X-Robots-Tag: noindex, follow` on room invitation URLs and the workers.dev root. It serves the existing static asset without game/database work or SSR. Other public assets and guides remain served directly. This replaces the earlier API-only `run_worker_first` configuration; recheck live CPU metrics after release. Preview URLs remain version access, not isolated staging. Public guide pages use the canonical domain in metadata even when accessed via another host.

After CI succeeds, fetch the live root, each guide, robots.txt, sitemap.xml and share.png; inspect the header on `/?room=TEST00` without joining a room. Check the share preview in the target messaging app. Existing cached previews may take time to refresh. Search controls are not access controls; private cards/session identifiers remain protected by the API.
