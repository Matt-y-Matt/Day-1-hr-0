'use client';
import { useEffect, useState } from 'react';
import { supa, TIER, fmtDate } from '../lib/supabase';

function monday(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d.toLocaleDateString('en-CA');
}

export default function Week() {
  const [off, setOff] = useState(0);
  const [plan, setPlan] = useState([]);
  const [days, setDays] = useState([]);

  const start = monday(off);
  const end = (() => { const d = new Date(start); d.setDate(d.getDate() + 6); return d.toLocaleDateString('en-CA'); })();

  useEffect(() => { (async () => {
    const s = supa();
    const { data: p } = await s.from('run_plan').select('*').gte('date', start).lte('date', end).order('date');
    setPlan(p || []);
    const { data: d } = await s.from('workout_days').select('*').eq('is_active', true).order('weekday');
    setDays(d || []);
  })(); }, [off]);

  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const block = plan[0]?.block;

  return (
    <div className="wrap">
      <div className="row">
        <button className="btn ghost" style={{ width: 'auto', padding: '10px 16px' }} onClick={() => setOff(o => o - 1)}>←</button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 17 }}>{fmtDate(start)} – {fmtDate(end)}</h1>
          <div className="muted">{off === 0 ? 'This week' : off > 0 ? `+${off} weeks` : `${off} weeks`}{block ? ` · ${block}` : ''}</div>
        </div>
        <button className="btn ghost" style={{ width: 'auto', padding: '10px 16px' }} onClick={() => setOff(o => o + 1)}>→</button>
      </div>

      <div style={{ marginTop: 18 }}>
        {names.map((n, i) => {
          const date = (() => { const d = new Date(start); d.setDate(d.getDate() + i); return d.toLocaleDateString('en-CA'); })();
          const runs = plan.filter(p => p.date === date);
          const lifts = days.filter(d => d.weekday === i + 1);
          const rest = runs.length === 0 && lifts.length === 0;
          return (
            <div key={n} className="card">
              <div className="row">
                <strong>{n} {new Date(date + 'T00:00:00').getDate()}</strong>
                {rest && <span className="muted">FULL REST — walk + mobility</span>}
              </div>
              {runs.map(r => (
                <div key={r.id} style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {r.run_type === 'long' ? '🏃 Long run' : r.run_type === 'threshold' ? '⚡ Threshold'
                      : r.run_type === 'test' ? '⏱ Time trial' : r.run_type === 'race' ? '🏁 RACE' : '🏃 ' + r.run_type}
                    {r.duration_min ? ` · ${r.duration_min} min` : ''}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {r.hr_ceiling && <span className="pill">HR ≤{r.hr_ceiling}</span>}
                    {r.hr_target_low && <span className="pill">{r.hr_target_low}–{r.hr_target_high}</span>}
                    <span className="pill">cad 172+</span>
                    <span className="pill">{r.warmup_type === 'full' ? 'full WU' : 'short WU'}</span>
                  </div>
                  {r.structure_note && <div className="cue">{r.structure_note}</div>}
                  {r.coach_note && <div className="cue" style={{ borderLeftColor: '#e0a53a' }}>{r.coach_note}</div>}
                </div>
              ))}
              {lifts.map(l => <div key={l.id} style={{ marginTop: 8, fontWeight: 600, fontSize: 15 }}>🏋 {l.name}</div>)}
              {!rest && runs.length === 0 && lifts.length > 0 && (
                <div className="muted" style={{ marginTop: 6 }}>Easy run 30–40 min if the legs are good</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
