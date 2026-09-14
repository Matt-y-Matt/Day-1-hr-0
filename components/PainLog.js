'use client';
import { useEffect, useRef, useState } from 'react';
import { supa } from '../lib/supabase';
import { ANKLE_SITE, PAIN_MOVEMENTS, localDate, shiftDate, latestPain } from '../lib/phase2-data.mjs';

function Scale({ label, value, onChange, disabled }) {
  const [more, setMore] = useState(false);
  const values = more ? Array.from({ length: 21 }, (_, i) => i / 2) : [0, .5, 1, 1.5, 2, 3];
  return <fieldset className="pain-field" disabled={disabled}><legend>{label} <span className="muted">{value == null ? 'Not scored' : `${value}/10`}</span></legend>
    <div className="painscale">{values.map(n => <button type="button" key={n} aria-label={`${label} ${n} out of 10`} aria-pressed={value === n} className={value === n ? `on ${n === 0 ? 'zero' : ''}` : ''} onClick={() => onChange(n)}>{n}</button>)}</div>
    <button className="chip" type="button" onClick={() => setMore(!more)}>{more ? 'Less' : 'More · 0–10'}</button>
  </fieldset>;
}

export default function PainLog({ userId, onClose, onChanged, initialDate }) {
  const [date] = useState(() => initialDate || localDate());
  const [rows, setRows] = useState([]);
  const [scores, setScores] = useState({ dorsiflexion: null, eversion: null });
  const [knee, setKnee] = useState(null);
  const [showKnee, setShowKnee] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const pendingInsert = useRef(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supa().from('pain_logs').select('*').eq('user_id', userId).gte('date', shiftDate(date, -13)).lte('date', date);
        if (error) throw error;
        if (alive) { setRows(data || []); const current = latestPain(data || [], date); setScores(Object.fromEntries(PAIN_MOVEMENTS.map(m => [m, current[m]?.score == null ? null : Number(current[m].score)]))); }
      } catch (e) { if (alive) setError(`Could not load readings: ${e.message}`); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [userId, date]);
  async function save() {
    if (lock.current || PAIN_MOVEMENTS.some(m => scores[m] == null)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const payload = PAIN_MOVEMENTS.map(movement => ({ user_id: userId, date, site: ANKLE_SITE, movement, score: scores[movement], note: note.trim() || null }));
      if (showKnee && knee != null) payload.push({ user_id: userId, date, site: 'right_patellar', movement: 'general', score: knee, note: note.trim() || null });
      // Stable IDs make a retry safe even if the first response was lost after commit.
      // A changed form starts a new observation group; older observations stay intact.
      const fingerprint = JSON.stringify(payload);
      if (pendingInsert.current?.fingerprint !== fingerprint) {
        pendingInsert.current = { fingerprint, rows: payload.map(row => ({ ...row, id: crypto.randomUUID() })) };
      }
      const { error } = await supa().from('pain_logs').upsert(pendingInsert.current.rows, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      onChanged?.(); onClose();
    } catch (e) { setError(`Scores were not saved: ${e.message}`); }
    finally { lock.current = false; setBusy(false); }
  }
  const yesterday = latestPain(rows, shiftDate(date, -1));
  return <div className="wrap pain-screen"><div className="row"><h1>Pain log</h1><button className="chip" onClick={onClose} disabled={busy} aria-label="Close pain log">✕</button></div>
    <p className="sub">{date} · left ankle extensor</p>
    <div className="flag">Score cold, before loading or isometrics. A missing reading is not zero.</div>
    {error && <div className="flag" role="alert">{error}</div>}
    {loading ? <p className="muted">Loading readings…</p> : <>
      <div className="pain-cards">{PAIN_MOVEMENTS.map(m => <div className="card" key={m}><Scale label={m === 'dorsiflexion' ? 'Dorsiflexion' : 'Eversion'} value={scores[m]} disabled={busy} onChange={value => setScores(s => ({ ...s, [m]: value }))}/><p className="muted">Yesterday: {yesterday[m]?.score == null ? 'not recorded' : `${yesterday[m].score}/10`}</p></div>)}</div>
      <div className="card"><button className="btn ghost" onClick={() => setShowKnee(!showKnee)} disabled={busy}>{showKnee ? 'Remove optional knee reading' : '+ Right patellar · optional'}</button>{showKnee && <Scale label="Right patellar · general" value={knee} onChange={setKnee} disabled={busy}/>}<label htmlFor="pain-note">Note · optional</label><textarea id="pain-note" rows={2} value={note} onChange={e => setNote(e.target.value)} disabled={busy}/></div>
      <button className="btn" disabled={busy || PAIN_MOVEMENTS.some(m => scores[m] == null)} onClick={save}>{busy ? 'Saving…' : showKnee && knee != null ? 'Save both scores + knee' : 'Save both scores'}</button>
      <h2>Last 14 days</h2><PainTrend rows={rows} date={date}/>
    </>}
  </div>;
}

function PainTrend({ rows, date }) {
  const dates = Array.from({ length: 14 }, (_, i) => shiftDate(date, i - 13));
  const groups = dates.map(d => latestPain(rows, d));
  return <div className="card"><svg className="spark-svg spark--multi" viewBox="0 0 326 94" role="img" aria-label="Pain scores over fourteen days, zero to ten. Missing readings have gaps."><line className="baseline" x1="8" x2="318" y1="84" y2="84"/>{PAIN_MOVEMENTS.map((m, j) => <g className={j ? 'l2' : 'l1'} key={m}>{groups.map((g, i) => {
    if (g[m]?.score == null) return null;
    const x = 8 + i * 310 / 13, y = 84 - Number(g[m].score) * 7.6;
    const previous = i > 0 ? groups[i - 1][m] : null;
    return <g key={i}>{previous?.score != null && <line x1={8 + (i - 1) * 310 / 13} y1={84 - Number(previous.score) * 7.6} x2={x} y2={y}/>}<circle cx={x} cy={y} r="2.5"><title>{dates[i]} {m}: {g[m].score}/10</title></circle></g>;
  })}</g>)}</svg><p className="muted">Solid amber: dorsiflexion · dashed blue: eversion. Gaps mean not recorded.</p></div>;
}
