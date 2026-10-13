# Room access and request security

## Validation

The HTTP entry point accepts application/json, limits streamed bodies to 8 KiB, rejects malformed UTF-8/JSON, and rejects cross-site browser requests. The game service independently validates action-specific fields before database access. Unknown fields are rejected, not copied into game state.

Sessions and request IDs must be UUIDs. Room codes must have six hexadecimal characters. Names must be nonblank for creation/joining, no more than 24 UTF-16 code units, and contain no control characters. Versions must be nonnegative safe integers. Play/tax sets contain integer ranks 1–13, with at most 80 cards (two for tax). Seat targets must be integers 0–7, and test scenarios come from a fixed allowlist. Rules still validate ownership, set rank, turn and hand membership after input validation.

## Sessions and permissions

The randomly generated device UUID is a bearer credential: knowledge of it grants that player's access. It is retained only on the device and in private server state; the client sees only its own credential. Opponents receive public seat identifiers. Diagnostic reports omit session credentials, hands, action receipts and fingerprints. Room codes allow joining, not control of existing seats. Clearing storage or changing browsers does not prove ownership of an old seat.

Host-only actions check the authenticated device session server-side. Replacement also requires an offline human and a current game version. Reclamation always targets the caller's own substituted seat and is restricted to between rounds. Test controls are restricted to hosts of test rooms. UUID input validation alone is not authentication; stored room membership and permissions are authoritative. Accounts/session rotation remain potential future improvements.

## Rate limits

The Worker uses Cloudflare's native rate-limit bindings, configured by scripts/rate-limit-config.mjs and included in both local development and deployment configuration:

| Budget | Requests per 60 seconds |
|---|---:|
| Network-wide safety limit | 600 |
| Device session | 120 |
| Room creation per network | 10 |
| Join attempts per network | 40 |

A network may serve multiple family members, so the broad limit allows eight phones polling at the normal 1.5-second interval. Network/session keys are hashed and prefixed for this application. The native namespaces 730001–730004 are reserved for this game; use different namespaces if those are already assigned to another application in the account.

Native counters are scoped to Cloudflare locations, not a strict globally consistent quota. The network cap is a basic anonymous-abuse safeguard; shared carrier/VPN networks can still share a budget. Missing rate-limit bindings or backend errors fail closed with 503 rather than silently disabling protection. No additional secrets or database migrations are required.

429 replies include Retry-After: 60. The client waits at least a minute and retains the pending action's exact ID and payload. It never converts a rate-limited retry into a new action.

## Tests and limits

The reliability suite covers malformed fields, oversized requests, invalid JSON, cross-site origins, MIME checks, rate-limit failures, hashed keys, session-token redaction, unauthorized game controls, bot-session spoofing and version-preserving rejection. It also exercises the existing reconnect/lifecycle/rules tests.

These safeguards do not replace platform-level DDoS protection, monitoring, dependency updates, or a browser security review. Never log request bodies or player-session tokens. Input protection does not make the game an account-based identity system.
