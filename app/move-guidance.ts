import {legalSets} from './strategy';
function contains(set:number[],selection:number[]){const rest=[...set];for(const card of selection){const i=rest.indexOf(card);if(i<0)return false;rest.splice(i,1)}return true}
// Incomplete pairs/triples are selectable only when they can become a legal move.
export function moveGuidance(hand:number[],pile:number[],selected:number[]){
 const legal=legalSets(hand,pile);
 const completions=legal.filter(set=>contains(set,selected));
 return {canPlay:selected.length>0&&legal.some(set=>set.length===selected.length&&contains(set,selected)),
 canAdd:(card:number)=>completions.some(set=>contains(set,[...selected,card])),hasMove:legal.length>0};
}
