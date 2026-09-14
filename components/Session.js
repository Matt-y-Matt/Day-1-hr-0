'use client';
import { useEffect, useState } from 'react';
import { supa, TIER, today, LOAD_UNIT, totalLoad } from '../lib/supabase';
import { RestTimer } from './Timers';

export default function Session({ day, onExit }) {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [setNo, setSetNo] = useState(1);
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

  // ---- load or RESUME ----
  useEffect(() => { (async () => {
    const s = supa();
    const { data: we } = await s.from('workout_exercises')
      .select('*, exercises(*)').eq('workout_day_id', day.id).order('order_index');
    const live = (we || []).filter(x => x.is_enabled);
    setItems(live);

    const { data: lp } = await s.from('v_last_performance').select('*');
    const m = {}; (lp || []).forEach(r => { (m[r.exercise_id] ||= {})[r.set_number] = r; });
    setLast(m);
    const { data: sg } = await s.from('v_progression_suggestions').select('*');
    const g = {}; (sg || []).forEach(r => { g[r.exercise_id] = r; }); setSugg(g);

    // resume an open session from today, otherwise start one
    const { data: open } = await s.from('sessions').select('*')
      .eq('workout_day_id', day.id).eq('date', today())
      .is('completed_at', null).order('started_at', { ascending: false }).limit(1);

    let sid;
    if (open?.length) {
      sid = open[0].id;
      const { data: done } = await s.from('set_logs').select('*').eq('session_id', sid);
      const L = {}; (done || []).forEach(r => { (L[r.exercise_id] ||= {})[r.set_number] = r; });
      setLogged(L);
      // jump to the first unfinished exercise/set
      let ji = 0, js = 1, found = false;
      for (let i = 0; i < live.length && !found; i++) {
        for (let n = 1; n <= live[i].sets; n++) {
          if (!L[live[i].exercise_id]?.[n]) { ji = i; js = n; found = true; break; }
        }
      }
      if (!found && live.length) { ji = live.length - 1; js = live[ji].sets; }
      setIdx(ji); setSetNo(js);
      // restore a running rest timer
      const r = Number(localStorage.getItem('rest_' + sid) || 0);
      if (r > Date.now()) setResting(Math.round((r - Date.now()) / 1000));
    } else {
      const { data: sess } = await s.from('sessions').insert({ workout_day_id: day.id }).select().single();
      sid = sess?.id;
    }
    setSessionId(sid);
    setLoading(false);
  })(); }, [day.id]);

  const cur = items[idx];
  const ex = cur?.exercises;

  // prefill steppers
  useEffect(() => {
    if (!cur) return;
    const already = logged[cur.exercise_id]?.[setNo];
    if (already) { setWeight(Number(already.weight_kg ?? 0)); setReps(Number(already.reps ?? 0)); setRir(already.rir ?? 2); return; }

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
    const prev = last[cur.exercise_id]?.[setNo] || last[cur.exercise_id]?.[1];
    const s = sugg[cur.exercise_id];
    setWeight(Number(s?.suggested_weight ?? prev?.weight_kg ?? cur.target_weight_kg ?? 0));
    setReps(Number(s ? (cur.rep_min || 0) : (prev?.reps ?? cur.rep_min ?? 0)));
    setRir(2);
  }, [idx, setNo, items, last, sugg, logged]);

  if (loading) return <div className="wrap"><p className="muted">Loading session…</p></div>;
  if (!cur) return <div className="wrap"><p className="muted">No enabled exercises.</p>
    <button className="btn ghost" onClick={onExit}>Back</button></div>;

  const isHold = !!cur.hold_seconds;
  const restSec = ex.category === 'rehab' ? 120 : (cur.rep_max && cur.rep_max > 12 ? 75 : 165);
  const tier = TIER[ex.priority_tier] || TIER.B;
  const unit = LOAD_UNIT[ex.load_unit] || LOAD_UNIT.total;
  const noWeight = ex.load_unit === 'bodyweight' || ex.load_unit === 'band';
  const editing = !!logged[cur.exercise_id]?.[setNo];
  const totalSets = items.reduce((a, b) => a + b.sets, 0);
  const doneSets = Object.values(logged).reduce((a, o) => a + Object.keys(o).length, 0);

  function startRest(sec) {
    localStorage.setItem('rest_' + sessionId, String(Date.now() + sec * 1000));
    setResting(sec);
  }
  function clearRest() { localStorage.removeItem('rest_' + sessionId); setResting(0); }

  async function logSet() {
    const s = supa();
    const row = {
      session_id: sessionId, exercise_id: cur.exercise_id, set_number: setNo,
      weight_kg: isHold ? null : weight, reps: isHold ? null : reps,
      hold_seconds: isHold ? cur.hold_seconds : null,
      rir: setNo === cur.sets ? rir : null,
    };
    const existing = logged[cur.exercise_id]?.[setNo];
    let saved;
    if (existing) {
      const { data } = await s.from('set_logs').update(row).eq('id', existing.id).select().single();
      saved = data;
    } else {
      const { data } = await s.from('set_logs').insert(row).select().single();
      saved = data;
    }
    setLogged(L => ({ ...L, [cur.exercise_id]: { ...(L[cur.exercise_id] || {}), [setNo]: saved } }));

    // remember this weight as the exercise's working weight
    if (!isHold && weight > 0 && weight !== Number(cur.target_weight_kg)) {
      await s.from('workout_exercises').update({ target_weight_kg: weight }).eq('id', cur.id);
      setItems(its => its.map(i => i.id === cur.id ? { ...i, target_weight_kg: weight } : i));
    }

    if (existing) return; // editing a past set shouldn't jump you forward
    if (setNo < cur.sets) { setSetNo(setNo + 1); startRest(restSec); }
    else if (idx < items.length - 1) { setIdx(idx + 1); setSetNo(1); startRest(restSec); }
    else setFinishing(true);
  }

  async function deleteSet() {
    const existing = logged[cur.exercise_id]?.[setNo];
    if (!existing) return;
    await supa().from('set_logs').delete().eq('id', existing.id);
    setLogged(L => {
      const c = { ...(L[cur.exercise_id] || {}) }; delete c[setNo];
      return { ...L, [cur.exercise_id]: c };
    });
  }

  async function finish() {
    await supa().from('sessions').update({
      completed_at: new Date().toISOString(), feel_1_5: feel, session_note: note || null,
      exercise_load: gLoad === '' ? null : Number(gLoad),
      training_effect: gTe === '' ? null : Number(gTe),
    }).eq('id', sessionId);
    clearRest();
    onExit();
  }

  if (finishing) return (
    <div className="wrap">
      <h1>Finish session</h1>
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
        <button className="btn" onClick={finish}>Save session</button>
        <button className="btn ghost" style={{ marginTop: 10 }}
          onClick={() => setFinishing(false)}>← Back to session</button>
      </div>
    </div>
  );

  const prev = last[cur.exercise_id]?.[setNo];
  const s = sugg[cur.exercise_id];
  const exLogged = logged[cur.exercise_id] || {};

  return (
    <div className="wrap">
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn ghost" style={{ width: 'auto', padding: '8px 14px' }} onClick={onExit}>
          ← Pause</button>
        <span className="muted">{doneSets}/{totalSets} sets</span>
        <button className="btn ghost" style={{ width: 'auto', padding: '8px 14px' }}
          onClick={() => setFinishing(true)}>Finish</button>
      </div>

      <div className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
        Everything is saved as you go. Pause and come back any time.
      </div>

      {resting > 0 && (
        <>
          <p className="sub">Resting — next: {ex.name}, set {setNo}</p>
          <RestTimer seconds={resting} onDone={clearRest} />
          <button className="btn" onClick={clearRest}>Ready now</button>
          <div style={{ height: 16 }} />
        </>
      )}

      {/* exercise navigation */}
      <div className="card" style={{ padding: 12 }}>
        <div className="row">
          <button className="btn ghost" style={{ width: 'auto', padding: '8px 14px' }}
            disabled={idx === 0} onClick={() => { setIdx(idx - 1); setSetNo(1); }}>←</button>
          <span className="muted">{idx + 1} of {items.length}</span>
          <button className="btn ghost" style={{ width: 'auto', padding: '8px 14px' }}
            disabled={idx === items.length - 1} onClick={() => { setIdx(idx + 1); setSetNo(1); }}>→</button>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{ex.name}</div>
            <div className="muted" style={{ marginTop: 3 }}>
              Set {setNo} of {cur.sets}{ex.tempo ? ` · ${ex.tempo}` : ''}
            </div>
          </div>
          <span className="tier" style={{ background: tier.color, color: tier.text }}>{tier.label}</span>
        </div>

        {/* set chips — tap any to review or fix */}
        <div style={{ marginTop: 12 }}>
          {Array.from({ length: cur.sets }, (_, i) => i + 1).map(n => {
            const l = exLogged[n];
            return (
              <button key={n} className="pill"
                style={{
                  cursor: 'pointer', border: 0,
                  background: n === setNo ? 'var(--accent)' : l ? '#1f3318' : '#1d1d21',
                  color: n === setNo ? '#fff' : l ? '#a5d894' : '#a8a49d',
                }}
                onClick={() => setSetNo(n)}>
                {n}{l ? `: ${l.hold_seconds ? l.hold_seconds + 's' : `${l.reps}×${l.weight_kg ?? 0}${noWeight ? '' : unit.short === 'total' ? '' : unit.short}`}` : ''}
              </button>
            );
          })}
        </div>

        {editing && <div className="flag" style={{ marginTop: 10 }}>
          Editing a logged set. Save overwrites it; nothing jumps forward.</div>}

        {isHold ? (
          <>
            <div className="timer" style={{ margin: '20px 0 6px' }}>{cur.hold_seconds}s</div>
            <div className="muted" style={{ textAlign: 'center' }}>hold at ~70%</div>
          </>
        ) : (
          <>
            {!noWeight && (
              <>
                <div className="step" style={{ marginTop: 18 }}>
                  <button onClick={() => setWeight(w => Math.max(0, +(w - (ex.increment_kg || 2.5)).toFixed(2)))}>−</button>
                  <div className="val">{weight}<span className="unit"> kg {unit.short}</span></div>
                  <button onClick={() => setWeight(w => +(w + (ex.increment_kg || 2.5)).toFixed(2))}>+</button>
                </div>
                <div className="muted" style={{ textAlign: 'center', marginTop: 6 }}>
                  {totalLoad(weight, ex.load_unit)
                    ? `${totalLoad(weight, ex.load_unit)} kg total across both hands`
                    : unit.help}
                </div>
              </>
            )}
            {noWeight && (
              <div className="muted" style={{ textAlign: 'center', margin: '16px 0' }}>{unit.help}</div>
            )}
            <div className="step" style={{ marginTop: 10 }}>
              <button onClick={() => setReps(r => Math.max(0, r - 1))}>−</button>
              <div className="val">{reps}<span className="unit"> reps</span></div>
              <button onClick={() => setReps(r => r + 1)}>+</button>
            </div>
          </>
        )}

        <div className="last" style={{ marginTop: 14 }}>
          {prev
            ? `Last time, set ${setNo}: ${prev.reps ?? prev.hold_seconds + 's'}${prev.weight_kg ? ` × ${prev.weight_kg}kg ${unit.short}` : ''}`
            : 'First time — this set is calibration. Light warm-up set, then a best guess.'}
          {cur.rep_min ? ` · target ${cur.rep_min}${cur.rep_max !== cur.rep_min ? '–' + cur.rep_max : ''}` : ''}
        </div>

        {s && !editing && (
          <div className="flag ok" style={{ marginTop: 12 }}>
            ⬆ You hit the top of the range at 2+ RIR. Suggested {s.suggested_weight}kg, reps back to {s.reset_to_reps}.
            One acceptance per session — one variable at a time.
          </div>
        )}

        {ex.cue_execution && <div className="cue">{ex.cue_execution}</div>}
        {ex.cue_mistake && <div className="cue" style={{ borderLeftColor: 'var(--warn)' }}>
          <strong>Common mistake:</strong> {ex.cue_mistake}</div>}
        {ex.feel_target && <div className="cue" style={{ borderLeftColor: 'var(--info)' }}>
          <strong>Should feel:</strong> {ex.feel_target}</div>}
        {ex.priority_tier === 'S' && ex.go_ham_tips && (
          <div className="cue" style={{ borderLeftColor: 'var(--accent)', marginTop: 10 }}>
            <strong>S-tier — go ham:</strong> {ex.go_ham_tips}</div>)}

        {setNo === cur.sets && !isHold && (
          <div className="field" style={{ marginTop: 16 }}>
            <label>Reps in reserve on this last set</label>
            <div className="grid3" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
              {[0,1,2,3,4].map(n => (
                <button key={n} className={'btn ' + (rir === n ? '' : 'ghost')}
                  style={{ padding: 12 }} onClick={() => setRir(n)}>{n}</button>))}
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              If the last rep did not visibly slow down, you had more than 2 left.
            </div>
          </div>
        )}
      </div>

      <button className="btn" onClick={logSet}>
        {editing ? `✓ Update set ${setNo}` : `✓ Log set ${setNo}`}
      </button>
      {editing && (
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={deleteSet}>
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
