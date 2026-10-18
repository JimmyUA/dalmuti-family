# Crownturn

Ranks. Taxes. Revolutions.

A mobile-friendly multiplayer family card game for 4–8 players, including computer opponents. Supports English, Ukrainian and Dutch, private room codes, automatic rule enforcement, taxation, revolutions and rankings.

Live game: https://dalmuti-family.sergii-pryhodko.workers.dev/

## Development

Requires Node.js 22.13+ and pnpm (see package.json for the pinned version).

```sh
pnpm install
pnpm dev
```

## Build and checks

```sh
pnpm build:production
node tests/strategy.mjs
node tests/reliability.mjs
node tests/production.mjs
```

## Storage and hosting

The server uses Cloudflare D1 through the `DB` binding. Database migrations are in `drizzle/`. Apply the migration to the local D1 database before testing room creation. The included Sites/Vinext starter documentation and build configuration describe the Cloudflare runtime integration; GitHub Pages alone cannot run the multiplayer API.

Production uses Cloudflare static assets, a direct API Worker and D1, deployed by GitHub Actions. See docs/DEPLOYMENT.md. The historical repository/Worker/database names and local-storage keys are retained so existing rooms, deployment settings and device sessions continue to work. Crownturn domain availability and trademark clearance are not established by this rename.

## Source layout

- `app/game.ts`: server-side rules and room actions
- `app/strategy.ts`: computer-player decisions using public information
- `app/api/game/route.ts`: multiplayer API with optimistic concurrency
- `app/page.tsx`: game interface
- `app/i18n.ts` and `app/dutch.ts`: translations
- `db/` and `drizzle/`: database schema and migrations

Crownturn is an independently developed card game inspired by The Great Dalmuti. It is not affiliated with or endorsed by the original game’s publisher.
