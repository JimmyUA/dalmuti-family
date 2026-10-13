# Releases, logs and deployment verification

## Release identity

Vite embeds the GitHub Actions GITHUB_SHA into both browser and Worker bundles. Local builds show development. Diagnostics shows browser and server releases separately and copies both full SHAs into the report. The server also sends X-Release-SHA and a server-generated X-Request-ID header. A browser/server mismatch prompts a refresh after pending actions are confirmed. Room version remains a separate counter for state changes.

## Server logs

Cloudflare Worker Logs receives structured game_request records with server trace ID, release, validated action type, hashed client action ID, HTTP status, duration and outcome. All mutations and failures are recorded; successful polls are sampled at 1%. No request bodies, player names, IP addresses, room codes, session tokens, cards, raw exception messages or stacks are logged. Hashed action IDs correlate retries without exposing a credential supplied in that field.

In Cloudflare Workers & Pages, select the game Worker and open its logs/observability view. Search a diagnostic trace ID or release to correlate a reported request. Outcomes distinguish ok, rejected, rate_limited and server_error. Ordinary rejected moves are not necessarily bugs. Log availability and retention depend on your Cloudflare account configuration; no external alert channel is installed by this release.

## No-progress detection

The server tracks the last successful game/control mutation. Polls and presence heartbeats do not reset it. Active playing/tax/revolution phases with no progress for five minutes are classified as waiting-for-player when the required player is offline/reconnecting, otherwise no-progress. Lobby and results phases are excluded. This is a diagnostic hint, not proof of a game error; families can intentionally pause.

Legacy rooms receive a persisted baseline on first observation. Detection is evaluated when the room is requested, not by an unattended background scanner. It does not automatically replace players or send notifications.

## Health and smoke checks

GET /api/health returns the compiled release, verifies both database tables exist, and checks rate-limit binding availability. It exposes no room data and is rate limited. After deployment, CI parses the Worker URL from Wrangler output and retries a smoke check up to ten times. It checks health, the game page and the API release header. A release mismatch, schema failure or unhealthy endpoint fails the pipeline.

Smoke failure occurs after uploading the Worker: the new release may already be live. Inspect logs and use Cloudflare version rollback if appropriate; the pipeline does not automatically undo database migrations or deployments. No new secret is needed.

## Tests

The reliability suite covers release headers, log field redaction, health failures, inactivity classification and smoke-check rejection of the wrong release. Real-browser diagnostics and production log access should be verified after deployment.
