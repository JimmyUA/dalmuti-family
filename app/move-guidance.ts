import {legalSets} from './strategy';
function contains(set:number[],selection:number[]){const rest=[...set];for(const card of selection){const i=rest.indexOf(card);if(i<0)return false;rest.splice(i,1)}return true}
// Incomplete pairs/triples are selectable only when they can become a legal move.
export function moveGuidance(hand:number[],pile:number[],selected:number[]){
 const legal=legalSets(hand,pile);
 const completions=legal.filter(set=>contains(set,selected));
 return {canPlay:selected.length>0&&legal.some(set=>set.length===selected.length&&contains(set,selected)),
 canAdd:(card:number)=>completions.some(set=>contains(set,[...selected,card])),hasMove:legal.length>0};
}

export function tableAction(input:{turn:boolean;busy:boolean;online:boolean;selected:number;canPlay:boolean;pileCount:number}){
 const {turn,busy,online,selected,canPlay,pileCount}=input;
 const blocked=!turn||busy||!online;
 if(selected>0)return canPlay?{type:'play',disabled:blocked,label:'Play cards',remaining:0} as const:{type:null,disabled:true,label:'Complete your set',remaining:Math.max(0,pileCount-selected)} as const;
 if(!pileCount)return {type:null,disabled:true,label:'Select cards to play',remaining:0} as const;
 return {type:'pass',disabled:blocked,label:'Pass',remaining:0} as const;
}
