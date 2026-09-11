'use client';
import { useEffect, useState } from 'react';
import { supa, TIER } from '../lib/supabase';
import { RestTimer } from './Timers';

export default function Session({ day, onExit }) {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [setNo, setSetNo] = useState(1);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState(2);
  const [sessionId, setSessionId] = useState(null);
  const [resting, setResting] = useState(false);
  const [last, setLast] = useState({});
  const [sugg, setSugg] = useState({});
  const [done, setDone] = useState([]);
  const [finishing, setFinishing] = useState(false);
  const [feel, setFeel] = useState(3);
  const [note, setNote] = useState('');
  const [gLoad, setGLoad] = useState('');
  const [gTe, setGTe] = useState('');

  useEffect(() => { (async () => {
    const s = supa();
    const { data: we } = await s.from('workout_exercises')
      .select('*, exercises(*)').eq('workout_day_id', day.id).order('order_index');
    const live = (we || []).filter(x => x.is_enabled);
    setItems(live);
    const { data: lp } = await s.from('v_last_performance').select('*');
    const m = {}; (lp || []).forEach(r => { (m[r.exercise_id] ||= [])[r.set_number] = r; });
    setLast(m);
    const { data: sg } = await s.from('v_progression_suggestions').select('*');
    const g = {}; (sg || []).forEach(r => { g[r.exercise_id] = r; }); setSugg(g);
    const { data: sess } = await s.from('sessions')
      .insert({ workout_day_id: day.id }).select().single();
    setSessionId(sess?.id);
  })(); }, [day.id]);

  const cur = items[idx];
  const ex = cur?.exercises;

  useEffect(() => {
    if (!cur) return;
    const prev = last[cur.exercise_id]?.[setNo];
    const s = sugg[cur.exercise_id];
    setWeight(Number(s?.suggested_weight ?? prev?.weight_kg ?? cur.target_weight_kg ?? 0));
    setReps(Number(s ? (cur.rep_min || 0) : (prev?.reps ?? cur.rep_min ?? 0)));
    setRir(2);
  }, [idx, setNo, items, last, sugg]);

  if (!cur) return <div className="card"><p className="muted">Loading session…</p></div>;

  const isHold = !!cur.hold_seconds;
  const restSec = ex.category === 'rehab' ? 120 : (cur.rep_max && cur.rep_max > 12 ? 75 : 165);
  const tier = TIER[ex.priority_tier] || TIER.B;

  async function logSet() {
    const s = supa();
    await s.from('set_logs').insert({
      session_id: sessionId, exercise_id: cur.exercise_id, set_number: setNo,
      weight_kg: isHold ? null : weight, reps: isHold ? null : reps,
      hold_seconds: isHold ? cur.hold_seconds : null,
      rir: setNo === cur.sets ? rir : null,
    });
    setDone(d => [...d, `${cur.exercise_id}-${setNo}`]);
    if (setNo < cur.sets) { setSetNo(setNo + 1); setResting(true); }
    else if (idx < items.length - 1) { setIdx(idx + 1); setSetNo(1); setResting(true); }
    else setFinishing(true);
  }

  async function finish() {
    const s = supa();
    await s.from('sessions').update({
      completed_at: new Date().toISOString(), feel_1_5: feel, session_note: note || null,
      exercise_load: gLoad === '' ? null : Number(gLoad),
      training_effect: gTe === '' ? null : Number(gTe),
    }).eq('id', sessionId);
    onExit();
  }

  if (finishing) return (
    <div className="wrap">
      <h1>Session done</h1>
      <p className="sub">{day.name} · {done.length} sets logged</p>
      <div className="card">
        <div className="field">
          <label>How did it feel? (1 wrecked — 5 flying)</label>
          <div className="grid3" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} className={'btn ' + (feel === n ? '' : 'ghost')}
                style={{ padding: 14 }} onClick={() => setFeel(n)}>{n}</button>
            ))}
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
        <div className="field">
          <label>Notes for the diary</label>
          <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Energy, niggles, what felt off…" />
        </div>
        <button className="btn" onClick={finish}>Save session</button>
      </div>
    </div>
  );

  const prev = last[cur.exercise_id]?.[setNo];
  const s = sugg[cur.exercise_id];

  return (
    <div className="wrap">
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn ghost" style={{ width: 'auto', padding: '8px 14px' }} onClick={onExit}>← Exit</button>
        <span className="muted">{idx + 1} / {items.length}</span>
      </div>

      {resting ? (
        <>
          <p className="sub">Rest — next: {items[idx]?.exercises?.name}, set {setNo}</p>
          <RestTimer seconds={restSec} onDone={() => setResting(false)} />
          <button className="btn" onClick={() => setResting(false)}>Ready now</button>
        </>
      ) : (
        <>
          <div className="card">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{ex.name}</div>
                <div className="muted" style={{ marginTop: 3 }}>
                  Set {setNo} of {cur.sets}{cur.tempo ? '' : ''}{ex.tempo ? ` · ${ex.tempo}` : ''}
                </div>
              </div>
              <span className="tier" style={{ background: tier.color }}>{tier.label}</span>
            </div>

            {isHold ? (
              <>
                <div className="timer" style={{ margin: '20px 0 6px' }}>{cur.hold_seconds}s</div>
                <div className="muted" style={{ textAlign: 'center' }}>hold at ~70%</div>
              </>
            ) : (
              <>
                <div className="step" style={{ marginTop: 18 }}>
                  <button onClick={() => setWeight(w => Math.max(0, +(w - (ex.increment_kg || 2.5)).toFixed(2)))}>−</button>
                  <div className="val">{weight}<span className="unit"> kg</span></div>
                  <button onClick={() => setWeight(w => +(w + (ex.increment_kg || 2.5)).toFixed(2))}>+</button>
                </div>
                <div className="step" style={{ marginTop: 10 }}>
                  <button onClick={() => setReps(r => Math.max(0, r - 1))}>−</button>
                  <div className="val">{reps}<span className="unit"> reps</span></div>
                  <button onClick={() => setReps(r => r + 1)}>+</button>
                </div>
              </>
            )}

            <div className="last" style={{ marginTop: 14 }}>
              {prev
                ? `Last time, set ${setNo}: ${prev.reps ?? prev.hold_seconds + 's'}${prev.weight_kg ? ' × ' + prev.weight_kg + 'kg' : ''}`
                : 'First time — this set is calibration. Light warm-up set, then a best guess.'}
              {cur.rep_min ? ` · target ${cur.rep_min}${cur.rep_max !== cur.rep_min ? '–' + cur.rep_max : ''}` : ''}
            </div>

            {s && (
              <div className="flag ok" style={{ marginTop: 12 }}>
                ⬆ You hit the top of the range at 2+ RIR. Suggested {s.suggested_weight}kg, reps back to {s.reset_to_reps}.
                One acceptance per session — one variable at a time.
              </div>
            )}

            {ex.cue_execution && <div className="cue">{ex.cue_execution}</div>}
            {ex.cue_mistake && <div className="cue" style={{ borderLeftColor: '#e0a53a' }}>
              <strong>Common mistake:</strong> {ex.cue_mistake}</div>}
            {ex.feel_target && <div className="cue" style={{ borderLeftColor: '#5aa9e6' }}>
              <strong>Should feel:</strong> {ex.feel_target}</div>}
            {ex.priority_tier === 'S' && ex.go_ham_tips && (
              <div className="cue" style={{ borderLeftColor: '#e8462a', marginTop: 10 }}>
                <strong>S-tier — go ham:</strong> {ex.go_ham_tips}</div>
            )}

            {setNo === cur.sets && !isHold && (
              <div className="field" style={{ marginTop: 16 }}>
                <label>Reps in reserve on this last set</label>
                <div className="grid3" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
                  {[0, 1, 2, 3, 4].map(n => (
                    <button key={n} className={'btn ' + (rir === n ? '' : 'ghost')}
                      style={{ padding: 12 }} onClick={() => setRir(n)}>{n}</button>
                  ))}
                </div>
                <div className="muted" style={{ marginTop: 8 }}>
                  If the last rep did not visibly slow down, you had more than 2 left.
                </div>
              </div>
            )}
          </div>

          <button className="btn" onClick={logSet}>✓ Log set {setNo}</button>
          {ex.cue_setup && <div className="card"><div className="muted"><strong>Setup:</strong> {ex.cue_setup}</div></div>}
          {ex.tier_reason && <div className="card"><div className="muted">
            <strong>Why {tier.label} tier:</strong> {ex.tier_reason}</div></div>}
        </>
      )}
    </div>
  );
}
