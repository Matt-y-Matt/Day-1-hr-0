'use client';
import { useState } from 'react';
import { supa, today } from '../lib/supabase';

const SITES = [
  { k: 'left_ankle_extensor', n: 'L ankle extensor' },
  { k: 'right_patellar', n: 'R patellar tendon' },
  { k: 'other', n: 'Other' },
];
const MOVES = ['dorsiflexion', 'eversion', 'inversion', 'plantarflexion', 'general'];

export default function LogPanel() {
  const [tab, setTab] = useState('pain');
  return (
    <div className="wrap">
      <h1>Log</h1>
      <div className="grid3" style={{ marginBottom: 18 }}>
        {['pain', 'run', 'daily'].map(t => (
          <button key={t} className={'btn ' + (tab === t ? '' : 'ghost')} style={{ padding: 12, fontSize: 14 }}
            onClick={() => setTab(t)}>{t === 'pain' ? 'Pain' : t === 'run' ? 'Run' : 'Daily'}</button>
        ))}
      </div>
      {tab === 'pain' && <Pain />}
      {tab === 'run' && <Run />}
      {tab === 'daily' && <Daily />}
    </div>
  );
}

function Pain() {
  const [site, setSite] = useState('left_ankle_extensor');
  const [move, setMove] = useState('dorsiflexion');
  const [score, setScore] = useState(0);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  async function save() {
    await supa().from('pain_logs').insert({ site, movement: move, score, note: note || null });
    setMsg(score === 0 ? 'Logged — clean reading.' : 'Logged.');
    setNote(''); setTimeout(() => setMsg(''), 2500);
  }
  return (
    <div className="card">
      <div className="flag" style={{ marginBottom: 14 }}>
        Score cold — first thing, before you stand up or do the isometrics.
        Isometrics produce real short-term analgesia, so a post-hold number is not a clean reading.
      </div>
      <div className="field"><label>Site</label>
        <select value={site} onChange={e => setSite(e.target.value)}>
          {SITES.map(s => <option key={s.k} value={s.k}>{s.n}</option>)}</select></div>
      <div className="field"><label>Movement</label>
        <select value={move} onChange={e => setMove(e.target.value)}>
          {MOVES.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
      <div className="field"><label>Score — {score}/10</label>
        <input type="range" min="0" max="10" step="0.5" value={score}
          onChange={e => setScore(Number(e.target.value))} /></div>
      <div className="field"><label>Note</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="optional" /></div>
      <button className="btn" onClick={save}>Save reading</button>
      {msg && <div className="flag ok" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}

const F = ({ label, ...p }) => (
  <div className="field"><label>{label}</label><input inputMode="decimal" {...p} /></div>
);

function Run() {
  const [f, setF] = useState({ run_type: 'easy', duration_min: '', distance_km: '', hr_avg: '', hr_max: '',
    min_under_135: '', cadence_avg: '', temp_c: '', shoes: '', exercise_load: '', training_effect: '',
    recovery_hr: '', feel_1_5: 3, notes: '' });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    const p = { ...f };
    ['duration_min','distance_km','hr_avg','hr_max','min_under_135','cadence_avg','temp_c',
     'exercise_load','training_effect','recovery_hr']
      .forEach(k => p[k] = p[k] === '' ? null : Number(p[k]));
    p.feel_1_5 = Number(p.feel_1_5);
    await supa().from('runs').insert(p);
    setMsg('Run logged.'); setTimeout(() => setMsg(''), 2500);
  }
  return (
    <div className="card">
      <div className="field"><label>Type</label>
        <select value={f.run_type} onChange={set('run_type')}>
          {['easy','long','threshold','test','cycle','walk','race'].map(t => <option key={t}>{t}</option>)}</select></div>
      <div className="grid2">
        <F label="Duration (min)" value={f.duration_min} onChange={set('duration_min')} />
        <F label="Distance (km)" value={f.distance_km} onChange={set('distance_km')} />
        <F label="Avg HR" value={f.hr_avg} onChange={set('hr_avg')} />
        <F label="Max HR" value={f.hr_max} onChange={set('hr_max')} />
        <F label="Min under 135" value={f.min_under_135} onChange={set('min_under_135')} />
        <F label="Avg cadence" value={f.cadence_avg} onChange={set('cadence_avg')} />
        <F label="Temp °C" value={f.temp_c} onChange={set('temp_c')} />
        <F label="Shoes" value={f.shoes} onChange={set('shoes')} />
        <F label="Garmin Load" value={f.exercise_load} onChange={set('exercise_load')} />
        <F label="Training Effect" value={f.training_effect} onChange={set('training_effect')} />
        <F label="Recovery HR" value={f.recovery_hr} onChange={set('recovery_hr')} />
      </div>
      <div className="field"><label>Felt (1–5)</label>
        <div className="grid3" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
          {[1,2,3,4,5].map(n => (
            <button key={n} className={'btn ' + (Number(f.feel_1_5) === n ? '' : 'ghost')}
              style={{ padding: 12 }} onClick={() => setF({ ...f, feel_1_5: n })}>{n}</button>))}</div></div>
      <div className="field"><label>Notes</label>
        <textarea rows={3} value={f.notes} onChange={set('notes')}
          placeholder="Tendon during / after. Cadence under fatigue. What broke down." /></div>
      <button className="btn" onClick={save}>Save run</button>
      {msg && <div className="flag ok" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}

function Daily() {
  const [f, setF] = useState({ weight_am_kg: '', weight_pm_kg: '', calories: '', protein_g: '',
    resting_hr: '', sleep_hours: '', note: '' });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    const p = { date: today() };
    Object.entries(f).forEach(([k, v]) => { if (v !== '') p[k] = k === 'note' ? v : Number(v); });
    await supa().from('daily_log').upsert(p, { onConflict: 'user_id,date' });
    setMsg('Saved.'); setTimeout(() => setMsg(''), 2500);
  }
  async function photo(e, slot) {
    const file = e.target.files?.[0]; if (!file) return;
    const s = supa();
    const { data: { user } } = await s.auth.getUser();
    const path = `${user.id}/${today()}-${slot}-${Date.now()}.jpg`;
    const { error } = await s.storage.from('photos').upload(path, file);
    if (!error) { await s.from('photos').insert({ slot, storage_path: path }); setMsg(`${slot.toUpperCase()} photo saved.`); }
    else setMsg('Upload failed: ' + error.message);
    setTimeout(() => setMsg(''), 3000);
  }
  return (
    <div className="card">
      <div className="grid2">
        <F label="Weight AM (kg)" value={f.weight_am_kg} onChange={set('weight_am_kg')} />
        <F label="Weight PM (kg)" value={f.weight_pm_kg} onChange={set('weight_pm_kg')} />
        <F label="Calories" value={f.calories} onChange={set('calories')} />
        <F label="Protein (g)" value={f.protein_g} onChange={set('protein_g')} />
        <F label="Resting HR" value={f.resting_hr} onChange={set('resting_hr')} />
        <F label="Sleep (h)" value={f.sleep_hours} onChange={set('sleep_hours')} />
      </div>
      <div className="muted" style={{ marginBottom: 12 }}>
        Targets: 2,400 cal · 150g protein. Long-run days go to 2,900 / 390g carbs.
      </div>
      <div className="grid2" style={{ marginBottom: 12 }}>
        <label className="btn ghost" style={{ textAlign: 'center', padding: 14, cursor: 'pointer' }}>
          📷 AM photo<input type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={e => photo(e, 'am')} /></label>
        <label className="btn ghost" style={{ textAlign: 'center', padding: 14, cursor: 'pointer' }}>
          📷 PM photo<input type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={e => photo(e, 'pm')} /></label>
      </div>
      <div className="field"><label>Note</label>
        <input value={f.note} onChange={set('note')} placeholder="optional" /></div>
      <button className="btn" onClick={save}>Save day</button>
      {msg && <div className="flag ok" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
