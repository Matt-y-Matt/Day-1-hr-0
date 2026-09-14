'use client';
import { useEffect, useState } from 'react';
import { supa, getKey, SUPA_URL, BUILD } from '../lib/supabase';
import Today from '../components/Today';
import Week from '../components/Week';
import LogPanel from '../components/LogPanel';
import Progress from '../components/Progress';
import Diary from '../components/Diary';
import ExportPanel from '../components/ExportPanel';
import Session from '../components/Session';

export default function Page() {
  const [ready, setReady] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [user, setUser] = useState(null);
  const [view, setView] = useState('today');
  const [active, setActive] = useState(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    setHasKey(!!getKey());
    const s = supa();
    if (!s) { setReady(true); return; }
    s.auth.getSession().then(({ data }) => { setUser(data.session?.user || null); setReady(true); });
    const { data: sub } = s.auth.onAuthStateChange((_e, sess) => setUser(sess?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { (async () => {
    if (!user || seeded) return;
    const s = supa();
    const { count } = await s.from('exercises').select('id', { count: 'exact', head: true });
    if (!count) await s.rpc('seed_all');
    setSeeded(true);
  })(); }, [user]);

  if (!ready) return <div className="wrap"><p className="muted">Loading…</p></div>;
  if (!hasKey) return <KeySetup />;
  if (!user) return <SignIn />;
  if (!seeded) return <div className="wrap"><p className="muted">Setting up your programme…</p></div>;
  if (active) return <Session day={active} onExit={() => setActive(null)} />;

  const TABS = [
    { k: 'today', ic: '◉', n: 'Today' },
    { k: 'week', ic: '▤', n: 'Week' },
    { k: 'log', ic: '✎', n: 'Log' },
    { k: 'progress', ic: '◪', n: 'Progress' },
    { k: 'diary', ic: '☰', n: 'Diary' },
    { k: 'export', ic: '↗', n: 'Export' },
  ];

  return (
    <>
      {view === 'today' && <Today onStart={setActive} />}
      {view === 'week' && <Week />}
      {view === 'log' && <LogPanel />}
      {view === 'progress' && <Progress />}
      {view === 'diary' && <Diary />}
      {view === 'export' && <ExportPanel />}
      <div className="wrap" style={{ paddingTop: 0, paddingBottom: 8 }}>
        <div className="card" style={{ marginTop: 8 }}>
          <div className="row">
            <div>
              <div style={{ fontSize: 13 }}>{user.email}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{BUILD}</div>
            </div>
            <button className="btn ghost" style={{ width: 'auto', padding: '10px 18px' }}
              onClick={async () => {
                if (!confirm('Sign out on this device?')) return;
                await supa().auth.signOut();
                location.reload();
              }}>Sign out</button>
          </div>
        </div>
      </div>
      <nav className="nav">
        {TABS.map(t => (
          <button key={t.k} className={view === t.k ? 'on' : ''} onClick={() => setView(t.k)}>
            <span className="ic">{t.ic}</span>{t.n}
          </button>
        ))}
      </nav>
    </>
  );
}

function KeySetup() {
  const [k, setK] = useState('');
  return (
    <div className="wrap">
      <h1>One-time setup</h1>
      <p className="sub">Paste your Supabase publishable (anon) key</p>
      <div className="card">
        <p className="muted" style={{ marginBottom: 14 }}>
          Supabase dashboard → Project Settings → API Keys. It starts with <code>sb_publishable_</code> or <code>eyJ</code>.
          It is safe in the browser — row-level security is what protects the data.
        </p>
        <div className="field"><label>Project URL</label><input value={SUPA_URL} readOnly /></div>
        <div className="field"><label>Anon key</label>
          <input value={k} onChange={e => setK(e.target.value)} placeholder="sb_publishable_…" /></div>
        <button className="btn" disabled={!k.trim()} onClick={() => {
          localStorage.setItem('sb_key', k.trim()); location.reload();
        }}>Save & continue</button>
      </div>
    </div>
  );
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
        <div className="field"><label>Email</label>
          <input type="email" autoComplete="username" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="cofounder@custore.co" /></div>

        <div className="field"><label>Password</label>
          <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" /></div>

        {mode === 'up' && (
          <div className="field"><label>Confirm password</label>
            <input type="password" autoComplete="new-password" value={pw2}
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
