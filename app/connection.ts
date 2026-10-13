import { acceptSnapshot } from './client-state';
export type Snapshot = { code: string; version: number; round: number; players: Array<{ id: string; hand: number[]; [key: string]: any }>; [key: string]: any };
export type PendingAction = { type: string; id: string; code?: string; name?: string; requestId: string; expectedVersion?: number; [key: string]: any };
export type ConnectionState = { game: Snapshot | null; id: string; name: string; code: string; connected: boolean; busy: boolean; restoring: boolean; pending: boolean; lastSync: number | null; latency: number | null; lastError: string; error: string; lastTraceId?:string; serverRelease?:string };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Reply = { status: number; data: any };
export type Dependencies = { storage: Storage; transport: (body: any) => Promise<Reply>; uuid: () => string; now: () => number; schedule: (fn: () => void, delay: number) => any; cancel: (timer: any) => void };
export const PENDING_KEY = 'dalmuti-pending-action';
export const retryDelay = (failures: number) => Math.min(30_000, 1_000 * 2 ** Math.min(5, Math.max(0, failures - 1)));
export const handKey = (game: Snapshot | null, id: string) => game ? JSON.stringify([game.code, game.round, game.players.find(p => p.id === id)?.hand || []]) : '';

export class GameConnection {
  state: ConnectionState = { game: null, id: '', name: '', code: '', connected: false, busy: false, restoring: false, pending: false, lastSync: null, latency: null, lastError: '', error: '' };
  private listeners = new Set<(state: ConnectionState) => void>();
  private pending: PendingAction | null = null;
  private recovery: string | null = null;
  private timer: any;
  private inFlight = false;
  private stopped = false;
  private failures = 0;
  private epoch = 0;
  private immediate = false;
  private networkOnline = true;
  private visible = true;
  constructor(private deps: Dependencies) {}
  subscribe(listener: (state: ConnectionState) => void) { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); }; }
  private emit(patch: Partial<ConnectionState> = {}) {
    this.state = { ...this.state, ...patch, pending: !!this.pending, restoring: !!this.recovery && !this.state.game, busy: !!this.pending || !!this.recovery };
    for (const listener of this.listeners) listener(this.state);
  }
  start(invite?: string | null) {
    try {
      const s = this.deps.storage;
      const id = s.getItem('dalmuti-id') || this.deps.uuid();
      s.setItem('dalmuti-id', id);
      const name = s.getItem('dalmuti-name') || '';
      const saved = s.getItem('dalmuti-room');
      const raw = s.getItem(PENDING_KEY);
      if (raw) {
        const pending = JSON.parse(raw);
        if (pending?.id !== id || typeof pending.requestId !== 'string' || typeof pending.type !== 'string') throw new Error('Could not restore the pending action.');
        this.pending = pending;
        this.recovery = pending.code || null;
      } else if (saved && (!invite || invite.toUpperCase() === saved)) this.recovery = saved;
      this.emit({ id, name, code: this.pending?.code || invite?.toUpperCase() || saved || '' });
      this.wake();
    } catch { this.emit({ error: 'Device storage is unavailable. Enable storage to play safely.' }); }
  }
  private schedule(delay: number) {
    this.deps.cancel(this.timer);
    if (this.stopped || !this.networkOnline || !this.visible) return;
    this.timer = this.deps.schedule(() => { void this.tick(); }, delay);
  }
  wake() {
    if (this.stopped) return;
    this.immediate = true;
    if (!this.inFlight) this.schedule(0);
  }
  connectivity(online: boolean) {
    this.networkOnline = online;
    if (!online) { this.deps.cancel(this.timer); this.emit({ connected: false }); }
    else { this.failures = 0; this.wake(); }
  }
  visibility(visible: boolean) {
    this.visible = visible;
    if (!visible) this.deps.cancel(this.timer);
    else this.wake();
  }
  async send(type: string, name: string, code: string, extra: Record<string, any> = {}) {
    if (this.pending || this.recovery || !this.state.id || this.stopped) return;
    if (this.state.game && !this.state.connected) { this.wake(); return; }
    const request: PendingAction = { ...extra, type, id: this.state.id, name, code: this.state.game?.code || code.toUpperCase(), requestId: this.deps.uuid(),
      ...(!['create', 'join'].includes(type) ? { expectedVersion: this.state.game?.version } : {}) };
    try {
      const existing = this.deps.storage.getItem(PENDING_KEY);
      if (existing) {
        const saved = JSON.parse(existing);
        if (saved.id !== this.state.id) throw new Error('Invalid pending action.');
        this.pending = saved; this.emit(); this.wake(); return;
      }
      // Persist before sending. A reload must reuse this exact ID, version and payload.
      this.deps.storage.setItem('dalmuti-name', name);
      this.deps.storage.setItem(PENDING_KEY, JSON.stringify(request));
      this.pending = request;
      this.emit({ error: '', name });
      this.wake();
    } catch { this.emit({ error: 'Device storage is unavailable. Enable storage to play safely.' }); }
  }
  private adopt(game: Snapshot) {
    const current = this.state.game;
    const accepted = acceptSnapshot(current, game, !!current);
    if (accepted !== game) return;
    this.deps.storage.setItem('dalmuti-room', game.code);
    this.recovery = null;
    this.emit({ game, code: game.code });
  }
  private clearPending() {
    const saved = this.deps.storage.getItem(PENDING_KEY);
    if (saved && JSON.parse(saved).requestId === this.pending?.requestId) this.deps.storage.removeItem(PENDING_KEY);
    this.pending = null;
  }
  async tick() {
    if (this.inFlight || this.stopped || !this.networkOnline || !this.visible) return;
    this.immediate = false;
    this.deps.cancel(this.timer);
    const pending = this.pending;
    const code = this.state.game?.code || this.recovery;
    if (!pending && !code) return;
    const body = pending || { type: 'poll', id: this.state.id, code };
    const epoch = this.epoch;
    const began = this.deps.now();
    this.inFlight = true;
    let retry = false;
    let retryAfter=0;
    try {
      const { status, data } = await this.deps.transport(body);
      if (epoch !== this.epoch || this.stopped) return;
      this.emit({lastTraceId:typeof data?.traceId==='string'?data.traceId:this.state.lastTraceId,serverRelease:typeof data?.serverRelease==='string'?data.serverRelease:this.state.serverRelease});
      if(status===429)retryAfter=60_000;
      if (status >= 500 || status === 429) throw new Error(data?.error || 'Could not connect.');
      if (status >= 400 || data?.error) {
        if (data?.snapshot) this.adopt(data.snapshot);
        if (pending) this.clearPending();
        if (status === 403 || status === 404) {
          this.deps.storage.removeItem('dalmuti-room'); this.recovery = null;
          this.emit({ game: null, code: '' });
        }
        if (!this.state.game && this.recovery) {
          this.deps.storage.removeItem('dalmuti-room'); this.recovery = null;
        }
        this.failures = 0;
        this.emit({ connected: this.networkOnline, error: data?.error || 'Could not connect.', lastError: data?.error || 'Could not connect.' });
      } else {
        if (!data?.code || !Number.isSafeInteger(data.version) || !Array.isArray(data.players)) throw new Error('Could not connect.');
        // A poll is not acknowledgement of an uncertain move. Only its exact replay resolves it.
        if (pending && data.acknowledgedRequestId !== pending.requestId) throw new Error('Could not connect.');
        if(data.departed){this.recovery=null;this.deps.storage.removeItem('dalmuti-room');this.emit({game:null,code:''});this.epoch++}else this.adopt(data);
        if (pending) this.clearPending();
        this.failures = 0;
        this.emit({ connected: this.networkOnline, error: '', lastSync: this.deps.now(), latency: Math.max(0, this.deps.now() - began) });
      }
    } catch (error: any) {
      if (epoch === this.epoch && !this.stopped) {
        retry = true; this.failures++;
        this.emit({ connected: false, lastError: error.message || 'Could not connect.' });
      }
    } finally {
      this.inFlight = false;
      if (!this.stopped) this.schedule(this.immediate ? 0 : retry ? Math.max(retryAfter,retryDelay(this.failures)) : 1500);
    }
  }
  dismissError() { this.emit({error:''}); }
  leave() {
    if (this.pending) { this.emit({ error: 'Waiting for confirmation of your last action.' }); return false; }
    this.epoch++; this.recovery = null;
    this.deps.cancel(this.timer);
    this.deps.storage.removeItem('dalmuti-room');
    this.emit({ game: null, code: '', connected: false, error: '' });
    return true;
  }
  stop() { this.stopped = true; this.epoch++; this.deps.cancel(this.timer); this.listeners.clear(); }
}

export async function browserTransport(body: any): Promise<Reply> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 10_000);
  try {
    const result = await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal });
    const data=await result.json();data.serverRelease=result.headers.get('X-Release-SHA')||data.serverRelease;data.traceId=result.headers.get('X-Request-ID')||undefined;return { status: result.status, data };
  } finally { clearTimeout(timeout); }
}
