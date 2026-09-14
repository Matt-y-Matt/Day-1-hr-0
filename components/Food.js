'use client';
import { useEffect, useRef, useState } from 'react';
import { supa, today } from '../lib/supabase';

export function FoodCard({ userId, dayType, onOpen }) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => { let alive = true; (async () => {
    const results = await Promise.all([supa().from('v_daily_nutrition').select('*').eq('user_id', userId).eq('date', today()).maybeSingle(), supa().from('user_settings').select('*').eq('user_id', userId).maybeSingle(), supa().from('foods').select('*').eq('is_favourite', true).order('name').limit(3)]);
    if (!alive) return;
    if (results.some(r => r.error)) { setError('Could not load food totals.'); return; }
    setData({ total: results[0].data || {}, settings: results[1].data || {}, favourites: results[2].data || [] });
  })().catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [userId]);
  const kcal = data?.total.kcal || 0, protein = data?.total.protein_g || 0;
  const target = data?.settings[`kcal_${dayType}`] ?? ({ rest: 1800, easy: 2000, run_lift: 2300, long: 2700 }[dayType]);
  const pTarget = data?.settings.protein_g ?? 155;
  return <section className="card food-card" aria-label="Food · today"><div className="row"><strong>Food · today</strong><span className="u-sub">{data ? `${kcal} / ${target} kcal` : '—'}</span></div>
    {data && <><div className="food-bar"><i style={{ width: `${Math.min(100, kcal / target * 100)}%` }}/></div><div className="row muted"><span>{Math.max(0,target-kcal)} kcal left</span><span>{protein} / {pTarget}g P</span></div><div className="food-bar protein"><i style={{ width: `${Math.min(100,protein / pTarget * 100)}%` }}/></div></>}
    {error && <p role="alert" className="muted">{error}</p>}
    <button className="btn ghost food-search" onClick={() => onOpen()}>Search food… <span className="u-label">1 tap</span></button>
    <div className="food-chips">{data?.favourites.map(f => <button className="pill" key={f.id} onClick={() => onOpen(f)}>{f.name}</button>)}<button className="pill" onClick={() => onOpen({ custom: true })}>+ Custom</button></div>
  </section>;
}

export default function FoodLog({ userId, initialFood, onClose, onChanged }) {
  const [foods, setFoods] = useState([]), [query, setQuery] = useState(''), [selected, setSelected] = useState(initialFood || null);
  const [servings, setServings] = useState('1'), [meal, setMeal] = useState('snack'), [custom, setCustom] = useState({ name: '', kcal: '', protein: '' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const lock = useRef(false), rowId = useRef(null);
  useEffect(() => { let alive = true; supa().from('foods').select('*').order('name').then(({ data, error }) => { if (alive) { setFoods(data || []); if (error) setError(error.message); setLoading(false); } }); return () => { alive = false; }; }, []);
  async function save() {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      const amount = Number(servings), kcal = Number(selected.custom ? custom.kcal : selected.kcal), protein = Number(selected.custom ? custom.protein : selected.protein_g);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(kcal) || kcal < 0 || !Number.isFinite(protein) || protein < 0 || (selected.custom && (!custom.name.trim() || custom.kcal === '' || custom.protein === ''))) throw new Error('Enter a food name, calories, protein and positive serving amount.');
      rowId.current ||= crypto.randomUUID();
      const { error } = await supa().from('meal_logs').upsert({ id: rowId.current, user_id: userId, date: today(), meal, food_id: selected.custom ? null : selected.id, custom_name: selected.custom ? custom.name.trim() : null, servings: amount, kcal: Math.round(kcal * amount), protein_g: Math.round(protein * amount * 10) / 10 }, { onConflict: 'id' });
      if (error) throw error; onChanged?.(); onClose();
    } catch (e) { setError(`Not saved: ${e.message}`); } finally { lock.current = false; setBusy(false); }
  }
  return <div className="wrap"><div className="row"><h1>Food log</h1><button className="btn ghost compact" onClick={onClose}>‹ Back</button></div>
    <div className="card"><label>Meal<select value={meal} disabled={busy} onChange={e => setMeal(e.target.value)}>{['breakfast','lunch','dinner','snack'].map(m => <option key={m}>{m}</option>)}</select></label>
      {selected ? <><strong>{selected.custom ? 'Custom food' : selected.name}</strong>{selected.custom && <>{[['name','Food name'],['kcal','Calories per serving'],['protein','Protein per serving (g)']].map(([key,label]) => <label key={key}>{label}<input disabled={busy} inputMode={key === 'name' ? 'text' : 'decimal'} value={custom[key]} onChange={e => setCustom(c => ({ ...c, [key]: e.target.value }))}/></label>)}</>}
        <label>Servings{selected.serving_desc ? ` · ${selected.serving_desc}` : ''}<input aria-label="Servings" inputMode="decimal" disabled={busy} value={servings} onChange={e => setServings(e.target.value)}/></label>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Add to ${meal}`}</button><button className="btn ghost" disabled={busy} onClick={() => setSelected(null)}>Choose another food</button></> : <><input aria-label="Search food" placeholder="Search food…" value={query} onChange={e => setQuery(e.target.value)}/>{loading && <p className="muted">Loading foods…</p>}{foods.filter(f => f.name.toLowerCase().includes(query.toLowerCase())).slice(0,50).map(f => <button className="food-result" key={f.id} onClick={() => setSelected(f)}><strong>{f.name}</strong><small>{f.serving_desc} · {f.kcal} kcal · {f.protein_g}g P</small></button>)}<button className="btn ghost" onClick={() => setSelected({ custom: true })}>+ Custom food</button></>}
      {error && <div className="flag" role="alert">{error}</div>}
    </div></div>;
}
