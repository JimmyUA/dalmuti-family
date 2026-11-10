# GROW-02 — one-tap invitations

## Implementation

Crownturn now offers two clear room-invitation actions, building on the original copy-link button:

- **Share** (only where the browser supports the Web Share API): calls `navigator.share({title,text,url})` directly from a user's click. The system share sheet can offer apps such as WhatsApp, Messages and other installed targets; Crownturn does not integrate directly with, identify, or message contacts.
- **Copy link**: always available and copies only the current room URL (the familiar previous behavior), using the Clipboard API. Where native share is unsupported, this is the single primary action.
- **Manual fallback**: if sharing is unsupported/blocked and clipboard access fails, show the complete room link in a read-only input that the user can select and copy. Never ask for a browser permission bypass.
- **Cancellation**: user dismissing the native share sheet (`AbortError`) is a no-op; it never silently copies a link.
- **Localized invitation text** in English, Dutch and Ukrainian says what Crownturn is and that no account is needed. The native share payload contains the localized description, the `Crownturn` title, and the exact invitation URL.
- The URL uses `location.origin` and the current server-provided six-hex-character room code in `/?room=ABCDEF`. Staging shares staging room links; production shares production links. No player names, card data or session identifiers are included.
- Invite buttons appear immediately under the **lobby seats** while waiting for players. They remain available in the **compact room header** during play/results, outside the felt/cards, so tapping does not block game interactions. The room code stays visible in both modes.
- An eight-seat full lobby displays a warning that newcomers cannot join this table. Share/copy remain available; GROW-03 will improve expired/full/already-started invitation landing behavior.

## Analytics, privacy and limitations

- A successful clipboard write counts one anonymous `invite_copied` event (as before). A resolved native share action counts `invite_shared`, also anonymous; **it is not proof a message was delivered**. A cancellation, denied clipboard write, or manual-copy fallback does not produce a completion event. Test-mode rooms are excluded. Both events are fire-and-forget and cannot block gameplay.
- The analytics endpoint receives only event name and allowlisted source; **never** the URL, room code, names, sessions, cards, browser contacts or share destination.
- No new npm packages, database migrations, external trackers, contact permissions, cookies or native-app deep links are introduced.
- Native share depends on browser/OS support and available installed apps. A browser can report an error when the share sheet or user gesture is disallowed; in that case copying is attempted.
- Joining an active or full table is not fixed in this milestone; GROW-03 handles those landing cases. Full tables remain visually functional and don't overflow the control row.

## Validation

Automated: `node tests/invite-sharing.mjs` plus existing `node tests/growth-analytics.mjs`, `pnpm build:production`, `node tests/production.mjs` and unchanged game reliability suites. CI runs these on the PR and cannot deploy production.

**After merge, validate in isolated staging (not production):**

1. EN/NL/UK: create a *normal* room, verify the invite message is localized and has the same origin and room code. Open the link in another session and join the same lobby.
2. Android mobile: Share should open the native share chooser. If WhatsApp is installed and the system presents it, select it and inspect the text/link. Actual sending to contacts is optional and must be user-initiated.
3. iOS Safari, if available: share sheet and explicit cancellation. Cancelling must not copy a link or show a false success notification.
4. Desktop without `navigator.share`: Copy invitation must copy the exact URL. Clipboard denied/unavailable must show a fully selectable manual link.
5. With native share available, confirm the separate **Copy link** button still works and records the existing anonymous `invite_copied` counter; native resolution records `invite_shared`.
6. Check 320–390px phone layouts, 4–8 occupied seats, full lobby, active round, results, and keyboard/screen-reader access. No invite UI should overlap cards or the table.
7. Verify test-mode rooms generate no invite events and that staging and production D1 remain isolated.

Only after these staging checks pass should the usual protected, manually approved production release be considered.
