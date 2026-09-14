'use client';
import { useEffect, useState } from 'react';
import { supa, today, fmtDate } from '../lib/supabase';
import { shiftDate } from '../lib/phase2-data.mjs';

export default function Week() {
  const [offset, setOffset] = useState(0), [data, setData] = useState(null), [error, setError] = useState('');
  const start = shiftDate(today(), -((new Date().getDay()+6)%7)+offset*7), end = shiftDate(start,6);
  useEffect(() => { let alive = true; setData(null); setError(''); (async () => {
    const s = supa();
    const results = await Promise.all([
      s.from('run_plan').select('*').gte('date',start).lte('date',end).order('date'),
      s.from('workout_days').select('*').eq('is_active',true).order('sort_order'),
      s.from('sessions').select('*').gte('date',start).lte('date',end),
      s.from('runs').select('*').gte('date',start).lte('date',end),
      s.from('v_load_weekly').select('*').eq('week_start',start).maybeSingle(),
    ]);
    if (!alive) return;
    if (results.some(r=>r.error)) { setError(results.find(r=>r.error).error.message); return; }
    setData({ plan: results[0].data || [], days: (results[1].data || []).filter(d=>!d.is_daily && d.session_type!=='daily'), sessions: results[2].data || [], runs: results[3].data || [], load: results[4].data });
  })().catch(e=>{if(alive)setError(e.message);}); return ()=>{alive=false;}; },[start,end]);
  const planned = data ? data.plan.filter(p=>p.run_type!=='rest').length + data.days.length : 0;
  const runMinutes = data?.runs.filter(r=>r.run_type!=='cycle' && !r.commute_direction).reduce((n,r)=>n+Number(r.duration_min || 0),0) || 0;
  return <div className="wrap"><div className="row"><button className="btn ghost compact" aria-label="Previous week" onClick={()=>setOffset(x=>x-1)}>←</button><div><h1>Week</h1><p className="sub">{fmtDate(start)} – {fmtDate(end)}</p></div><button className="btn ghost compact" aria-label="Next week" onClick={()=>setOffset(x=>x+1)}>→</button></div>
    {error && <div className="flag" role="alert">Could not load week: {error}</div>}
    {!data && !error && <p className="muted">Loading week…</p>}
    {data && <><div className="week-stats"><div><strong>{planned}</strong><small>Planned sessions</small></div><div><strong>{Math.round(runMinutes)}</strong><small>Run minutes logged</small></div><div><strong>{data.load?.total_load ?? '—'}</strong><small>Recorded load</small></div></div>
    {data.plan[0]?.block && <p className="u-label">{data.plan[0].block}</p>}
    <div className="week-list">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((name,i)=>{
      const date = shiftDate(start,i), plannedRuns = data.plan.filter(p=>p.date===date && p.run_type!=='rest'), lifts=data.days.filter(d=>d.weekday===i+1);
      // Match each planned run to at most one recorded run of that type.
      const available = data.runs.filter(r=>r.date===date && !r.commute_direction && r.run_type!=='cycle');
      const sessions = plannedRuns.map(r=>{ const match=available.findIndex(a=>a.run_type===r.run_type); if(match>=0)available.splice(match,1); return {id:r.id,label:`${r.run_type} run${r.duration_min ? ' · '+r.duration_min+' min' : ''}`,status:match>=0?'done':'pending',kind:'run'}; });
      lifts.forEach(d=>{const logs=data.sessions.filter(s=>s.date===date && s.workout_day_id===d.id);sessions.push({id:d.id,label:d.name,status:logs.some(s=>s.completed_at)?'done':logs.length?'active':'pending',kind:'lift'});});
      const status = !sessions.length ? 'rest' : sessions.every(s=>s.status==='done') ? 'done' : sessions.some(s=>s.status==='active' || s.status==='done') ? 'active' : date < today() ? 'unlogged' : 'pending';
      return <div key={date} className={`week-day ${date===today()?'is-today':''}`} data-date={date}><div className="week-date"><strong>{name}</strong><small>{Number(date.slice(-2))}</small></div><div className="week-pills">{sessions.length ? sessions.map(s=><span className={`pill week-session ${s.kind}`} key={s.id}>{s.status==='done'?'✓ ':s.status==='active'?'◐ ':''}{s.label}</span>) : <span className="muted">Rest · daily routine only</span>}</div><span className={`week-status ${status}`} aria-label={status}>{{done:'✓',active:'◐',pending:'○',unlogged:'–',rest:'·'}[status]}</span></div>;
    })}</div><p className="muted">✓ Completed · ◐ In progress · ○ Planned · – No log</p></>}
  </div>;
}
