'use client';
import { useEffect, useState } from 'react';
import { supa } from '../lib/supabase';
import { allRows } from '../lib/export-client';
import { strengthRows } from '../lib/progress.mjs';
import { shiftDate } from '../lib/phase2-data.mjs';
import { loadWorkout } from '../lib/workout-client';
import { loadSchedule } from '../lib/schedule-client';
import { localDate, latestPain, PAIN_MOVEMENTS, sessionProgress } from '../lib/phase2-data.mjs';

export default function Dashboard({ userId, revision, onPain, onRun, onDaily, onStart, onToday, onProgress, onWeek, onSettings, email }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [date, setDate] = useState(localDate);
  useEffect(() => { const refresh = () => setDate(localDate()); const id = setInterval(refresh, 30000); document.addEventListener('visibilitychange', refresh); return () => { clearInterval(id); document.removeEventListener('visibilitychange', refresh); }; }, []);
  useEffect(() => {
    let alive = true; setData(null); setError('');
    (async () => {
      try {
        const s = supa();
        const results = await Promise.all([
          loadSchedule(userId,date,date).then(data=>({data})),
          s.from('pain_logs').select('*').eq('user_id', userId).eq('date', date),
          s.from('workout_days').select('*').eq('user_id', userId).eq('is_active', true),
          s.from('sessions').select('*').eq('user_id', userId).eq('date', date).order('started_at', { ascending: false, nullsFirst: false }),
        ]);
        for (const r of results) if (r.error) throw r.error;
        const [schedule, pain, days, sessions] = results.map(r => r.data || []);
        const daily = days.filter(d => d.is_daily === true);
        const scheduled=schedule.filter(x=>x.status!=='skipped');
        const plans=scheduled.filter(x=>x.kind==='run');
        const lifts=scheduled.filter(x=>x.kind==='lift').map(x=>x.day);
        const selected = [...daily, ...lifts];
        const cards = await Promise.all(selected.map(async day => {
          const { data: baseItems, error } = day.is_daily ? await s.from('workout_exercises').select('*, exercises(name)').eq('workout_day_id', day.id).eq('is_enabled', true).order('order_index') : {data:[]};
          if (error) throw error;
          const session = sessions.find(x => x.workout_day_id === day.id && (!x.schedule_ref || x.schedule_ref===day.schedule_ref) && (day.is_daily || (x.started_at && !x.completed_at)));
          const items=day.is_daily?baseItems:(session?.workout_snapshot||(await loadWorkout(day,userId)).items).filter(x=>x.is_enabled);
          let logs = [];
          if (session) { const r = await s.from('set_logs').select('exercise_id,set_number').eq('session_id', session.id); if (r.error) throw r.error; logs = r.data || []; }
          return { day, session, items: items || [], ...sessionProgress(items || [], logs) };
        }));
        if (alive) setData({ plans, pain: latestPain(pain, date), daily: cards.filter(c => c.day.is_daily), lifts: cards.filter(c => !c.day.is_daily) });
      } catch (e) { if (alive) setError(`Dashboard could not load: ${e.message}`); }
    })(); return () => { alive = false; };
  }, [userId, revision, retry, date]);
  return <div className="wrap dashboard-screen">
    <header className="dashboard-heading"><div><p className="u-label">{new Date(`${date}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'long'})}</p><h1>Dashboard</h1></div><button className="avatar" onClick={onSettings} aria-label="Open settings">{email?.slice(0,2).toUpperCase()||'ME'}</button></header>
    <DashboardWeek userId={userId} revision={revision} date={date} onOpen={onWeek}/>
    {error ? <div className="card"><div className="flag" role="alert">{error}</div><button className="btn ghost" onClick={() => setRetry(x => x + 1)}>Retry</button></div> : !data ? <p className="muted">Loading today’s programme…</p> : <>
      <div className="section-heading"><h2>Today</h2><button className="text-action" onClick={onToday}>Open →</button></div>
      {data.daily.map(c=><button className="cockpit-row daily-row" key={c.day.id} onClick={onDaily}><span className="tier">S</span><span><strong>Daily · tendon + hip</strong><small>{c.completeItems} of {c.items.length} · {c.count} sets logged</small></span><span className="daily-action">{c.count?'Continue':'Open'}</span><span className="daily-track"><i style={{width:`${c.total?c.count/c.total*100:0}%`}}/></span></button>)}
      <section className="card dashboard-session">
        <div className="session-title"><strong>{[...data.plans.map(p=>`${p.run_type.charAt(0).toUpperCase()+p.run_type.slice(1)} run`),...data.lifts.map(c=>c.day.name)].join(' + ')||'Rest day'}</strong><small>{[...data.plans.map(p=>p.duration_min),...data.lifts.map(c=>c.day.est_minutes)].filter(Boolean).join(' + ')}{[...data.plans.map(p=>p.duration_min),...data.lifts.map(c=>c.day.est_minutes)].some(Boolean)?' min':''}</small></div>
        <div className="dashboard-session-actions">{data.plans.map(p=><button className="btn" key={p.id||p.key} onClick={()=>onRun(p.warmup_type==='full'?'full':'short')}>Start run</button>)}{data.lifts.map(c=><button className={c.session?'btn--resume':'btn ghost'} key={c.day.schedule_ref||c.day.id} onClick={()=>onStart(c.day)}><b>{c.session?`Resume ${c.day.name}`:'Start lift'}</b>{c.session&&<span>{c.count} SETS</span>}</button>)}</div>
        {!data.plans.length&&!data.lifts.length&&<p className="muted">No run or lifting session scheduled today.</p>}
        {data.lifts.filter(c=>c.session).map(c=><p key={c.day.id} className="resume-caption">{c.next?`Picks up at ${c.next.item.exercises?.name||'exercise'} · set ${c.next.setNumber}`:'All sets recorded · finish session'}</p>)}
        <button className={`dashboard-pain ${PAIN_MOVEMENTS.every(m=>data.pain[m]?.score!=null)?'is-scored':''}`} onClick={onPain}><span>{PAIN_MOVEMENTS.every(m=>data.pain[m]?.score!=null)?`Cold pain · dorsiflexion ${data.pain.dorsiflexion.score} / eversion ${data.pain.eversion.score}`:'Pain check not logged — do it before you train'}</span><span>→</span></button>
      </section>
      <KeyLifts userId={userId} revision={revision} onProgress={onProgress}/>
    </>}
  </div>;
}

function DashboardWeek({userId,revision,date,onOpen}){
 const [offset,setOffset]=useState(0),[items,setItems]=useState([]),[error,setError]=useState('');
 const start=shiftDate(date,-((new Date(date+'T12:00:00').getDay()+6)%7)+offset*7),end=shiftDate(start,6);
 useEffect(()=>{let alive=true;setItems([]);setError('');loadSchedule(userId,start,end).then(rows=>{if(alive)setItems(rows.filter(x=>x.status!=='skipped'));}).catch(()=>{if(alive)setError('Schedule unavailable');});return()=>{alive=false;};},[userId,revision,start,end]);
 return <section className="calendar-card"><div className="calendar-heading"><button aria-label="Previous dashboard week" onClick={()=>setOffset(x=>x-1)}>‹</button><strong>{new Date(start+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric'})} – {new Date(end+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</strong><button aria-label="Next dashboard week" onClick={()=>setOffset(x=>x+1)}>›</button></div><div className="calendar-days">{['M','T','W','T','F','S','S'].map((label,i)=>{const d=shiftDate(start,i),day=items.filter(x=>x.date===d),run=day.some(x=>x.kind==='run'),lift=day.some(x=>x.kind==='lift');return <button key={d} className={d===date?'selected':''} onClick={()=>onOpen?.(d)} aria-label={`View week containing ${d}`}><small>{label}</small><b>{Number(d.slice(-2))}</b><small>{error?'—':run&&lift?'R+L':run?'RU':lift?'LI':'RE'}</small></button>;})}</div>{error&&<p className="muted">{error}</p>}</section>;
}

function KeyLifts({userId,revision,onProgress}){
 const [rows,setRows]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setError('');allRows(()=>supa().from('set_logs').select('*, exercises(name,load_unit,priority_tier), sessions(date)').eq('user_id',userId).order('id')).then(logs=>{if(alive)setRows(strengthRows(logs).slice(0,5));}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[userId,revision]);
 return <><div className="section-heading"><h2>Lift progress</h2><button className="text-action" onClick={onProgress}>See all →</button></div><section className="card lift-chart">{error?<p className="flag" role="alert">{error}</p>:!rows?<p className="muted">Loading lift history…</p>:!rows.length?<p className="muted">Log your first lift to start your progress chart.</p>:<><div className="lift-bars">{rows.map(r=>{const measure=x=>Number(x.hold_seconds??x.weight_kg??x.reps??0),first=measure(r.first),last=measure(r.last),scale=Math.max(first,last,1);return <div key={r.id}><div className="bar-pair" role="img" aria-label={`${r.exercise.name}: first ${first}, latest ${last}`}><i style={{height:`${first/scale*100}%`}}/><i style={{height:`${last/scale*100}%`}}/></div><small>{r.exercise.name}</small></div>;})}</div><div className="chart-legend"><span><i/>First recorded</span><span><i/>Latest</span></div><small className="muted">Each exercise uses its own scale.</small></>}</section></>;
}
