'use client';
import { useEffect, useState } from 'react';
import { supa, TIER, today, fmtDate } from '../lib/supabase';
import { WarmupTimer } from './Timers';
import Commute from './Commute';

export default function Today({ onStart }) {
  const [days, setDays] = useState([]);
  const [plan, setPlan] = useState(null);
  const [pain, setPain] = useState([]);
  const [warm, setWarm] = useState(null);
  const t = today();
  const wd = ((new Date().getDay() + 6) % 7) + 1; // 1=Mon

  useEffect(() => { (async () => {
    const s = supa();
    const { data: d } = await s.from('workout_days').select('*').eq('weekday', wd).eq('is_active', true);
    setDays(d || []);
    const { data: p } = await s.from('run_plan').select('*').eq('date', t);
    setPlan(p?.[0] || null);
    const { data: pl } = await s.from('pain_logs').select('*').eq('date', t);
    setPain(pl || []);
  })(); }, []);

  const daysToRace = Math.ceil((new Date('2026-12-05') - new Date()) / 86400000);

  return (
    <div className="wrap">
      <h1>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
      <p className="sub">{daysToRace} days to SCSM</p>

      {pain.length === 0 && (
        <div className="flag">Morning pain check not logged. Score it cold, before you load anything —
          that is the reading the return criteria run on.</div>
      )}

      {warm && <WarmupTimer type={warm} onClose={() => setWarm(null)} />}

      {plan && (
        <div className="card key">
          <div className="row">
            <strong style={{ fontSize: 18 }}>
              {plan.run_type === 'long' ? '🏃 Long run' : plan.run_type === 'threshold' ? '⚡ Threshold'
                : plan.run_type === 'test' ? '⏱ Time trial' : plan.run_type === 'race' ? '🏁 RACE' : '🏃 Run'}
              {plan.duration_min ? ` · ${plan.duration_min} min` : ''}
            </strong>
          </div>
          <div style={{ marginTop: 10 }}>
            {plan.hr_ceiling && <span className="pill">HR ceiling {plan.hr_ceiling}</span>}
            {plan.hr_target_low && <span className="pill">aim {plan.hr_target_low}–{plan.hr_target_high}</span>}
            <span className="pill">cadence 172+</span>
            <span className="pill">{plan.warmup_type === 'full' ? 'full warm-up' : 'short warm-up'}</span>
            {plan.duration_min > 45 && <span className="pill">LMNT</span>}
          </div>
          {plan.structure_note && <div className="cue">{plan.structure_note}</div>}
          {plan.coach_note && <div className="cue" style={{ borderLeftColor: '#e0a53a' }}>{plan.coach_note}</div>}
          <button className="btn" style={{ marginTop: 14 }}
            onClick={() => setWarm(plan.warmup_type || 'short')}>Start warm-up</button>
        </div>
      )}

      <Commute />

      {days.map(d => <DayCard key={d.id} day={d} onStart={onStart} />)}

      {!plan && days.length === 0 && (
        <div className="card">
          <strong>Full rest day</strong>
          <p className="muted" style={{ marginTop: 8 }}>
            Walk and mobility only. Rest is one of the two non-negotiables — over-training does not come
            from too many easy sessions, it comes from deleting rest.
          </p>
        </div>
      )}

      <div className="card">
        <strong>Daily 15 min</strong>
        <p className="muted" style={{ marginTop: 8 }}>
          Isometric dorsiflexion 5 × 45s · Spanish squat 5 × 45s · hip mobility block.
          Collagen + vitamin C 40 min before.
        </p>
      </div>
    </div>
  );
}

function DayCard({ day, onStart }) {
  const [items, setItems] = useState([]);
  useEffect(() => { (async () => {
    const { data } = await supa().from('workout_exercises')
      .select('*, exercises(name,priority_tier)').eq('workout_day_id', day.id).order('order_index');
    setItems(data || []);
  })(); }, [day.id]);

  const live = items.filter(i => i.is_enabled);
  const off = items.filter(i => !i.is_enabled);

  return (
    <div className="card">
      <div className="row">
        <strong style={{ fontSize: 18 }}>🏋 {day.name}</strong>
        <span className="muted">{live.length} exercises · {day.est_minutes} min</span>
      </div>
      <div style={{ marginTop: 12 }}>
        {live.map(i => {
          const tr = TIER[i.exercises.priority_tier] || TIER.B;
          return (
            <div key={i.id} className="row" style={{ marginBottom: 7, justifyContent: 'flex-start' }}>
              <span className="tier" style={{ background: tr.color }}>{tr.label}</span>
              <span style={{ fontSize: 14, flex: 1 }}>{i.exercises.name}</span>
              <span className="muted">
                {i.sets}×{i.hold_seconds ? i.hold_seconds + 's' : (i.rep_min === i.rep_max ? i.rep_min : `${i.rep_min}–${i.rep_max}`)}
              </span>
            </div>
          );
        })}
        {off.map(i => (
          <div key={i.id} className="row disabled" style={{ marginBottom: 7, justifyContent: 'flex-start' }}>
            <span className="tier" style={{ background: '#3a3a40' }}>—</span>
            <span style={{ fontSize: 14, flex: 1, textDecoration: 'line-through' }}>{i.exercises.name}</span>
          </div>
        ))}
      </div>
      {off.length > 0 && <div className="flag" style={{ marginTop: 10 }}>{off[0].disabled_reason}</div>}
      <button className="btn" style={{ marginTop: 12 }} onClick={() => onStart(day)}>Start {day.name}</button>
    </div>
  );
}
