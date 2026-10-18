# Accessibility checks

Checked 18 October 2026 against a local production build using Chromium, Playwright 1.62.1 and axe-core 4.11.0, with mock game responses. This is an automated/source review, not a declaration of full WCAG conformance or a substitute for assistive-technology user testing.

## Findings fixed

- Added a keyboard skip link, visible focus indicators across controls, a screen-reader page heading during games, expanded state on the inline rules control, and a labelled hand/card group.
- Cards announce their translated name, rank and position; selection remains exposed through `aria-pressed`. Public turn and phase changes have a persistent polite live region. Decorative symbols are hidden from assistive technology. Diagnostics are not a live region, so each poll does not announce timestamps.
- Notifications have a named keyboard-accessible dismiss button and can be dismissed with Escape. Rules can be closed with Escape. Opening external links in a new tab is announced.
- Darkened low-contrast supporting text and decorative card text. Disabled cards remain legible instead of relying on faint opacity. Buttons, selects, summaries and small host controls have minimum 44-pixel height; card buttons exceed that size in both dimensions.
- Added reduced-motion and forced-colour support. Fixed 320-pixel reflow with single-column seats/sidebars and scaled decorative cards. No new visible turn/trick feature was added; that remains in the backlog.

## Automated evidence

Nine rendered scans reported zero axe violations for the selected WCAG 2 A/AA, 2.1 AA and 2.2 AA tags:

| Screen | Language | Width |
| --- | --- | --- |
| Welcome | English | 320 px |
| Playing | English, Ukrainian, Dutch | 320 px each |
| Taxation | English | 390 px |
| Revolution | English | 390 px |
| Results | English | 1280 px |
| Lobby | English | 390 px |
| Privacy information | Dutch | 320 px |

All scanned screens had no horizontal page overflow. Browser interactions checked the first keyboard stop and skip-link destination, Space/Enter card selection, incomplete-set blocking, valid-set enablement, keyboard notification dismissal and reduced-motion styling. Production build, existing game/reliability tests and semantic label/announcement regression tests passed.

## Repeat the browser checks

Build first with `pnpm build:production`. The opt-in browser runner is `node tests/accessibility-browser.mjs`. It serves local build assets and intercepts game API calls with fixtures; it does not contact production or use real player sessions.

Install Playwright and axe-core in a separate tooling directory (not a change to production dependencies), for example:

```sh
npm install --prefix /tmp/dalmuti-a11y-tools --no-save playwright@1.62.1 axe-core@4.11.0
node /tmp/dalmuti-a11y-tools/node_modules/playwright/cli.js install chromium
A11Y_PLAYWRIGHT_MODULE=/tmp/dalmuti-a11y-tools/node_modules/playwright \
A11Y_AXE_PATH=/tmp/dalmuti-a11y-tools/node_modules/axe-core/axe.min.js \
node tests/accessibility-browser.mjs
```

Optional settings: `A11Y_CHROMIUM_PATH` for an existing browser executable; `A11Y_CHROMIUM_ARGS` for a JSON argument array; `A11Y_REPORT_PATH` for a JSON result file; `A11Y_SCREENSHOT_PREFIX` for temporary inspection images. The runner fails on axe violations or horizontal overflow. Semantic label and announcement checks run in the normal strategy suite in CI; the opt-in browser suite requires the tooling above and is not currently a CI step.

## Remaining manual verification

- Android TalkBack, iOS VoiceOver and a desktop screen reader: reading order, useful announcement frequency, card selection and complete-game usability.
- Real-device touch operation and browser text enlargement, plus forced-colour/high-contrast modes.
- Human review of every language and unusual long player names. Automated checks cover representative states, not every possible table configuration.
