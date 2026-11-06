import assert from 'node:assert/strict';

export const STAGING_ORIGIN='https://dalmuti-family-staging.sergii-pryhodko.workers.dev';
export function stagingOrigin(value=STAGING_ORIGIN){
 const url=new URL(value);
 if(url.origin!==STAGING_ORIGIN||url.pathname!=='/'||url.search||url.hash)throw Error('Live E2E must target only the isolated staging Worker');
 return url.origin;
}
export async function stagingRequest(origin,request,fetcher=fetch){
 const url=stagingOrigin(origin);
 const response=await fetcher(url+'/api/game',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(request),signal:AbortSignal.timeout(12000),
 });
 const data=await response.json();
 if(response.headers.get('X-Crownturn-Environment')!=='staging')throw Error('E2E requests are not reaching the staging Worker');
 return {status:response.status,data};
}
const mut=(type,id,game,extra={})=>({
 type,id,code:game.code,expectedVersion:game.version,requestId:crypto.randomUUID(),...extra,
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function runStagingApiE2E(origin=STAGING_ORIGIN,fetcher=fetch){
 stagingOrigin(origin);
 const host=crypto.randomUUID(),guest=crypto.randomUUID();
 const call=body=>stagingRequest(origin,body,fetcher);
 const created=await call({type:'create',id:host,name:'E2E Host',requestId:crypto.randomUUID(),testMode:true});
 assert.equal(created.status,200,JSON.stringify(created.data));
 let game=created.data,code=game.code;
 assert.match(code,/^[A-F0-9]{6}$/);
 assert.equal(game.players.length,1);
 const second=await call({type:'join',id:guest,name:'E2E Guest',code,requestId:crypto.randomUUID()});
 assert.equal(second.status,200,JSON.stringify(second.data));
 game=(await call({type:'poll',id:host,code})).data;
 assert.equal(game.players.length,2);
 for(let i=0;i<6;i++){
  const response=await call(mut('add-bot',host,game));
  assert.equal(response.status,200,JSON.stringify(response.data));
  game=response.data;
  assert.equal(game.players.length,i+3);
 }
 assert.equal(game.players.length,8);
 assert.equal(game.players.filter(p=>p.bot).length,6);
 const invalidJoin=await call({type:'join',id:crypto.randomUUID(),name:'E2E Overflow',code,requestId:crypto.randomUUID()});
 assert.equal(invalidJoin.status,400,'Ninth player must be rejected');
 const invalidBot=await call(mut('add-bot',host,game));
 assert.equal(invalidBot.status,400,'Ninth bot must be rejected');
 const stable=(await call({type:'poll',id:guest,code})).data;
 assert.equal(stable.players.length,8);
 assert(stable.players.every(p=>p.id!==host&&!p.hand.length),'Private opponent cards must never leak');
 const started=await call(mut('start',host,game));
 assert.equal(started.status,200,JSON.stringify(started.data));
 game=started.data;
 assert.equal(game.round,1);
 assert.equal(game.phase,'revolution');
 assert.equal(game.players.length,8);
 assert.equal(game.players.reduce((sum,p)=>sum+p.count,0),80,'Deck should contain 80 cards');
 const resumed=(await call({type:'poll',id:guest,code})).data;
 assert.equal(resumed.code,code);
 assert.equal(resumed.round,1);
 assert.equal(resumed.players.length,8);
 assert(resumed.players.every(p=>p.id===guest||p.hand.length===0),'No cards from other players');
 assert(resumed.players.some(p=>p.id===guest&&p.hand.length>0),'Guest should see their own dealt cards');
 // Predictable test room: split Jesters, host has authority to continue to taxes.
 const accepted=await call(mut('accept',host,game));
 assert.equal(accepted.status,200,JSON.stringify(accepted.data));
 game=accepted.data;
 assert.equal(game.phase,'tax');
 assert.equal(game.players[0].id,host);
 const hostHand=game.players.find(p=>p.id===host).hand;
 const paid=await call(mut('tax',host,game,{cards:hostHand.slice(0,2)}));
 assert.equal(paid.status,200,JSON.stringify(paid.data));
 game=paid.data;
 for(let i=0;i<12&&game.phase==='tax';i++){
  await sleep(1200);
  const response=await call({type:'poll',id:host,code});
  assert.equal(response.status,200,JSON.stringify(response.data));
  game=response.data;
 }
 assert.equal(game.phase,'playing','Bot taxation must complete without getting stuck');
 assert.equal(game.players[0].id,host);
 assert.equal(game.turn,0);
 const firstCard=game.players[0].hand[0];
 const played=await call(mut('play',host,game,{cards:[firstCard]}));
 assert.equal(played.status,200,JSON.stringify(played.data));
 assert.equal(played.data.players.find(p=>p.id===host).count,game.players.find(p=>p.id===host).count-1);
 const replay=await call({type:'poll',id:guest,code});
 assert.equal(replay.status,200);
 assert(replay.data.version>=played.data.version);
 console.log('Passed: isolated staging real D1 game, 8 seats, ninth-seat rejection, privacy, taxation, bot move, first play and reconnect.');
 return {code,release:responseRelease(played),players:8};
}
function responseRelease(x){return x.data.serverRelease||null}
if(process.argv[1]?.endsWith('staging-api-e2e.mjs'))await runStagingApiE2E();
