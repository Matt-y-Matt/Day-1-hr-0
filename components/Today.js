'use client';
import { useEffect, useState } from 'react';
import { supa, TIER, today, fmtDate } from '../lib/supabase';
import { WarmupTimer } from './Timers';
import Commute from './Commute';
import BodyCard from './BodyCard';
import { FoodCard } from './Food';
import { DEFAULT_SETTINGS } from '../lib/settings.mjs';
import { loadWorkout } from '../lib/workout-client';
import { loadSchedule } from '../lib/schedule-client';
import { loadLabel } from '../lib/gym.mjs';
import { latestPain, PAIN_MOVEMENTS, sessionProgress } from '../lib/phase2-data.mjs';

export default function Today({ onStart, onPain, onDaily, onRun, userId, beepEnabled, onFood, subtabs, onSchedule, onCommute, onWorkout }) {
  const [settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [mode, setMode] = useState('run');
  const [daily, setDaily] = useState(null);
  const [days, setDays] = useState([]);
  const [plan, setPlan] = useState(null);
  const [pain, setPain] = useState([]);
  const [warm, setWarm] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const t = today();
  const wd = ((new Date().getDay() + 6) % 7) + 1; // 1=Mon

  useEffect(() => { (async () => {
    const s = supa();
    const [config,scheduleResult,dailyResult,painResult]=await Promise.all([s.from('user_settings').select('*').eq('user_id',userId).maybeSingle(),loadSchedule(userId,t,t),s.from('workout_days').select('*').eq('user_id',userId).eq('is_daily',true).eq('is_active',true),s.from('pain_logs').select('*').eq('user_id',userId).eq('date',t)]);
    if(config.error)throw config.error;const defaults={...DEFAULT_SETTINGS,...config.data};setSettings(defaults);
    const scheduled = scheduleResult.filter(x=>x.status!=='skipped');
    setDays(scheduled.filter(x=>x.kind==='lift').map(x=>({...x.day,occurrence:x})));
    const p=scheduled.filter(x=>x.kind==='run').map(x=>({...x,hr_ceiling:x.hr_ceiling??defaults.hr_ceiling,hr_target_low:x.hr_target_low??defaults.hr_target_low,hr_target_high:x.hr_target_high??defaults.hr_target_high}));
    setPlan(p); setMode(p.length?'run':'lift');
    const { data: dailyDays, error: dailyError } = dailyResult;
    if (dailyError) setError(dailyError.message);
    if (dailyDays?.[0]) {
      const day = dailyDays[0];
      const [{data:items,error:itemError},{data:sessions,error:sessionError}]=await Promise.all([s.from('workout_exercises').select('*, exercises(*)').eq('workout_day_id',day.id),s.from('sessions').select('id').eq('workout_day_id',day.id).eq('date',t).order('started_at',{ascending:false,nullsFirst:false}).limit(1)]);
      if (itemError || sessionError) setError((itemError || sessionError).message);
      else {
        const result = sessions?.length ? await s.from('set_logs').select('*').eq('session_id',sessions[0].id) : {data:[]};
        if (result.error) setError(result.error.message);
        else setDaily({ ...sessionProgress(items || [],result.data || []), totalItems: (items || []).filter(i => i.is_enabled !== false).length });
      }
    }
    const { data: pl, error: ple } = painResult;
    if (ple) setError(ple.message);
    setPain(pl || []);
    setLoading(false);
  })().catch(e => { setError(e.message); setLoading(false); }); }, []);

  if (loading) return <div className="wrap today-screen"><h1>Today</h1><p className="muted">Loading today’s programme…</p></div>;

  const daysToRace = Math.ceil((new Date(settings.race_date+'T00:00:00') - new Date(t+'T00:00:00')) / 86400000);

  return (
    <div className="wrap today-screen">
      <h1>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
      <p className="sub">{daysToRace} days to {settings.race_name}</p>

      {error && <div className="flag" role="alert">Could not load Today: {error}</div>}
      {subtabs}
      <div className="seg today-toggle" aria-label="Training type">{['run','lift'].map(m => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'run' ? 'Run' : 'Lift'}</button>)}</div>
      <button className="cockpit-row pain-row" onClick={onPain}><span><strong>{PAIN_MOVEMENTS.every(m => latestPain(pain,t)[m]?.score != null) ? 'Pain scored cold' : 'Pain not scored cold'}</strong><small>Dorsiflexion + eversion · 4 taps</small></span><span className="pain-action">Log</span></button>
      {warm && <WarmupTimer type={warm} onClose={() => setWarm(null)} userId={userId} beepEnabled={beepEnabled} />}

      <button className="cockpit-row daily-row" onClick={onDaily}><span className="tier">S</span><span><strong>Daily · tendon + hip</strong><small>{daily ? `${daily.completeItems} of ${daily.totalItems} complete` : 'Open your daily routine'}</small></span><span className="daily-action">Continue</span><span className="daily-track"><i style={{width:`${daily?.total?daily.count/daily.total*100:0}%`}}/></span></button>
      <BodyCard userId={userId}/>
      <FoodCard userId={userId} dayType={plan?.some(p => p.run_type === 'long') ? 'long' : plan?.length && days.length ? 'run_lift' : plan?.length || days.length ? 'easy' : 'rest'} onOpen={onFood}/>
      <Commute userId={userId} onOpen={onCommute}/>
      <section className="today-session" aria-label="Today’s session">
      {mode === 'run' && (plan || []).map(plan => (
        <div className="card key" key={plan.id}>
          <div className="row">
            <strong style={{ fontSize: 18 }}>
              {plan.run_type === 'long' ? 'Long run' : plan.run_type === 'threshold' ? 'Threshold'
                : plan.run_type === 'test' ? 'Time trial' : plan.run_type === 'race' ? 'Race' : 'Run'}
              {plan.duration_min ? ` · ${plan.duration_min} min` : ''}
            </strong>
          </div>
          <div style={{ marginTop: 10 }}>
            {plan.hr_ceiling && <span className="pill">HR ceiling {plan.hr_ceiling}</span>}
            {plan.hr_target_low && <span className="pill">aim {plan.hr_target_low}–{plan.hr_target_high}</span>}
            <span className="pill">cadence {settings.cadence_target}+</span>
            <span className="pill">{plan.warmup_type === 'full' ? 'full warm-up' : 'short warm-up'}</span>
            {plan.duration_min > 45 && <span className="pill">LMNT</span>}
          </div>
          {plan.structure_note && <div className="cue">{plan.structure_note}</div>}
          {plan.coach_note && <div className="cue" style={{ borderLeftColor: 'var(--warn)' }}>{plan.coach_note}</div>}
          <button className="btn" style={{ marginTop: 14 }}
            onClick={() => onRun ? onRun(plan.warmup_type || 'short') : setWarm(plan.warmup_type || 'short')}>Start run · warm-up</button><p className="u-label">Garmin records the run</p><ScheduleActions item={plan} onSchedule={onSchedule}/>
        </div>
      ))}

      {mode === 'lift' && days.map(d => <DayCard key={d.schedule_ref||d.id} day={d} userId={userId} onWorkout={onWorkout} onStart={onStart} onSchedule={onSchedule} />)}

      {!loading && !error && !(plan?.length) && days.length === 0 && (
        <div className="card">
          <strong>Full rest day</strong>
          <p className="muted" style={{ marginTop: 8 }}>
            Walk and mobility only. Rest is one of the two non-negotiables — over-training does not come
            from too many easy sessions, it comes from deleting rest.
          </p>
        </div>
      )}
      {!loading && !error && mode === 'run' && !plan?.length && days.length > 0 && <div className="card"><strong>No run planned today</strong><button className="btn ghost" onClick={() => setMode('lift')}>View today’s lift</button></div>}
      {!loading && !error && mode === 'lift' && !days.length && plan?.length > 0 && <div className="card"><strong>No lift planned today</strong><button className="btn ghost" onClick={() => setMode('run')}>View today’s run</button></div>}
      </section>
    </div>
  );
}

