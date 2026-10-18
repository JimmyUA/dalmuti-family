import type {GameRequest} from './game-service';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const types=['skip-to-results','create','join','poll','start','play','pass','tax','accept','revolution','add-bot','remove-bot','set-scenario','replace-player','reclaim-seat','leave-room'];
export function validateRequest(value:unknown):GameRequest{
 const bad=()=>{throw new Error('Invalid game request.')};
 if(!value||typeof value!=='object'||Array.isArray(value))return bad();
 const b=value as Record<string,unknown>;
 if(typeof b.type!=='string'||!types.includes(b.type))return bad();
 const allowed=new Set(['type','id','code','name',...(b.type==='poll'?[]:['requestId']),...(!['create','join','poll'].includes(b.type)?['expectedVersion']:[]),...(['play','tax'].includes(b.type)?['cards']:[]),...(b.type==='create'?['practice','testMode']:[]),...(b.type==='set-scenario'?['scenario']:[]),...(b.type==='replace-player'?['target']:[])]);
 if(Object.keys(b).some(k=>!allowed.has(k)))return bad();
 if(typeof b.id!=='string'||!uuid.test(b.id))return bad();
 if(b.type!=='poll'&&(typeof b.requestId!=='string'||!uuid.test(b.requestId)))return bad();
 if(b.type!=='create'&&(typeof b.code!=='string'||!/^[a-f0-9]{6}$/i.test(b.code)))return bad();
 if(b.type==='create'&&b.code!==undefined&&(typeof b.code!=='string'||(b.code!==''&&!/^[a-f0-9]{6}$/i.test(b.code))))return bad();
 if(b.name!==undefined&&(typeof b.name!=='string'||b.name.length>24||/[\u0000-\u001f\u007f]/.test(b.name)))return bad();
 if(['create','join'].includes(b.type)&&(typeof b.name!=='string'||!b.name.trim()))return bad();
 if(!['create','join','poll'].includes(b.type)&&(!Number.isSafeInteger(b.expectedVersion)||(b.expectedVersion as number)<0))return bad();
 if(['play','tax'].includes(b.type)&&(!Array.isArray(b.cards)||!b.cards.length||b.cards.length>80||b.cards.some(c=>!Number.isInteger(c)||c<1||c>13)))return bad();
 if(b.type==='tax'&&(b.cards as number[]).length>2)return bad();
 if(b.type==='replace-player'&&(!Number.isInteger(b.target)||(b.target as number)<0||(b.target as number)>7))return bad();
 if(b.type==='set-scenario'&&!['tax','revolution','greater-revolution'].includes(b.scenario as string))return bad();
 for(const key of ['practice','testMode'])if(b[key]!==undefined&&typeof b[key]!=='boolean')return bad();
 return b as unknown as GameRequest;
}
