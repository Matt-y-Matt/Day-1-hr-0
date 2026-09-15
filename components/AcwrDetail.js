'use client';
import { useEffect, useState } from 'react';
import { supa, fmtDate } from '../lib/supabase';

const BASES = [
  { k: 'time', n: 'Time' },
  { k: 'distance', n: 'Distance' },
  { k: 'load', n: 'Load' },
];

// Which band a ratio falls in. Kept in step with the ranges acwr_detail returns
// so the highlighted row and the verdict can never disagree.
function bandFor(ratio) {
  if (ratio == null) return null;
  if (ratio > 1.5) return '> 1.5';
  if (ratio >= 1.3) return '1.3 – 1.5';
  if (ratio >= 0.8) return '0.8 – 1.3';
  return '< 0.8';
}

export default function AcwrDetail({ onClose }) {
  const [basis, setBasis] = useState('time');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true; setData(null); setError('');
    (async () => {
      const { data, error } = await supa().rpc('acwr_detail', { basis });
      if (!alive) return;
      if (error) setError(error.message); else setData(data);
    })();
    return () => { alive = false; };
  }, [basis]);

  const ratio = data?.ratio == null ? null : Number(data.ratio);
  const active = bandFor(ratio);
  const rows = data?.rows || [];
  const acuteRows = rows.filter(r => r.in_acute);

  return <div className="wrap logging-screen acwr-screen">
    <div className="row"><h1>Acute : chronic</h1><button className="chip" onClick={onClose} aria-label="Close load detail">✕</button></div>
    <p className="sub">Every number below, and the sessions behind it</p>

    <div className="seg" aria-label="Load basis">
      {BASES.map(b => <button key={b.k} className={basis === b.k ? 'on' : ''} onClick={() => setBasis(b.k)}>{b.n}</button>)}
    </div>

    {error && <div className="flag" role="alert">Could not load the calculation: {error}</div>}
    {!data && !error && <p className="muted">Working it out…</p>}

    {data && <>
      <section className="card key">
        <div className="row"><strong>Ratio</strong><b className="big">{ratio == null ? '—' : ratio.toFixed(2)}</b></div>
        <p className="muted">Measured in {data.unit}.</p>
        {active && <div className="cue" style={{ borderLeftColor: ratio > 1.5 ? 'var(--accent)' : ratio >= 1.3 ? 'var(--warn)' : ratio >= 0.8 ? 'var(--good)' : 'var(--info)' }}>
          {data.bands?.find(b => b.range === active)?.meaning}
        </div>}
      </section>

      <h2>The arithmetic</h2>
      <section className="card">
        <p>{data.formula}</p>
        <div className="row"><span className="muted">Acute · {data.acute_window}</span><b>{data.acute} {data.unit}</b></div>
        <div className="row"><span className="muted">28-day total · {data.chronic_window}</span><b>{data.total_28d} {data.unit}</b></div>
        <div className="row"><span className="muted">Chronic · 28-day total ÷ 4</span><b>{data.chronic_avg} {data.unit}</b></div>
        <div className="row"><span className="muted">{data.acute} ÷ {data.chronic_avg}</span><b>{ratio == null ? '—' : ratio.toFixed(2)}</b></div>
        <p className="u-label">{acuteRows.length} of {rows.length} recorded sessions fall in the acute window</p>
      </section>

      {data.why_time && basis === 'time' && <section className="card"><strong>Why time is the default</strong><p className="muted">{data.why_time}</p></section>}

      <h2>Bands</h2>
      <div className="card table-scroll">
        <table><thead><tr><th>Ratio</th><th>Reading</th></tr></thead>
          <tbody>{(data.bands || []).map(b => (
            <tr key={b.range} className={b.range === active ? 'is-active' : undefined}>
              <td><b>{b.range}</b>{b.range === active ? ' ←' : ''}</td><td>{b.meaning}</td>
            </tr>
          ))}</tbody></table>
      </div>

      <h2>Every session counted</h2>
      <div className="card table-scroll">
        <table><thead><tr><th>Date</th><th>Kind</th><th>{data.unit}</th><th>Window</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={`${r.date}-${r.kind}-${i}`}>
              <td>{fmtDate(r.date)}</td><td>{r.kind}</td><td>{r.value}</td>
              <td>{r.in_acute ? <span className="pill">acute + chronic</span> : <span className="muted">chronic only</span>}</td>
            </tr>
          ))}</tbody></table>
        {!rows.length && <p className="muted">Nothing recorded in the last 28 days on this basis.</p>}
      </div>

      {data.caveat && <section className="card"><strong>Read it with this in mind</strong><p className="muted">{data.caveat}</p></section>}
    </>}
  </div>;
}
