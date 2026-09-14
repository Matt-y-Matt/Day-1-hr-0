'use client';
import { useEffect, useRef, useState } from 'react';
import { supa, getKey, BUILD } from '../lib/supabase';
import Today from '../components/Today';
import Settings from '../components/Settings';
import WorkoutEditor from '../components/WorkoutEditor';
import '../components/phase6.css';
import FoodLog from '../components/Food';
import { CommuteLog } from '../components/Commute';
import '../components/phase5.css';
import '../components/phase3.css';
import Week from '../components/Week';
import ScheduleEditor from '../components/ScheduleEditor';
import '../components/phase4.css';
import LogPanel from '../components/LogPanel';
import Progress from '../components/Progress';
import Diary from '../components/Diary';
import ExportPanel from '../components/ExportPanel';
import Session from '../components/Session';
import Dashboard from '../components/Dashboard';
import PainLog from '../components/PainLog';
import DailyBlock from '../components/DailyBlock';
import { WarmupTimer } from '../components/Timers';
import '../components/phase2-dashboard.css';

export default function Page() {
  const [ready, setReady] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [user, setUser] = useState(null);
  const [seededFor, setSeededFor] = useState(null);
  const [setupError, setSetupError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setHasKey(!!getKey()); const s = supa();
    if (!s) { setReady(true); return; }
    let alive = true;
    s.auth.getSession().then(({ data, error }) => { if (alive) { setUser(data.session?.user || null); if (error) setSetupError(error.message); setReady(true); } }).catch(e => { if (alive) { setSetupError(e.message); setReady(true); } });
    const { data: sub } = s.auth.onAuthStateChange((_e, sess) => { if (alive) setUser(sess?.user || null); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    let alive = true; setSeededFor(null); setSetupError('');
    if (!user) return;
    (async () => {
      try {
        const s = supa();
        const { count, error } = await s.from('exercises').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
        if (error) throw error;
        if (count == null) throw new Error('Could not verify your programme. Please retry.');
        if (!alive) return;
        if (count === 0) { const { error } = await s.rpc('seed_all'); if (error) throw error; }
        if (alive) setSeededFor(user.id);
      } catch (e) { if (alive) setSetupError(e.message); }
    })();
    return () => { alive = false; };
  }, [user?.id, retry]);
  if (!ready) return <div className="wrap"><p className="muted">Loading…</p></div>;
  if (!hasKey) return <div className="wrap"><h1>Temporarily unavailable</h1><p>Please try again shortly.</p></div>;
  if (!user) return <SignIn />;
  if (setupError) return <div className="wrap"><h1>Programme unavailable</h1><div className="flag" role="alert">{setupError}</div><button className="btn" onClick={() => setRetry(x => x + 1)}>Retry</button></div>;
  if (seededFor !== user.id) return <div className="wrap"><p className="muted">Setting up your programme…</p></div>;
  return <TrainingApp key={user.id} user={user}/>;
}

const TABS = [{ k: 'dashboard', ic: '◉', n: 'Dashboard' }, { k: 'week', ic: '▤', n: 'Week' }, { k: 'diary', ic: '☰', n: 'Diary' }, { k: 'settings', ic: '⚙', n: 'Settings' }];
function TrainingApp({ user }) {
  const [tab, setTab] = useState('dashboard');
  const [sub, setSub] = useState('overview');
  const [overlay, setOverlay] = useState(null);
  const [revision, setRevision] = useState(0);
  const [beepEnabled, setBeepEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);
  const [error, setError] = useState('');
  const overlayRef = useRef(null);
  const closing = useRef(false);
  const afterClose = useRef(null);
  const changed = () => setRevision(x => x + 1);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supa().from('user_settings').select('beep_enabled').eq('user_id', user.id).maybeSingle();
        if (error) throw error;
        if (alive) setBeepEnabled(data?.beep_enabled === true);
      } catch (e) { if (alive) setError(`Could not load timer settings: ${e.message}`); }
      finally { if (alive) setSettingsLoading(false); }
    })();
    return () => { alive = false; };
  }, [user.id]);
  useEffect(() => {
    if (!overlay) { previousFocus.current?.focus?.(); return; }
    const dialog = dialogRef.current;
    dialog?.focus();
    const keydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); return; }
      if (e.key !== 'Tab') return;
      const focusable = [...(dialog?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || [])].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { e.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener('keydown', keydown);
    return () => dialog?.removeEventListener('keydown', keydown);
  }, [overlay]);
  useEffect(() => {
    // A reload cannot restore an in-memory overlay; remove its stale marker.
    if (history.state?.trainingOverlay) history.replaceState(null, '');
    const pop = () => {
      const current = overlayRef.current;
      if (current) { setTab(current.origin.tab); setSub(current.origin.sub); }
      overlayRef.current = null; setOverlay(null); closing.current = false;
      const action = afterClose.current; afterClose.current = null; action?.();
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  function openOverlay(name, payload = {}) {
    if (closing.current || overlayRef.current) return;
    const next = { name, ...payload, origin: { tab, sub }, token: `${user.id}:${Date.now()}` };
    previousFocus.current = document.activeElement;
    overlayRef.current = next; setOverlay(next);
    history.pushState({ trainingOverlay: next.token }, '');
  }
  function closeOverlay(action) {
    if (closing.current) return;
    const current = overlayRef.current;
    if (!current) { action?.(); return; }
    afterClose.current = action || null;
    if (history.state?.trainingOverlay === current.token) { closing.current = true; history.back(); }
    else { overlayRef.current = null; setOverlay(null); setTab(current.origin.tab); setSub(current.origin.sub); afterClose.current = null; action?.(); }
  }
  function navigate(next) { const action = () => { setTab(next); if (next === 'dashboard') setSub('overview'); }; if (overlayRef.current) closeOverlay(action); else action(); }
  const nav = <nav className="nav" aria-label="Main navigation">{TABS.map(t => <button key={t.k} className={tab === t.k ? 'on' : ''} onClick={() => navigate(t.k)} aria-current={tab === t.k ? 'page' : undefined}><span className="ic">{t.ic}</span>{t.n}</button>)}</nav>;
  const onSchedule = (item, initialMode='move', weekStart) => openOverlay('schedule', { item, initialMode, weekStart });
  const onPain = date => openOverlay('pain', { date: typeof date === 'string' ? date : undefined });
  const onDaily = () => openOverlay('daily');
  const onRun = type => openOverlay('warmup', { type });
  const onStart = day => openOverlay('session', { day });
  const subnav = <div className="wrap phase2-subnav"><div className="seg" aria-label="Dashboard views">{['overview', 'today', 'progress'].map(v => <button key={v} className={sub === v ? 'on' : ''} onClick={() => setSub(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div></div>;
  return <>
    <main aria-hidden={!!overlay} inert={overlay ? '' : undefined}>
      {tab === 'dashboard' && <>{sub !== 'today' && subnav}
        {sub === 'overview' && <Dashboard userId={user.id} revision={revision} onPain={onPain} onDaily={onDaily} onRun={onRun} onStart={onStart} onToday={() => setSub('today')} onProgress={() => setSub('progress')}/>}
        {sub === 'today' && <Today onWorkout={day => openOverlay('workout',{day})} onCommute={trip => openOverlay('commute',trip)} onSchedule={onSchedule} subtabs={subnav} onFood={food => openOverlay('food', { food })} key={revision} onStart={onStart} onPain={onPain} onDaily={onDaily} onRun={onRun} userId={user.id} beepEnabled={beepEnabled}/>}
        {sub === 'progress' && <><div className="wrap phase2-tools"><button className="btn ghost" onClick={() => openOverlay('export')}>Export</button></div><Progress userId={user.id} revision={revision}/></>}
      </>}
      {tab === 'week' && <Week userId={user.id} revision={revision} onSchedule={onSchedule}/>}
      {tab === 'diary' && <><div className="wrap phase2-tools"><button className="btn ghost" onClick={onPain}>Log pain · dorsiflexion + eversion</button></div><Diary userId={user.id} revision={revision} onPain={onPain} onExport={() => openOverlay('export')}/></>}
      {tab === 'settings' && <Settings user={user} onSaved={value=>{setBeepEnabled(value.beep_enabled);changed();}} onWorkout={day=>openOverlay('workout',{day})} onExport={()=>openOverlay('export')} onLogs={()=>openOverlay('log')} onPain={onPain}/>}

      {nav}
    </main>
    {overlay && <div ref={dialogRef} tabIndex={-1} className="phase2-overlay" role="dialog" aria-modal="true" aria-label={overlay.name} key={overlay.token}>
      {overlay.name === 'workout' && <WorkoutEditor userId={user.id} day={overlay.day} onChanged={changed} onClose={()=>closeOverlay()}/>}
      {overlay.name === 'schedule' && <ScheduleEditor userId={user.id} item={overlay.item} initialMode={overlay.initialMode} weekStart={overlay.weekStart} onChanged={changed} onClose={() => closeOverlay()}/>}
      {overlay.name === 'commute' && <CommuteLog userId={user.id} direction={overlay.direction} leg={overlay.leg} onChanged={changed} onClose={() => closeOverlay()}/>}
      {overlay.name === 'food' && <FoodLog userId={user.id} initialFood={overlay.food} onChanged={changed} onClose={() => closeOverlay()}/>}
      {overlay.name === 'pain' && <PainLog initialDate={overlay.date} userId={user.id} onClose={() => closeOverlay()} onChanged={changed}/>}
      {overlay.name === 'daily' && <DailyBlock userId={user.id} beepEnabled={beepEnabled} onClose={() => closeOverlay()} onChanged={changed}/>}
      {overlay.name === 'warmup' && <WarmupTimer type={overlay.type} userId={user.id} beepEnabled={beepEnabled} onClose={() => closeOverlay()} onDone={() => closeOverlay(() => { setTab('dashboard'); setSub('today'); })}/>}
      {overlay.name === 'session' && <Session day={overlay.day} beepEnabled={beepEnabled} userId={user.id} onExit={() => { changed(); closeOverlay(); }}/>}
      {['log', 'export'].includes(overlay.name) && <><div className="wrap phase2-tools"><button className="btn ghost" onClick={() => { changed(); closeOverlay(); }}>‹ Back</button></div>{overlay.name === 'log' ? <LogPanel/> : <ExportPanel userId={user.id}/>}</>}
      {nav}
    </div>}
  </>;
}
function SignIn() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    setErr(''); setMsg(''); setBusy(true);
    const s = supa();
    if (mode === 'up') {
      if (pw !== pw2) { setErr('Passwords do not match.'); setBusy(false); return; }
      if (pw.length < 8) { setErr('Use at least 8 characters.'); setBusy(false); return; }
      const { data, error } = await s.auth.signUp({ email, password: pw });
      if (error) setErr(error.message);
      else if (data.session) { /* signed straight in */ }
      else setMsg('Account created. Check your email to confirm, then sign in.');
    } else {
      const { error } = await s.auth.signInWithPassword({ email, password: pw });
      if (error) setErr(error.message);
    }
    setBusy(false);
  }

  async function reset() {
    if (!email.includes('@')) { setErr('Enter your email first.'); return; }
    const { error } = await supa().auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
    if (error) setErr(error.message); else setMsg('Password reset link sent.');
  }

  return (
    <div className="wrap">
      <h1>Training</h1>
      <p className="sub">{mode === 'in' ? 'Sign in' : 'Create your account'}</p>
      <div className="card">
        <div className="field"><label htmlFor="signin-email">Email</label>
          <input id="signin-email" type="email" autoComplete="username" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></div>

        <div className="field"><label htmlFor="signin-password">Password</label>
          <input id="signin-password" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" /></div>

        {mode === 'up' && (
          <div className="field"><label htmlFor="signin-password-confirm">Confirm password</label>
            <input id="signin-password-confirm" type="password" autoComplete="new-password" value={pw2}
              onChange={e => setPw2(e.target.value)} placeholder="••••••••" /></div>
        )}

        <button className="btn" disabled={busy || !email.includes('@') || pw.length < 6} onClick={go}>
          {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>

        {err && <div className="flag" style={{ marginTop: 12 }}>{err}</div>}
        {msg && <div className="flag ok" style={{ marginTop: 12 }}>{msg}</div>}

        <button className="btn ghost" style={{ marginTop: 10 }}
          onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); setMsg(''); }}>
          {mode === 'in' ? 'Create an account instead' : 'I already have an account'}
        </button>

        {mode === 'in' && (
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={reset}>
            Forgot password
          </button>
        )}
      </div>
      <p className="muted">Stays signed in on this device. No email link needed.</p>
    </div>
  );
}
