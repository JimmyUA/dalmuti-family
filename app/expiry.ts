import type {Database} from './game-service';
export type ExpiryEnv={ROOM_IDLE_TTL_HOURS?:string;ROOM_ACTIVE_TTL_HOURS?:string};
export function expiryPolicy(env:ExpiryEnv={}){
 const hours=(value:string|undefined,fallback:number)=>{if(value===undefined||value==='')return fallback*3600000;const n=Number(value);if(!Number.isFinite(n)||n<1||n>8760)throw Error('Room expiry must be between 1 and 8760 hours.');return n*3600000};
 return {idle:hours(env.ROOM_IDLE_TTL_HOURS,24),active:hours(env.ROOM_ACTIVE_TTL_HOURS,168)};
}
export type ExpiryPolicy=ReturnType<typeof expiryPolicy>;
export function expired(phase:string,lastActivity:number,now:number,policy:ExpiryPolicy){return now-lastActivity>=(['lobby','results'].includes(phase)?policy.idle:policy.active)}
export async function cleanupRooms(db:Database,env:ExpiryEnv,now=Date.now()){
 const policy=expiryPolicy(env);
 // Bounded work per invocation; triggers remove presence and retain a short-lived tombstone.
 const result=await db.prepare(`DELETE FROM rooms WHERE code IN (SELECT code FROM rooms WHERE last_activity<=? AND last_activity<=CASE WHEN json_extract(state,'$.phase') IN ('lobby','results') THEN ? ELSE ? END LIMIT 100)`).bind(now-Math.min(policy.idle,policy.active),now-policy.idle,now-policy.active).run();
 await db.prepare('DELETE FROM expired_rooms WHERE expired_at<?').bind(now-30*86400000).run();
 return result.meta.changes||0;
}
