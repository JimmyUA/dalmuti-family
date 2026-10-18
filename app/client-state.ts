// Poll replies can arrive after a newer move, or after leaving a room.
export function acceptSnapshot<T extends {code:string,version:number}>(current:T|null,incoming:T,poll:boolean):T|null{
if(poll&&(!current||current.code!==incoming.code))return current;
if(current?.code===incoming.code&&current.version>incoming.version)return current;
return incoming;
}

// Discard selections when their hand/table context changes so hidden cards cannot
// block Pass or become selected again if a previous context returns.
export function reconcileSelection(selection:{key:string;indices:number[]},key:string){
return selection.key===key?selection:{key,indices:[]};
}
