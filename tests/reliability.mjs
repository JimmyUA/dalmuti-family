import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dalmuti-reliability-'));
const databases = [];
try {
  for (const file of ['strategy', 'game', 'client-state', 'game-service', 'connection','lifecycle','request-validation','security','monitoring','health']) {
    const source = fs.readFileSync('app/' + file + '.ts', 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
    fs.writeFileSync(path.join(dir, file + '.mjs'), output);
  }
  const { handleGameRequest, RECEIPT_LIMIT, COMPUTER_DELAY_MS } = await import('file://' + dir + '/game-service.mjs');
  const { GameConnection, PENDING_KEY, retryDelay, handKey } = await import('file://' + dir + '/connection.mjs');
  const id = crypto.randomUUID();
  function database() {
    const sqlite = new DatabaseSync(':memory:'); databases.push(sqlite);
    sqlite.exec('CREATE TABLE presence (room TEXT NOT NULL, player TEXT NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(room,player))');
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
  errorStatus = 429; await errorClient.tick(); assert.equal(errorDeps.timers.at(-1).delay,60000); assert.equal(errorStore.getItem(PENDING_KEY),uncertain);
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
  // Presence and lifecycle use an injected server clock; heartbeats do not change game versions.
  const life=database();const hostId=crypto.randomUUID(),guestId=crypto.randomUUID();const time=1_000_000;
  const invoke=(body,t=time)=>callLife(body,t);
  async function callLife(body,t){const r=await handleGameRequest(life.db,body,t);return {status:r.status,data:await r.json()}}
  let table=(await invoke({type:'create',id:hostId,name:'Host',requestId:crypto.randomUUID()})).data;
  table=(await invoke({type:'join',id:guestId,name:'Guest',code:table.code,requestId:crypto.randomUUID()})).data;
  const poll=(who,t)=>invoke({type:'poll',id:who,code:table.code},t);
  await poll(hostId,time);table=(await poll(guestId,time)).data;const initialVersion=table.version;
  table=(await poll(guestId,time+20_000)).data;assert.equal(table.version,initialVersion);assert.equal(table.players.find(p=>p.id!==guestId).presence,'reconnecting');
  table=(await poll(guestId,time+59_000)).data;assert.notEqual(table.host,guestId);
  table=(await poll(guestId,time+60_000)).data;assert.equal(table.host,guestId);assert.equal(table.version,initialVersion+1);
  const req=(type,who,extra={})=>({type,id:who,code:table.code,expectedVersion:table.version,requestId:crypto.randomUUID(),...extra});
  assert.equal((await invoke(req('replace-player',guestId,{target:99}),time+60_000)).status,400);
  const hostSeat=table.players.find(p=>p.name==='Host').seat;
  const takeover=req('replace-player',guestId,{target:hostSeat});table=(await invoke(takeover,time+60_000)).data;
  assert.equal(table.players[hostSeat].substituted,true);assert.equal(table.players[hostSeat].count,0);
  const replayed=(await invoke(takeover,time+60_000)).data;assert.equal(replayed.version,table.version);
  table=(await poll(hostId,time+60_000)).data;assert.equal(table.players[hostSeat].bot,true);
  table=(await invoke(req('reclaim-seat',hostId),time+60_000)).data;assert.equal(table.players[hostSeat].bot,false);
  // The previous host does not automatically take hosting back.
  assert.notEqual(table.host,hostId);
  const leave=req('leave-room',hostId);const left=await invoke(leave,time+60_000);assert.equal(left.data.departed,true);assert.equal(left.data.players.length,1);
  assert.equal((await invoke(leave,time+60_000)).data.departed,true);
  assert.equal((await poll(hostId,time+60_000)).status,403);
  table=(await invoke({type:'join',id:hostId,code:table.code,name:'Host',requestId:crypto.randomUUID()},time+60_000)).data;
  // Grace-period enforcement and exact hand/score preservation during active-game replacement.
  const raw=life.sqlite.prepare('SELECT state,version FROM rooms WHERE code=?').get(table.code);const active=JSON.parse(raw.state);
  active.phase='playing';active.players.forEach(p=>{p.hand=[4,5];p.score=7});active.players.push({id:'bot-a',name:'Bot A',bot:true,hand:[6],score:0,wins:0},{id:'bot-b',name:'Bot B',bot:true,hand:[7],score:0,wins:0});active.turn=0;active.host=guestId;
  life.sqlite.prepare('UPDATE rooms SET state=? WHERE code=?').run(JSON.stringify(active),table.code);
  table=(await poll(guestId,time+61_000)).data;
  const target=table.players.find(p=>p.name==='Host').seat;
  assert.equal((await invoke(req('replace-player',guestId,{target}),time+61_000)).status,400);
  table=(await poll(guestId,time+121_000)).data;
  // Keep the guest host alive while the other human is absent.
  const replacement=req('replace-player',guestId,{target});table=(await invoke(replacement,time+121_000)).data;
  assert.equal(table.players[target].score,7);assert.equal(table.players[target].count,2);assert.equal(table.players[target].substituted,true);
  assert.equal((await invoke(req('reclaim-seat',hostId),time+121_000)).status,400);
  const stored=JSON.parse(life.sqlite.prepare('SELECT state FROM rooms WHERE code=?').get(table.code).state);stored.phase='results';life.sqlite.prepare('UPDATE rooms SET state=? WHERE code=?').run(JSON.stringify(stored),table.code);
  table=(await poll(hostId,time+121_000)).data;table=(await invoke(req('reclaim-seat',hostId),time+121_000)).data;
  assert.equal(table.players.find(p=>p.id===hostId).bot,false);

  const {validateRequest}=await import('file://'+dir+'/request-validation.mjs');
  const {secureGameRequest:rawSecureGameRequest,BODY_LIMIT}=await import('file://'+dir+'/security.mjs');
  const valid={type:'play',id,requestId:crypto.randomUUID(),code:'ABC123',expectedVersion:1,cards:[4,4]};
  for(const invalid of [null,[],{}, {...valid,id:'bot-1'}, {...valid,type:'unknown'}, {...valid,cards:[]}, {...valid,cards:[0]}, {...valid,cards:[14]}, {...valid,cards:[2.5]}, {...valid,cards:Array(81).fill(4)}, {...valid,cards:'4'}, {...valid,expectedVersion:-1}, {...valid,expectedVersion:'1'}, {...valid,expectedVersion:Number.MAX_SAFE_INTEGER+1}, {...valid,host:true}, {...valid,name:'x'.repeat(25)}, {...valid,name:'x\n'}, {...valid,code:'123'}, {...valid,type:'pass'}, {...valid,type:'replace-player',cards:undefined,target:99}, {...valid,type:'poll'}])assert.throws(()=>validateRequest(invalid));
  assert.equal(validateRequest(valid).cards.length,2);
  assert.throws(()=>validateRequest({type:'create',id,requestId:crypto.randomUUID(),name:'   '}));
  const securityDb=database();let dbAccess=0;
  const spyDb={prepare(sql){dbAccess++;return securityDb.db.prepare(sql)}};
  function limiter(limit){const counts=new Map();return {counts,async limit({key}){const n=(counts.get(key)||0)+1;counts.set(key,n);return {success:n<=limit}}}}
  const logRecords=[];const secureGameRequest=(req,env)=>rawSecureGameRequest(req,env,record=>logRecords.push(record),()=>0.5);
  const makeEnv=()=>({DB:spyDb,NETWORK_LIMIT:limiter(600),SESSION_LIMIT:limiter(120),CREATE_LIMIT:limiter(10),JOIN_LIMIT:limiter(40)});
  const http=(body,headers={})=>new Request('https://game.example/api/game',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  let limits=makeEnv();
  for(const [req,status] of [[http(valid,{Origin:'https://attacker.example'}),403],[http(valid,{'Sec-Fetch-Site':'cross-site'}),403],[http(valid,{'Content-Type':'application/jsonp'}),415],[http('{'),400],[http({...valid,cards:[99]}),400],[http('x'.repeat(BODY_LIMIT+1)),413]]){assert.equal((await secureGameRequest(req,limits)).status,status);assert.equal(dbAccess,0)}
  assert.equal((await secureGameRequest(http(valid),{DB:spyDb})).status,503);assert.equal(dbAccess,0);
  limits=makeEnv();limits.NETWORK_LIMIT=limiter(0);const limited=await secureGameRequest(http(valid),limits);assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');assert.equal(dbAccess,0);
  limits=makeEnv();limits.SESSION_LIMIT=limiter(0);assert.equal((await secureGameRequest(http(valid),limits)).status,429);assert.equal(dbAccess,0);
  limits=makeEnv();const makeRoom=()=>({type:'create',id:crypto.randomUUID(),name:'Person',requestId:crypto.randomUUID()});
  for(let i=0;i<10;i++)assert.equal((await secureGameRequest(http(makeRoom()),limits)).status,200);
  assert.equal((await secureGameRequest(http(makeRoom()),limits)).status,429);
  assert([...limits.NETWORK_LIMIT.counts.keys()].every(key=>!key.includes('192.0.2.1')));
  assert([...limits.SESSION_LIMIT.counts.keys()].every(key=>!key.includes(id)));
  // Verify authorization against real stored games, not only schema checks.
  const permissionDb=database();const owner=crypto.randomUUID(),viewer=crypto.randomUUID();
  let room=(await call(permissionDb.db,{type:'create',id:owner,name:'Owner',requestId:crypto.randomUUID(),practice:true})).data;
  room=(await call(permissionDb.db,{type:'join',id:viewer,name:'Viewer',code:room.code,requestId:crypto.randomUUID()})).data;
  const before=permissionDb.sqlite.prepare('SELECT version FROM rooms').get().version;
  for(const type of ['start','add-bot','remove-bot','replace-player','set-scenario','reclaim-seat']){
    const extra=type==='replace-player'?{target:0}:type==='set-scenario'?{scenario:'tax'}:{};
    const response=await call(permissionDb.db,{type,id:viewer,code:room.code,expectedVersion:room.version,requestId:crypto.randomUUID(),...extra});
    assert.equal(response.status,400);
    assert.equal(permissionDb.sqlite.prepare('SELECT version FROM rooms').get().version,before);
  }
  const outsider=crypto.randomUUID();assert.equal((await call(permissionDb.db,{type:'poll',id:outsider,code:room.code})).status,403);
  assert.equal((await call(permissionDb.db,{type:'start',id:outsider,code:room.code,expectedVersion:room.version,requestId:crypto.randomUUID()})).status,403);
  const state=JSON.parse(permissionDb.sqlite.prepare('SELECT state FROM rooms').get().state);const bot=state.players.find(p=>p.bot);
  assert.equal((await call(permissionDb.db,{type:'poll',id:bot.id,code:room.code})).status,400);
  assert(!JSON.stringify(room).includes(owner));
  const {progressStatus,RELEASE}=await import('file://'+dir+'/monitoring.mjs');
  const {health}=await import('file://'+dir+'/health.mjs');
  const live={phase:'playing',turn:0,players:[{id:'seat',presence:'online'}]};
  assert.equal(progressStatus(live,1000,1000+299999),'normal');assert.equal(progressStatus(live,1000,1000+300000),'no-progress');
  assert.equal(progressStatus({...live,players:[{id:'seat',presence:'offline'}]},1000,1000+300000),'waiting-for-player');
  assert.equal(progressStatus({...live,phase:'results'},1000,1000+300000),'normal');
  assert.equal((await health(makeEnv())).status,200);
  assert.equal((await health({})).status,503);
  assert.equal((await health({...makeEnv(),DB:{prepare(){throw Error('private database message')}}})).status,503);
  assert(logRecords.some(r=>r.status===429));assert(logRecords.some(r=>r.status===503));
  const logged=JSON.stringify(logRecords);assert(!logged.includes(id));assert(!logged.includes('192.0.2.1'));assert(!logged.includes('Person'));assert(!logged.includes('cards'));
  const redact=makeEnv();const privateId=crypto.randomUUID();
  const checked=await rawSecureGameRequest(http({type:'create',id:privateId,requestId:privateId,name:'SecretName'}),redact,record=>logRecords.push(record));
  assert.equal(checked.headers.get('X-Release-SHA'),RELEASE);assert(checked.headers.get('X-Request-ID'));assert(!JSON.stringify(logRecords).includes(privateId));assert(!JSON.stringify(logRecords).includes('SecretName'));
  const healthy=await health(makeEnv());assert.equal((await healthy.json()).release,RELEASE);
  const {deploymentUrl,checkDeployment}=await import('../scripts/smoke-check.mjs');
  assert.equal(deploymentUrl('Worker: https://dalmuti-family.family.workers.dev'),'https://dalmuti-family.family.workers.dev');
  assert.throws(()=>deploymentUrl('No URL'));
  const mockFetch=async(url,options)=>String(url).includes('/api/health')?Response.json({status:'ok',release:'expected',checks:{database:true,rateLimits:true}}):String(url).includes('/api/game')?new Response('{}',{status:404,headers:{'X-Release-SHA':'expected'}}):new Response('DALMUTI',{status:200});
  await checkDeployment('https://dalmuti-family.family.workers.dev','expected',mockFetch);
  await assert.rejects(()=>checkDeployment('https://dalmuti-family.family.workers.dev','wrong',mockFetch));
  // Each due computer action is a single CAS write, regardless of polling clients.
  const paced=database();const pacedCode='ABCDEF';const human=crypto.randomUUID();
  const pacedState={code:pacedCode,host:human,players:[{id:human,name:'Human',hand:[11,12],score:0,wins:0},...['A','B','C'].map((name,i)=>({id:'bot-'+i,name,hand:[6+i,9+i],score:0,wins:0,bot:true}))],phase:'playing',round:1,turn:0,pile:[],last:0,passes:0,finished:[],tax:{},log:[],lastProgressAt:10000};
  paced.sqlite.prepare('INSERT INTO rooms(code,state,version) VALUES(?,?,0)').run(pacedCode,JSON.stringify(pacedState));
  const humanMove={type:'play',id:human,code:pacedCode,requestId:crypto.randomUUID(),expectedVersion:0,cards:[12]};
  const execute=async(body,time)=>{const r=await handleGameRequest(paced.db,body,time);return {status:r.status,data:await r.json()}};
  const pollBody={type:'poll',id:human,code:pacedCode};
  let pacedResult=await execute(humanMove,10000);assert.equal(pacedResult.status,200);assert.equal(pacedResult.data.turn,1);assert.equal(pacedResult.data.computerThinking,true);
  assert(!('computerDueAt' in pacedResult.data));
  const due=10000+COMPUTER_DELAY_MS;
  assert.equal((await execute(pollBody,due-1)).data.version,1);
  const simultaneous=await Promise.all([execute(pollBody,due),execute(pollBody,due)]);
  assert(simultaneous.every(r=>r.status===200&&r.data.version===2));
  let saved=JSON.parse(paced.sqlite.prepare('SELECT state FROM rooms').get().state);
  assert.equal(saved.turn,2);assert.equal(saved.players[1].hand.length,1);assert.equal(saved.players[2].hand.length,2);
  assert.equal(saved.computerDueAt,due+COMPUTER_DELAY_MS);
  assert.equal((await execute(pollBody,due+1)).data.version,2);
  // Retrying the original human request acknowledges it without running another bot.
  assert.equal((await execute(humanMove,due+1)).data.version,2);
  assert.equal((await execute(pollBody,due+COMPUTER_DELAY_MS)).data.version,3);
  // A long absence advances one move, not a catch-up burst.
  assert.equal((await execute(pollBody,due+100000)).data.version,4);
  assert.equal((await execute(pollBody,due+100000)).data.version,4);
  // Legacy rooms with no deadline pause first. Bot tax submissions are separate.
  saved={...pacedState,phase:'tax',players:[pacedState.players[1],pacedState.players[2],pacedState.players[0],pacedState.players[3]],tax:{},computerDueAt:undefined};
  paced.sqlite.prepare('UPDATE rooms SET state=?,version=0').run(JSON.stringify(saved));
  assert.equal((await execute(pollBody,200000)).data.phase,'tax');
  let taxed=(await execute(pollBody,200000+COMPUTER_DELAY_MS)).data;
  assert.equal(Object.keys(taxed.tax).length,1);assert.equal(taxed.phase,'tax');
  taxed=(await execute(pollBody,200000+2*COMPUTER_DELAY_MS)).data;assert.equal(taxed.phase,'playing');
  assert.equal(Object.keys(taxed.tax).length,2);
  const {chooseMove}=await import('file://'+dir+'/strategy.mjs');
  for(const seats of [4,8]){
    const complete=database();let clock=300000;
    const invoke=async body=>{const r=await handleGameRequest(complete.db,body,clock);assert.equal(r.status,200);return r.json()};
    let table=await invoke({type:'create',id:human,name:'Human',requestId:crypto.randomUUID(),practice:true,testMode:true});
    const send=async(type,extra={})=>invoke({type,id:human,code:table.code,requestId:crypto.randomUUID(),expectedVersion:table.version,...extra});
    while(table.players.length<seats)table=await send('add-bot');
    table=await send('start');table=await send('accept');
    for(let step=0;table.phase!=='results'&&step<1000;step++){
      clock+=COMPUTER_DELAY_MS;
      const me=table.players.find(p=>p.id===human);
      if(table.phase==='tax'&&!table.tax[human])table=await send('tax',{cards:me.hand.slice(-2)});
      else if(table.phase==='playing'&&table.players[table.turn].id===human){
        const cards=chooseMove({hand:me.hand,pile:table.pile,opponentCounts:table.players.filter(p=>p.id!==human).map(p=>p.count),lastPlayerCount:table.players[table.last].count});
        table=await send(cards.length?'play':'pass',cards.length?{cards}:{});
      }else table=await invoke({type:'poll',id:human,code:table.code});
    }
    assert.equal(table.phase,'results');assert.equal(table.finished.length,seats);
  }
  console.log('Passed: paced computer moves, concurrent poll CAS, replay safety, legacy deadlines and separate tax choices.');
  console.log('Passed: release headers, schema health checks, inactivity classification and log redaction.');
  console.log('Passed: strict validation, HTTP/body/origin guards, rate limits, private-token redaction and host/seat permissions.');

  console.log('Passed: real SQL duplicate/concurrent actions, stale versions, lost responses, reload recovery, request serialization, foreground/offline wakeups and safe hand selection.');
} finally {
  for (const db of databases) db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
