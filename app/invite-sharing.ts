import type { Language } from './i18n';

// Invite text is public and contains only a room link, never player information.
const messages: Record<Language, string> = {
  en: 'Come play Crownturn with me! It’s a free card game for friends and family. No account needed.',
  nl: 'Speel Crownturn met me mee! Een gratis kaartspel voor vrienden en familie. Geen account nodig.',
  uk: 'Зіграємо разом у Crownturn! Це безкоштовна карткова гра для друзів і родини. Реєстрація не потрібна.',
};
export type Invite = { title: string; text: string; url: string };
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'manual';

export function createInvite(origin: string, roomCode: string, lang: Language): Invite {
  if (!/^[a-f0-9]{6}$/i.test(roomCode)) throw new Error('Invalid room code.');
  const url = new URL('/', origin);
  url.searchParams.set('room', roomCode.toUpperCase());
  return { title: 'Crownturn', text: messages[lang], url: url.toString() };
}

export async function copyInvite(
  url: string,
  copy?: (text: string) => Promise<void>,
): Promise<'copied' | 'manual'> {
  try {
    if (!copy) return 'manual';
    await copy(url);
    return 'copied';
  } catch {
    return 'manual';
  }
}

// Must be called directly in a click handler: native sharing requires user activation.
// A cancelled share never silently copies or records a successful invitation.
export async function shareInvite(
  invite: Invite,
  share: ((data: Invite) => Promise<void>) | undefined,
  copy?: (text: string) => Promise<void>,
): Promise<ShareResult> {
  if (share) {
    try {
      await share(invite);
      return 'shared';
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
      // Unsupported or blocked native sharing falls back to a one-tap copy.
    }
  }
  return copyInvite(invite.url, copy);
}
