'use client';
import {useRef,useState} from 'react';
import {today} from '../lib/supabase';
import {exportDates,exportMarkdown} from '../lib/export.mjs';
import {loadExport} from '../lib/export-client';
export default function ExportPanel({userId}){
 const [range,setRange]=useState(7),[end,setEnd]=useState(today),[txt,setTxt]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const lock=useRef(false);
 const dates=exportDates(end,range);
 async function build(){if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');setTxt('');try{const data=await loadExport(userId,dates.start,dates.end),output=exportMarkdown(data,dates.start,dates.end);setTxt(output);try{await navigator.clipboard.writeText(output);setMessage('Copied. Ready to paste.');}catch{setMessage('Export ready. Use Copy again or select the text below.');}}catch(e){setError(`Export failed: ${e.message}`);}finally{lock.current=false;setBusy(false);}}
 async function copy(){try{await navigator.clipboard.writeText(txt);setMessage('Copied.');}catch{setMessage('Select the text below and copy it manually.');}}
 return <div className="wrap logging-screen export-screen"><h1>Export</h1><p className="sub">Markdown · preview here, then paste into a chat</p><fieldset disabled={busy}><div className="seg">{[[1,'Day'],[7,'Week'],[30,'Month']].map(([v,n])=><button className={range===v?'on':''} key={v} onClick={()=>{setRange(v);setTxt('');setMessage('');}}>{n}</button>)}</div><label>Ending on<input type="date" max={today()} value={end} onChange={e=>{if(e.target.value){setEnd(e.target.value);setTxt('');setMessage('');}}}/></label><p>{dates.start} → {dates.end} · {range} day{range>1?'s':''}</p><button className="btn" onClick={build}>{busy?'Building export…':'Build & copy'}</button></fieldset>{error&&<div className="flag" role="alert">{error}</div>}{message&&<p role="status">{message}</p>}{txt&&<><button className="btn ghost" onClick={copy}>Copy again</button><label>Export preview<textarea readOnly className="export-preview" value={txt} onFocus={e=>e.target.select()}/></label></>}</div>;
}
