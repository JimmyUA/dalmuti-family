import {cleanupRooms} from '../app/expiry';
import {secureGameRequest,type SecurityEnv} from '../app/security';
import {health} from '../app/health';
import {growthRequest,pruneGrowth} from '../app/growth';
type Env=SecurityEnv&{
 ASSETS:{fetch(request:Request):Promise<Response>};
 CROWNTURN_ENV?:'production'|'staging';
};
export default {
 async scheduled(_event:unknown,env:Env){const deleted=await cleanupRooms(env.DB,env);await pruneGrowth(env.DB);console.log(JSON.stringify({event:"room_cleanup",deleted}));},
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  // Staging runs the Worker before all assets and marks every response noindex.
  // Production retains the original asset routing and response behavior.
  const finish=(response:Response):Response=>{
   if(env.CROWNTURN_ENV!=='staging')return response;
   const headers=new Headers(response.headers);
   headers.set('X-Robots-Tag','noindex, nofollow');
   headers.set('X-Crownturn-Environment','staging');
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  };
  if(path==='/'){
   const asset=await env.ASSETS.fetch(request);
   if(url.searchParams.has('room')||url.hostname!=='crownturn.com'){
    const response=new Response(asset.body,asset);
    response.headers.set('X-Robots-Tag','noindex, follow');
    return finish(response);
   }
   return finish(asset);
  }
  if(path==='/api/game')return finish(request.method==='POST'?await secureGameRequest(request,env):new Response('Method not allowed',{status:405,headers:{Allow:'POST'}}));
  if(path==='/api/growth')return finish(request.method==='POST'?await growthRequest(request,env):new Response('Method not allowed',{status:405,headers:{Allow:'POST'}}));
  if(path==='/api/health')return finish(request.method==='GET'?await health(env):new Response('Method not allowed',{status:405,headers:{Allow:'GET'}}));
  if(path.startsWith('/api/'))return finish(new Response('Not found',{status:404}));
  return finish(await env.ASSETS.fetch(request));
 }
};
