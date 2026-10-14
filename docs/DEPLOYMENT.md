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
