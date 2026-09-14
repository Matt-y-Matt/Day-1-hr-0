'use client';
import { useEffect, useState } from 'react';
import { supa, today, fmtDate } from '../lib/supabase';
import { buildSchedule } from '../lib/schedule.mjs';
import { shiftDate } from '../lib/phase2-data.mjs';

export default function Week({userId,revision,onSchedule,initialDate}) {
  const [offset, setOffset] = useState(0), [data, setData] = useState(null), [error, setError] = useState('');
  const anchor=initialDate||today();
  const start = shiftDate(anchor, -((new Date(anchor+'T12:00:00').getDay()+6)%7)+offset*7), end = shiftDate(start,6);
  useEffect(() => { let alive = true; setData(null); setError(''); (async () => {
    const s = supa();
    const results = await Promise.all([
      s.from('run_plan').select('*').gte('date',start).lte('date',end).order('date'),
      s.from('workout_days').select('*').eq('is_active',true).order('sort_order'),
      s.from('sessions').select('*').gte('date',start).lte('date',end),
      s.from('runs').select('*').gte('date',start).lte('date',end),
      s.from('lift_schedule').select('*'),
      s.from('v_load_weekly').select('*').eq('week_start',start).maybeSingle(),
    ]);
    if (!alive) return;
    if (results.some(r=>r.error)) { setError(results.find(r=>r.error).error.message); return; }
    setData({ plan: results[0].data || [], days: (results[1].data || []).filter(d=>!d.is_daily && d.session_type!=='daily'), sessions: results[2].data || [], runs: results[3].data || [], overrides: results[4].data || [], load: results[5].data });
  })().catch(e=>{if(alive)setError(e.message);}); return ()=>{alive=false;}; },[start,end,revision,userId]);
  const schedule=data?buildSchedule(data.plan,data.days,data.overrides,start,end):[];
  const planned=schedule.filter(x=>x.status!=='skipped').length;
  const runMinutes = data?.runs.filter(r=>r.run_type!=='cycle' && !r.commute_direction).reduce((n,r)=>n+Number(r.duration_min || 0),0) || 0;
  const available=(data?.runs||[]).filter(r=>!r.commute_direction);
      const displaySchedule=schedule.map(x=>{
        let status=x.status==='skipped'?'skipped':'pending';
        if(status!=='skipped'&&x.kind==='run'){const match=available.findIndex(r=>r.date===x.date&&r.run_type===x.run_type);if(match>=0){available.splice(match,1);status='done';}}
        if(status!=='skipped'&&x.kind==='lift'){const logs=data.sessions.filter(s=>s.workout_day_id===x.id&&(s.schedule_ref?s.schedule_ref===x.key:s.date===x.date));status=logs.some(s=>s.completed_at)?'done':logs.length?'active':'pending';}
        return {...x,label:x.title+(x.duration_min?' · '+x.duration_min+' min':''),status};
      });
  const completed=displaySchedule.filter(x=>x.status==='done').length;
  const km=(data?.runs||[]).filter(r=>!r.commute_direction&&!['cycle','walk'].includes(r.run_type)).reduce((n,r)=>n+Number(r.distance_km||0),0);
  return <div className="wrap week-screen"><div className="row"><button className="btn ghost compact" aria-label="Previous week" onClick={()=>setOffset(x=>x-1)}>←</button><div><h1>Week of {new Date(start+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</h1><p className="sub">{fmtDate(start)} – {fmtDate(end)}</p></div><button className="btn ghost compact" aria-label="Next week" onClick={()=>setOffset(x=>x+1)}>→</button></div>
    {error && <div className="flag" role="alert">Could not load week: {error}</div>}
    {!data && !error && <p className="muted">Loading week…</p>}
    {data && <><section className="card week-summary"><div className="week-stats"><div><small>KM</small><strong>{km.toFixed(1)}</strong></div><div><small>LIFTS</small><strong>{displaySchedule.filter(x=>x.kind==='lift'&&x.status==='done').length}/{schedule.filter(x=>x.kind==='lift'&&x.status!=='skipped').length}</strong></div><div><small>LOAD</small><strong>{data.load?.total_load??'—'}</strong></div></div><div className="row"><div className="food-bar"><i style={{width:`${planned?completed/planned*100:0}%`}}/></div><small>{planned?Math.round(completed/planned*100):0}% done</small></div></section>
    {data.plan[0]?.block && <p className="u-label">{data.plan[0].block}</p>}
    <div className="week-list">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((name,i)=>{
      const date = shiftDate(start,i);
      const sessions=displaySchedule.filter(x=>x.date===date);
      const status = !sessions.length ? 'rest' : sessions.every(s=>s.status==='done') ? 'done' : sessions.some(s=>s.status==='active' || s.status==='done') ? 'active' : date < today() ? 'unlogged' : 'pending';
      return <div key={date} className={`week-day ${date===today()?'is-today':''}`} data-date={date}><div className="week-date"><strong>{name}</strong><small>{Number(date.slice(-2))}</small></div><div className="week-pills">{sessions.length ? sessions.map(s=><button type="button" disabled={!onSchedule||date<today()||['done','active'].includes(s.status)} onClick={()=>onSchedule(schedule.find(x=>x.key===s.key),'move')} className={`pill week-session week-session-button ${s.kind} ${s.status}`} key={s.key}><span className={`session-code ${s.kind==='lift'?'lift':s.run_type==='easy'?'easy':'run'}`}>{s.kind==='lift'?'LI':s.run_type==='easy'?'RE':'RU'}</span><span className="week-entry-copy"><strong>{s.title}</strong><small>{s.status==='done'?'Completed':s.status==='active'?'In progress':s.status==='skipped'?'Skipped':'Planned'}{s.duration_min?` · ${s.duration_min} min`:''}</small></span>{date>=today()&&!['done','active'].includes(s.status)&&<span className="week-more">⋮</span>}</button>) : <div className="week-rest"><span className="session-code">–</span><span><strong>Rest · daily routine</strong><small>Optional mobility</small></span></div>}</div><span className={`week-status ${status}`} aria-label={status}>{{done:'✓',active:'◐',pending:'○',unlogged:'–',rest:'·'}[status]}</span></div>;
    })}</div>    {end>=today()&&onSchedule&&<button className="btn ghost" onClick={()=>onSchedule(null,'reorder',start)}>Reorder week</button>}
<p className="muted">✓ Completed · ◐ In progress · ○ Planned · – No log</p></>}
  </div>;
}
