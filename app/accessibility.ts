import type {Language} from './i18n';
export function cardLabel(name:string,rank:number,index:number,total:number,lang:Language){
 return lang==='uk'?`${name}, ранг ${rank}, карта ${index+1} з ${total}`:lang==='nl'?`${name}, rang ${rank}, kaart ${index+1} van ${total}`:`${name}, rank ${rank}, card ${index+1} of ${total}`;
}
export function gameAnnouncement(game:any,id:string,lang:Language,translate:(text:string)=>string){
 if(!game)return '';
 const phase=translate(({lobby:'Waiting for players.',revolution:'Choose whether to declare a revolution.',tax:'Taxation: choose return cards or wait for the other players.',results:'Round results.'} as Record<string,string>)[game.phase]||game.phase),round=game.round;
 const roundLabel=lang==='uk'?`Раунд ${round}`:lang==='nl'?`Ronde ${round}`:`Round ${round}`;
 if(game.phase!=='playing')return `${roundLabel}. ${phase}.`;
 const player=game.players[game.turn];
 const turn=player?.id===id?translate('Your move.'):player?player.name+translate('’s move.'):'';
 return `${roundLabel}. ${turn} ${translate(game.log[0]||'')}`;
}
