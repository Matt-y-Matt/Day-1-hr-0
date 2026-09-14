'use client';
import { useEffect, useState } from 'react';
import { supa, fmtDate } from '../lib/supabase';

export default function Diary() {
  const [items, setItems] = useState([]);
  useEffect(() => { (async () => {
    const s = supa();
    const [{ data: sess }, { data: runs }, { data: pain }] = await Promise.all([
      s.from('sessions').select('*, workout_days(name)').order('date', { ascending: false }).limit(60),
      s.from('runs').select('*').order('date', { ascending: false }).limit(60),
      s.from('pain_logs').select('*').order('date', { ascending: false }).limit(80),
    ]);
    const rows = [
      ...(sess || []).filter(x => x.completed_at).map(x => ({ kind: 'lift', date: x.date, o: x })),
      ...(runs || []).map(x => ({ kind: 'run', date: x.date, o: x })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    const byDate = {};
    (pain || []).forEach(p => { (byDate[p.date] ||= []).push(p); });
    setItems(rows.map(r => ({ ...r, pain: byDate[r.date] })));
  })(); }, []);

  const FEEL = ['', 'wrecked', 'flat', 'ok', 'good', 'flying'];

  return (
    <div className="wrap">
      <h1>Diary</h1>
      <p className="sub">Every session, newest first</p>
      {items.map((it, i) => (
        <div key={i} className="card">
          <div className="row">
            <strong>{it.kind === 'lift' ? '🏋 ' + (it.o.workout_days?.name || 'Lift') :
              (it.o.run_type === 'cycle' ? '🚴 ' : '🏃 ') + it.o.run_type}</strong>
            <span className="muted">{fmtDate(it.date)}</span>
          </div>
          {it.kind === 'run' && (
            <div style={{ marginTop: 9 }}>
              {it.o.duration_min && <span className="pill">{Math.round(it.o.duration_min)} min</span>}
              {it.o.distance_km && <span className="pill">{it.o.distance_km} km</span>}
              {it.o.hr_avg && <span className="pill">HR {it.o.hr_avg}{it.o.hr_max ? '/' + it.o.hr_max : ''}</span>}
              {it.o.cadence_avg && <span className="pill">cad {it.o.cadence_avg}</span>}
              {it.o.temp_c && <span className="pill">{it.o.temp_c}°C</span>}
              {it.o.feel_1_5 && <span className="pill">felt {FEEL[it.o.feel_1_5]}</span>}
            </div>
          )}
          {it.kind === 'lift' && it.o.feel_1_5 && (
            <div style={{ marginTop: 9 }}><span className="pill">felt {FEEL[it.o.feel_1_5]}</span></div>
          )}
          {(it.o.notes || it.o.session_note) && (
            <div className="cue" style={{ borderLeftColor: 'var(--inset-border)' }}>{it.o.notes || it.o.session_note}</div>
          )}
          {it.pain && (
            <div style={{ marginTop: 8 }}>
              {it.pain.map(p => (
                <span key={p.id} className="pill"
                  style={{ borderColor: p.score > 0 ? '#4a2018' : '#22401b' }}>
                  {p.movement} {p.score}/10</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
