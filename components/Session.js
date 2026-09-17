'use client';
import { useEffect, useRef, useState } from 'react';
import { supa, TIER, today, LOAD_UNIT } from '../lib/supabase';
import { loadWorkout } from '../lib/workout-client';
import { GymRestTimer } from './Timers';
import { nextSet, loadLabel, recordId } from '../lib/gym.mjs';
import { unlockTimerAudio } from '../lib/useTimer';

export default function Session({ day, onExit, beepEnabled = false, userId, date = day.schedule_date || today() }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('log');
  const restPointer = `gym-rest:${userId}:${day.schedule_ref||day.id}:${date}`;
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [setNo, setSetNo] = useState(1);
  const [holdSeconds, setHoldSeconds] = useState('');
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState(2);
  const [sessionId, setSessionId] = useState(null);
  const [resting, setResting] = useState(0);
  const [last, setLast] = useState({});
  const [sugg, setSugg] = useState({});
  const [logged, setLogged] = useState({});
  const [finishing, setFinishing] = useState(false);
  const [feel, setFeel] = useState(3);
  const [note, setNote] = useState('');
  const [gLoad, setGLoad] = useState('');
  const [gTe, setGTe] = useState('');
  const [loading, setLoading] = useState(true);
  const [skipped, setSkipped] = useState(0);

  // ---- load or RESUME ----
  useEffect(() => { (async () => {
    const s = supa();
    try {
    const [openResult,performance,suggestions] = await Promise.all([s.from('sessions').select('*').eq('workout_day_id',day.id).eq('user_id',userId).eq('date',date).order('started_at',{ascending:false,nullsFirst:false}),s.from('v_last_performance').select('*'),s.from('v_progression_suggestions').select('*')]);
    const {data:allOpen,error:openError}=openResult;
    if(openError)throw openError;
    const open=(allOpen||[]).filter(x=>!x.schedule_ref||x.schedule_ref===day.schedule_ref);
    const we=open[0]?.workout_snapshot || (await loadWorkout(day,userId)).items;
    // Fail closed when a required exercise is hidden or unavailable.
    const all = (we || []).filter(x => x.is_enabled);
    const live = all.filter(x => x.exercises);
    if (all.length !== live.length) throw new Error('An exercise is unavailable. Repair the programme before logging this session.');
    setSkipped(all.length - live.length);
    setItems(live);

    const {data:lp,error:lpError}=performance;
    if (lpError) throw lpError;
    const m = {}; (lp || []).forEach(r => { (m[r.exercise_id] ||= {})[r.set_number] = r; });
    setLast(m);
    const {data:sg,error:sgError}=suggestions;
    if (sgError) throw sgError;
    const g = {}; (sg || []).forEach(r => { g[r.exercise_id] = r; }); setSugg(g);

    let sid;
    if (open?.length) {
      sid = open[0].id;
      setFeel(open[0].feel_1_5 ?? 3); setNote(open[0].session_note || ''); setGLoad(open[0].exercise_load ?? ''); setGTe(open[0].training_effect ?? '');
      const { data: done, error: doneError } = await s.from('set_logs').select('*').eq('session_id', sid).order('logged_at');
      if (doneError) throw doneError;
      const L = {}; (done || []).forEach(r => { (L[r.exercise_id] ||= {})[r.set_number] = r; });
      setLogged(L);
      // jump to the first unfinished exercise/set
      let ji = 0, js = 1, found = false;
      for (let i = 0; i < live.length && !found; i++) {
        for (let n = 1; n <= live[i].sets; n++) {
          if (!L[live[i].exercise_id]?.[n]) { ji = i; js = n; found = true; break; }
        }
      }
      if (!found && live.length) { ji = live.length - 1; js = live[ji].sets; setFinishing(true); }
      setIdx(ji); setSetNo(js);
      try {
        const r = JSON.parse(localStorage.getItem(restPointer));
        if (r && r.sessionId === sid && Number.isFinite(r.seconds) && r.seconds > 0 && typeof r.token === 'string') setResting(r);
      } catch {}
    }
    setSessionId(sid);
    } catch (e) { setItems([]); setError(e.message); }
    setLoading(false);
  })(); }, [day.id,date]);

  const cur = items[idx];
  const ex = cur?.exercises;

  // prefill steppers
  useEffect(() => {
    if (!cur) return;
    const already = logged[cur.exercise_id]?.[setNo];
    setHoldSeconds(String(already?.hold_seconds ?? cur.hold_seconds ?? ''));
    if (already) { setMode('edit'); setWeight(Number(already.weight_kg ?? 0)); setReps(Number(already.reps ?? 0)); setRir(already.rir ?? 2); return; }

    setMode('log');
    // 1. carry forward the weight already used for THIS exercise in THIS session
    const thisSession = logged[cur.exercise_id] || {};
    const earlier = Object.keys(thisSession).map(Number).filter(n => n < setNo).sort((a, b) => b - a)[0];
    if (earlier) {
      setWeight(Number(thisSession[earlier].weight_kg ?? 0));
      setReps(Number(thisSession[earlier].reps ?? cur.rep_min ?? 0));
      setRir(2);
      return;
    }

    // 2. otherwise last week's number for this set, or the suggestion, or the seeded start
    const previous = last[cur.exercise_id]?.[setNo] || last[cur.exercise_id]?.[1];
    const prev = previous?.date < date ? previous : null;
    const s = date === today() ? sugg[cur.exercise_id] : null;
    setWeight(Number(prev?.weight_kg ?? cur.target_weight_kg ?? 0));
    setReps(Number(prev?.reps ?? cur.rep_min ?? 0));
    setRir(2);
  }, [idx, setNo, items, last, sugg, logged]);

  if (loading) return <div className="wrap"><p className="muted">Loading session…</p></div>;
  if (!cur) return <div className="wrap"><p className="muted" role="alert">{error || 'No enabled exercises.'}</p>
    <button className="btn ghost" disabled={busy} onClick={onExit}>Back</button></div>;

  const isHold = !!cur.hold_seconds;
  const restSec = Number(cur.rest_seconds) || 0;
  const tier = TIER[ex.priority_tier] || TIER.B;
  const unit = LOAD_UNIT[ex.load_unit] || LOAD_UNIT.total;
  const noWeight = ex.load_unit === 'bodyweight' || ex.load_unit === 'band';
  const editing = mode === 'edit';
  const totalSets = items.reduce((a, b) => a + b.sets, 0);
  const doneSets = Object.values(logged).reduce((a, o) => a + Object.keys(o).length, 0);

  function startRest(sec, sid, savedId) {
    if (sec <= 0 || date < today()) return;
    const value = { seconds: sec, sessionId: sid, token: `timer:${userId}:gym-rest:${sid}:${savedId}:${Date.now()}` };
    try { localStorage.setItem(restPointer, JSON.stringify(value)); } catch {}
    setResting(value);
  }
  function clearRest() {
    try { localStorage.removeItem(restPointer); if (resting) localStorage.removeItem(resting.token); } catch {}
    setResting(0);
  }
  async function logSet() {
    if (lock.current || date > today()) return;
    if (beepEnabled) unlockTimerAudio();
    lock.current = true; setBusy(true); setError('');
    try {
      if (isHold && (!Number.isInteger(Number(holdSeconds)) || Number(holdSeconds) <= 0)) throw new Error('Enter a positive whole number of hold seconds.');
      if (!isHold && (reps === '' || !Number.isInteger(Number(reps)) || Number(reps) <= 0)) throw new Error('Enter a positive whole number of reps.');
      if (!noWeight && !isHold && (weight === '' || !Number.isFinite(Number(weight)) || Number(weight) < 0)) throw new Error('Enter a valid load.');
      if (!isHold && (rir === '' || !Number.isInteger(Number(rir)) || Number(rir)<0 || Number(rir)>10)) throw new Error('Enter RIR from 0 to 10.');
      const db = supa(); let sid = sessionId;
      if (!sid) {
        sid = await recordId(`gym-session:${userId}:${day.schedule_ref||day.id}:${date}`);
        const result = await db.from('sessions').upsert({ id: sid, user_id: userId, date, workout_day_id: day.id, schedule_ref: day.schedule_ref||null, workout_snapshot: items, started_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: true });
        if (result.error) throw result.error;
        setSessionId(sid);
      }
      const row = { user_id: userId, session_id: sid, exercise_id: cur.exercise_id, set_number: setNo, weight_kg: isHold || noWeight ? null : Number(weight), reps: isHold ? null : Number(reps), hold_seconds: isHold ? Number(holdSeconds) : null, rir: isHold ? null : Number(rir) };
      const existing = logged[cur.exercise_id]?.[setNo]; let result;
      if (editing && existing) {
        result = await db.from('set_logs').update(row).eq('id',existing.id).eq('user_id',userId).select().single();
      } else {
        const id = await recordId(`gym-set:${userId}:${sid}:${cur.exercise_id}:${setNo}`);
        const write = await db.from('set_logs').upsert({ ...row, id }, { onConflict: 'id', ignoreDuplicates: true });
        if (write.error) throw write.error;
        result = await db.from('set_logs').select('*').eq('id',id).eq('user_id',userId).single();
      }
      if (result.error) throw result.error;
      if (!result.data) throw new Error('The saved set could not be confirmed. Retry.');
      const updated = { ...logged, [cur.exercise_id]: { ...(logged[cur.exercise_id] || {}), [setNo]: result.data } };
      setLogged(updated);
      if (editing) return;
      const next = nextSet(items, updated);
      if (next) { setIdx(next.idx); setSetNo(next.setNo); startRest(restSec, sid, result.data.id); }
      else setFinishing(true);
    } catch (e) { setError(`Not saved: ${e.message}`); }
    finally { lock.current = false; setBusy(false); }
  }
  async function deleteSet() {
    if (lock.current || date > today() || !editing) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const { error } = await supa().from('set_logs').delete().eq('user_id',userId).eq('session_id',sessionId).eq('exercise_id',cur.exercise_id).eq('set_number',setNo);
      if (error) throw error;
      setLogged(L => { const c = { ...(L[cur.exercise_id] || {}) }; delete c[setNo]; return { ...L, [cur.exercise_id]: c }; });
      setMode('log');
      const result = await supa().from('sessions').update({ completed_at: null }).eq('id',sessionId).eq('user_id',userId);
      if (result.error) throw result.error;
    } catch (e) { setError(`Could not delete set: ${e.message}`); }
    finally { lock.current = false; setBusy(false); }
  }

  async function addSet() {
    if (lock.current || date > today()) return;
    lock.current=true; setBusy(true); setError('');
    try {
      let sid=sessionId;
      if (!sid) {
        sid=await recordId(`gym-session:${userId}:${day.schedule_ref||day.id}:${date}`);
        const r=await supa().from('sessions').upsert({id:sid,user_id:userId,date,workout_day_id:day.id,schedule_ref:day.schedule_ref||null,workout_snapshot:items,started_at:new Date().toISOString()},{onConflict:'id',ignoreDuplicates:true});
        if(r.error)throw r.error; setSessionId(sid);
      }
      const r=await supa().rpc('add_session_set',{p_session:sid,p_exercise:cur.exercise_id,p_expected_sets:Number(cur.sets)});
      if(r.error)throw r.error;
      if(!Array.isArray(r.data))throw new Error('Could not confirm the extra set. Retry.');
      setItems(r.data.filter(x=>x.is_enabled)); setSetNo(Number(cur.sets)+1); setMode('log'); setFinishing(false);
    } catch(e){setError(`Could not add set: ${e.message}`);}
    finally{lock.current=false;setBusy(false);}
  }

  async function finish() {
    if (lock.current || date > today() || !sessionId) return;
    lock.current = true; setBusy(true); setError('');
    try {
    const { error } = await supa().from('sessions').update({
      completed_at: new Date().toISOString(), feel_1_5: feel, session_note: note || null,
      exercise_load: gLoad === '' ? null : Number(gLoad),
      training_effect: gTe === '' ? null : Number(gTe),
    }).eq('id', sessionId).eq('user_id',userId).select().single();
    if (error) throw error;
    clearRest(); onExit();
    } catch (e) { setError(`Not saved: ${e.message}`); }
    finally { lock.current = false; setBusy(false); }
  }

  if (resting) return <div className="wrap gym-rest"><button className="btn ghost compact" disabled={busy} onClick={onExit}>Pause</button><h1>Rest</h1><p className="sub">Up next · {ex.name} · set {setNo}</p><GymRestTimer key={resting.token} seconds={resting.seconds} storageKey={resting.token} nextSet={setNo} onDone={clearRest} beepEnabled={beepEnabled}/></div>;

  if (finishing) return (
    <div className="wrap">
      <h1>Finish session</h1><button className="btn ghost" disabled={busy} onClick={addSet}>+ Add another set · {ex.name}</button>{error && <div className="flag" role="alert">{error}</div>}
      <p className="sub">{day.name} · {doneSets} of {totalSets} sets logged</p>
      <div className="card">
        <div className="field">
          <label>How did it feel? (1 wrecked — 5 flying)</label>
          <div className="grid3" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
            {[1,2,3,4,5].map(n => (
              <button key={n} className={'btn ' + (feel === n ? '' : 'ghost')}
                style={{ padding: 14 }} onClick={() => setFeel(n)}>{n}</button>))}
          </div>
        </div>
        <div className="grid2">
          <div className="field"><label>Garmin Load</label>
            <input inputMode="decimal" value={gLoad} onChange={e => setGLoad(e.target.value)} /></div>
          <div className="field"><label>Training Effect</label>
            <input inputMode="decimal" value={gTe} onChange={e => setGTe(e.target.value)} /></div>
        </div>
        <div className="muted" style={{ marginBottom: 12 }}>
          Garmin's load is HR-derived, so for lifting read it as cardiovascular cost only —
          it does not capture mechanical load on the tendons.
        </div>
        <div className="field"><label>Notes for the diary</label>
          <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Energy, niggles, what felt off…" /></div>
        <button className="btn" disabled={busy || !sessionId} onClick={finish}>Save session</button>
        <button className="btn ghost" style={{ marginTop: 10 }}
          onClick={() => setFinishing(false)}>← Back to session</button>
      </div>
    </div>
  );

  const candidate = last[cur.exercise_id]?.[setNo];
  const prev = candidate?.date < date ? candidate : null;
  const s = date === today() ? sugg[cur.exercise_id] : null;
  const exLogged = logged[cur.exercise_id] || {};

  return (
    <div className="wrap active-set" data-mode={mode}>
      <div className="row session-toolbar">
        <button className="btn ghost" style={{ width: 'auto', padding: '8px 14px' }} disabled={busy} onClick={onExit}>
          ← Pause</button>
        <span className="muted">{doneSets}/{totalSets} sets</span>
        <button className="btn ghost" style={{ width: 'auto', padding: '8px 14px' }}
          disabled={busy} onClick={() => setFinishing(true)}>Finish</button>
      </div>

      <div className="muted session-save-note">
        Everything is saved as you go. Pause and come back any time.
      </div>

      {skipped > 0 && (
        <div className="flag">
          {skipped} exercise{skipped === 1 ? '' : 's'} skipped — not readable by the account you are
          signed in as. This session is incomplete.
        </div>
      )}


      <div className="card exercise-navigation">
        <div className="row">
          <button className="btn ghost" style={{ width: 'auto', padding: '8px 14px' }}
            disabled={busy || idx === 0} onClick={() => { setIdx(idx - 1); setSetNo(1); }}>←</button>
          <span className="muted">{idx + 1} of {items.length}</span>
          <button className="btn ghost" style={{ width: 'auto', padding: '8px 14px' }}
            disabled={busy || idx === items.length - 1} onClick={() => { setIdx(idx + 1); setSetNo(1); }}>→</button>
        </div>
      </div>

      <div className="active-set-content">
        <div className="row exercise-heading">
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{ex.name}</div>
            <div className="muted" style={{ marginTop: 3 }}>
              Set {setNo} of {cur.sets} <span className="pill">RIR {ex.rir_target || 'not prescribed'}</span>{ex.tempo ? ` · ${ex.tempo}` : ''}
            </div>
          </div>
          <span className="tier" style={{ background: tier.color, color: tier.text }}>{tier.label}</span>
        </div>

        <button className="chip" disabled={busy} onClick={addSet}>+ Add set to this workout</button>
        {/* set chips — tap any to review or fix */}
        <div className="set-chips">
          {Array.from({ length: cur.sets }, (_, i) => i + 1).map(n => {
            const l = exLogged[n];
            return (
              <button key={n} className={`setchip ${l ? n === setNo && editing ? 'editing' : 'done' : 'pending'}`} disabled={busy} aria-label={`Set ${n}${l ? ', completed' : ', pending'}`} aria-pressed={n === setNo} onClick={() => setSetNo(n)}>
                {n}{l ? `: ${l.hold_seconds ? l.hold_seconds+'s' : l.reps+'×'+(l.weight_kg??'BW')}` : ''}
              </button>
            );
          })}
        </div>

        {editing && <div className="editstrip" style={{ marginTop: 10 }}>
          Editing a logged set. Save overwrites it; nothing jumps forward.</div>}

        <div className="set-controls">{isHold ? (
          <>
            <label className="u-label">Hold · seconds<input aria-label="Hold seconds" inputMode="decimal" value={holdSeconds} disabled={busy} onChange={e => setHoldSeconds(e.target.value)}/></label>
            <div className="muted" style={{ textAlign: 'center' }}>hold at ~70%</div>
          </>
        ) : (
          <>
            {!noWeight && (
              <>
                <div className="step" style={{ marginTop: 18 }}>
                  <button disabled={busy} onClick={() => setWeight(w => Math.max(0, +(Number(w) - (ex.increment_kg || 2.5)).toFixed(2)))}>−</button>
                  <div className="step-readout"><div><input aria-label="Load" inputMode="decimal" value={weight} disabled={busy} onChange={e => setWeight(e.target.value)}/><span>kg</span></div><small>Load unit · {unit.short}</small></div>
                  <button disabled={busy} onClick={() => setWeight(w => +(Number(w) + (ex.increment_kg || 2.5)).toFixed(2))}>+</button>
                </div>
                <div className="muted" style={{ textAlign: 'center', marginTop: 6 }}>
                  {ex.load_unit==='per_hand'?`${Number(weight||0)*2} kg total across both hands`:unit.help}
                </div>
              </>
            )}
            {noWeight && (
              <div className="muted" style={{ textAlign: 'center', margin: '16px 0' }}>{unit.help}</div>
            )}
            <div className="step" style={{ marginTop: 10 }}>
              <button disabled={busy} onClick={() => setReps(r => Math.max(0, Number(r) - 1))}>−</button>
              <div className="step-readout"><div><input aria-label="Reps" inputMode="decimal" value={reps} disabled={busy} onChange={e => setReps(e.target.value)}/><span>reps</span></div></div>
              <button disabled={busy} onClick={() => setReps(r => Number(r) + 1)}>+</button>
            </div>
          </>
        )}

        </div><div className="last" style={{ marginTop: 14 }}>
          {prev
            ? `Last time, set ${setNo}: ${prev.reps ?? prev.hold_seconds + 's'} · ${loadLabel(prev.weight_kg,ex.load_unit)}`
            : 'First time — this set is calibration. Light warm-up set, then a best guess.'}
          {cur.rep_min ? ` · target ${cur.rep_min}${cur.rep_max !== cur.rep_min ? '–' + cur.rep_max : ''}` : ''}
        </div>

        {s && !editing && (
          <div className="flag ok" style={{ marginTop: 12 }}>
            ⬆ You hit the top of the range at 2+ RIR. Suggested {loadLabel(s.suggested_weight, ex.load_unit)}, reps back to {s.reset_to_reps}.
            Change the load above if you choose to take this suggestion.
          </div>
        )}

        {ex.cue_execution && <div className="cue"><strong>Cue</strong>{ex.cue_execution}</div>}
        {ex.cue_mistake && <div className="cue" style={{ borderLeftColor: 'var(--warn)' }}>
          <strong>Common mistake:</strong> {ex.cue_mistake}</div>}
        {ex.feel_target && <div className="cue" style={{ borderLeftColor: 'var(--info)' }}>
          <strong>Should feel:</strong> {ex.feel_target}</div>}
        {ex.priority_tier === 'S' && ex.go_ham_tips && (
          <div className="cue" style={{ borderLeftColor: 'var(--accent)', marginTop: 10 }}>
            <strong>S-tier — go ham:</strong> {ex.go_ham_tips}</div>)}

        {!isHold && (
          <div className="field" style={{ marginTop: 16 }}>
            <label>Reps in reserve</label>
            <div className="step rir-step"><button aria-label="Less RIR" disabled={busy || rir<=0} onClick={()=>setRir(n=>Math.max(0,Number(n)-1))}>−</button><div className="step-readout"><input aria-label="Reps in reserve" inputMode="numeric" value={rir} disabled={busy} onChange={e=>setRir(e.target.value)}/></div><button aria-label="More RIR" disabled={busy || rir>=10} onClick={()=>setRir(n=>Math.min(10,Number(n)+1))}>+</button></div>
            <div className="muted" style={{ marginTop: 8 }}>
              If the last rep did not visibly slow down, you had more than 2 left.
            </div>
          </div>
        )}
      </div>

      {error && <div className="flag" role="alert">{error}</div>}
      <button className="btn" disabled={busy} onClick={logSet}>
        {editing ? `✓ Update set ${setNo}` : `✓ Log set ${setNo}`}
      </button>
      {editing && (
        <button className="btn ghost danger" style={{ marginTop: 10 }} disabled={busy} onClick={deleteSet}>
          Delete set {setNo}
        </button>
      )}

      {ex.cue_setup && <div className="card" style={{ marginTop: 12 }}>
        <div className="muted"><strong>Setup:</strong> {ex.cue_setup}</div></div>}
      {ex.tier_reason && <div className="card"><div className="muted">
        <strong>Why {tier.label} tier:</strong> {ex.tier_reason}</div></div>}
    </div>
  );
}
