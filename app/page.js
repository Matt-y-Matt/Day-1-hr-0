'use client';
import { useEffect, useState } from 'react';
import { supa, getKey, SUPA_URL } from '../lib/supabase';
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
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    const { error } = await supa().auth.signInWithOtp({
      email, options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) setErr(error.message); else setSent(true);
  }
  return (
    <div className="wrap">
      <h1>Training</h1>
      <p className="sub">Sign in with a magic link</p>
      <div className="card">
        {sent ? <p className="muted">Check your email — tap the link on this device.</p> : (
          <>
            <div className="field"><label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="cofounder@custore.co" /></div>
            <button className="btn" disabled={!email.includes('@')} onClick={go}>Send link</button>
            {err && <div className="flag" style={{ marginTop: 12 }}>{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}
