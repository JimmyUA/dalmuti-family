import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const dir=mkdtempSync(join(tmpdir(),'crownturn-legacy-room-'));
const host='11111111-1111-4111-8111-111111111111';
const original=JSON.parse(readFileSync('tests/fixtures/legacy-room-v1.json','utf8'));
assert.equal(original.code,'C0FFEE');
assert(!('lastProgressAt' in original));
assert(!('receipts' in original));
const sql=new DatabaseSync(':memory:');
try{
 for(const file of ['expiry','strategy','game','game-service','lifecycle','request-validation','monitoring']){
  const source=readFileSync('app/'+file+'.ts','utf8');
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
   .replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");
  writeFileSync(join(dir,file+'.mjs'),output);
 }
 const {handleGameRequest}=await import('file://'+dir+'/game-service.mjs');
 sql.exec('CREATE TABLE rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0)');
 sql.exec('CREATE TABLE presence (room TEXT NOT NULL, player TEXT NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(room,player))');
 sql.exec(readFileSync('drizzle/0002_room_expiry.sql','utf8'));
 const now=Date.now();
 sql.prepare('INSERT INTO rooms(code,state,version,last_activity) VALUES (?,?,?,?)').run(original.code,JSON.stringify(original),7,now);
 const db={prepare(query){
  let values=[];
  return {bind(...args){values=args;return this},async first(){return sql.prepare(query).get(...values)||null},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}}}};
 }};
 async function call(body){
  const result=await handleGameRequest(db,body);
  return {status:result.status,data:await result.json()};
 }
 const first=await call({type:'poll',id:host,code:original.code});
 assert.equal(first.status,200,JSON.stringify(first.data));
 assert.equal(first.data.players.length,4);
 assert.equal(first.data.players[0].score,2);
 assert.equal(first.data.phase,'lobby');
 assert.equal(first.data.code,original.code);
 assert.equal(first.data.host,host);
 assert(!JSON.stringify(first.data).includes('bot-'));
 assert(!('receipts' in first.data));
 const saved=JSON.parse(sql.prepare('SELECT state FROM rooms WHERE code=?').get(original.code).state);
 assert(Number.isFinite(saved.lastProgressAt),'Old rooms must acquire a progress baseline');
 assert.equal(saved.players[0].wins,1);
 const startRequest={type:'start',id:host,code:original.code,expectedVersion:first.data.version,requestId:crypto.randomUUID()};
 const started=await call(startRequest);
 assert.equal(started.status,200,JSON.stringify(started.data));
 assert.equal(started.data.round,1);
 assert.equal(started.data.players.length,4);
 assert.equal(started.data.players.reduce((total,p)=>total+p.count,0),80);
 const duplicate=await call(startRequest);
 assert.equal(duplicate.status,200,'Repeated post-upgrade action must be idempotent');
 assert.equal(duplicate.data.version,started.data.version);
 const resumed=await call({type:'poll',id:host,code:original.code});
 assert.equal(resumed.status,200);
 assert.equal(resumed.data.round,1);
 assert.equal(resumed.data.players.length,4);
 assert(!JSON.stringify(resumed.data).includes('creationKey'));
 const persisted=JSON.parse(sql.prepare('SELECT state FROM rooms WHERE code=?').get(original.code).state);
 assert.equal(persisted.players.length,4);
 assert(persisted.receipts?.[startRequest.requestId],'New receipt must be added to legacy game safely');
 console.log('Passed: pre-receipts/pre-progress legacy room survives poll, baseline upgrade, round start, idempotent replay and reconnect.');
}finally{sql.close();rmSync(dir,{recursive:true,force:true})}
