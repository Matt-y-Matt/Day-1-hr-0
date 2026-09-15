'use client';
import { useEffect, useRef, useState } from 'react';
import { supa, fmtDate } from '../lib/supabase';

// Isotonic is sipped across a run rather than taken at a moment, so its volume
// lives on runs.isotonic_ml with the carbohydrate it carries mirrored into one
// fuel_logs row. Without that row v_run_fuel counts the fluid but not the
// carbs, and carbs/hr reads low exactly when it matters — on the long runs.
const ISOTONIC_SERVING_ML = 500;

export default function FuelLog({ userId, run, onChanged, onClose }) {
  const [products, setProducts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [water, setWater] = useState('');
  const [isotonic, setIsotonic] = useState('');
  const [productId, setProductId] = useState('');
  const [atMinute, setAtMinute] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);

  const duration = Number(run?.duration_min) || 0;

  async function load() {
    const s = supa();
    const [prod, fuel, view, fresh] = await Promise.all([
      s.from('fuel_products').select('*').order('kind').order('name'),
      s.from('fuel_logs').select('*, fuel_products(name,kind,carbs_g,ratio,note)').eq('run_id', run.id).order('at_minute'),
      s.from('v_run_fuel').select('*').eq('run_id', run.id).maybeSingle(),
      s.from('runs').select('water_ml,isotonic_ml').eq('id', run.id).maybeSingle(),
    ]);
    for (const r of [prod, fuel, view, fresh]) if (r.error) throw r.error;
    setProducts(prod.data || []);
    setLogs(fuel.data || []);
    setSummary(view.data || null);
    setWater(fresh.data?.water_ml == null ? '' : String(fresh.data.water_ml));
    setIsotonic(fresh.data?.isotonic_ml == null ? '' : String(fresh.data.isotonic_ml));
    if (!productId) setProductId((prod.data || []).find(p => p.kind === 'gel')?.id || '');
  }

  useEffect(() => {
    let alive = true;
    load().catch(e => { if (alive) setError(`Could not load fuel: ${e.message}`); })
          .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [run.id]);

  const gels = products.filter(p => p.kind === 'gel');
  const chosen = products.find(p => p.id === productId);

  async function addProduct() {
    if (lock.current) return;
    const minute = Number(atMinute);
    if (!productId) { setError('Pick a product first.'); return; }
    if (atMinute === '' || !Number.isInteger(minute) || minute < 0) { setError('Enter the minute you took it, as a whole number.'); return; }
    if (duration && minute > duration) { setError(`That run was ${duration} min long — ${minute} min is after it finished.`); return; }
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const { error } = await supa().from('fuel_logs').insert({
        user_id: userId, run_id: run.id, date: run.date, product_id: productId, at_minute: minute, qty: 1,
      });
      if (error) throw error;
      setAtMinute('');
      await load();
      setMessage('Logged.');
      onChanged?.();
    } catch (e) { setError(`Not logged: ${e.message}`); }
    finally { lock.current = false; setBusy(false); }
  }

  async function removeLog(id) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const { error } = await supa().from('fuel_logs').delete().eq('id', id);
      if (error) throw error;
      await load();
      onChanged?.();
    } catch (e) { setError(`Not removed: ${e.message}`); }
    finally { lock.current = false; setBusy(false); }
  }

  async function saveFluid() {
    if (lock.current) return;
    const w = water === '' ? null : Number(water);
    const iso = isotonic === '' ? null : Number(isotonic);
    if ([w, iso].some(v => v != null && (!Number.isInteger(v) || v < 0))) { setError('Volumes must be whole millilitres.'); return; }
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const s = supa();
      const { error } = await s.from('runs').update({ water_ml: w, isotonic_ml: iso }).eq('id', run.id);
      if (error) throw error;

      // Keep the mirrored carbohydrate row in step with the volume.
      const isoProduct = products.find(p => p.kind === 'drink' && /isotonic/i.test(p.name));
      if (isoProduct) {
        const existing = logs.find(l => l.product_id === isoProduct.id);
        if (!iso) {
          if (existing) { const r = await s.from('fuel_logs').delete().eq('id', existing.id); if (r.error) throw r.error; }
        } else {
          const row = {
            user_id: userId, run_id: run.id, date: run.date, product_id: isoProduct.id,
            at_minute: 0, qty: Number((iso / ISOTONIC_SERVING_ML).toFixed(3)),
            note: 'Sipped through the run — volume taken from the fluid total.',
          };
          const r = existing
            ? await s.from('fuel_logs').update(row).eq('id', existing.id)
            : await s.from('fuel_logs').insert(row);
          if (r.error) throw r.error;
        }
      }
      await load();
      setMessage('Fluid saved.');
      onChanged?.();
    } catch (e) { setError(`Fluid not saved: ${e.message}`); }
    finally { lock.current = false; setBusy(false); }
  }

  const carbs = Number(summary?.carbs_g || 0);
  const perHr = summary?.carbs_per_hr == null ? null : Number(summary.carbs_per_hr);
  // A single-carbohydrate gel absorbs to roughly 60 g/hr; the 1:0.8
  // glucose:fructose blend uses a second transporter and lifts that near 90.
  const usedDual = logs.some(l => l.fuel_products?.ratio);
  const ceiling = usedDual ? 90 : 60;

  return <div className="wrap logging-screen fuel-screen">
    <div className="row"><h1>Fuel</h1><button className="chip" onClick={onClose} disabled={busy} aria-label="Close fuel log">✕</button></div>
    <p className="sub">{fmtDate(run.date)} · {run.run_type}{duration ? ` · ${duration} min` : ''}</p>

    {error && <div className="flag" role="alert">{error}</div>}
    {message && <div className="flag ok">{message}</div>}

    {loading ? <p className="muted">Loading fuel…</p> : <>
      <section className="card key">
        <div className="row"><strong>Carbohydrate</strong><b className="big">{carbs ? carbs.toFixed(0) : '0'} g</b></div>
        <div className="row"><span className="muted">Per hour</span><b>{perHr == null ? '—' : `${perHr} g/hr`}</b></div>
        {perHr != null && (
          <div className="cue" style={{ borderLeftColor: perHr > ceiling ? 'var(--warn)' : 'var(--good)' }}>
            {perHr > ceiling
              ? `Above the ~${ceiling} g/hr you can absorb${usedDual ? ' even on the 1:0.8 blend' : ' on single-source carbs'}. The surplus sits in your gut.`
              : `Within the ~${ceiling} g/hr ceiling${usedDual ? ' the 1:0.8 blend gives you' : ' for single-source carbs'}.`}
          </div>
        )}
        <div className="row"><span className="muted">Fluid</span><b>{summary?.fluid_ml ? `${summary.fluid_ml} ml` : '—'}{summary?.ml_per_hr ? ` · ${summary.ml_per_hr} ml/hr` : ''}</b></div>
        {summary?.timeline && <p className="muted">{summary.timeline}</p>}
      </section>

      <h2>Drink</h2>
      <section className="card">
        <div className="grid2">
          <div className="field"><label htmlFor="fuel-water">Water (ml)</label>
            <input id="fuel-water" inputMode="numeric" value={water} disabled={busy} onChange={e => setWater(e.target.value)} placeholder="0"/></div>
          <div className="field"><label htmlFor="fuel-isotonic">Isotonic (ml)</label>
            <input id="fuel-isotonic" inputMode="numeric" value={isotonic} disabled={busy} onChange={e => setIsotonic(e.target.value)} placeholder="0"/></div>
        </div>
        <p className="muted">Tracked apart because isotonic is food as well as fluid — {ISOTONIC_SERVING_ML} ml carries about 30 g of carbohydrate, and it counts toward the hourly total above. Water does not.</p>
        {Number(isotonic) > 0 && <p className="u-label">{isotonic} ml isotonic ≈ {(Number(isotonic) / ISOTONIC_SERVING_ML * 30).toFixed(0)} g carbs</p>}
        <button className="btn" disabled={busy} onClick={saveFluid}>{busy ? 'Saving…' : 'Save fluid'}</button>
      </section>

      <h2>Gels</h2>
      <section className="card">
        <div className="field"><label htmlFor="fuel-product">Product</label>
          <select id="fuel-product" value={productId} disabled={busy} onChange={e => setProductId(e.target.value)}>
            {gels.map(p => <option key={p.id} value={p.id}>{p.name} · {p.carbs_g} g</option>)}
            {products.filter(p => p.kind !== 'gel').map(p => <option key={p.id} value={p.id}>{p.name} · {p.carbs_g} g</option>)}
          </select></div>
        {chosen?.note && <div className="cue">{chosen.note}</div>}
        <div className="field"><label htmlFor="fuel-minute">Minute taken</label>
          <input id="fuel-minute" inputMode="numeric" value={atMinute} disabled={busy} onChange={e => setAtMinute(e.target.value)} placeholder={duration ? `0–${duration}` : 'minutes in'}/></div>
        <button className="btn" disabled={busy || !productId} onClick={addProduct}>{busy ? 'Saving…' : 'Add'}</button>
      </section>

      {logs.filter(l => l.fuel_products?.kind === 'gel').length > 0 && (
        <section className="card">
          {logs.filter(l => l.fuel_products?.kind === 'gel').map(l => (
            <div className="row" key={l.id} style={{ marginBottom: 8 }}>
              <span style={{ flex: 1 }}>{l.fuel_products?.name}{l.fuel_products?.ratio ? <span className="muted"> · {l.fuel_products.ratio}</span> : null}</span>
              <span className="pill">{l.at_minute} min</span>
              <button className="chip" disabled={busy} onClick={() => removeLog(l.id)} aria-label={`Remove ${l.fuel_products?.name} at ${l.at_minute} minutes`}>✕</button>
            </div>
          ))}
        </section>
      )}
    </>}
  </div>;
}
