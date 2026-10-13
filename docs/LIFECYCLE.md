# Player and host lifecycle

Human players are online when their last heartbeat is at most 15 seconds old, reconnecting until 60 seconds, then offline. Background tabs pause polling, so the status means recent activity, not a guaranteed physical network connection. Heartbeats are throttled to 10 seconds and stored in a separate D1 table; they do not change the game version.

On the next room request after a host has been absent for 60 seconds, hosting transfers to the first recently active human in seating order. Computers never become hosts. An explicit departure transfers hosting immediately if another human is active. If everyone is absent, no host is elected until a human returns. The former host does not automatically regain hosting.

The host can replace an offline human with a computer. A brief interruption within the grace period cannot trigger replacement. An explicit departure is immediately eligible. Replacement preserves the same player identity, hand, rank, score and finish order. A substituted player may watch on return but can reclaim control only in the lobby or results screen. Other people's seats cannot be reclaimed. A substituted seat is never removed by the ordinary remove-computer control.

Leaving the lobby frees a seat. Leaving during a round preserves the seat and cards; the host may assign a computer. A returned human can join with the same saved device session and reclaim between rounds. Closing the browser is treated as a disconnect after the grace period.

All lifecycle actions use the existing request IDs and expected versions. Transfer/replacement commits use compare-and-swap writes; stale controls cannot target a newly reordered seat. Presence changes are observed when someone polls: no background scheduler runs for empty rooms.

Deployment applies the new presence-table migration before uploading the Worker. Existing rooms receive an initial grace period when first observed after the upgrade.

`node tests/reliability.mjs` covers clock-controlled grace boundaries, host transfer, heartbeat version stability, replacement, departure, replay and between-round reclamation alongside reconnect tests. Real-phone background behaviour still requires device verification.
