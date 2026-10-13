declare const __RELEASE_SHA__: string;
export const RELEASE = typeof __RELEASE_SHA__ === 'string' ? __RELEASE_SHA__ : 'development';
export const STALL_MS=5*60_000;
export function progressStatus(game:any,lastProgress:number,now:number){
 if(!['playing','tax','revolution'].includes(game.phase)||now-lastProgress<STALL_MS)return 'normal';
 const waiting=game.phase==='playing'?[game.players[game.turn]]:game.phase==='tax'?game.players.slice(0,2).filter((p:any)=>!game.tax[p.id]):game.revolution?game.players.filter((p:any)=>p.id===game.revolution):game.players.filter((p:any)=>p.id===game.host);
 return waiting.some((p:any)=>p?.presence==='offline'||p?.presence==='reconnecting')?'waiting-for-player':'no-progress';
}
export function monitoringSnapshot(game:any,lastProgress:number,now:number){return {serverRelease:RELEASE,lastProgressAt:lastProgress,progressStatus:progressStatus(game,lastProgress,now)}}
export type RequestLog={event:'game_request';traceId:string;release:string;action?:string;actionRequestId?:string;status:number;durationMs:number;outcome:string};
export function requestLog(traceId:string,status:number,durationMs:number,action?:string,requestId?:string):RequestLog{return {event:'game_request',traceId,release:RELEASE,...(action?{action}:{}),...(requestId?{actionRequestId:requestId}:{}),status,durationMs:Math.max(0,Math.round(durationMs)),outcome:status>=500?'server_error':status===429?'rate_limited':status>=400?'rejected':'ok'}}
