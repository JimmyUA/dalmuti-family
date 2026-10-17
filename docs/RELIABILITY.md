# Reconnect and request reliability

## Client behaviour

- The device keeps its player session, room and one unresolved action in localStorage.
- Opening the game restores the saved room with a read-only poll; an invitation to a different room is not automatically joined.
- An unresolved action is persisted before transmission. Refreshes and retries reuse its exact request ID, expected game version and payload.
- Requests are serialized. Polling runs after the preceding request finishes; hidden tabs pause requests and focus, visibility and online events request immediate synchronization.
- Requests time out after 10 seconds. Network errors, server errors and rate limiting retry with exponential delay, capped at 30 seconds. Permanent input/rule errors stop retries.
- New moves and leaving the room are blocked while an action is unresolved. Disconnects block gameplay until synchronized again.
- Selection is keyed to room, round and the player's hand. A changed hand cannot turn selected indices into different cards.
- Definitive stale-action errors include an authoritative snapshot for review. The client never changes a failed action's version and silently resubmits it.

## Server behaviour

Mutations require a UUID request ID. Gameplay actions also require the exact version the client acted on. Creation uses a stable room code derived from the session and request ID; retrying a lost create response cannot create another room.

Accepted action fingerprints and receipts are stored inside the room's private state. A single compare-and-swap SQL update commits both game changes and acknowledgement. Concurrent duplicates find the same receipt after rereading. A reused request ID with a different payload is rejected.

Receipts are bounded to the most recent 1,024 accepted requests per room. An older retry whose receipt has been pruned is rejected by its stale expected version; it is not reapplied. A very long-offline client may therefore receive a stale-action error instead of positive historical acknowledgement. Creation retains its identity separately. Joining an existing session never creates an additional seat.

Public snapshots and diagnostic reports exclude receipts, fingerprints, creation identity, opponents' cards and opponents' session tokens. No database migration is needed: the extra state fields are optional and existing rooms remain readable.

Old open tabs must refresh once after deployment because mutations without request IDs are rejected. Local storage is origin-specific; recovery does not transfer between the old ChatGPT Sites URL and the new Cloudflare URL, between browsers or after clearing device data.

## Verification

`node tests/reliability.mjs` tests the actual game service against SQLite, including duplicate/concurrent writes, stale versions, private-state redaction and session recovery. It exercises the production connection controller with lost responses, saved pending requests, serialized polling and lifecycle wakeups. Both this suite and `tests/strategy.mjs` run before production deployment in GitHub Actions.

Real-browser timing and device storage behaviour still need device testing. Host transfer and replacing absent players remain separate lifecycle work.

## Paced computers

Production applies one computer action per eligible authenticated poll. Every successful move stores a new deadline at least 1.8 seconds later. A compare-and-swap on the room version prevents simultaneous polls from applying the same turn twice. Human mutations schedule the next computer instead of running a batch; retrying an acknowledged action does not advance computers. Tax and revolution decisions are paced too. Existing rooms acquire a deadline on their first poll.

Polling remains every 1.5 seconds, so actual pauses may be longer than 1.8 seconds. With nobody polling, computers pause; a returning player advances one due action, never a catch-up burst. The table displays the latest event and a translated thinking indicator. No database migration is needed.

## Adaptive computer timing and move guidance

Computer decision deadlines now range from 300 ms for passes to 1.8 seconds for endgame choices. Simple moves use 600 ms, ordinary choices 1–1.4 seconds, and tax/revolution decisions 1.2 seconds. The choice uses the bot's hand and public counts only. The persisted deadline is still updated atomically with the move. Polls follow the remaining deadline, with a minimum one-second interval to keep an eight-player table within the existing network rate budget. Actual visible timing includes network latency and polling; it is not a hard real-time guarantee.

Card selection allows only prefixes of legal sets. Partial pairs/triples remain selectable; Play enables only for a complete valid set. Taxation permits arbitrary cards up to the required count. Changes to room version, phase, turn or hand invalidate the selection and pass confirmation. The server remains authoritative.

A single action button keeps a fixed position and size: no selection shows subdued Pass when responding to a set; a complete selection shows prominent Play N cards. Partial selections show disabled completion guidance. Empty leads show disabled Select cards to play. Clear selection is a separate control. A game update invalidating a nonempty selection blocks the action with Review your selection until the player selects again or explicitly clears it; it must never silently become Pass. Pending requests disable the button and the connection controller rejects repeat submissions. There is no separate Pass control or pass-confirmation panel. All new guidance is translated into English, Ukrainian and Dutch.
