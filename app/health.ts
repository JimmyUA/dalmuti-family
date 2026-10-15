import {RELEASE} from './monitoring';
import type {SecurityEnv} from './security';
export async function health(env:SecurityEnv){
 if(env.NETWORK_LIMIT&&!(await env.NETWORK_LIMIT.limit({key:'dalmuti:health'})).success)return Response.json({status:'limited',release:RELEASE},{status:429,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
 const rateLimits=!!(env.NETWORK_LIMIT&&env.SESSION_LIMIT&&env.CREATE_LIMIT&&env.JOIN_LIMIT);let database=false;
 if(rateLimits)try{await env.DB.prepare('SELECT (SELECT COUNT(last_activity) FROM rooms WHERE 0) AS rooms, (SELECT COUNT(*) FROM presence WHERE 0) AS presence, (SELECT COUNT(*) FROM expired_rooms WHERE 0) AS expired').first();database=true}catch{}
 return Response.json({status:database&&rateLimits?'ok':'unavailable',release:RELEASE,checks:{database,rateLimits}},{status:database&&rateLimits?200:503,headers:{'Cache-Control':'no-store','X-Release-SHA':RELEASE}})
}
