// Test-only transport replacement. Never imported by the production entrypoint.
import {useState} from 'react';
const id='11111111-1111-4111-8111-111111111111';
function fixture(){
 const q=new URLSearchParams(location.search),phase=q.get('phase')||'playing',n=Number(q.get('players')||8),count=Number(q.get('cards')||20);
 const hand=count===7?[3,7,7,10,10,12,13]:Array.from({length:count},(_,i)=>i<4?3:i<8?7:i<count-2?12:13);
 const players=Array.from({length:n},(_,i)=>({id:i?'seat-'+i:id,seat:i,name:i?(q.get('names')==='short'?['Matilda','Oliver','Anna'][i-1]||'Arthur':'Alexandermatildalongname'+i):'You',hand:i?[]:hand,count:i?10:count,presence:'online',score:3,wins:1,bot:i>0}));
 return {code:'ABCDEF',host:id,phase,round:phase==='lobby'?0:3,version:1,players,turn:0,last:1,pile:Number(q.get('pile'))===14?[...Array(12).fill(12),13,13]:Array(Number(q.get('pile')||2)).fill(9),finished:phase==='results'?players.map(p=>p.id):[],tax:{},log:[(q.get('names')==='short'?'Anna':'Alexandermatildalongname7')+' played 2 × 9','Oliver passed','Matilda won the trick and leads'],revolution:phase==='revolution'?id:undefined,revolutionOutcome:phase==='revolution'?undefined:'greater'};
}
export function useGameConnection(){
 const [game,setGame]=useState<any>(fixture),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const q=new URLSearchParams(location.search);
 return {game,id,name:'You',code:'ABCDEF',connected:!q.has('offline'),busy:q.has('busy')||pending,lastSync:Date.now(),latency:30,lastError:'',error,restoring:false,pending:q.has('busy')||pending,serverRelease:'development',lastTraceId:'qa-only',
 send:(type:string,_name:string,_code:string,extra:any={})=>{setPending(true);setTimeout(()=>{setGame((g:any)=>({...g,version:g.version+1,phase:type==='tax'||type==='accept'||type==='revolution'?'playing':g.phase,log:[type==='play'?'You played '+extra.cards.length+' × '+extra.cards[0]:type==='pass'?'You passed':'Table updated',...g.log].slice(0,20)}));setPending(false)},1200)},leave:()=>{},wake:()=>{},dismissError:()=>setError('')};
}
