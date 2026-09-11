'use client';
import { useState } from 'react';
import { supa, fmtDate, today } from '../lib/supabase';

export default function ExportPanel() {
  const [range, setRange] = useState(7);
  const [txt, setTxt] = useState('');
  const [msg, setMsg] = useState('');

  async function build() {
    const s = supa();
    const from = new Date(); from.setDate(from.getDate() - range);
    const f = from.toLocaleDateString('en-CA');
    const [{ data: runs }, { data: pain }, { data: sess }, { data: daily }] = await Promise.all([
      s.from('runs').select('*').gte('date', f).order('date'),
      s.from('pain_logs').select('*').gte('date', f).order('date'),
      s.from('sessions').select('*, workout_days(name)').gte('date', f).order('date'),
      s.from('daily_log').select('*').gte('date', f).order('date'),
    ]);
    const ids = (sess || []).map(x => x.id);
    let logs = [];
    if (ids.length) {
      const { data } = await s.from('set_logs').select('*, exercises(name,load_unit)').in('session_id', ids);
      logs = data || [];
    }

    let o = `## Training export — last ${range} days (to ${fmtDate(today())})\n\n`;

    o += `### Runs\n`;
    if (runs?.length) {
      o += `| Date | Type | Min | Km | HR avg/max | <135 | Cad | °C | Felt |\n|---|---|---|---|---|---|---|---|---|\n`;
      runs.forEach(r => o += `| ${fmtDate(r.date)} | ${r.run_type} | ${r.duration_min ?? '—'} | ${r.distance_km ?? '—'} | ${r.hr_avg ?? '—'}/${r.hr_max ?? '—'} | ${r.min_under_135 ?? '—'} | ${r.cadence_avg ?? '—'} | ${r.temp_c ?? '—'} | ${r.feel_1_5 ?? '—'} |\n`);
      runs.filter(r => r.notes).forEach(r => o += `- ${fmtDate(r.date)}: ${r.notes}\n`);
    } else o += `None logged.\n`;

    o += `\n### Pain\n`;
    if (pain?.length) {
      o += `| Date | Site | Movement | Score |\n|---|---|---|---|\n`;
      pain.forEach(p => o += `| ${fmtDate(p.date)} | ${p.site} | ${p.movement ?? '—'} | ${p.score} |\n`);
    } else o += `None logged.\n`;

    o += `\n### Lifting\n`;
    if (sess?.length) {
      sess.filter(x => x.completed_at).forEach(x => {
        o += `\n**${fmtDate(x.date)} — ${x.workout_days?.name}** (felt ${x.feel_1_5 ?? '—'}/5)\n`;
        const mine = logs.filter(l => l.session_id === x.id);
        const byEx = {};
        mine.forEach(l => {
          const u = l.exercises?.load_unit;
          const suffix = u === 'per_hand' ? ' [per hand]' : u === 'added' ? ' [added to BW]'
            : u === 'stack' ? ' [stack]' : '';
          (byEx[(l.exercises?.name || '?') + suffix] ||= []).push(l);
        });
        Object.entries(byEx).forEach(([n, ls]) => {
          const parts = ls.sort((a, b) => a.set_number - b.set_number)
            .map(l => l.hold_seconds ? `${l.hold_seconds}s` : `${l.reps}×${l.weight_kg ?? 0}kg`);
          const rir = ls.find(l => l.rir != null);
          o += `- ${n}: ${parts.join(', ')}${rir ? ` (RIR ${rir.rir})` : ''}\n`;
        });
        if (x.session_note) o += `  _${x.session_note}_\n`;
      });
    } else o += `None logged.\n`;

    if (daily?.length) {
      o += `\n### Daily\n| Date | Wt AM | Wt PM | Cal | Protein | RHR | Sleep |\n|---|---|---|---|---|---|---|\n`;
      daily.forEach(d => o += `| ${fmtDate(d.date)} | ${d.weight_am_kg ?? '—'} | ${d.weight_pm_kg ?? '—'} | ${d.calories ?? '—'} | ${d.protein_g ?? '—'} | ${d.resting_hr ?? '—'} | ${d.sleep_hours ?? '—'} |\n`);
    }

    const clean = (pain || []).filter(p => Number(p.score) === 0).length;
    o += `\n### Flags\n- ${(sess || []).filter(x => x.completed_at).length} lifting sessions, ${(runs || []).length} runs\n`;
    o += `- ${clean} of ${(pain || []).length} pain readings clean\n`;

    setTxt(o);
    try { await navigator.clipboard.writeText(o); setMsg('Copied. Paste it straight into chat.'); }
    catch { setMsg('Built — select and copy below.'); }
    setTimeout(() => setMsg(''), 4000);
  }

  return (
    <div className="wrap">
      <h1>Export</h1>
      <p className="sub">One tap, then paste into chat. No re-explaining.</p>
      <div className="grid3" style={{ marginBottom: 14 }}>
        {[{ n: 'Day', v: 1 }, { n: 'Week', v: 7 }, { n: 'Month', v: 30 }].map(r => (
          <button key={r.v} className={'btn ' + (range === r.v ? '' : 'ghost')}
            style={{ padding: 13 }} onClick={() => setRange(r.v)}>{r.n}</button>
        ))}
      </div>
      <button className="btn" onClick={build}>Build & copy</button>
      {msg && <div className="flag ok" style={{ marginTop: 12 }}>{msg}</div>}
      {txt && <pre style={{ marginTop: 14 }}>{txt}</pre>}
    </div>
  );
}
