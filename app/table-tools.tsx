'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {recentTableEvent} from './table-events';

type Props={showRules:()=>void;game:any;id:string;t:(s:string)=>string;roundDetails:ReactNode;details:ReactNode;role:(i:number,n:number)=>string;replace:(seat:number)=>void;busy:boolean;online:boolean};
export function TableNotice({game,t,pending=false,restoring=false}:{game:any;t:(s:string)=>string;pending?:boolean;restoring?:boolean}){
 const previous=useRef<{code:string;version:number;log:string[];at:number}|null>(null);
 const [notice,setNotice]=useState({message:'',version:0});
 const message=notice.message;
 const status=pending?'Waiting for confirmation of your last action.':restoring?'Restoring your room…':'';
 useEffect(()=>{
  const now=Date.now();const text=recentTableEvent(previous.current,game,now,document.visibilityState==='visible');
  const changedRoom=previous.current?.code!==game.code;
  previous.current={code:game.code,version:game.version,log:game.log,at:now};
  if(changedRoom)setNotice({message:'',version:game.version});
  if(text)setNotice({message:text,version:game.version});
 },[game.code,game.version,game.log]);
 useEffect(()=>{if(!notice.message)return;const timer=setTimeout(()=>setNotice(n=>({...n,message:''})),4500);return()=>clearTimeout(timer)},[notice]);
 useEffect(()=>{const reset=()=>{previous.current=null;setNotice({message:'',version:0})};document.addEventListener('visibilitychange',reset);return()=>document.removeEventListener('visibilitychange',reset)},[]);
 // Move events use the existing page live region; delivery status is announced here.
 return <div className="table-notification"><span aria-hidden="true">{status?t(status):message?t(message):'\u00a0'}</span><span className="sr-only" role="status" aria-atomic="true">{status?t(status):''}</span></div>;
}
export function TableTools({showRules,game:g,id,t,roundDetails,details,role,replace,busy,online}:Props){
 const dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null);
 const [panel,setPanel]=useState(''),[focus,setFocus]=useState(false),[history,setHistory]=useState<string[]>([]);
 const [slots,setSlots]=useState<{header:Element|null;round:Element|null;history:Element|null}>({header:null,round:null,history:null});
 useEffect(()=>{setSlots({header:document.querySelector('.header-table-tools'),round:document.querySelector('.felt-round-tools'),history:document.querySelector('.felt-history-tools')})},[g.code,g.phase]);
 const titles:Record<string,string>={history:'History',players:'Players',round:'Round information',menu:'Table menu'};
 useEffect(()=>{document.body.classList.toggle('table-focus',focus);return()=>document.body.classList.remove('table-focus')},[focus]);
 useEffect(()=>{const changed=()=>{if(!document.fullscreenElement)setFocus(false)};document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed)},[]);
 useEffect(()=>{dialog.current?.close();setPanel('')},[g.code]);
 function open(which:string){if(which==='history')setHistory([...g.log]);if(!dialog.current?.open)opener.current=document.activeElement as HTMLElement;setPanel(which);if(!dialog.current?.open)dialog.current?.showModal()}
 function close(){dialog.current?.close();setPanel('');opener.current?.focus()}
 async function toggleFocus(){const next=!focus;setFocus(next);if(next&&document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen()}catch{/* In-page focus mode remains available. */}}else if(!next&&document.fullscreenElement){try{await document.exitFullscreen()}catch{}}}
 const revolution=g.revolutionOutcome==='greater'?'Greater revolution':g.revolutionOutcome==='normal'?'Revolution':g.revolutionOutcome==='declined'?'Revolution declined':g.phase==='tax'?'Time to pay the crown.':'Round information';
 const headerTools=<><button className="outline focus-toggle" aria-label={t(focus?'Exit focus mode':'Focus mode')} aria-pressed={focus} onClick={toggleFocus}>⛶</button><button className="outline" aria-label={t('Table menu')} onClick={()=>open('menu')}>☰</button></>;
 return <>{g.phase==='lobby'?<nav className="table-toolbar" aria-label={t('Table controls')}>{headerTools}</nav>:slots.header&&createPortal(headerTools,slots.header)}
 {slots.round&&createPortal(<button className="round-chip" onClick={()=>open('round')}>✶ {t(revolution)} <span aria-hidden="true">ⓘ</span></button>,slots.round)}
 {slots.history&&createPortal(<button className="history-chip" onClick={()=>open('history')}>↶ {t('History')}</button>,slots.history)}
 <dialog ref={dialog} className="table-dialog" aria-labelledby="table-panel-title" onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}}}>
 <div className="table-dialog-header"><h2 id="table-panel-title">{t(titles[panel]||'Table menu')}</h2><button className="quiet" aria-label={t('Close panel')} onClick={close}>×</button></div>
 <div className="table-dialog-content">
 {panel==='history'&&<><p>{t('Most recent first')}</p>{g.log[0]!==history[0]&&<button className="outline" onClick={()=>setHistory([...g.log])}>{t('Show new moves')}</button>}<ol className="table-history">{history.map((s:string,i:number)=><li key={i}>{t(s)}</li>)}</ol></>}
 {panel==='round'&&<><p>{t('YOUR FAMILY TABLE · ROUND')} {g.round} · {t(g.phase)}</p>{roundDetails||<p>{t('No revolution has been declared this round.')}</p>}</>}
 {panel==='players'&&<div className="player-details">{g.players.map((p:any,i:number)=><section key={p.id}><b>{p.name}{p.id===id?t(' (you)'):''}</b><p>{role(i,g.players.length)} · {p.count} · {t(p.presence||'online')}{p.bot?' · '+t('Computer'):''}{g.finished.includes(p.id)?' · #'+(g.finished.indexOf(p.id)+1):''}</p>{g.host===id&&p.id!==id&&!p.bot&&p.presence==='offline'&&<button disabled={busy||!online} onClick={()=>replace(p.seat)}>{t('Replace with computer')}</button>}</section>)}</div>}
 {panel==='menu'&&<><div className="menu-shortcuts"><button className="quiet" onClick={()=>open('players')}>{t('Players')} · {g.players.length}</button><button className="quiet" onClick={()=>open('history')}>{t('History')}</button><button className="quiet" onClick={()=>open('round')}>{t('Round information')}</button><button className="quiet" onClick={()=>{close();showRules()}}>{t('How to play')}</button></div><button className="outline" aria-pressed={focus} onClick={toggleFocus}>{t(focus?'Exit focus mode':'Focus mode')}</button>{details}</>}
 </div></dialog></>;
}

export function TableModal({title,closeLabel,onClose,children}:{title:string;closeLabel:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const opener=document.activeElement as HTMLElement;ref.current?.showModal();return()=>{ref.current?.close();opener?.focus()}},[]);
 return <dialog className="table-dialog" ref={ref} aria-label={title} onCancel={e=>{e.preventDefault();onClose()}}><div className="table-dialog-header"><h2>{title}</h2><button className="quiet" aria-label={closeLabel} onClick={onClose}>×</button></div><div className="table-dialog-content">{children}</div></dialog>;
}
