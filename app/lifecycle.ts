import {say,type Game} from './game';
export const GRACE_MS=60_000;
export const ONLINE_MS=15_000;
export type Presence=Record<string,number>;
export function status(game:Game,id:string,presence:Presence,now:number){const p=game.players.find(p=>p.id===id)!;if(p.bot)return 'computer';if(p.left)return 'offline';const age=now-(presence[id]??now);return age<=ONLINE_MS?'online':age<GRACE_MS?'reconnecting':'offline'}
export function transferHost(game:Game,presence:Presence,now:number){const host=game.players.find(p=>p.id===game.host);if(host&&!host.bot&&!host.left&&now-(presence[host.id]??now)<GRACE_MS)return false;const next=game.players.find(p=>!p.bot&&!p.left&&status(game,p.id,presence,now)==='online');if(!next||next.id===game.host)return false;game.host=next.id;say(game,next.name+' is now the host');return true}
export function lifecycleAction(game:Game,id:string,type:string,target:number|undefined,presence:Presence,now:number){const me=game.players.find(p=>p.id===id)!;
if(type==='replace-player'){if(game.host!==id)throw Error('Only the host can replace disconnected players.');const p=Number.isInteger(target)?game.players[target!]:undefined;if(!p||p.bot||p.id===id)throw Error('Choose a disconnected human player.');if(status(game,p.id,presence,now)!=='offline')throw Error('Wait for the 60-second disconnect grace period.');p.bot=true;p.substituted=true;say(game,p.name+' is now controlled by the computer');return}
if(type==='reclaim-seat'){if(!me.substituted)throw Error('Your seat is not controlled by the computer.');if(!['lobby','results'].includes(game.phase))throw Error('You can reclaim your seat between rounds.');me.bot=false;me.substituted=false;me.left=false;say(game,me.name+' reclaimed their seat');return}
if(type==='leave-room'){if(game.phase==='lobby'){game.players=game.players.filter(p=>p.id!==id);say(game,me.name+' left the table')}else{me.left=true;say(game,me.name+' left the table')}return}
throw Error('Unknown action.')}
