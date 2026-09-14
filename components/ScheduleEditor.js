'use client';
import { useEffect, useRef, useState } from 'react';
import { supa, today, fmtDate } from '../lib/supabase';
import { shiftDate } from '../lib/phase2-data.mjs';
import { loadSchedule } from '../lib/schedule-client';
import { scheduleChange, previewSchedule, guardrails, longRunCap } from '../lib/schedule.mjs';

export default function ScheduleEditor({userId,item,initialMode='move',weekStart,onClose,onChanged}){
  const start=weekStart||shiftDate(item?.date||today(),-((new Date((item?.date||today())+'T12:00:00').getDay()+6)%7));
  const [mode,setMode]=useState(initialMode),[items,setItems]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[maxLong,setMaxLong]=useState(null);
  const [target,setTarget]=useState(shiftDate(item?.date||today(),1)),[collision,setCollision]=useState(''),[swapKey,setSwapKey]=useState('');
  const [action,setAction]=useState('skip'),[reason,setReason]=useState(''),[note,setNote]=useState(''),[minutes,setMinutes]=useState(item?.duration_min||30);
  const [actualType,setActualType]=useState('easy'),[actualMinutes,setActualMinutes]=useState(30),[keep,setKeep]=useState('drop'),[ack,setAck]=useState(false);
  const [order,setOrder]=useState(Array.from({length:7},(_,i)=>shiftDate(start,i))),[drag,setDrag]=useState(null);
  const request=useRef(null);
  useEffect(()=>{let alive=true;setItems(null);loadSchedule(userId,shiftDate(start,-14),target>shiftDate(start,20)?shiftDate(target,7):shiftDate(start,20)).then(data=>{if(alive)setItems(data);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[userId,start,target]);
  useEffect(()=>{let alive=true;supa().from('runs').select('duration_min').eq('user_id',userId).eq('run_type','long').then(r=>{if(alive&&!r.error)setMaxLong(Math.max(0,...(r.data||[]).map(x=>Number(x.duration_min)||0)));});return()=>{alive=false;};},[userId]);
  const current=items?.find(x=>x.key===item?.key)||item;
  const occupants=(items||[]).filter(x=>x.date===target&&x.key!==item?.key&&x.status!=='skipped');
  let changes=[];
  if(mode==='reorder')changes=(items||[]).filter(x=>x.date>=start&&x.date<=shiftDate(start,6)).flatMap(x=>{const to=shiftDate(start,order.indexOf(x.date));return to===x.date?[]:[scheduleChange(x,{to_date:to,action:'reorder'})];});
  else if(current){
    if(mode==='move'){
      changes=[scheduleChange(current,{to_date:target,action:occupants.length?collision||'move':'move'})];
      if(occupants.length&&collision==='swap'){const other=occupants.find(x=>x.key===swapKey);if(other)changes.push(scheduleChange(other,{to_date:current.date,action:'swap'}));}
    }else{
      const duration=Number(minutes), actualAction=action==='duration'?(duration>current.duration_min?'lengthen':'shorten'):action;
      changes=[scheduleChange(current,{action:actualAction,reason,note,status:action==='skip'||(action==='did_other'&&keep==='drop')?'skipped':'scheduled',to_date:action==='did_other'&&keep==='move'?target:current.date,duration_min:action==='duration'?duration:current.duration_min,ack_lengthen:ack,...(action==='did_other'?{actual:{run_type:actualType,duration_min:Number(actualMinutes)}}:{})})];
    }
  }
  const warnings=guardrails(previewSchedule(items||[],changes),start);
  const needsAck=mode==='change'&&action==='duration'&&current?.run_type==='long'&&Number(minutes)>current.duration_min&&Number(minutes)>longRunCap(current);
  const invalid=!items||!changes.length||changes.some(c=>c.to_date<today()||c.from_date<today())||(mode==='move'&&(target===current?.date||!target||(occupants.length&&(!collision||(collision==='swap'&&!swapKey)))))||(mode==='change'&&action!=='restore'&&(!reason||(action==='duration'&&(!Number.isInteger(Number(minutes))||Number(minutes)<1||Number(minutes)>600||Number(minutes)===current.duration_min))||(action==='did_other'&&(!Number.isInteger(Number(actualMinutes))||Number(actualMinutes)<1||Number(actualMinutes)>600||(keep==='move'&&target===current.date)))))||(needsAck&&!ack);
  async function save(){if(busy||invalid)return;setBusy(true);setError('');const payload=JSON.stringify(changes);if(request.current?.payload!==payload)request.current={payload,id:crypto.randomUUID()};try{const {error}=await supa().rpc('save_schedule_changes',{p_request_id:request.current.id,p_changes:changes});if(error)throw error;onChanged();onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}
  function moveDay(from,to){if(from==null||to==null||from===to||from<0||to<0||from>6||to>6||shiftDate(start,Math.min(from,to))<today())return;setOrder(old=>{const next=[...old];const [entry]=next.splice(from,1);next.splice(to,0,entry);return next;});}
  return <div className="wrap schedule-editor"><button className="btn ghost" disabled={busy} onClick={onClose}>‹ Back</button><h1>{mode==='reorder'?'Reorder week':mode==='move'?'Move session':'Change session'}</h1><p className="sub">{current?`${current.title} · ${fmtDate(current.date)}`:`${fmtDate(start)} – ${fmtDate(shiftDate(start,6))}`}</p>
    {mode!=='reorder'&&<div className="seg">{['move','change'].map(m=><button key={m} disabled={busy} className={mode===m?'on':''} onClick={()=>{setMode(m);setAck(false);}}>{m==='move'?'Move':'Skip / change'}</button>)}</div>}
    {error&&<div className="flag" role="alert">{error}</div>}{!items&&<p className="muted">Loading programme…</p>}
    <fieldset disabled={busy} className="schedule-fields">
    {(mode==='move'||(mode==='change'&&action==='did_other'&&keep==='move'))&&<label>Move planned session to<input type="date" min={today()} value={target} onChange={e=>{setTarget(e.target.value);setCollision('');setSwapKey('');}}/></label>}
    {mode==='move'&&occupants.length>0&&<div className="card"><strong>Already on this day</strong><p>{occupants.map(x=>x.title).join(' + ')}</p><div className="seg">{['swap','stack'].map(m=><button key={m} className={collision===m?'on':''} onClick={()=>{setCollision(m);if(occupants.length===1)setSwapKey(occupants[0].key);}}>{m==='swap'?'Swap dates':'Stack together'}</button>)}</div>{collision==='swap'&&<label>Swap with<select value={swapKey} onChange={e=>setSwapKey(e.target.value)}><option value="">Choose session</option>{occupants.map(x=><option key={x.key} value={x.key}>{x.title}</option>)}</select></label>}</div>}
    {mode==='change'&&<><label>Change<select value={action} onChange={e=>{setAction(e.target.value);setAck(false);}}><option value="skip">Skip</option>{current?.kind==='run'&&<option value="duration">Shorten / lengthen</option>}<option value="did_other" disabled={current?.date!==today()}>Did something else today</option>{current?.status==='skipped'&&<option value="restore">Restore session</option>}</select></label>
      {action==='duration'&&<label>Planned minutes · currently {current.duration_min}<input type="number" inputMode="numeric" min="1" max="600" value={minutes} onChange={e=>{setMinutes(e.target.value);setAck(false);}}/></label>}
      {action==='did_other'&&<><label>Activity completed<select value={actualType} onChange={e=>setActualType(e.target.value)}>{['easy','cycle','walk','threshold','long'].map(t=><option key={t}>{t}</option>)}</select></label><label>Actual minutes<input type="number" inputMode="numeric" min="1" max="600" value={actualMinutes} onChange={e=>setActualMinutes(e.target.value)}/></label><label>Original planned session<select value={keep} onChange={e=>setKeep(e.target.value)}><option value="drop">Drop from this week</option><option value="move">Keep and move to another date</option></select></label><p className="muted">Saving also adds this completed activity to your run/activity log.</p></>}
      {action!=='restore'&&<label>Reason<select value={reason} onChange={e=>setReason(e.target.value)}><option value="">Choose a reason</option>{['sore','tired','sick','no_time','travel','injury','weather','other'].map(r=><option key={r} value={r}>{r.replace('_',' ')}</option>)}</select></label>}<label>Note (optional)<textarea value={note} onChange={e=>setNote(e.target.value)}/></label>
    </>}
    {mode==='reorder'&&<><p className="muted">Drag a day’s sessions or use the arrows. Sessions on the same day move together; durations stay unchanged. Past days stay in place.</p>{order.map((source,i)=><div className="card reorder-row" key={source} draggable={shiftDate(start,i)>=today()} onDragStart={()=>setDrag(i)} onDragOver={e=>e.preventDefault()} onDrop={()=>{moveDay(drag,i);setDrag(null);}}><div><strong>{fmtDate(shiftDate(start,i))}</strong><p>{(items||[]).filter(x=>x.date===source).map(x=>x.title).join(' + ')||'Rest'}</p></div><button className="chip" aria-label={`Move ${fmtDate(source)} earlier`} disabled={i===0||shiftDate(start,i-1)<today()} onClick={()=>moveDay(i,i-1)}>↑</button><button className="chip" aria-label={`Move ${fmtDate(source)} later`} disabled={i===6||shiftDate(start,i)<today()} onClick={()=>moveDay(i,i+1)}>↓</button></div>)}</>}
    {changes.length>0&&<div className="card"><strong>Preview</strong>{changes.map(c=><p key={`${c.kind}:${c.id}:${c.original_date}`}><b>{(items||[]).find(x=>x.id===c.id&&(c.kind==='run'||x.original_date===c.original_date))?.title}</b><br/>{fmtDate(c.from_date)} → {c.status==='skipped'?'Skipped':`${fmtDate(c.to_date)}${c.duration_min?' · '+c.duration_min+' min':''}`}</p>)}</div>}
    {warnings.map(w=><div className="flag" key={w}>{w}</div>)}
    {needsAck&&<div className="flag"><strong>Long-run increase</strong><p>Baseline {current.baseline_duration_min??current.duration_min} min · +10% cap {longRunCap(current)} min. You entered {minutes} min.</p><p>Longest recorded run: {maxLong?`${maxLong} min`:'not available'}. The cap uses this plan’s baseline.</p><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I understand · set {minutes} min</label><button className="btn ghost" onClick={()=>{setMinutes(current.duration_min);setAck(false);}}>Keep {current.duration_min} min</button></div>}
    </fieldset><button className="btn" disabled={busy||invalid} onClick={save}>{busy?'Saving…':mode==='reorder'?'Save week':'Save change'}</button><p className="muted">Started or logged sessions cannot be rescheduled. Changes are recorded in your export.</p>
  </div>;
}