function DayCard({ day, userId, onStart, onSchedule, onWorkout }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null),[cardError,setCardError]=useState('');
  useEffect(() => { (async () => {
    const s = supa();
    const {data:candidates,error}=await s.from('sessions').select('id,schedule_ref,workout_snapshot').eq('user_id',userId).eq('workout_day_id',day.id).eq('date',today()).is('completed_at',null);
    if(error)throw error;const o=(candidates||[]).filter(x=>!x.schedule_ref||x.schedule_ref===day.schedule_ref);
    setItems(o[0]?.workout_snapshot||(await loadWorkout(day,userId)).items);
    if (o?.length) {
      const { count } = await s.from('set_logs')
        .select('id', { count: 'exact', head: true }).eq('session_id', o[0].id);
      setOpen({ id: o[0].id, sets: count || 0 });
    }
  })().catch(e=>setCardError(e.message)); }, [day.id,userId,day.schedule_ref]);

  const live = items.filter(i => i.is_enabled);
  const off = items.filter(i => !i.is_enabled);
  const missing = items.filter(i => !i.exercises).length;

  return (
    <div className="card">
      <div className="row">
        <strong style={{ fontSize: 18 }}>{day.name}</strong>
        <span className="muted">{live.length} exercises · {day.est_minutes} min</span>
      </div>
      <div className="exercise-list">
        {live.map(i => {
          // exercises embeds as null when the row points at an exercise this
          // account cannot see under RLS. Render it, don't die on it.
          const ex = i.exercises;
          const tr = (ex && TIER[ex.priority_tier]) || TIER.B;
          if (!ex) return (
            <div key={i.id} className="exrow">
              <span className="tier" style={{ background: 'var(--inset-border)', color: 'var(--dim)' }}>?</span>
              <span className="muted" style={{ fontSize: 14, flex: 1 }}>Exercise unavailable on this account</span>
            </div>
          );
          return (
            <div key={i.id} className="exrow">
              <span className="tier" style={{ background: tr.color, color: tr.text }}>{tr.label}</span>
              <span className="exercise-copy"><span className="exname">{ex.name}</span><small>{loadLabel(i.target_weight_kg, ex.load_unit)}{i.rir_target ? ` · RIR ${i.rir_target}` : ''}</small></span>
              <span className="exercise-prescription">{i.sets}×{i.hold_seconds ? i.hold_seconds + 's' : (i.rep_min === i.rep_max ? i.rep_min : `${i.rep_min}–${i.rep_max}`)}</span>
            </div>
          );
        })}
        {off.map(i => (
          <div key={i.id} className="exrow disabled">
            <span className="tier" style={{ background: 'var(--inset-border)' }}>—</span>
            <span style={{ fontSize: 14, flex: 1, textDecoration: 'line-through' }}>
              {i.exercises ? i.exercises.name : 'Exercise unavailable on this account'}</span>
          </div>
        ))}
        {missing > 0 && (
          <div className="flag" style={{ marginTop: 10 }}>
            {missing} of {items.length} exercises on this day are not readable by the account you are
            signed in as. The workout is incomplete until the programme data is repaired.
          </div>
        )}
      </div>
      {off.length > 0 && <div className="flag" style={{ marginTop: 10 }}>{off[0].disabled_reason}</div>}
      {open && (
        <div className="flag ok" style={{ marginTop: 10 }}>
          In progress — {open.sets} set{open.sets === 1 ? '' : 's'} logged. Picks up where you left off.
        </div>
      )}
      <button className="btn" style={{ marginTop: 12 }} onClick={() => onStart(day)}>
        {open ? `Resume ${day.name}` : `Start ${day.name}`}
      </button>
      {cardError&&<div className="flag" role="alert">{cardError}</div>}
      <button className="btn ghost edit-workout-link" onClick={()=>onWorkout?.(day)}>Edit workout / swap exercise</button>
      <ScheduleActions item={day.occurrence} onSchedule={onSchedule}/>
    </div>
  );
}

function ScheduleActions({item,onSchedule}){return item&&onSchedule?<div className="schedule-actions"><button className="btn ghost" onClick={()=>onSchedule(item,'move')}>Move to tomorrow</button><button className="btn ghost" onClick={()=>onSchedule(item,'change')}>Skip / shorten</button></div>:null;}
