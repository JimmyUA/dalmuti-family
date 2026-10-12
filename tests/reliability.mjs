import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dalmuti-reliability-'));
const databases = [];
try {
  for (const file of ['strategy', 'game', 'client-state', 'game-service', 'connection']) {
    const source = fs.readFileSync('app/' + file + '.ts', 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
    fs.writeFileSync(path.join(dir, file + '.mjs'), output);
  }
  const { handleGameRequest, RECEIPT_LIMIT } = await import('file://' + dir + '/game-service.mjs');
  const { GameConnection, PENDING_KEY, retryDelay, handKey } = await import('file://' + dir + '/connection.mjs');
  const id = crypto.randomUUID();
  function database() {
    const sqlite = new DatabaseSync(':memory:'); databases.push(sqlite);
    sqlite.exec('CREATE TABLE rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0)');
    const db = { prepare(sql) {
      let values = [];
      return { bind(...args) { values = args; return this; }, async first() { return sqlite.prepare(sql).get(...values) || null; }, async run() { const r = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(r.changes) } }; } };
    } };
    return { db, sqlite };
  }
  async function call(db, body) { const result = await handleGameRequest(db, body); return { status: result.status, data: await result.json() }; }
  const mutation = (type, game, extra = {}) => ({ type, id, code: game.code, expectedVersion: game.version, requestId: crypto.randomUUID(), ...extra });
  const fixture = database();
  const create = { type: 'create', id, name: 'Family', requestId: crypto.randomUUID(), practice: true, testMode: true };
  let result = await call(fixture.db, create); assert.equal(result.status, 200); let game = result.data;
  const again = await call(fixture.db, create);
  assert.equal(again.data.code, game.code); assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM rooms').get().n, 1);
  assert.equal(again.data.version, game.version);
  assert(!('receipts' in game)); assert(!('creationKey' in game));

  const setScenario = mutation('set-scenario', game, { scenario: 'greater-revolution' });
  result = await call(fixture.db, setScenario); game = result.data;
  result = await call(fixture.db, mutation('start', game)); game = result.data;
  assert.equal(game.phase, 'revolution');
  result = await call(fixture.db, mutation('revolution', game)); game = result.data;
  assert.equal(game.phase, 'playing');
  assert.equal(game.players[game.turn].id, id);
  const play = mutation('play', game, { cards: [game.players.find(p => p.id === id).hand[0]] });
  const duplicates = await Promise.all([call(fixture.db, play), call(fixture.db, play)]);
  assert(duplicates.every(r => r.status === 200));
  assert.equal(duplicates[0].data.version, duplicates[1].data.version);
  const row = fixture.sqlite.prepare('SELECT * FROM rooms').get();
  assert.equal(row.version, play.expectedVersion + 1);
  assert.equal(JSON.parse(row.state).log.filter(s => s.startsWith('Family played')).length, 1);
  const mismatch = await call(fixture.db, { ...play, cards: [13] }); assert.equal(mismatch.status, 409);
  const stale = await call(fixture.db, { ...play, requestId: crypto.randomUUID() }); assert.equal(stale.status, 409);
  assert.equal(stale.data.snapshot.version, row.version);
  assert.equal(fixture.sqlite.prepare('SELECT version FROM rooms').get().version, row.version);
  const tokenLeak = JSON.stringify(duplicates[0].data);
  const privateGame = JSON.parse(row.state);
  assert(!tokenLeak.includes(privateGame.players.find(p => p.bot).id));
  assert(!tokenLeak.includes('fingerprint'));
  // Retention is bounded. Forgotten receipts are still protected by their original version.
  const compacted = JSON.parse(row.state); compacted.receipts = {};
  fixture.sqlite.prepare('UPDATE rooms SET state=?').run(JSON.stringify(compacted));
  assert.equal((await call(fixture.db, play)).status, 409);
  assert.equal(RECEIPT_LIMIT, 1024);

  const joining = database(); const lobbyCreate = { ...create, requestId: crypto.randomUUID(), practice: false, testMode: false };
  const lobby = (await call(joining.db, lobbyCreate)).data;
  const join = { type: 'join', id: crypto.randomUUID(), code: lobby.code, name: 'Second', requestId: crypto.randomUUID() };
  const joins = await Promise.all([call(joining.db, join), call(joining.db, join)]);
  assert(joins.every(r => r.status === 200));
  assert.equal(joins[0].data.players.length, 2); assert.equal(joins[1].data.version, 1);
  const resumed = await call(joining.db, { type: 'poll', id: join.id, code: lobby.code }); assert.equal(resumed.data.players.length, 2);

  const contention = database(); const base = (await call(contention.db, { ...lobbyCreate, requestId: crypto.randomUUID() })).data;
  const competing = await Promise.all([call(contention.db, mutation('add-bot', base)), call(contention.db, mutation('add-bot', base))]);
  assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
  assert.equal(JSON.parse(contention.sqlite.prepare('SELECT state FROM rooms').get().state).players.length, 2);

  function storage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return { map, getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  }
  function deps(store, transport) {
    const timers = [];
    return { timers, storage: store, transport, uuid: () => crypto.randomUUID(), now: () => 10000, schedule: (fn, delay) => { const t = { fn, delay, cancelled: false }; timers.push(t); return t; }, cancel: timer => { if (timer) timer.cancelled = true; } };
  }
  // Response lost after COMMIT, then refresh: recover the exact ID and original action.
  const lostDb = database(); const store = storage({ 'dalmuti-id': id });
  let lost = false; const sent = [];
  const d = deps(store, async body => {
    sent.push(structuredClone(body)); const result = await call(lostDb.db, body);
    if (!lost) { lost = true; throw new Error('lost response'); }
    return result;
  });
  const first = new GameConnection(d); first.start();
  await first.send('create', 'Family', '', { practice: true });
  await first.tick(); assert.equal(first.state.pending, true); assert.equal(first.state.connected, false);
  const savedRequest = store.getItem(PENDING_KEY); assert(savedRequest);
  await first.send('create', 'Another', ''); assert.equal(store.getItem(PENDING_KEY), savedRequest);
  assert.equal(first.leave(), false); first.stop();
  const refreshed = new GameConnection(d); refreshed.start(); await refreshed.tick();
  assert.equal(refreshed.state.pending, false); assert(refreshed.state.game);
  assert.equal(store.getItem(PENDING_KEY), null);
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(lostDb.sqlite.prepare('SELECT COUNT(*) AS n FROM rooms').get().n, 1);
  const persistedRoom = refreshed.state.game.code;
  refreshed.stop();
  const recovered = new GameConnection(d); recovered.start(); assert.equal(recovered.state.restoring, true); await recovered.tick();
  assert.equal(recovered.state.game.code, persistedRoom); assert.equal(sent.at(-1).type, 'poll');
  assert.equal(recovered.state.restoring, false);

  // Lost play response: the same move is retried, not a fresh mutation.
  const moveStore = storage({ 'dalmuti-id': id, 'dalmuti-room': game.code }); let dropMove = true;
  const moveBodies = []; const liveDb = database(); liveDb.sqlite.prepare('INSERT INTO rooms VALUES (?,?,?)').run(game.code, JSON.stringify(privateGame), game.version);
  const moveDeps = deps(moveStore, async body => {
    moveBodies.push(structuredClone(body)); const r = await call(liveDb.db, body);
    if (body.type === 'play' && dropMove && r.status === 200) { dropMove = false; throw new Error('response lost'); }
    return r;
  });
  // Restore an earlier snapshot so the next play can be legal, with the same real rules engine.
  const setup = database(); let startGame = (await call(setup.db, { ...create, requestId: crypto.randomUUID() })).data;
  startGame = (await call(setup.db, mutation('set-scenario', startGame, { scenario: 'greater-revolution' }))).data;
  startGame = (await call(setup.db, mutation('start', startGame))).data;
  startGame = (await call(setup.db, mutation('revolution', startGame))).data;
  liveDb.sqlite.prepare('DELETE FROM rooms').run(); const setupRow = setup.sqlite.prepare('SELECT * FROM rooms').get();
  liveDb.sqlite.prepare('INSERT INTO rooms VALUES (?,?,?)').run(setupRow.code, setupRow.state, setupRow.version);
  moveStore.setItem('dalmuti-room', setupRow.code);
  let client = new GameConnection(moveDeps); client.start(); await client.tick();
  const ownHand = client.state.game.players.find(p => p.id === id).hand;
  await client.send('play', 'Family', setupRow.code, { cards: [ownHand[0]] }); await client.tick();
  assert.equal(client.state.pending, true); const moveId = JSON.parse(moveStore.getItem(PENDING_KEY)).requestId;
  client.stop(); client = new GameConnection(moveDeps); client.start();
  await client.tick(); assert.equal(client.state.pending, false);
  assert.equal(moveBodies.filter(b => b.type === 'play').length, 2);
  assert(moveBodies.filter(b => b.type === 'play').every(b => b.requestId === moveId));
  assert.equal(liveDb.sqlite.prepare('SELECT version FROM rooms').get().version, setupRow.version + 1);

  // Retryable errors retain their original request; a definitive stale error stops it.
  const errorStore = storage({ 'dalmuti-id': id }); let errorStatus = 503;
  const errorDeps = deps(errorStore, async () => ({ status: errorStatus, data: { error: 'Could not connect.' } }));
  const errorClient = new GameConnection(errorDeps); errorClient.start(); await errorClient.send('create', 'Family', '');
  await errorClient.tick(); const uncertain = errorStore.getItem(PENDING_KEY);
  assert(uncertain); assert.equal(errorClient.state.pending, true); assert.equal(errorDeps.timers.at(-1).delay, 1000);
  await errorClient.tick(); assert.equal(errorStore.getItem(PENDING_KEY), uncertain); assert.equal(errorDeps.timers.at(-1).delay, 2000);
  errorStatus = 409; await errorClient.tick(); assert.equal(errorClient.state.pending, false); assert.equal(errorStore.getItem(PENDING_KEY), null);

  // One request at a time; immediate wake is queued behind the current request.
  let resolve; let requests = 0;
  const serialStore = storage({ 'dalmuti-id': id, 'dalmuti-room': persistedRoom });
  const serialDeps = deps(serialStore, () => { requests++; return new Promise(r => { resolve = r; }); });
  const serial = new GameConnection(serialDeps); serial.start();
  const running = serial.tick(); await serial.tick(); serial.wake(); await serial.tick(); assert.equal(requests, 1);
  resolve({ status: 200, data: recovered.state.game }); await running;
  assert.equal(serialDeps.timers.at(-1).delay, 0);
  serial.visibility(false); assert.equal(serialDeps.timers.at(-1).cancelled, true); await serial.tick(); assert.equal(requests, 1);
  serial.visibility(true); assert.equal(serialDeps.timers.at(-1).delay, 0);
  serial.connectivity(false); assert.equal(serial.state.connected, false); await serial.tick(); assert.equal(requests, 1);
  serial.connectivity(true); assert.equal(serialDeps.timers.at(-1).delay, 0);
  assert.equal(retryDelay(1), 1000); assert.equal(retryDelay(100), 30000);

  // Late responses after leaving a room cannot resurrect it.
  const late = serial.tick(); assert.equal(serial.leave(), true);
  resolve({ status: 200, data: recovered.state.game }); await late; assert.equal(serial.state.game, null);
  const h1 = { code: 'ABC123', version: 1, round: 1, players: [{ id, hand: [4, 5] }] };
  assert.equal(handKey(h1, id), handKey({ ...h1, version: 2 }, id));
  assert.notEqual(handKey(h1, id), handKey({ ...h1, players: [{ id, hand: [5, 6] }] }, id));
  assert.notEqual(handKey(h1, id), handKey({ ...h1, round: 2 }, id));
  // An invite to a different room is not silently joined during recovery.
  const invite = new GameConnection(deps(store, async () => { throw new Error('unexpected request'); })); invite.start('FFFFFF');
  assert.equal(invite.state.restoring, false); assert.equal(invite.state.code, 'FFFFFF');
  console.log('Passed: real SQL duplicate/concurrent actions, stale versions, lost responses, reload recovery, request serialization, foreground/offline wakeups and safe hand selection.');
} finally {
  for (const db of databases) db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
