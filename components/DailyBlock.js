'use client';
import { useEffect, useRef, useState } from 'react';
import { supa, today } from '../lib/supabase';
import useTimer, { unlockTimerAudio } from '../lib/useTimer';
import { TimerRing } from './Timers';

const countSets = (item, logs) => Array.from({ length: item.sets }, (_, i) => i + 1).filter(n => logs.some(log => log.exercise_id === item.exercise_id && log.set_number === n)).length;
const firstMissingSet = (item, logs) => Array.from({ length: item.sets }, (_, i) => i + 1).find(n => !logs.some(log => log.exercise_id === item.exercise_id && log.set_number === n));
async function checked(query) { const { data, error } = await query; if (error) throw error; return data; }
async function dailySetId(sessionId, exerciseId, setNumber) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`daily-set:${sessionId}:${exerciseId}:${setNumber}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function DailyBlock({ onClose, userId, beepEnabled = false, onChanged }) {
  const [days, setDays] = useState([]), [day, setDay] = useState(null);
  const [items, setItems] = useState([]), [logs, setLogs] = useState([]), [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [active, setActive] = useState(null), [busy, setBusy] = useState(false);
  const [rest, setRest] = useState(null);
  const lock = useRef(false);
  const [date] = useState(today);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!userId || !supa()) throw new Error('Sign in to open your daily block.');
        const rows = await checked(supa().from('workout_days').select('*').eq('user_id', userId).eq('is_daily', true).eq('is_active', true).order('name'));
        if (live) { setDays(rows); if (rows.length === 1) setDay(rows[0]); else setLoading(false); }
      } catch (e) { if (live) { setError(e.message); setLoading(false); } }
    })();
    return () => { live = false; };
  }, [userId]);
  useEffect(() => {
    if (!day) return;
    let live = true; setLoading(true); setError('');
    (async () => {
      try {
        const [rows, sessions] = await Promise.all([
          checked(supa().from('workout_exercises').select('*, exercises(*)').eq('user_id', userId).eq('workout_day_id', day.id).order('order_index')),
          checked(supa().from('sessions').select('*').eq('user_id', userId).eq('workout_day_id', day.id).eq('date', date).order('started_at', { ascending: false, nullsFirst: false }).limit(1)),
        ]);
        const current = sessions[0] || null;
        const done = current ? await checked(supa().from('set_logs').select('*').eq('user_id', userId).eq('session_id', current.id)) : [];
        if (live) {
          setItems(rows.filter(row => row.is_enabled && row.sets > 0)); setSession(current); setLogs(done);
          try {
            const pending = JSON.parse(localStorage.getItem(`daily-rest:${userId}:${day.id}:${date}`));
            if (current && !current.completed_at && pending?.sessionId === current.id && typeof pending.identity === 'string' && Number.isFinite(pending.seconds) && pending.seconds > 0) setRest(pending);
          } catch {}
        }
      } catch (e) { if (live) setError(e.message); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [day, userId, date]);

  async function saveSet(item, setNumber, reps) {
    if (lock.current) return false;
    if (beepEnabled) unlockTimerAudio();
    lock.current = true; setBusy(true); setError('');
    try {
      let current = session;
      if (!current) {
        // Stable ID survives an uncertain response; retry cannot create a second session.
        const key = `daily-session:${userId}:${day.id}:${date}`;
        let id;
        try { id = localStorage.getItem(key); } catch {}
        if (!id) { id = crypto.randomUUID(); try { localStorage.setItem(key, id); } catch {} }
        current = await checked(supa().from('sessions').upsert({ id, user_id: userId, workout_day_id: day.id, date, started_at: null }, { onConflict: 'id', ignoreDuplicates: true }).select().maybeSingle());
        if (!current) current = await checked(supa().from('sessions').select('*').eq('id', id).eq('user_id', userId).single());
        setSession(current);
      }
      const existing = await checked(supa().from('set_logs').select('*').eq('user_id', userId).eq('session_id', current.id).eq('exercise_id', item.exercise_id).eq('set_number', setNumber).order('logged_at', { ascending: false }).limit(1).maybeSingle());
      let row = existing;
      if (!row) {
        const id = await dailySetId(current.id, item.exercise_id, setNumber);
        row = await checked(supa().from('set_logs').upsert({ id, user_id: userId, session_id: current.id, exercise_id: item.exercise_id, set_number: setNumber, hold_seconds: item.hold_seconds || null, reps: item.hold_seconds ? null : reps, weight_kg: item.hold_seconds ? null : (item.target_weight_kg ?? null) }, { onConflict: 'id', ignoreDuplicates: true }).select().maybeSingle());
        // Another tab may have saved the same canonical set while this request was in flight.
        if (!row) row = await checked(supa().from('set_logs').select('*').eq('user_id', userId).eq('id', id).single());
      }
      const nextLogs = [...logs.filter(log => log.id !== row.id), row];
      const complete = items.every(it => it.exercises && countSets(it, nextLogs) >= it.sets);
      const updated = await checked(supa().from('sessions').update({ started_at: current.started_at || row.logged_at || new Date().toISOString(), ...(complete ? { completed_at: new Date().toISOString() } : {}) }).eq('id', current.id).eq('user_id', userId).select().single());
      setLogs(nextLogs); setSession(updated);
      setActive(items.find(it => it.exercises && firstMissingSet(it, nextLogs)) || null);
      if (!complete && item.rest_seconds > 0) {
        const pending = { seconds: Number(item.rest_seconds), identity: `${current.id}:${item.id}:${setNumber}`, sessionId: current.id };
        try { localStorage.setItem(`daily-rest:${userId}:${day.id}:${date}`, JSON.stringify(pending)); } catch {}
        setRest(pending);
      }
      onChanged?.(); return true;
    } catch (e) { setError(`Could not finish saving this set: ${e.message}. Retry to reconcile it.`); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  const unavailable = items.filter(item => !item.exercises).length;
  const complete = items.filter(item => item.exercises && countSets(item, logs) >= item.sets).length;
  const next = items.find(item => item.exercises && firstMissingSet(item, logs));
  const header = <div className="row"><h1>Daily block</h1><button className="phase2-close" disabled={busy} aria-label="Close daily block" onClick={onClose}>×</button></div>;
  if (loading) return <div className="phase2-timer-stack">{header}<p className="muted">Loading your routine…</p></div>;
  if (rest) return <div className="phase2-timer-stack">{header}<DailyRest rest={rest} userId={userId} beepEnabled={beepEnabled} onDone={() => { try { localStorage.removeItem(`daily-rest:${userId}:${day.id}:${date}`); } catch {} setRest(null); setActive(next || null); }} /></div>;
  if (active) return <div className="phase2-timer-stack">{header}{error && <p className="phase2-error" role="alert">{error}</p>}<DailyItem key={`${active.id}:${firstMissingSet(active, logs)}`} item={active} setNumber={firstMissingSet(active, logs)} userId={userId} identity={`${day.id}:${date}`} beepEnabled={beepEnabled} busy={busy} onBack={() => setActive(null)} onSave={async reps => { const setNumber = firstMissingSet(active, logs); if (setNumber) await saveSet(active, setNumber, reps); }} /></div>;
  return <div className="phase2-timer-stack">{header}{error && <p className="phase2-error" role="alert">{error}</p>}
    {!day ? <>{!days.length && <p className="muted">No daily routine is available for this account.</p>}{days.map(d => <button key={d.id} className="btn ghost" onClick={() => setDay(d)}>{d.name}</button>)}</> : <>
      <p className="u-label">{day.name} · {complete} of {items.length} items</p><div className="bar bar--thin"><i style={{ width: `${items.length ? complete / items.length * 100 : 0}%` }} /></div>
      {!items.length && <p className="muted">No enabled exercises are available in this routine.</p>}
      {unavailable > 0 && <p className="phase2-error" role="alert">{unavailable} enabled exercise{unavailable === 1 ? ' is' : 's are'} unavailable to this account. This routine cannot be marked complete until those references are resolved.</p>}
      {items.map(item => <button key={item.id} className="card phase2-daily-row" disabled={!item.exercises || countSets(item, logs) >= item.sets} onClick={() => setActive(item)}><div className="row"><strong>{item.exercises?.name || 'Unavailable exercise'}</strong><span className="u-sub">{!item.exercises ? 'Unavailable' : countSets(item, logs) >= item.sets ? '✓' : `${countSets(item, logs)}/${item.sets}`}</span></div><span className="muted">{item.sets} × {item.hold_seconds ? `${item.hold_seconds}s hold` : `${item.rep_min ?? '—'}${item.rep_max && item.rep_max !== item.rep_min ? `–${item.rep_max}` : ''} reps`}</span></button>)}
      {next ? <button className="btn" onClick={() => setActive(next)}>Continue · item {items.indexOf(next) + 1} of {items.length}</button> : items.length > 0 && !unavailable && <><p className="muted">All prescribed sets logged{session?.completed_at ? ' · daily block complete.' : '.'}</p><button className="btn" onClick={onClose}>Done</button></>}
    </>}
  </div>;
}

function DailyRest({ rest, userId, beepEnabled, onDone }) {
  const timer = useTimer({ durations: [rest.seconds], autoStart: true, beepEnabled, storageKey: `timer:${userId}:daily-rest:${rest.identity}` });
  return <><h1>Rest</h1><TimerRing remainingMs={timer.remainingMs} left={timer.left} total={rest.seconds} label={timer.status === 'done' ? 'READY' : 'REST'} /><p className="muted">Next set starts when you are ready.</p><button className="btn" onClick={onDone}>{timer.status === 'done' ? 'Continue daily block' : 'Skip rest'}</button></>;
}

function DailyItem({ item, setNumber, userId, identity, beepEnabled, busy, onBack, onSave }) {
  const hold = Number(item.hold_seconds || 0);
  const timer = useTimer({ durations: [hold], beepEnabled, storageKey: `timer:${userId}:daily:${identity}:${item.id}:${setNumber}` });
  const [reps, setReps] = useState(Number(item.rep_min || 0));
  return <><p className="u-label">Set {setNumber} of {item.sets}</p><h1>{item.exercises.name}</h1><p className="muted">{item.exercises.cue_execution}</p>
    {hold ? <><TimerRing remainingMs={timer.status === 'idle' ? hold*1000 : timer.remainingMs} left={timer.status === 'idle' ? hold : timer.left} total={hold} label={timer.status === 'done' ? 'HOLD FINISHED' : timer.status === 'paused' ? 'PAUSED' : 'HOLD'} />
      {timer.status !== 'done' && <button className="btn" onClick={timer.status === 'idle' ? timer.start : timer.status === 'paused' ? timer.resume : timer.pause}>{timer.status === 'idle' ? 'Start hold' : timer.status === 'paused' ? 'Resume hold' : 'Pause hold'}</button>}
      <p className="muted">Already did it without the timer? Log the completed hold below.</p><button className="btn" disabled={busy} onClick={() => onSave(null)}>{busy ? 'Saving…' : `✓ Log completed hold ${setNumber}`}</button><button className="btn ghost" disabled={busy} onClick={timer.reset}>Reset hold</button>
    </> : <><label htmlFor="daily-reps">Completed reps</label><div className="row"><button className="phase2-close" aria-label="Fewer reps" onClick={() => setReps(Math.max(0, reps - 1))}>−</button><input id="daily-reps" type="number" min="0" value={reps} onChange={e => setReps(Math.max(0, Math.floor(Number(e.target.value) || 0)))} /><button className="phase2-close" aria-label="More reps" onClick={() => setReps(reps + 1)}>+</button></div><button className="btn" disabled={busy || !reps} onClick={() => onSave(reps)}>{busy ? 'Saving…' : `✓ Log set ${setNumber}`}</button></>}
    <button className="btn ghost" disabled={busy} onClick={() => { timer.pause(); onBack(); }}>Pause · back to daily block</button>
  </>;
}
