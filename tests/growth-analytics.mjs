import assert from 'node:assert/strict';
import ts from 'typescript';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const directory=mkdtempSync(join(tmpdir(),'crownturn-growth-'));
const sql=new DatabaseSync(':memory:');
try {
  for(const file of ['expiry','strategy','game','game-service','lifecycle','request-validation','monitoring','growth','growth-client']){
    const source=readFileSync('app/'+file+'.ts','utf8');
    const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
      .replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");
    writeFileSync(join(directory,file+'.mjs'),output);
  }
  const {handleGameRequest}=await import('file://'+directory+'/game-service.mjs');
  const {completionGrowthEvents,weekStartUTC,pruneGrowth,growthRequest,recordGrowth}=await import('file://'+directory+'/growth.mjs');
  const {landingGrowth,sendGrowth}=await import('file://'+directory+'/growth-client.mjs');
  const now=Date.UTC(2026,10,9,9);
  assert.equal(weekStartUTC(now),'2026-11-09');
  assert.equal(weekStartUTC(Date.UTC(2026,10,15,23)),'2026-11-09');
  assert.equal(weekStartUTC(Date.UTC(2026,10,16,0)),'2026-11-16');
  const sample={phase:'results',players:[{bot:false},{bot:false},{bot:true}]};
  assert.deepEqual(completionGrowthEvents(sample,'playing',now),['multiplayer_completed','weekly_active_room']);
  assert.deepEqual(completionGrowthEvents(sample,'results',now),[]);
  sample.phase='playing';sample.phase='results';
  assert.deepEqual(completionGrowthEvents(sample,'playing',now+13*3600000),['multiplayer_completed','return_room']);
  sample.phase='playing';sample.phase='results';
  assert.deepEqual(completionGrowthEvents(sample,'playing',now+14*3600000),['multiplayer_completed']);
  assert.deepEqual(completionGrowthEvents({...sample,testMode:true},'playing',now),[]);
  assert.deepEqual(completionGrowthEvents({...sample,players:[{bot:false},{bot:true}]},'playing',now),[]);

  sql.exec('CREATE TABLE rooms(code TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0)');
  sql.exec('CREATE TABLE presence(room TEXT NOT NULL, player TEXT NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(room,player))');
  sql.exec(readFileSync('drizzle/0002_room_expiry.sql','utf8'));
  sql.exec(readFileSync('drizzle/0003_growth_daily.sql','utf8'));
  const db={prepare(query){
    let values=[];
    return {
      bind(...args){values=args;return this;},
      async first(){return sql.prepare(query).get(...values)||null;},
      async run(){const result=sql.prepare(query).run(...values);return {meta:{changes:Number(result.changes)}};}
    };
  }};
  const count=(event)=>Number(sql.prepare('SELECT COALESCE(SUM(total),0) AS n FROM growth_daily WHERE event=?').get(event).n);
  const host=crypto.randomUUID(),guest=crypto.randomUUID();
  const created={type:'create',id:host,name:'Host private name',requestId:crypto.randomUUID()};
  const call=async(body,time=now)=>{
    const response=await handleGameRequest(db,body,time);
    return {status:response.status,data:await response.json()};
  };
  const first=await call(created);
  assert.equal(first.status,200);
  assert.equal(count('room_created'),1);
  const replay=await call(created);
  assert.equal(replay.status,200);
  assert.equal(count('room_created'),1,'a retried create must not count twice');
  const code=first.data.code;
  const join={type:'join',id:guest,name:'Guest private name',requestId:crypto.randomUUID(),code};
  assert.equal((await call(join)).status,200);
  assert.equal((await call(join)).status,200);
  assert.equal(count('human_joined'),1,'joining the same session is not another new human');
  let game=(await call({type:'poll',id:host,code})).data;
  for(let i=0;i<2;i++){
    const result=await call({type:'add-bot',id:host,code,expectedVersion:game.version,requestId:crypto.randomUUID()});
    assert.equal(result.status,200);game=result.data;
  }
  assert.equal(game.players.length,4);
  function forceNearFinish(round){
    const row=sql.prepare('SELECT state,version FROM rooms WHERE code=?').get(code);
    const stored=JSON.parse(row.state);
    stored.round=round;stored.phase='playing';stored.turn=0;stored.pile=[];stored.passes=0;stored.last=0;
    stored.players[0].hand=[1];stored.players[1].hand=[2];
    for(const p of stored.players.slice(2))p.hand=[];
    stored.finished=stored.players.slice(2).map(p=>p.id);
    sql.prepare('UPDATE rooms SET state=? WHERE code=?').run(JSON.stringify(stored),code);
    return row.version;
  }
  let version=forceNearFinish(1);
  const finish1={type:'play',id:host,code,expectedVersion:version,requestId:crypto.randomUUID(),cards:[1]};
  const finished=await call(finish1);
  assert.equal(finished.status,200,JSON.stringify(finished.data));
  assert.equal(finished.data.phase,'results');
  assert(!JSON.stringify(finished.data).includes('growthWeekStart'));
  assert(!JSON.stringify(finished.data).includes('growthLastCompletionAt'));
  assert.equal(count('multiplayer_completed'),1);
  assert.equal(count('weekly_active_room'),1);
  assert.equal((await call(finish1)).status,200);
  assert.equal(count('multiplayer_completed'),1,'a replay must not count twice');
  version=forceNearFinish(2);
  const finish2={...finish1,expectedVersion:version,requestId:crypto.randomUUID()};
  const finishedAgain=await call(finish2,now+13*3600000);
  assert.equal(finishedAgain.status,200,JSON.stringify(finishedAgain.data));
  assert.equal(count('multiplayer_completed'),2);
  assert.equal(count('weekly_active_room'),1,'one room must be counted once within UTC week');
  assert.equal(count('return_room'),1,'return requires a separate match after 12 hours');

  const practice=await call({type:'create',id:crypto.randomUUID(),name:'Practice',practice:true,requestId:crypto.randomUUID()});
  assert.equal(practice.status,200);
  assert.equal(count('practice_started'),1);
  assert.equal(count('room_created'),1,'practice is separate from multiplayer rooms');
  const testing=await call({type:'create',id:crypto.randomUUID(),name:'Testing',testMode:true,requestId:crypto.randomUUID()});
  assert.equal(testing.status,200);
  assert.equal(count('room_created'),1,'test rooms excluded from growth metrics');

  assert.deepEqual(landingGrowth(''),{event:'landing_loaded',source:'direct'});
  assert.deepEqual(landingGrowth('?room=Ab12Cd'),{event:'invite_landing',source:'invite'});
  assert.deepEqual(landingGrowth('?room=Ab12Cd&utm_source=reddit'),{event:'invite_landing',source:'reddit'});
  assert.deepEqual(landingGrowth('?utm_source=https://private.example/ABCDEF'),{event:'landing_loaded',source:'direct'});
  const existingFetch=globalThis.fetch;let captured;
  try{
    globalThis.fetch=(url,options)=>{captured={url,options};return Promise.resolve(new Response(null,{status:204}));};
    sendGrowth('invite_copied','invite');
    assert.equal(captured.url,'/api/growth');
    assert.deepEqual(JSON.parse(captured.options.body),{event:'invite_copied',source:'invite'});
    assert.equal(captured.options.referrerPolicy,'no-referrer');
    assert.equal(captured.options.credentials,'omit');
    assert(!captured.options.body.includes(code));
  }finally{globalThis.fetch=existingFetch;}

  const keys=[];
  const env={DB:db,CREATE_LIMIT:{limit:async({key})=>{keys.push(key);return {success:true};}}};
  const request=(data,options={})=>new Request('https://crownturn.test/api/growth',{
    method:'POST',headers:{'content-type':'application/json',...options.headers},
    body:typeof data==='string'?data:JSON.stringify(data)
  });
  assert.equal((await growthRequest(request({event:'invite_landing',source:'invite'}),env)).status,204);
  assert.equal(count('invite_landing'),1);
  assert(keys[0].startsWith('crownturn:growth:'));
  assert(!keys[0].includes('local'),'rate limiter uses hashed IP');
  assert.equal((await growthRequest(request({event:'invite_landing',source:'invite',room:code}),env)).status,400);
  assert.equal((await growthRequest(request({event:'multiplayer_completed',source:'server'}),env)).status,400,'a browser cannot forge verified game events');
  assert.equal((await growthRequest(request({event:'landing_loaded',source:'server'}),env)).status,400);
  assert.equal((await growthRequest(request({event:'landing_loaded',source:'reddit'},{headers:{origin:'https://evil.test'}}),env)).status,403);
  assert.equal((await growthRequest(request({event:'landing_loaded',source:'reddit'},{headers:{'sec-fetch-site':'cross-site'}}),env)).status,403);
  assert.equal((await growthRequest(request('a'.repeat(200)),env)).status,413);
  assert.equal((await growthRequest(request({event:'landing_loaded',source:'direct'}),{...env,CREATE_LIMIT:{limit:async()=>({success:false})}})).status,429);
  assert.equal(count('invite_landing'),1,'invalid and blocked events never count');
  await recordGrowth(db,'landing_loaded',now,'reddit');
  await recordGrowth(db,'landing_loaded',now,'reddit');
  assert.equal(sql.prepare("SELECT total FROM growth_daily WHERE event='landing_loaded' AND source='reddit'").get().total,2);
  sql.prepare('INSERT INTO growth_daily(day,event,source,total) VALUES (?,?,?,?)').run('2020-01-01','landing_loaded','direct',42);
  await pruneGrowth(db,now);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM growth_daily WHERE day='2020-01-01'").get().n,0);
  assert.equal(count('landing_loaded'),2);
  sql.exec('DROP TABLE growth_daily');
  assert.equal((await call({type:'create',id:crypto.randomUUID(),name:'Resilient',requestId:crypto.randomUUID()})).status,200,'analytics outage must not block gameplay');

  console.log('Passed: anonymous aggregate funnel, server-verified events, idempotency, weekly room counts, privacy, retention, rate limiting, and analytics failure isolation.');
}finally{sql.close();rmSync(directory,{recursive:true,force:true});}
