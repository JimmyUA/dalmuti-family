// Logs are newest-first. Only announce additions to a recent, same-room snapshot.
export function recentTableEvent(previous:{code:string;version:number;log:string[];at:number}|null,current:{code:string;version:number;log:string[]},now:number,visible=true):string{
 if(!previous||previous.code!==current.code||current.version<=previous.version||now-previous.at>10000||!visible)return '';
 for(let added=0;added<=current.log.length;added++){
  const overlap=current.log.slice(added);
  if(overlap.length&&overlap.every((line,i)=>line===previous.log[i]))return added?current.log[0]||'':'';
 }
 return current.log[0]!==previous.log[0]?current.log[0]||'':'';
}
