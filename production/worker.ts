import {cleanupRooms} from '../app/expiry';
import {secureGameRequest,type SecurityEnv} from '../app/security';
import {health} from '../app/health';
type Env=SecurityEnv&{ASSETS:{fetch(request:Request):Promise<Response>}};
export default {
 async scheduled(_event:unknown,env:Env){const deleted=await cleanupRooms(env.DB,env);console.log(JSON.stringify({event:"room_cleanup",deleted}));},
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  if(path==='/'){
   const asset=await env.ASSETS.fetch(request);
   if(url.searchParams.has('room')||url.hostname!=='crownturn.com'){const response=new Response(asset.body,asset);response.headers.set('X-Robots-Tag','noindex, follow');return response;}
   return asset;
  }
  if(path==='/api/game')return request.method==='POST'?secureGameRequest(request,env):new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
  if(path==='/api/health')return request.method==='GET'?health(env):new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
  if(path.startsWith('/api/'))return new Response('Not found',{status:404});
  return env.ASSETS.fetch(request);
 }
};
