'use client';
import { useEffect, useState } from 'react';
import { supa, fmtDate } from '../lib/supabase';

function Spark({ data, color = '#e8462a', h = 60 }) {
  if (!data || data.length < 2) return <div className="muted">Not enough data yet.</div>;
  const vals = data.map(d => d.v);
  const min = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
  const pts = data.map((d, i) =>
    `${(i / (data.length - 1)) * 100},${h - ((d.v - min) / rng) * (h - 8) - 4}`).join(' ');
  return (
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Progress() {
  const [runs, setRuns] = useState([]);
  const [pain, setPain] = useState([]);
  const [proj, setProj] = useState(null);
  const [wk, setWk] = useState([]);
  const [load, setLoad] = useState([]);
  const [acwr, setAcwr] = useState(null);

  useEffect(() => { (async () => {
    const s = supa();
    const { data: r } = await s.from('runs').select('*').order('date');
    setRuns(r || []);
    const { data: p } = await s.from('pain_logs').select('*').order('date');
    setPain(p || []);
    const { data: w } = await s.from('v_weekly_running').select('*').order('week_start');
    setWk(w || []);
    const { data: mp } = await s.rpc('marathon_projection');
    setProj(mp?.[0] || null);
    const { data: lw } = await s.from('v_load_weekly').select('*').order('week_start');
    setLoad(lw || []);
    const { data: ac } = await s.rpc('acwr');
    setAcwr(ac?.[0] || null);
  })(); }, []);

  const longs = runs.filter(r => r.run_type === 'long' && r.duration_min);
  const paceAtHR = runs.filter(r => r.distance_km && r.duration_min && r.hr_avg && r.hr_avg <= 140)
    .map(r => ({ d: r.date, v: r.duration_min / r.distance_km }));
  const ankle = pain.filter(p => p.site === 'left_ankle_extensor').map(p => ({ d: p.date, v: Number(p.score) }));

  const peak = longs.length ? Math.max(...longs.map(r => r.duration_min)) : 0;
  const lastPace = paceAtHR.at(-1)?.v, firstPace = paceAtHR[0]?.v;

  return (
    <div className="wrap">
      <h1>Progress</h1>
      <p className="sub">{runs.length} sessions logged since 12 May</p>

      {proj && (
        <div className="card key">
          <div className="muted">Marathon projection</div>
          <div className="big" style={{ margin: '6px 0' }}>{proj.projected_time}</div>
          <div className="muted">{proj.pace_per_km} min/km easy · {proj.basis}</div>
          <div className="cue" style={{ borderLeftColor: '#e0a53a' }}>{proj.verdict}</div>
        </div>
      )}

      <div className="card">
        <div className="row"><strong>Long run</strong><span className="muted">peak {peak} min</span></div>
        <Spark data={longs.map(r => ({ d: r.date, v: r.duration_min }))} />
        <div className="muted">Target: 180 min by 15 Nov. Cap ~3:15 for the two peak runs.</div>
      </div>

      <div className="card">
        <div className="row"><strong>Pace at HR ≤140</strong>
          <span className="muted">{lastPace ? lastPace.toFixed(1) + ' min/km' : '—'}</span></div>
        <Spark data={paceAtHR} color="#5aa9e6" />
        <div className="muted">
          {firstPace && lastPace
            ? `${firstPace.toFixed(1)} → ${lastPace.toFixed(1)} min/km. Down is better — this is progress marker #1.`
            : 'Down is better — the single best marker you have.'}
        </div>
      </div>

      <div className="card">
        <div className="row"><strong>L ankle extensor</strong>
          <span className="muted">{ankle.at(-1) ? ankle.at(-1).v + '/10' : '—'}</span></div>
        <Spark data={ankle} color="#e0a53a" />
        <div className="muted">Return criterion: 0 on both movements, two consecutive cold mornings.</div>
      </div>

      {acwr && (
        <div className="card">
          <div className="row"><strong>Acute : chronic load</strong>
            <span className="big" style={{ fontSize: 22 }}>{acwr.ratio ?? '—'}</span></div>
          <div className="muted" style={{ marginTop: 4 }}>
            Last 7 days {acwr.acute} vs 4-week average {acwr.chronic_avg}
          </div>
          <div className="cue" style={{
            borderLeftColor: acwr.ratio > 1.5 ? '#e8462a' : acwr.ratio > 1.3 ? '#e0a53a' : '#22401b' }}>
            {acwr.verdict}
          </div>
        </div>
      )}

      <h2>Weekly load</h2>
      <div className="card">
        <table><thead><tr><th>Week</th><th>Run</th><th>Cycle</th><th>Lift</th><th>Total</th></tr></thead>
          <tbody>{load.slice(-8).reverse().map(w => (
            <tr key={w.week_start}><td>{fmtDate(w.week_start).slice(0, 6)}</td>
              <td>{w.run_load || '—'}</td><td>{w.cycle_load || '—'}</td>
              <td>{w.lift_load || '—'}</td><td><strong>{w.total_load || '—'}</strong></td></tr>
          ))}</tbody></table>
      </div>

      <h2>Weekly volume</h2>
      <div className="card">
        <table><thead><tr><th>Week</th><th>Runs</th><th>Min</th><th>Long</th><th>Cad</th></tr></thead>
          <tbody>{wk.slice(-10).reverse().map(w => (
            <tr key={w.week_start}><td>{fmtDate(w.week_start).slice(0, 6)}</td><td>{w.runs}</td>
              <td>{Math.round(w.total_min || 0)}</td><td>{w.long_run_min || '—'}</td><td>{w.avg_cadence || '—'}</td></tr>
          ))}</tbody></table>
      </div>

      <h2>Markers</h2>
      <div className="card">
        <table><tbody>
          <tr><td>Resting HR</td><td style={{ textAlign: 'right' }}>62 → <strong>47</strong></td></tr>
          <tr><td>Continuous Z2</td><td style={{ textAlign: 'right' }}>20 → <strong>{peak} min</strong></td></tr>
          <tr><td>VT2 (field)</td><td style={{ textAlign: 'right' }}>~150 → <strong>~158–162</strong></td></tr>
          <tr><td>Longest run</td><td style={{ textAlign: 'right' }}>4km → <strong>12km</strong></td></tr>
          <tr><td>LTHR</td><td style={{ textAlign: 'right' }}>provisional 160 — <strong>TT 29 Sep</strong></td></tr>
          <tr><td>Fat oxidation</td><td style={{ textAlign: 'right' }}>untested since June</td></tr>
        </tbody></table>
      </div>
    </div>
  );
}
