import {chooseMove,legalSets} from './strategy';
import {expired,expiryPolicy,type ExpiryPolicy} from './expiry';
import {monitoringSnapshot} from './monitoring';
import {validateRequest} from './request-validation';
import {status,transferHost,lifecycleAction,type Presence} from './lifecycle';
import { action, computerActor, computerStep, view, addComputer, setTestScenario, type Game } from './game';

type Receipt = { player: string; fingerprint: string; version: number };
type StoredGame = Game & { receipts?: Record<string, Receipt>; creationKey?: string;lastProgressAt?:number;computerDueAt?:number;skipComputerWait?:boolean };
type Row = { state: string; version: number; last_activity:number };
type Statement = { bind(...args: any[]): Statement; first<T>(): Promise<T | null>; run(): Promise<{ meta: { changes?: number } }> };
export type Database = { prepare(sql: string): Statement };
export type GameRequest = { type: string; id: string; code?: string; name?: string; requestId?: string; expectedVersion?: number; cards?: number[]; scenario?: string; practice?: boolean; testMode?: boolean; target?: number; round?: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const moves = new Set(['skip-to-results', 'start', 'play', 'pass', 'tax', 'accept', 'revolution', 'add-bot', 'remove-bot', 'set-scenario', 'replace-player', 'reclaim-seat', 'leave-room']);
export const RECEIPT_LIMIT = 1024;
export const COMPUTER_DELAY_MS = 1800;
export function computerDelay(game:Game){
 const actor=computerActor(game);if(!actor?.bot)return 0;
 if(game.phase!=='playing')return 1200;
 const info={hand:actor.hand,pile:game.pile,opponentCounts:game.players.filter(p=>p.id!==actor.id).map(p=>p.hand.length),lastPlayerCount:game.players[game.last].hand.length};
 if(!chooseMove(info).length)return 300;
 const endgame=actor.hand.length<=4||info.opponentCounts.some(n=>n>0&&n<=3);
 if(endgame)return COMPUTER_DELAY_MS;
 const choices=legalSets(actor.hand,game.pile).length;
 return choices<=1?600:choices<=4?1000:1400;
}
export const SKIP_BATCH_SIZE = 12;
export function canSkipComputers(game:Game){
 return game.phase==='playing'&&game.players.some(p=>!p.bot)&&game.players.every(p=>p.bot||game.finished.includes(p.id));
}
function skipComputerBatch(game:StoredGame,now:number){
 // Bound each request's work; subsequent polls continue without thinking delays.
 for(let step=0;step<SKIP_BATCH_SIZE&&canSkipComputers(game)&&computerStep(game);step++);
 game.lastProgressAt=now;
 scheduleComputer(game,now);
}
function scheduleComputer(game:StoredGame,now:number){
 if(!canSkipComputers(game))game.skipComputerWait=undefined;
 game.computerDueAt=computerActor(game)?.bot?now+(game.skipComputerWait?0:computerDelay(game)):undefined;
}
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const publicView = (game: StoredGame, id: string, version: number, presence:Presence={}, now=Date.now()) => {
  const { receipts, creationKey,lastProgressAt,computerDueAt,skipComputerWait, ...safe } = game;
  const result=view(safe,id,version);const snapshot={...result,players:result.players.map((p,i)=>({...p,seat:i,presence:status(safe,safe.players[i].id,presence,now)}))};return {...snapshot,canSkipComputers:canSkipComputers(safe)&&safe.finished.includes(id)&&!safe.players.find(p=>p.id===id)?.bot&&!skipComputerWait,skippingComputers:!!skipComputerWait,computerThinking:!!computerActor(safe)?.bot,computerWaitMs:computerActor(safe)?.bot&&computerDueAt!==undefined?Math.max(0,computerDueAt-now):undefined,...monitoringSnapshot(snapshot,lastProgressAt??now,now)};
};
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
const read = (db: Database, code: string) => db.prepare('SELECT state,version,last_activity FROM rooms WHERE code=?').bind(code).first<Row>();
function replay(game: StoredGame, request: GameRequest, fingerprint: string, version: number,presence:Presence={},now=Date.now()): Response | null {
  const receipt = game.receipts?.[request.requestId!];
  if (!receipt) return null;
  if (receipt.player !== request.id || receipt.fingerprint !== fingerprint) {
    return response({ error: 'This request ID was already used for a different action.' }, 409);
  }
  return response({ ...publicView(game, request.id, version,presence,now),departed:request.type==='leave-room', acknowledgedRequestId: request.requestId });
}

export async function handleGameRequest(db: Database, request: GameRequest, now=Date.now(), policy:ExpiryPolicy=expiryPolicy()): Promise<Response> {
  try{request=validateRequest(request)}catch{return response({error:'Invalid game request.'},400)}
  if (!request || typeof request.id !== 'string' || !uuid.test(request.id)) {
    return response({ error: 'Invalid player session.' }, 400);
  }
  if (request.type !== 'poll' && (!request.requestId || !uuid.test(request.requestId))) {
    return response({ error: 'Please refresh the page to update the game.' }, 400);
  }
  if (!['create', 'join', 'poll'].includes(request.type) && !moves.has(request.type)) {
    return response({ error: 'Unknown action.' }, 400);
  }
  const fingerprint = await digest(JSON.stringify({
    type: request.type, player: request.id, code: String(request.code || '').toUpperCase(),
    name: request.type === 'create' || request.type === 'join' ? String(request.name || 'Player').slice(0, 24) : undefined,
    expectedVersion: request.expectedVersion, cards: request.cards, scenario: request.scenario,target:request.target,round:request.round,
    practice: request.practice === true, testMode: request.testMode === true,
  }));
  if (request.type === 'create') {
    // Stable, unguessable-per-request room code also makes lost create responses retry-safe.
    const creationKey = await digest(request.id + ':' + request.requestId);
    const code = creationKey.slice(0, 6).toUpperCase();
    if(await db.prepare('SELECT code FROM expired_rooms WHERE code=?').bind(code).first())return response({error:'This room has expired. Please create a new table.'},404);
    const game: StoredGame = {
      code, host: request.id, players: [{ id: request.id, name: String(request.name || 'Player').slice(0, 24), hand: [], score: 0, wins: 0 }],
      phase: 'lobby', round: 0, turn: 0, pile: [], last: 0, passes: 0, finished: [], tax: {}, log: ['Welcome to your family table.'],
      testMode: request.testMode === true, ...(request.testMode === true ? { testScenario: 'tax' as const } : {}),
      lastProgressAt:now,creationKey, receipts: { [request.requestId!]: { player: request.id, fingerprint, version: 0 } },
    };
    if (request.practice) for (let i = 0; i < 3; i++) addComputer(game);
    await db.prepare('INSERT INTO rooms (code,state,version,last_activity) VALUES (?,?,0,?) ON CONFLICT(code) DO NOTHING').bind(code, JSON.stringify(game),now).run();
    const row = await read(db, code);
    if (!row) return response({ error: 'Could not connect.' }, 503);
    const stored: StoredGame = JSON.parse(row.state);
    if(expired(stored.phase,row.last_activity,now,policy))return response({error:'This room has expired. Please create a new table.'},404);
    if (stored.creationKey !== creationKey) return response({ error: 'Room code collision. Please create a new room.' }, 409);
    const result = replay(stored, request, fingerprint, row.version);
    // Even after receipt pruning, the creation identity prevents creating a second room.
    return result || response({ ...publicView(stored, request.id, row.version), acknowledgedRequestId: request.requestId });
  }
  const code = String(request.code || '').toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) return response({ error: 'Room not found. Check the six-character code.' }, 404);
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await read(db, code);
    if (!row) {const old=await db.prepare('SELECT code FROM expired_rooms WHERE code=?').bind(code).first();return response({error:old?'This room has expired. Please create a new table.':'Room not found. Check the six-character code.'},404);}
    const game: StoredGame = JSON.parse(row.state);
    if(expired(game.phase,row.last_activity,now,policy)){const removed=await db.prepare('DELETE FROM rooms WHERE code=? AND version=? AND last_activity=?').bind(code,row.version,row.last_activity).run();if(!removed.meta.changes)continue;return response({error:'This room has expired. Please create a new table.'},404);}
    const member = game.players.some(p => p.id === request.id && (!p.bot||p.substituted));
    if(request.type==='poll'&&!member)return response({error:'Join this room first.'},403);
    if(member&&!game.players.find(p=>p.id===request.id)?.left){const touched=await db.prepare('UPDATE rooms SET last_activity=? WHERE code=? AND last_activity=?').bind(now,code,row.last_activity).run();if(!touched.meta.changes)continue;}
    const presence:Presence={};
    for(const p of game.players.filter(p=>!p.bot||p.substituted)){
      await db.prepare('INSERT INTO presence (room,player,last_seen) VALUES (?,?,?) ON CONFLICT(room,player) DO NOTHING').bind(code,p.id,now).run();
      if(p.id===request.id&&!p.left)await db.prepare('UPDATE presence SET last_seen=? WHERE room=? AND player=? AND last_seen<=?').bind(now,code,p.id,now-10000).run();
      const seen=await db.prepare('SELECT last_seen FROM presence WHERE room=? AND player=?').bind(code,p.id).first<{last_seen:number}>();presence[p.id]=seen!.last_seen;
    }
    const baseline=game.lastProgressAt===undefined;if(baseline)game.lastProgressAt=now;
    if(transferHost(game,presence,now)||baseline){
      const changed=await db.prepare('UPDATE rooms SET state=?,version=version+1 WHERE code=? AND version=?').bind(JSON.stringify(game),code,row.version).run();
      continue;
    }
    if (request.type === 'poll') {
      if(computerActor(game)?.bot){
        // Legacy rooms acquire a deadline before their first paced move.
        if(game.skipComputerWait&&canSkipComputers(game))skipComputerBatch(game,now);
        else if(game.computerDueAt===undefined)scheduleComputer(game,now);
        else if(now>=game.computerDueAt){computerStep(game);game.lastProgressAt=now;scheduleComputer(game,now)}
        else return response(publicView(game,request.id,row.version,presence,now));
        const changed=await db.prepare('UPDATE rooms SET state=?,version=version+1 WHERE code=? AND version=?').bind(JSON.stringify(game),code,row.version).run();
        if(changed.meta.changes)return response(publicView(game,request.id,row.version+1,presence,now));
        continue;
      }
      return member ? response(publicView(game, request.id, row.version,presence,now)) : response({ error: 'Join this room first.' }, 403);
    }
    const acknowledged = replay(game, request, fingerprint, row.version,presence,now);
    if (acknowledged) return acknowledged;
    if (request.type !== 'join') {
      if (!member) return response({ error: 'Join this room first.' }, 403);
      if(game.players.find(p=>p.id===request.id)?.substituted&&!['reclaim-seat','leave-room'].includes(request.type))return response({error:'You can reclaim your seat between rounds.'},400);
      // Skip is a round-scoped intent: computer polls may advance the version
      // before the click arrives. Card moves still require the exact version.
      const roundSkip=request.type==='skip-to-results'&&request.round===game.round;
      const safeSkip=roundSkip&&request.expectedVersion!<=row.version&&
        game.finished.includes(request.id)&&(canSkipComputers(game)||game.phase==='results');
      if ((request.type==='skip-to-results'&&request.round!==undefined&&!roundSkip)||
          (!safeSkip&&request.expectedVersion !== row.version)) {
        return response({ error: 'The game changed. Review the table and try again.', snapshot: publicView(game, request.id, row.version,presence,now) }, 409);
      }
    }
    try {
      if (request.type === 'join') {
        if (!member) {
          if (game.phase !== 'lobby' || game.players.length >= 8) throw new Error('This table is full or already playing.');
          game.players.push({ id: request.id, name: String(request.name || 'Player').slice(0, 24), hand: [], score: 0, wins: 0 });
        }
        else game.players.find(p=>p.id===request.id)!.left=false;
      } else if(request.type==='skip-to-results'){
        const alreadyDone=request.round===game.round&&game.phase==='results'&&game.finished.includes(request.id);
        if((!alreadyDone&&!canSkipComputers(game))||!game.finished.includes(request.id)||game.players.find(p=>p.id===request.id)?.bot)throw Error('Wait until all human players have finished the round.');
        if(!alreadyDone&&!game.skipComputerWait){game.skipComputerWait=true;skipComputerBatch(game,now)}
      } else if(['replace-player','reclaim-seat','leave-room'].includes(request.type))lifecycleAction(game,request.id,request.type,request.target,presence,now);
      else if (request.type === 'set-scenario') setTestScenario(game, request.id, request.scenario!);
      else action(game, request.id, request.type, request.cards);
      transferHost(game,presence,now);
      if(request.type!=='join'&&request.type!=='leave-room')scheduleComputer(game,now);
      else if(computerActor(game)?.bot&&game.computerDueAt===undefined)scheduleComputer(game,now);
    } catch (error: any) {
      return response({ error: error.message || 'Unknown action.', snapshot: member ? publicView(JSON.parse(row.state), request.id, row.version) : undefined }, 400);
    }
    if(!['join','leave-room'].includes(request.type))game.lastProgressAt=now;
    game.receipts ??= {};
    game.receipts[request.requestId!] = { player: request.id, fingerprint, version: row.version + 1 };
    const entries = Object.entries(game.receipts);
    if (entries.length > RECEIPT_LIMIT) game.receipts = Object.fromEntries(entries.slice(-RECEIPT_LIMIT));
    // State and acknowledgement are one atomic compare-and-swap SQL statement.
    const result = await db.prepare('UPDATE rooms SET state=?,version=version+1,last_activity=MAX(last_activity,?) WHERE code=? AND version=?')
      .bind(JSON.stringify(game), now, code, row.version).run();
    if (result.meta.changes) return response({ ...publicView(game, request.id, row.version + 1,presence,now), departed:request.type==='leave-room',acknowledgedRequestId: request.requestId });
    // Reread after a concurrent write. A duplicate finds its receipt; another action finds a stale version.
  }
  return response({ error: 'Could not connect.' }, 503);
}
