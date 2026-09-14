'use client';
import { useEffect, useRef, useState } from 'react';
import { supa, today } from '../lib/supabase';
import Icon from './Icons';
import { bodyComplete } from '../lib/gym.mjs';

const fields = [['weight_am_kg', 'AM weight', 'kg'], ['weight_pm_kg', 'PM weight', 'kg'], ['waist_cm', 'Waist', 'cm']];
export default function BodyCard({ userId }) {
  const [form, setForm] = useState({}), [saved, setSaved] = useState({}), [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(true), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const lock = useRef(false), pendingPhoto = useRef(null);
  const date = today();
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [body, pics] = await Promise.all([
          supa().from('daily_log').select('*').eq('user_id', userId).eq('date', date).maybeSingle(),
          supa().from('photos').select('*').eq('user_id', userId).eq('date', date).order('created_at', { ascending: false }),
        ]);
        if (body.error || pics.error) throw body.error || pics.error;
        const list = await Promise.all((pics.data || []).map(async p => {
          const { data } = await supa().storage.from('photos').createSignedUrl(p.storage_path, 3600);
          return { ...p, url: data?.signedUrl };
        }));
        if (alive) { setForm(body.data || {}); setSaved(body.data || {}); setPhotos(list); setOpen(!bodyComplete(body.data, list)); setLoaded(true); }
      } catch (e) { if (alive) setError(e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [userId, date]);
  async function save(e) {
    e.preventDefault(); if (lock.current || !loaded) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const values = { user_id: userId, date };
      for (const [key, label] of fields) {
        const raw = form[key]; values[key] = raw == null || raw === '' ? null : Number(raw);
        if (values[key] != null && (!Number.isFinite(values[key]) || values[key] <= 0)) throw new Error(`${label} must be a positive number.`);
      }
      const { data, error } = await supa().from('daily_log').upsert(values, { onConflict: 'user_id,date' }).select().single();
      if (error) throw error;
      setSaved(data); setForm(data); setOpen(!bodyComplete(data, photos)); setMessage('Body measurements saved.');
    } catch (e) { setError(`Not saved: ${e.message}`); }
    finally { lock.current = false; setBusy(false); }
  }
  async function photo(e, slot) {
    const file = e.target.files?.[0]; if (!file || lock.current) return;
    e.target.value = ''; lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image.');
      if (file.size > 15 * 1024 * 1024) throw new Error('Choose a photo smaller than 15 MB.');
      const fingerprint = `${slot}:${file.name}:${file.size}:${file.lastModified}`;
      if (pendingPhoto.current?.fingerprint !== fingerprint) {
        const id = crypto.randomUUID();
        pendingPhoto.current = { fingerprint, id, path: `${userId}/${date}-${slot}-${id}`, uploaded: false };
      }
      const pending = pendingPhoto.current;
      if (!pending.uploaded) {
        const result = await supa().storage.from('photos').upload(pending.path, file, { contentType: file.type });
        if (result.error && String(result.error.statusCode) !== '409') throw result.error;
        pending.uploaded = true;
      }
      const { data, error } = await supa().from('photos').upsert({ id: pending.id, user_id: userId, date, slot, storage_path: pending.path }, { onConflict: 'id' }).select().single();
      if (error) throw error;
      const signed = await supa().storage.from('photos').createSignedUrl(pending.path, 3600);
      const list = [{ ...data, url: signed.data?.signedUrl }, ...photos.filter(p => p.id !== data.id)];
      setPhotos(list); pendingPhoto.current = null;
      // Do not hide unsaved measurements when a photo finishes uploading.
      const dirty = fields.some(([k]) => String(form[k] ?? '') !== String(saved[k] ?? ''));
      if (!dirty && bodyComplete(saved, list)) setOpen(false);
      setMessage(`${slot.toUpperCase()} photo saved.`);
    } catch (e) { setError(`Photo not saved: ${e.message}. Select the photo again to retry.`); }
    finally { lock.current = false; setBusy(false); }
  }
  const complete = bodyComplete(saved, photos);
  if (!open && complete) return <button className="body-summary" onClick={() => setOpen(true)} aria-expanded="false"><span className="status-dot good"/><span><strong>Body · daily</strong><small>{saved.weight_am_kg} / {saved.weight_pm_kg} kg · waist {saved.waist_cm ?? '—'}{saved.waist_cm ? ' cm' : ''} · {photos.length} photo{photos.length === 1 ? '' : 's'}</small></span><span>▸</span></button>;
  const missing = [!saved.weight_am_kg && 'AM weight', !saved.weight_pm_kg && 'PM weight', !photos.length && '1 photo'].filter(Boolean);
  return <section className="card body-card" aria-label="Body · daily">
    <div className="row"><strong className="u-label">Body · daily</strong><span className="u-label body-status"><i className="status-dot"/>{missing.length ? missing.length===3?'Weights + photo left':missing.join(' + ') + ' left' : 'Complete'}</span></div>
    {loading ? <p className="muted">Loading measurements…</p> : <>
      <form onSubmit={save}><div className="body-fields">{fields.map(([key, label, unit]) => <label key={key} className={`field-box ${form[key] == null || form[key] === '' ? 'is-empty' : ''}`}><span className="u-label">{label}</span><div className="body-input"><input aria-label={label} inputMode="decimal" placeholder="Tap" value={form[key] ?? ''} disabled={busy || !loaded} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}/><span className="u-unit">{unit}</span></div></label>)}</div><button className="btn ghost body-save" disabled={busy || !loaded}>{busy ? 'Saving…' : 'Save measurements'}</button></form>
      <div className="grid2">{['am', 'pm'].map(slot => { const p = photos.find(p => p.slot === slot); return <label key={slot} className={`body-photo field-box ${p ? '' : 'is-empty'}`}>
        {p?.url ? <img src={p.url} alt={`${slot.toUpperCase()} progress photo`}/> : <Icon name="camera" size={18}/>}<span><strong>{slot.toUpperCase()} photo</strong><small>{p ? 'Taken · tap to replace' : 'Tap to take'}</small></span><input aria-label={`${slot.toUpperCase()} photo`} type="file" accept="image/*" capture="environment" disabled={busy || !loaded} onChange={e => photo(e, slot)}/>
      </label>; })}</div>
    </>}
    {error && <div className="flag" role="alert">{error}</div>}{message && <p className="muted" role="status">{message}</p>}
  </section>;
}
