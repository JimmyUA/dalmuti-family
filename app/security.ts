import {expiryPolicy,type ExpiryEnv} from './expiry';
import {RELEASE,requestLog,type RequestLog} from './monitoring';
import {validateRequest} from './request-validation';
import {handleGameRequest,type Database} from './game-service';
type Limiter={limit(input:{key:string}):Promise<{success:boolean}>};
export type SecurityEnv=ExpiryEnv&{DB:Database;NETWORK_LIMIT:Limiter;SESSION_LIMIT:Limiter;CREATE_LIMIT:Limiter;JOIN_LIMIT:Limiter};
export const BODY_LIMIT=8192;
const reply=(error:string,status:number,extra={})=>Response.json({error,...extra},{status,headers:{'Cache-Control':'no-store',...(status===429?{'Retry-After':'60'}:{})}});
async function hash(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}
async function processRequest(request:Request,env:SecurityEnv,context:{action?:string;requestId?:string}):Promise<Response>{
 try{
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return reply('Cross-site requests are not allowed.',403);
  if(request.headers.get('sec-fetch-site')==='cross-site')return reply('Cross-site requests are not allowed.',403);
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply('Send a JSON game request.',415);
  if(!env.NETWORK_LIMIT||!env.SESSION_LIMIT||!env.CREATE_LIMIT||!env.JOIN_LIMIT)return reply('Could not connect.',503);
  const networkKey='dalmuti:network:'+await hash(request.headers.get('cf-connecting-ip')||'local');
  if(!(await env.NETWORK_LIMIT.limit({key:networkKey})).success)return reply('Too many requests. Please wait a minute.',429,{retryAfter:60});
  const reader=request.body?.getReader();if(!reader)return reply('Invalid game request.',400);
  let size=0;const parts:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>BODY_LIMIT){await reader.cancel();return reply('Game request is too large.',413)}parts.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
  let body;try{body=validateRequest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)))}catch{return reply('Invalid game request.',400)}
  context.action=body.type;context.requestId=body.requestId?await hash('action:'+body.requestId):undefined;
  if(!(await env.SESSION_LIMIT.limit({key:'dalmuti:session:'+await hash(body.id)})).success)return reply('Too many requests. Please wait a minute.',429,{retryAfter:60});
  const special=body.type==='create'?env.CREATE_LIMIT:body.type==='join'?env.JOIN_LIMIT:null;
  if(special&&!(await special.limit({key:networkKey})).success)return reply('Too many requests. Please wait a minute.',429,{retryAfter:60});
  return await handleGameRequest(env.DB,body,Date.now(),expiryPolicy(env));
 }catch{return reply('Could not connect.',503)}
}

export async function secureGameRequest(request:Request,env:SecurityEnv,log:(record:RequestLog)=>void=record=>console.log(JSON.stringify(record)),sample=()=>Math.random()):Promise<Response>{
 const traceId=crypto.randomUUID(),began=performance.now();const context:{action?:string;requestId?:string}={};
 const result=await processRequest(request,env,context);
 const headers=new Headers(result.headers);headers.set('X-Request-ID',traceId);headers.set('X-Release-SHA',RELEASE);
 if(result.status>=400||context.action!=='poll'||sample()<0.01){try{log(requestLog(traceId,result.status,performance.now()-began,context.action,context.requestId))}catch{}}
 return new Response(result.body,{status:result.status,headers});
}
