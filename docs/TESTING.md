# Real-device reliability testing

Start with two people on separate phones, using different languages, plus two computers.

## Test-room setup

1. Enter your name, expand **Testing tools**, and select **Create test room**.
2. Share the invite link. The other person joins normally.
3. Add two computers to reach four players.
4. Select a scenario before dealing:
   - **Taxation**: Jesters are split, so no player can declare revolution. The host is Greater Dalmuti and can choose return cards.
   - **Revolution**: the host gets both Jesters and a seat other than Greater Peon.
   - **Greater revolution**: the host is Greater Peon and gets both Jesters. Declaring revolution reverses the ranks.
5. On subsequent rounds, select the next scenario from the results screen.

Test rooms are visibly labeled and deliberately use predictable distributions. They should not be used for competitive games. Normal rooms have no test controls.

## Checklist

- Join and verify matching player lists and host-only controls.
- Finish three consecutive rounds; verify rankings, points, taxes and whose turn it is.
- Attempt an invalid set; confirm a translated error with no lost cards or turn change.
- Pass and then play on a later legal turn.
- Refresh during your turn; confirm the same room, seat and hand restore automatically.
- Background the browser, lock the phone, and return.
- Briefly disable internet, then reconnect.
- Tap Play repeatedly and check that only one move applies.
- Disconnect the host and record which operations remain possible.
- Switch languages during play; names and cards should remain intact.

## Capture a problem

Expand **Diagnostics** and use **Copy diagnostic report** on each phone. Record the action, expected result, actual result, and approximate time. Reports include player names, public card counts, device/browser, phase, version, last sync, response time and last error. They exclude card faces and session tokens. Share reports only with people helping debug the game.

Different versions may be normal briefly while updates propagate. Persistent disagreement, or a screen reverting to an earlier state, is a failure.

## Automated checks

`node tests/strategy.mjs` checks strategic decisions, legal moves, full rounds, test-room permissions, scenario deck integrity and stale-response handling.

These checks do not replace real-device testing. Automatic seat recovery and action idempotency are now covered by `node tests/reliability.mjs`. Host transfer and paced bot turns remain future lifecycle/gameplay work.
