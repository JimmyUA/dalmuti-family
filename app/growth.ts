// Anonymous aggregate counters only. Do not add room codes, player IDs, URLs, or free-form attributes.
export const GROWTH_RETENTION_DAYS = 90;
export const RETURN_MIN_MS = 12 * 60 * 60 * 1000;
export const RETURN_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export type GrowthEvent =
  | 'landing_loaded' | 'invite_landing' | 'invite_copied'
  | 'room_created' | 'practice_started' | 'human_joined'
  | 'multiplayer_completed' | 'weekly_active_room' | 'return_room';
export type GrowthSource = 'direct' | 'invite' | 'reddit' | 'linkedin' | 'community' | 'other' | 'server';
export const CLIENT_EVENTS = ['landing_loaded', 'invite_landing', 'invite_copied', 'invite_shared'] as const;
export const CLIENT_SOURCES = ['direct', 'invite', 'reddit', 'linkedin', 'community', 'other'] as const;
export type GrowthDatabase = {
  prepare(sql: string): { bind(...values: any[]): { run(): Promise<any> } };
};
type GrowthGame = {
  phase: string; testMode?: boolean;
  players: Array<{ bot?: boolean }>;
  growthWeekStart?: string;
  growthLastCompletionAt?: number;
};
const dateUTC = (time: number) => new Date(time).toISOString().slice(0, 10);
export function weekStartUTC(time: number): string {
  const d = new Date(time);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Called only on an actual transition to results, before the room CAS.
// Markers live in private room state so one room is counted at most once per UTC week;
// no per-room ID is ever copied to the analytics table.
export function completionGrowthEvents(game: GrowthGame, previousPhase: string, now: number): GrowthEvent[] {
  if (previousPhase === 'results' || game.phase !== 'results' || game.testMode) return [];
  if (game.players.filter(p => !p.bot).length < 2) return [];
  const events: GrowthEvent[] = ['multiplayer_completed'];
  const week = weekStartUTC(now);
  if (game.growthWeekStart !== week) {
    game.growthWeekStart = week;
    events.push('weekly_active_room');
  }
  const previous = game.growthLastCompletionAt;
  if (previous !== undefined && now - previous >= RETURN_MIN_MS && now - previous <= RETURN_MAX_MS) {
    events.push('return_room');
  }
  game.growthLastCompletionAt = now;
  return events;
}

// All writes are best effort: a failed aggregate update must never fail a game action.
// This can undercount on database errors; counters are directional, not billing-grade.
export async function recordGrowth(db: GrowthDatabase, event: GrowthEvent, now = Date.now(), source: GrowthSource = 'server'): Promise<void> {
  try {
    await db.prepare('INSERT INTO growth_daily (day,event,source,total) VALUES (?,?,?,1) ON CONFLICT(day,event,source) DO UPDATE SET total=total+1')
      .bind(dateUTC(now), event, source).run();
  } catch { /* Metrics are strictly optional. */ }
}
export async function recordGrowthBatch(db: GrowthDatabase, events: GrowthEvent[], now: number): Promise<void> {
  for (const event of events) await recordGrowth(db, event, now);
}
export async function pruneGrowth(db: GrowthDatabase, now = Date.now()): Promise<void> {
  try {
    const cutoff = dateUTC(now - GROWTH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db.prepare('DELETE FROM growth_daily WHERE day < ?').bind(cutoff).run();
  } catch { /* Migrations and temporary failures must not interrupt room cleanup. */ }
}

type Limiter = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type GrowthRequestEnv = { DB: GrowthDatabase; CREATE_LIMIT: Limiter };
const respond = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
async function networkHash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export async function growthRequest(request: Request, env: GrowthRequestEnv): Promise<Response> {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return respond(403);
    if (request.headers.get('sec-fetch-site') === 'cross-site') return respond(403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return respond(415);
    if (!env.DB || !env.CREATE_LIMIT) return respond(503);
    // Separate limiter key from room creation: telemetry is capped at 10/min/network,
    // while creation keeps its independent native Cloudflare budget.
    const key = 'crownturn:growth:' + await networkHash(request.headers.get('cf-connecting-ip') || 'local');
    if (!(await env.CREATE_LIMIT.limit({ key })).success) return respond(429);
    const reader = request.body?.getReader();
    if (!reader) return respond(400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 160) { await reader.cancel(); return respond(413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2 ||
        !CLIENT_EVENTS.includes(body.event) || !CLIENT_SOURCES.includes(body.source)) return respond(400);
    await recordGrowth(env.DB, body.event, Date.now(), body.source);
    return respond(204);
  } catch { return respond(400); }
}
