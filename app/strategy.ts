// Decisions use only the bot's hand, the current set and public hand counts.
export type TableInfo={hand:number[],pile:number[],opponentCounts:number[],lastPlayerCount:number};
const counts=(hand:number[])=>Array.from({length:14},(_,r)=>hand.filter(c=>c===r).length);
function remainder(hand:number[],set:number[]){const rest=[...hand];for(const c of set)rest.splice(rest.indexOf(c),1);return rest}
// A compact hand is easier to shed; weak isolated cards are especially costly.
function burden(hand:number[]){const c=counts(hand);let value=0;for(let r=1;r<=12;r++)if(c[r])value+=8+(c[r]===1?r*.35:0);return value}
export function legalSets(hand:number[],pile:number[]){const c=counts(hand),limit=pile.length?(pile.find(r=>r!==13)||13):14;const sets:number[][]=[];for(let r=1;r<limit&&r<=12;r++){for(let normal=1;normal<=c[r];normal++)for(let wild=0;wild<=c[13];wild++){if(pile.length&&normal+wild!==pile.length)continue;sets.push([...Array(normal).fill(r),...Array(wild).fill(13)])}}if(limit>13)for(let n=1;n<=c[13];n++)if(!pile.length||n===pile.length)sets.push(Array(n).fill(13));return sets}
export function chooseMove({hand,pile,opponentCounts,lastPlayerCount}:TableInfo):number[]{const candidates=legalSets(hand,pile);if(!candidates.length)return [];const out=candidates.find(s=>s.length===hand.length);if(out)return out;
const c=counts(hand),lead=!pile.length;const danger=opponentCounts.some(n=>n>0&&n<=(pile.length||2));const before=burden(hand);let best:number[]=[];let bestScore=-Infinity;
for(const set of candidates){const r=set.find(x=>x!==13)||13,wild=set.filter(x=>x===13).length,normal=set.length-wild,rest=remainder(hand,set);let score=before-burden(rest)+set.length*1.4-wild*4;
// Preserve high cards as future entries, and avoid splitting useful groups.
score-=(14-r)*(danger?.05:.3);if(r!==13&&normal<c[r])score-=3;
if(danger)score+=(14-r)*.8;
if(lead&&opponentCounts.every(n=>n===0||n<set.length))score+=6;
if(rest.length<=3)score+=3;
if(score>bestScore){bestScore=score;best=set}}
// Do not spend a Jester or break a set just to take a safe, early trick.
// Never yield to a player already out: winning that trick is our chance to lead.
if(!lead&&!danger&&lastPlayerCount>0&&hand.length>4&&bestScore<0)return [];
return best}
export function chooseTax(hand:number[],amount:number){let best:number[]=[],bestScore=Infinity;const choices=amount===1?hand.map(c=>[c]):hand.flatMap((c,i)=>hand.slice(i+1).map(d=>[c,d]));for(const set of choices){const rest=remainder(hand,set);const value=burden(rest)+set.reduce((sum,r)=>sum+(r===13?15:(13-r)*.7),0);if(value<bestScore){bestScore=value;best=set}}return best}
export function shouldRevolt(seat:number){return seat>=2}
