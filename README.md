# Dalmuti · Family Table

A mobile-friendly multiplayer family card game for 4–8 players, including computer opponents. Supports English, Ukrainian and Dutch, private room codes, automatic rule enforcement, taxation, revolutions and rankings.

Live game: https://dalmuti-family-table.cocoascout2.chatgpt.site

## Development

Requires Node.js 22.13+ and pnpm (see package.json for the pinned version).

```sh
pnpm install
pnpm dev
```

## Build and checks

```sh
pnpm build
node tests/strategy.mjs
```

## Storage and hosting

The server uses Cloudflare D1 through the `DB` binding. Database migrations are in `drizzle/`. Apply the migration to the local D1 database before testing room creation. The included Sites/Vinext starter documentation and build configuration describe the Cloudflare runtime integration; GitHub Pages alone cannot run the multiplayer API.

The existing live deployment is managed through ChatGPT Sites. This export omits its project identifier and does not change the running site. For independent deployment, configure your Cloudflare Worker and D1 database, and apply the SQL migration before serving requests.

## Source layout

- `app/game.ts`: server-side rules and room actions
- `app/strategy.ts`: computer-player decisions using public information
- `app/api/game/route.ts`: multiplayer API with optimistic concurrency
- `app/page.tsx`: game interface
- `app/i18n.ts` and `app/dutch.ts`: translations
- `db/` and `drizzle/`: database schema and migrations

Independent family implementation with original visual design. The Great Dalmuti is a trademark of its respective owner; this project is not affiliated with the publisher.
