import {secureGameRequest,type SecurityEnv} from '../app/security';
import {health} from '../app/health';
type Env=SecurityEnv&{ASSETS:{fetch(request:Request):Promise<Response>}};
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(path==='/api/game')return request.method==='POST'?secureGameRequest(request,env):new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
  if(path==='/api/health')return request.method==='GET'?health(env):new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
  if(path.startsWith('/api/'))return new Response('Not found',{status:404});
  return env.ASSETS.fetch(request);
 }
};
