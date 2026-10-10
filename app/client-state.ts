// Poll replies can arrive after a newer move, or after leaving a room.
export function acceptSnapshot<T extends {code:string,version:number}>(current:T|null,incoming:T,poll:boolean):T|null{
if(poll&&(!current||current.code!==incoming.code))return current;
if(current?.code===incoming.code&&current.version>incoming.version)return current;
return incoming;
}
