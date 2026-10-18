import assert from 'node:assert/strict';
import ts from 'typescript';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dalmuti-ai-'));
try{
for(const file of ['strategy','game','client-state','move-guidance','accessibility']){let code=ts.transpileModule(fs.readFileSync('app/'+file+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;code=code.replace("'./strategy'","'./strategy.mjs'");fs.writeFileSync(path.join(dir,file+'.mjs'),code)}
const {chooseMove,chooseTax,shouldRevolt}=await import('file://'+dir+'/strategy.mjs');const {start,bots,rank,action,setTestScenario,view}=await import('file://'+dir+'/game.mjs');
const {cardLabel,gameAnnouncement}=await import('file://'+dir+'/accessibility.mjs');
assert.equal(cardLabel('Jester',13,1,4,'en'),'Jester, rank 13, card 2 of 4');
assert.match(cardLabel('Блазень',13,0,2,'uk'),/карта 1 з 2/);
assert.match(cardLabel('Nar',13,0,2,'nl'),/kaart 1 van 2/);
const publicTable={round:2,phase:'playing',turn:0,players:[{id:'me',name:'Jimmy'},{id:'other',name:'Oliver'}],log:['Oliver passed']};
assert.match(gameAnnouncement(publicTable,'me','en',s=>s),/Round 2\. Your move\. Oliver passed/);
assert.match(gameAnnouncement({...publicTable,turn:1},'me','en',s=>s),/Oliver’s move/);
assert.match(gameAnnouncement({...publicTable,phase:'tax'},'me','en',s=>s),/Taxation:/);
assert.equal(gameAnnouncement(null,'me','en',s=>s),'');
console.log('Passed: localized card position/rank labels and public turn/phase announcements.');
const {moveGuidance,tableAction}=await import('file://'+dir+'/move-guidance.mjs');
const buttonState={turn:true,busy:false,online:true,selected:0,canPlay:false,pileCount:2};
assert.equal(tableAction(buttonState).type,'pass');
assert.equal(tableAction({...buttonState,pileCount:0}).disabled,true);
assert.equal(tableAction({...buttonState,selected:1}).type,null);
assert.equal(tableAction({...buttonState,selected:1}).remaining,1);
assert.equal(tableAction({...buttonState,selected:2,canPlay:true}).type,'play');
for(const state of [{busy:true},{online:false},{turn:false}])assert.equal(tableAction({...buttonState,...state}).disabled,true);
assert.equal(tableAction({...buttonState,selected:2,canPlay:true,busy:true}).disabled,true);
console.log('Passed: one context-sensitive action, incomplete sets, empty leads, busy guards.');
const {reconcileSelection}=await import('file://'+dir+'/client-state.mjs');
const chosen={key:'before-move',indices:[0,1]};
assert.equal(reconcileSelection(chosen,'before-move'),chosen);
for(const key of ['after-play','after-pass','fresh-trick','next-turn','new-hand','next-round']){
 const cleared=reconcileSelection(chosen,key);
 assert.deepEqual(cleared,{key,indices:[]});
 const action=tableAction({...buttonState,selected:cleared.indices.length});
 assert.equal(action.type,'pass');assert.equal(action.disabled,false);
 assert.equal(tableAction({...buttonState,selected:cleared.indices.length,pileCount:0}).label,'Select cards to play');
 assert.deepEqual(reconcileSelection(cleared,chosen.key).indices,[]);
}
console.log('Passed: table changes clear hidden selections, restore Pass and never resurrect old highlights.');
let guide=moveGuidance([3,3,7,13],[4,4],[]);
assert.equal(guide.canAdd(3),true);assert.equal(guide.canAdd(7),false);assert.equal(guide.canAdd(13),true);
guide=moveGuidance([3,3,7,13],[4,4],[3]);assert.equal(guide.canPlay,false);assert.equal(guide.canAdd(3),true);assert.equal(guide.canAdd(13),true);
assert.equal(moveGuidance([3,3,7,13],[4,4],[3,13]).canPlay,true);
assert.equal(moveGuidance([3,3,7,13],[4,4],[3,7]).canPlay,false);
assert.equal(moveGuidance([3,3,7,13],[4,4],[3,3]).canAdd(13),false);
assert.equal(moveGuidance([8,9],[4],[]).hasMove,false);
assert.equal(moveGuidance([13,13],[],[13,13]).canPlay,true);
assert.equal(moveGuidance([13,13],[12,12],[]).hasMove,false);
// Every permitted prefix must extend to a set accepted by the authoritative engine.
for(const pile of [[],[8],[8,8],[8,8,8],[13]]){
 const hand=[3,3,6,13,13];
 for(let mask=1;mask<(1<<hand.length);mask++){
  const selected=hand.filter((_,i)=>mask&(1<<i)),g=moveGuidance(hand,pile,selected);
  const table={code:'GUIDE',host:'a',players:[{id:'a',name:'A',hand:[...hand],score:0,wins:0},...['b','c','d'].map(id=>({id,name:id,hand:[12],score:0,wins:0}))],phase:'playing',round:1,turn:0,pile,last:1,passes:0,finished:[],tax:{},log:[]};
  let valid=true;try{action(table,'a','play',selected)}catch{valid=false}
  assert.equal(g.canPlay,valid);
 }
}
console.log('Passed: partial sets, wildcard selection, impossible combinations and client/server move parity.');
const move=(hand,pile=[],opponentCounts=[10,10,10],lastPlayerCount=10)=>chooseMove({hand,pile,opponentCounts,lastPlayerCount});
assert.deepEqual(move([3,3,3,9,10]),[3,3,3]);
assert.deepEqual(move([4,13],[5,5]),[4,13]);
assert.deepEqual(move([6,6,10,10,12,12],[7]),[]); // save pairs in a safe trick
assert.deepEqual(move([6,6,10,10,12,12],[7],[1,10,10]),[6]); // intervene against a short hand
assert.equal(move([3,13,9,9],[4]).includes(13),false);
assert.deepEqual(move([9,10],[4]),[]);
assert.deepEqual(chooseTax([1,3,3,12],1),[12]);
assert.deepEqual(chooseTax([1,4,4,12,12],2),[12,12]);
assert.equal(shouldRevolt(0),false);assert.equal(shouldRevolt(3),true);
const lobby={code:'FAMILY',host:'human1',players:['human1','human2'].map(id=>({id,name:id,hand:[],score:0,wins:0})),phase:'lobby',round:0,turn:0,pile:[],last:0,passes:0,finished:[],tax:{},log:[]};
assert.throws(()=>action(lobby,'human2','add-bot'),/Only the host/);
action(lobby,'human1','add-bot');action(lobby,'human1','add-bot');assert.equal(lobby.players.length,4);assert.equal(lobby.players.filter(p=>p.bot).length,2);
action(lobby,'human1','remove-bot');assert.equal(lobby.players.length,3);assert.equal(lobby.players.filter(p=>!p.bot).length,2);
for(let i=0;i<5;i++)action(lobby,'human1','add-bot');assert.equal(lobby.players.length,8);assert.equal(new Set(lobby.players.map(p=>p.id)).size,8);assert.throws(()=>action(lobby,'human1','add-bot'),/full/);
action(lobby,'human1','start');bots(lobby);assert.equal(lobby.players.reduce((n,p)=>n+p.hand.length,0)<=80,true);if(lobby.phase==='revolution'){const holder=lobby.players.find(p=>p.hand.filter(c=>c===13).length===2);action(lobby,holder?.id||lobby.host,'accept');bots(lobby)}if(lobby.phase==='tax'){for(const [i,p] of lobby.players.slice(0,2).entries())if(!lobby.tax[p.id])action(lobby,p.id,'tax',p.hand.slice(0,i===0?2:1));bots(lobby)}assert.equal(lobby.phase,'playing');assert(!lobby.players[lobby.turn].bot);assert.throws(()=>action(lobby,'human1','remove-bot'),/before the game/);
const {acceptSnapshot}=await import('file://'+dir+'/client-state.mjs');
assert.equal(acceptSnapshot({code:'A',version:5},{code:'A',version:4},true).version,5);assert.equal(acceptSnapshot(null,{code:'A',version:4},true),null);assert.equal(acceptSnapshot({code:'B',version:1},{code:'A',version:4},true).code,'B');
for(const scenario of ['tax','revolution','greater-revolution'])for(let n=4;n<=8;n++){
const g={code:'TEST',host:'human',testMode:true,testScenario:scenario,players:Array.from({length:n},(_,i)=>({id:i===0?'human':'p'+i,name:'P'+i,hand:[],score:0,wins:0})),phase:'lobby',round:0,turn:0,pile:[],last:0,passes:0,finished:[],tax:{},log:[]};
assert.throws(()=>setTestScenario(g,'p1','tax'),/Only the host/);assert.throws(()=>setTestScenario(g,'human','invalid'),/Unknown/);start(g);
assert.equal(g.players.reduce((s,p)=>s+p.hand.length,0),80);for(let r=1;r<=12;r++)assert.equal(g.players.flatMap(p=>p.hand).filter(c=>c===r).length,r);
const host=g.players.find(p=>p.id==='human');if(scenario==='tax')assert(host.hand.filter(c=>c===13).length<=1);else assert.equal(host.hand.filter(c=>c===13).length,2);assert.equal(view(g,'human',42).version,42);
assert.throws(()=>setTestScenario(g,'human','tax'),/before dealing/);
const declined=structuredClone(g);action(declined,'human','accept');assert.equal(declined.revolutionOutcome,scenario==='tax'?'unavailable':'declined');
if(scenario==='tax'){assert(!g.players.some(p=>p.hand.filter(c=>c===13).length===2));action(g,'human','accept');assert.equal(g.phase,'tax')}else{const last=g.players.at(-1).id;action(g,'human','revolution');assert.equal(g.phase,'playing');assert.equal(g.revolutionOutcome,scenario==='greater-revolution'?'greater':'normal');assert.equal(view(g,'human').revolutionOutcome,g.revolutionOutcome);if(scenario==='greater-revolution'){assert.equal(last,'human');assert.equal(g.players[0].id,'human')}}
const nextRound=structuredClone(g);nextRound.phase='results';nextRound.finished=nextRound.players.map(p=>p.id);start(nextRound);assert.equal(nextRound.revolutionOutcome,undefined);
}
const normal={...lobby,phase:'lobby',testMode:false};assert.throws(()=>setTestScenario(normal,'human1','tax'),/only available/);
for(let n=4;n<=8;n++)for(let trial=0;trial<20;trial++){
const g={code:'TEST',host:'p0',players:Array.from({length:n},(_,i)=>({id:'p'+i,name:'P'+i,hand:[],bot:true,score:0,wins:0})),phase:'lobby',round:0,turn:0,pile:[],last:0,passes:0,finished:[],tax:{},log:[]};
for(let round=0;round<3;round++){start(g);assert.equal(g.players.reduce((sum,p)=>sum+p.hand.length,0),80);for(let step=0;step<100&&g.phase!=='results';step++)bots(g);assert.equal(g.phase,'results');assert.equal(new Set(g.finished).size,n)}}
for(let i=0;i<1000;i++){const hand=Array.from({length:1+Math.floor(Math.random()*20)},()=>1+Math.floor(Math.random()*13)),pile=Math.random()<.5?[]:Array(1+Math.floor(Math.random()*5)).fill(1+Math.floor(Math.random()*13));const selected=move(hand,pile);if(!selected.length){assert(pile.length);continue}const copy=[...hand];for(const c of selected){assert(copy.includes(c));copy.splice(copy.indexOf(c),1)}if(pile.length){assert.equal(selected.length,pile.length);assert(rank(selected)<rank(pile))}}
console.log('Passed: strategic choices, legal moves, and 300 complete rounds for 4–8 players.');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
