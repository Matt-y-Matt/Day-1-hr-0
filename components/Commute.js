'use client';
import { useEffect, useState } from 'react';
import { supa, today } from '../lib/supabase';

const NUM = ['duration_min','distance_km','hr_avg','hr_max','temp_c','elevation_m',
  'carried_load_kg','exercise_load','training_effect'];

export default function Commute() {
  const [legs, setLegs] = useState([]);
  const [wk, setWk] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const s = supa();
    const { data } = await s.from('v_session_intensity').select('*')
      .eq('date', today()).not('commute_direction', 'is', null);
    setLegs(data || []);
    const { data: w } = await s.from('v_commute_weekly').select('*')
      .order('week_start', { ascending: false }).limit(1);
    setWk(w?.[0] || null);
  }
  useEffect(() => { load(); }, []);

  async function log(dir) {
    setBusy(true);
    const { data } = await supa().from('runs')
      .insert({ run_type: 'cycle', commute_direction: dir, duration_min: 22 })
      .select().single();
    await load(); setBusy(false);
    if (data) setEditing(data.id);
  }

  async function remove(id) { await supa().from('runs').delete().eq('id', id); setEditing(null); load(); }

  const toWork = legs.find(l => l.commute_direction === 'to_work');
  const toHome = legs.find(l => l.commute_direction === 'to_home');

  return (
    <div className="card">
      <div className="row">
        <strong>Commute</strong>
        {wk && <span className="muted">{wk.days_cycled} days this week · {wk.total_km} km</span>}
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <button className={'btn ' + (toWork ? 'ghost' : '')} disabled={busy}
          onClick={() => toWork ? setEditing(editing === toWork.id ? null : toWork.id) : log('to_work')}>
          {toWork ? '✓ To work' : '→ To work'}
        </button>
        <button className={'btn ' + (toHome ? 'ghost' : '')} disabled={busy}
          onClick={() => toHome ? setEditing(editing === toHome.id ? null : toHome.id) : log('to_home')}>
          {toHome ? '✓ Home' : '← Home'}
        </button>
      </div>

      {legs.map(l => (
        <div key={l.id}>
          <div className="row" style={{ marginTop: 12, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <span className="pill">{l.commute_direction === 'to_work' ? 'To work' : 'Home'}</span>
            {l.duration_min && <span className="pill">{Math.round(l.duration_min)} min</span>}
            {l.distance_km && <span className="pill">{l.distance_km} km</span>}
            {l.kmh && <span className="pill">{l.kmh} km/h</span>}
            {l.hr_avg && <span className="pill">HR {l.hr_avg}</span>}
            {l.exercise_load ? <span className="pill">load {l.exercise_load}</span>
              : l.est_load ? <span className="pill">load ~{l.est_load}</span> : null}
            {l.carried_load_kg && <span className="pill">+{l.carried_load_kg} kg</span>}
          </div>
          {l.hr_avg && (
            <div className="cue" style={{ borderLeftColor: l.hr_avg > 135 ? '#e0a53a' : '#22401b' }}>
              {l.intensity_read}
            </div>
          )}
          {editing === l.id && <Detail leg={l} onSaved={() => { setEditing(null); load(); }} onDelete={() => remove(l.id)} />}
        </div>
      ))}

      {legs.length > 0 && !editing && (
        <div className="muted" style={{ marginTop: 10 }}>Tap a logged leg to add detail.</div>
      )}
    </div>
  );
}

const F = ({ label, ...p }) => (
  <div className="field"><label>{label}</label><input inputMode="decimal" {...p} /></div>
);

function Detail({ leg, onSaved, onDelete }) {
  const init = {};
  NUM.forEach(k => init[k] = leg[k] ?? '');
  init.rpe = leg.rpe ?? '';
  init.notes = leg.notes ?? '';
  const [f, setF] = useState(init);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const kmh = f.distance_km && f.duration_min
    ? (Number(f.distance_km) / (Number(f.duration_min) / 60)).toFixed(1) : null;

  async function save() {
    const p = {};
    NUM.forEach(k => p[k] = f[k] === '' ? null : Number(f[k]));
    p.rpe = f.rpe === '' ? null : Number(f.rpe);
    p.notes = f.notes || null;
    await supa().from('runs').update(p).eq('id', leg.id);
    onSaved();
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #232327' }}>
      <div className="grid2">
        <F label="Duration (min)" value={f.duration_min} onChange={set('duration_min')} />
        <F label="Distance (km)" value={f.distance_km} onChange={set('distance_km')} />
        <F label="Avg HR" value={f.hr_avg} onChange={set('hr_avg')} />
        <F label="Max HR" value={f.hr_max} onChange={set('hr_max')} />
        <F label="Temp °C" value={f.temp_c} onChange={set('temp_c')} />
        <F label="Ascent (m)" value={f.elevation_m} onChange={set('elevation_m')} />
        <F label="Backpack (kg)" value={f.carried_load_kg} onChange={set('carried_load_kg')} />
        <F label="RPE 1–10" value={f.rpe} onChange={set('rpe')} />
        <F label="Garmin Load" value={f.exercise_load} onChange={set('exercise_load')} />
        <F label="Training Effect" value={f.training_effect} onChange={set('training_effect')} />
      </div>

      {kmh && <div className="muted" style={{ marginBottom: 10 }}>
        Avg speed {kmh} km/h — derived, no need to enter it.
      </div>}

      <div className="field"><label>Notes</label>
        <input value={f.notes} onChange={set('notes')} placeholder="stops, headwind, legs…" /></div>

      <div className="row">
        <button className="btn" onClick={save}>Save</button>
        <button className="btn ghost" style={{ width: 'auto', padding: '15px 18px' }} onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
