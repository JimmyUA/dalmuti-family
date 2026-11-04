# Mobile table layout

## Behaviour

- The game uses a compact viewport workspace after the lobby. All 4–8 seats remain visible with card counts and active-player styling. Full names, ranks, presence, replacement controls and finish order are available in Players.
- The hand is a single horizontally scrolling region. Cards keep a readable size instead of shrinking with hand size; keyboard focus can bring off-screen selectable cards into view.
- Play/Pass, tax submission and revolution decisions sit beside the hand. Table content can scroll independently for long explanations, large piles and results.
- History, round information, player details, rules and the table menu use native modal dialogs with Escape, close controls and focus restoration. History is frozen while reading; Show new moves explicitly refreshes it.
- Routine events appear in reserved space on the felt for 4.5 seconds; rapid events replace the message. Initial/recovered snapshots, older versions, other rooms and hidden-tab updates are not replayed. Existing screen-reader announcements remain authoritative.
- In-game errors/confirmation messages are inline and dismissible rather than covering the hand. Offline/pending controls stay disabled.
- Focus mode hides nonessential chrome. Browser fullscreen is attempted only from a user gesture; in-page focus remains available if it is unsupported or denied.
- Under 620 CSS pixels of height, including short landscape screens and many zoomed layouts, ordinary vertical scrolling is allowed instead of clipping controls. This is an intentional fallback, not a claim of scroll-free gameplay at every size.

## Local review

Run `node scripts/build-mobile-qa.mjs` and serve `dist/mobile-qa`, opening `/review.html`. This is the real Home component and stylesheet using a **test-only connection replacement**. It never contacts live game APIs, is not bundled in `dist/client`, and must not be deployed as production. Some fixtures deliberately combine unusually large hands and tables as stress cases; game legality is tested separately.

Browser checks performed with the review harness:

| Case | Result |
| --- | --- |
| 320 × 640, eight seats, long names, 20 cards | No document horizontal overflow; Play/Pass bottom at 632px, inside viewport; full player names available in Players |
| 320 × 640, Ukrainian tax, 22 cards | Submit action inside viewport; last card can be selected after hand scroll |
| 390 × 700, Dutch revolution | Both decision buttons inside viewport; explanation scrolls within table |
| 390 × 700, 14-card pile, 22 cards | No document horizontal overflow; primary action inside viewport |
| 320 × 640, eight-player results | No document horizontal overflow; results locally scrollable |
| 320 × 640, offline / pending | Primary action disabled and inside viewport |
| 740 × 360 landscape | No horizontal overflow; intentional vertical-scroll fallback |
| 320 × 640 focus fallback | Header hidden, action remains within viewport |
| Play/Pass event + History | Inline event appears, new move retained in History; dialog closes and returns focus |

Automated checks: `node tests/strategy.mjs`, `node tests/table-events.mjs`, `node tests/reliability.mjs`, production build, `node tests/production.mjs`, and `node tests/recovery.mjs`.

These checks do not replace a real-device staging playtest. Still check Android/iOS browser bars and safe areas, screen readers, 200% browser zoom and native fullscreen support. No backend schema, move validation, room lifetime, recovery safeguards or production release gates are changed.
