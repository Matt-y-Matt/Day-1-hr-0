'use client';
import { useEffect, useState } from 'react';
import { supa, LOAD_UNIT } from '../lib/supabase';
import { loadSchedule } from '../lib/schedule-client';
import { localDate, latestPain, PAIN_MOVEMENTS, sessionProgress } from '../lib/phase2-data.mjs';

export default function Dashboard({ userId, revision, onPain, onRun, onDaily, onStart, onToday, onProgress }) {
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
          s.from('run_plan').select('*').eq('user_id', userId).eq('date', date),
          s.from('pain_logs').select('*').eq('user_id', userId).eq('date', date),
          s.from('workout_days').select('*').eq('user_id', userId).eq('is_active', true),
          s.from('sessions').select('*').eq('user_id', userId).eq('date', date).order('started_at', { ascending: false, nullsFirst: false }),
        ]);
        for (const r of results) if (r.error) throw r.error;
        const [rawPlans, pain, days, sessions] = results.map(r => r.data || []);
        const weekday = ((new Date(`${date}T12:00:00`).getDay() + 6) % 7) + 1;
        const daily = days.filter(d => d.is_daily === true);
        const scheduled=(await loadSchedule(userId,date,date)).filter(x=>x.status!=='skipped');
        const plans=scheduled.filter(x=>x.kind==='run');
        const lifts=scheduled.filter(x=>x.kind==='lift').map(x=>x.day);
        const selected = [...daily, ...lifts];
        const cards = await Promise.all(selected.map(async day => {
          const { data: items, error } = await s.from('workout_exercises').select('*, exercises(name)').eq('workout_day_id', day.id).eq('is_enabled', true).order('order_index');
          if (error) throw error;
          const session = sessions.find(x => x.workout_day_id === day.id && (!x.schedule_ref || x.schedule_ref===day.schedule_ref) && (day.is_daily || (x.started_at && !x.completed_at)));
          let logs = [];
          if (session) { const r = await s.from('set_logs').select('exercise_id,set_number').eq('session_id', session.id); if (r.error) throw r.error; logs = r.data || []; }
          return { day, session, items: items || [], ...sessionProgress(items || [], logs) };
        }));
        if (alive) setData({ plans, pain: latestPain(pain, date), daily: cards.filter(c => c.day.is_daily), lifts: cards.filter(c => !c.day.is_daily) });
      } catch (e) { if (alive) setError(`Dashboard could not load: ${e.message}`); }
    })(); return () => { alive = false; };
  }, [userId, revision, retry, date]);
  return <div className="wrap"><div className="row"><h1>Dashboard</h1><span className="u-label">TRAINING</span></div><p className="sub">{new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    {error ? <div className="card"><div className="flag" role="alert">{error}</div><button className="btn ghost" onClick={() => setRetry(x => x + 1)}>Retry</button></div> : !data ? <p className="muted">Loading today’s programme…</p> : <>
      <button className={`dashboard-pain ${PAIN_MOVEMENTS.every(m => data.pain[m]?.score != null) ? 'is-scored' : ''}`} onClick={onPain}><span><strong>{PAIN_MOVEMENTS.every(m => data.pain[m]?.score != null) ? 'Pain scores recorded' : 'Pain not scored cold'}</strong><small>{PAIN_MOVEMENTS.every(m => data.pain[m]?.score != null) ? `Dorsiflexion ${data.pain.dorsiflexion.score} · eversion ${data.pain.eversion.score}` : 'Dorsiflexion + eversion · 4 taps'}</small></span><b>Log →</b></button>
      <div className="row"><h2>Today</h2><button className="chip" onClick={onToday}>Open →</button></div>
      {data.plans.map(plan => <div className="card key" key={plan.id || plan.date}><span className="u-label">{plan.is_key_session ? 'KEY SESSION' : 'RUN PLAN'}</span><strong className="dashboard-title">{plan.run_type} run{plan.duration_min != null ? ` · ${plan.duration_min} min` : ''}</strong><div>{plan.hr_ceiling != null && <span className="pill">HR ≤{plan.hr_ceiling}</span>}{plan.hr_target_low != null && plan.hr_target_high != null && <span className="pill">Aim {plan.hr_target_low}–{plan.hr_target_high}</span>}</div>{plan.structure_note && <p className="muted">{plan.structure_note}</p>}<button className="btn" onClick={() => onRun(plan.warmup_type === 'full' ? 'full' : 'short')}>Start run</button><span className="u-label">{plan.warmup_type === 'full' ? 'FULL' : 'SHORT'} WARM-UP · GARMIN RECORDS THE RUN</span></div>)}
      {data.lifts.map(c => <div className="card" key={c.day.schedule_ref||c.day.id}><strong className="dashboard-title">{c.day.name}</strong><p className="muted">{c.items.length} exercises{c.day.est_minutes != null ? ` · ${c.day.est_minutes} min` : ''}</p><button className={c.session ? 'btn--resume' : 'btn'} onClick={() => onStart(c.day)}><b>{c.session ? `Resume ${c.day.name}` : 'Start lift'}</b>{c.session && <span>{c.count} SETS</span>}</button>{c.session && <p className="u-label">Started {new Date(c.session.started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {c.next ? `Picks up at ${c.next.item.exercises?.name || 'unavailable exercise'} set ${c.next.setNumber}` : 'All sets recorded · finish session'}</p>}</div>)}
      {!data.plans.length && !data.lifts.length && <div className="card"><p className="muted">No run or lifting session scheduled today.</p></div>}
      <h2>Daily block</h2>{data.daily.length ? data.daily.map(c => <div className="card" key={c.day.id}><div className="row"><strong>{c.day.name}</strong><span className="u-sub">{c.completeItems} of {c.items.length}</span></div><div className="bar bar--thin"><i style={{ width: `${c.total ? c.count / c.total * 100 : 0}%` }}/></div><p className="muted">{c.count} of {c.total} sets logged{c.next ? ` · Next: ${c.next.item.exercises?.name || 'exercise unavailable'}, set ${c.next.setNumber}` : c.total ? ' · All prescribed sets recorded' : ' · No enabled items'}</p><button className="btn ghost" onClick={onDaily}>{c.next && c.count ? 'Continue' : c.total && !c.next ? 'Review daily block' : 'Open daily block'}</button></div>) : <div className="card"><p className="muted">No active daily block is configured.</p><button className="btn ghost" onClick={onDaily}>Open daily block</button></div>}
      <KeyLifts userId={userId} revision={revision}/>
      <button className="btn ghost" onClick={onProgress}>Progress · see all →</button>
    </>}
  </div>;
}

function KeyLifts({ userId, revision }) {
  const [rows, setRows] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let alive = true; setRows(null); setError('');
    (async () => {
      try {
        const s = supa();
        const [performance, exercises] = await Promise.all([
          s.from('v_last_performance').select('*').eq('user_id', userId),
          s.from('exercises').select('id,name,load_unit,priority_tier').eq('user_id', userId),
        ]);
        if (performance.error) throw performance.error;
        if (exercises.error) throw exercises.error;
        const metadata = new Map((exercises.data || []).map(e => [e.id, e]));
        const seen = new Set();
        const selected = (performance.data || []).filter(r => metadata.has(r.exercise_id)).sort((a, b) => {
          const tiers = { S: 0, A: 1, B: 2, C: 3 };
          return (tiers[metadata.get(a.exercise_id).priority_tier] ?? 4) - (tiers[metadata.get(b.exercise_id).priority_tier] ?? 4) || Number(a.set_number) - Number(b.set_number);
        }).filter(r => { if (seen.has(r.exercise_id)) return false; seen.add(r.exercise_id); return true; }).slice(0, 3).map(r => ({ ...r, exercise: metadata.get(r.exercise_id) }));
        if (alive) setRows(selected);
      } catch (e) { if (alive) setError(`Could not load key lifts: ${e.message}`); }
    })();
    return () => { alive = false; };
  }, [userId, revision]);
  return <><h2>Key lifts · last recorded</h2><div className="card">{error ? <p className="flag" role="alert">{error}</p> : !rows ? <p className="muted">Loading lift history…</p> : !rows.length ? <p className="muted">No lifting history recorded yet.</p> : rows.map(r => <div key={r.exercise_id}><div className="row"><strong>{r.exercise.name}</strong><span className="u-sub">{['bodyweight', 'band'].includes(r.exercise.load_unit) ? (LOAD_UNIT[r.exercise.load_unit]?.short || r.exercise.load_unit) : <>{r.weight_kg == null ? '—' : `${r.weight_kg} kg`} {LOAD_UNIT[r.exercise.load_unit]?.short || r.exercise.load_unit || 'unit unavailable'}</>}</span></div><p className="muted">Set {r.set_number}{r.reps != null ? ` · ${r.reps} reps` : ''}{r.hold_seconds != null ? ` · ${r.hold_seconds}s hold` : ''}{r.exercise.load_unit === 'per_hand' && r.weight_kg != null ? ` · ${Number(r.weight_kg) * 2} kg total across both hands` : ''}</p></div>)}</div></>;
}
