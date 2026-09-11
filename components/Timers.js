'use client';
import { useEffect, useRef, useState } from 'react';

function beep() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = new C();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.18;
    o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 220);
  } catch (e) {}
}
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

// Rest timer — counts down, survives backgrounding via wall clock
export function RestTimer({ seconds, onDone }) {
  const [left, setLeft] = useState(seconds);
  const end = useRef(Date.now() + seconds * 1000);
  useEffect(() => {
    end.current = Date.now() + seconds * 1000;
    setLeft(seconds);
    const t = setInterval(() => {
      const l = Math.round((end.current - Date.now()) / 1000);
      setLeft(l);
      if (l <= 0) { clearInterval(t); beep(); onDone && onDone(); }
    }, 250);
    return () => clearInterval(t);
  }, [seconds]);
  return (
    <div className="card">
      <div className="timer" style={{ color: left <= 10 ? '#e8462a' : '#f0efec' }}>{mmss(left)}</div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn ghost" onClick={() => { end.current += 30000; setLeft(l => l + 30); }}>+30s</button>
        <button className="btn ghost" onClick={() => { end.current = Date.now(); setLeft(0); }}>Skip</button>
      </div>
    </div>
  );
}

const FULL = [
  { n: 'Raise — brisk walk building to easy jog', s: 210 },
  { n: 'Leg swings front/back + lateral, 10 each leg', s: 60 },
  { n: 'Walking lunge + twist, 6 each side', s: 50 },
  { n: 'Ankle circles + dorsiflexion rocks, 10 each', s: 45 },
  { n: '10 slow squats', s: 40 },
  { n: "World's greatest stretch, 3 each side", s: 55 },
  { n: 'Ankling — 20m', s: 30 },
  { n: 'A-skips — 20m', s: 30 },
  { n: 'High knees — 20m', s: 30 },
  { n: 'Butt kicks — 20m', s: 30 },
  { n: 'Stride 1 of 3 — 70m at 80%, full walk back', s: 60 },
  { n: 'Stride 2 of 3', s: 60 },
  { n: 'Stride 3 of 3', s: 60 },
  { n: 'Metronome to 172. Three breaths. Go.', s: 20 },
];
const SHORT = [
  { n: 'Raise — brisk walk building to easy jog', s: 210 },
  { n: 'Leg swings + ankle circles', s: 60 },
  { n: '10 slow squats', s: 40 },
  { n: 'Ankling — 20m', s: 30 },
  { n: 'A-skips — 20m', s: 30 },
  { n: 'Metronome to 172. Go.', s: 20 },
];

export function WarmupTimer({ type = 'short', onClose }) {
  const seq = type === 'full' ? FULL : SHORT;
  const [i, setI] = useState(-1);
  const [left, setLeft] = useState(0);
  const end = useRef(0);

  useEffect(() => {
    if (i < 0 || i >= seq.length) return;
    end.current = Date.now() + seq[i].s * 1000;
    setLeft(seq[i].s);
    const t = setInterval(() => {
      const l = Math.round((end.current - Date.now()) / 1000);
      setLeft(l);
      if (l <= 0) { clearInterval(t); beep(); setI(x => x + 1); }
    }, 250);
    return () => clearInterval(t);
  }, [i]);

  const total = seq.reduce((a, b) => a + b.s, 0);

  if (i < 0) return (
    <div className="card key">
      <div className="row"><strong>{type === 'full' ? 'Full warm-up' : 'Short warm-up'}</strong>
        <span className="muted">{Math.round(total / 60)} min</span></div>
      <p className="muted" style={{ margin: '8px 0 14px' }}>
        {type === 'full'
          ? 'Quality sessions and long runs. Auto-advances so you never touch the phone.'
          : 'Easy runs. No strides — those are a quality-day tool.'}
      </p>
      <div className="cue">One 45s Spanish squat hold before you start. Every run.</div>
      <button className="btn" style={{ marginTop: 12 }} onClick={() => setI(0)}>Start warm-up</button>
    </div>
  );

  if (i >= seq.length) return (
    <div className="card key">
      <strong>Warm-up done</strong>
      <div className="cue" style={{ marginTop: 10 }}>
        Lightly sweaty, breathing slightly up, legs springy. If you never got warm it was too easy;
        if you are puffing it was too hard.
      </div>
      <button className="btn ghost" style={{ marginTop: 12 }} onClick={onClose}>Close</button>
    </div>
  );

  return (
    <div className="card key">
      <div className="muted">Step {i + 1} of {seq.length}</div>
      <div style={{ fontSize: 19, fontWeight: 650, margin: '8px 0 14px', lineHeight: 1.3 }}>{seq[i].n}</div>
      <div className="timer" style={{ color: left <= 5 ? '#e8462a' : '#f0efec' }}>{mmss(left)}</div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={() => setI(x => x + 1)}>Skip step</button>
        <button className="btn ghost" onClick={onClose}>Exit</button>
      </div>
    </div>
  );
}
