// Anonymous, best-effort product counters. Never include room links, player data, or identifiers.
const sourceChoices = ['reddit', 'linkedin', 'community', 'other'] as const;
export type ClientGrowthEvent = 'landing_loaded' | 'invite_landing' | 'invite_copied';
export function landingGrowth(search: string): { event: ClientGrowthEvent; source: string } {
  const params = new URLSearchParams(search);
  const invited = /^[a-f0-9]{6}$/i.test(params.get('room') || '');
  const rawSource = params.get('utm_source');
  const source = sourceChoices.includes(rawSource as typeof sourceChoices[number]) ? rawSource! : invited ? 'invite' : 'direct';
  return { event: invited ? 'invite_landing' : 'landing_loaded', source };
}
export function sendGrowth(event: ClientGrowthEvent, source = 'direct'): void {
  try {
    // Fixed endpoint and strict payload. No Referer: an invite page URL contains a room code.
    void fetch('/api/growth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, source }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true,
    }).catch(() => {});
  } catch { /* Analytics never affect gameplay. */ }
}
