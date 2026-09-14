'use client';
import { useEffect, useRef } from 'react';
import useTimer from '../lib/useTimer';
import { today } from '../lib/supabase';
import { FULL, SHORT } from './warmup-plan';
import './phase2-timers.css';
const mmss = s => `${Math.floor(Math.max(0,s)/60)}:${String(Math.max(0,s)%60).padStart(2,'0')}`;
export function TimerRing({left,total,good=false,label='REMAINING'}) {
 const c=2*Math.PI*104;
 return <div className="ring phase2-ring" role="timer" aria-label={`${left} seconds ${label.toLowerCase()}`}><svg viewBox="0 0 228 228" aria-hidden="true"><circle className="ring__track" cx="114" cy="114" r="104"/><circle className={`ring__fill ${good?'good':''}`} cx="114" cy="114" r="104" strokeDasharray={c} strokeDashoffset={c*(1-Math.min(1,left/(total||1)))}/></svg><div className="phase2-ring-text"><span className="ring__val">{mmss(left)}</span><span className="ring__unit">{label}</span></div></div>;
}
export function RestTimer({seconds,onDone,beepEnabled=false,userId,sessionId}) {
 const timer=useTimer({durations:[seconds],autoStart:true,beepEnabled,storageKey:userId&&sessionId?`timer:${userId}:rest:${sessionId}`:null});
 const called=useRef(false);
 useEffect(()=>{called.current=false;},[seconds]);
 useEffect(()=>{if(timer.status==='done'&&!called.current){called.current=true;onDone?.();}},[timer.status,onDone]);
 return <div className="card"><div className="timer">{mmss(timer.left)}</div><div className="grid2"><button className="btn ghost" onClick={timer.extend}>+30s</button><button className="btn ghost" onClick={timer.skip}>Skip</button></div></div>;
}
export function GymRestTimer({seconds,storageKey,nextSet,onDone,beepEnabled=false}) {
 const timer=useTimer({durations:[seconds],autoStart:true,beepEnabled,storageKey});
 return <><TimerRing left={timer.left} total={seconds}/><p className="muted">{timer.status==='done'?'Rest complete. Start when you are ready.':'Breathe. Set up for the next set.'}</p><button className="btn" onClick={onDone}>Start set {nextSet} now</button><button className="btn ghost" onClick={timer.extend}>+30 seconds</button></>;
}
export function WarmupTimer({type='short',onClose,onDone=onClose,beepEnabled=false,userId}) {
 const seq=type==='full'?FULL:SHORT;
 const timer=useTimer({durations:seq.map(s=>s.s),beepEnabled,storageKey:userId?`timer:${userId}:warmup:${today()}:${type}`:null});
 const total=seq.reduce((sum,s)=>sum+s.s,0);
 return <div className="phase2-timer-stack"><div className="row"><h1>{timer.status==='done'?'Warm-up done':'Warm-up'}</h1><button className="phase2-close" onClick={onClose} aria-label="Close warm-up">×</button></div>
 {timer.status==='idle'?<><p className="u-label">{type==='full'?'Full':'Short'} · {mmss(total)} · {seq.length} steps</p><div className="card"><strong>{type==='full'?'Quality sessions & long runs':'Easy run warm-up'}</strong><p className="muted">Steps advance automatically. Garmin records the run.</p><ol className="phase2-step-list">{seq.map(s=><li key={s.n}><span>{s.n}</span><span className="u-sub">{mmss(s.s)}</span></li>)}</ol></div><div className="callout red">One 45s Spanish squat hold before you start. Every run.</div><button className="btn" onClick={timer.start}>Start warm-up</button></>:timer.status==='done'?<><div className="phase2-done-mark">✓</div><h2>Ready to run</h2><p className="muted">Lightly sweaty, breathing slightly up, legs springy. If you never got warm it was too easy; if you are puffing it was too hard.</p><button className="btn" onClick={()=>{timer.reset();onDone?.();}}>Done · back to Today</button><button className="btn ghost" onClick={timer.reset}>Reset warm-up</button></>:<><div className="pips pips--steps" aria-label={`Step ${timer.index+1} of ${seq.length}`}>{seq.map((s,i)=><i key={s.n} className={i<timer.index?'done':i===timer.index?'current':''}/>)}</div><p className="u-label">Step {timer.index+1} of {seq.length} · {timer.status==='paused'?'Paused':'In progress'}</p><h1>{seq[timer.index]?.n}</h1><TimerRing left={timer.left} total={seq[timer.index]?.s} good/>{seq[timer.index+1]&&<div className="card"><span className="u-label">Up next</span><strong>{seq[timer.index+1].n}</strong></div>}<button className="btn" onClick={timer.status==='paused'?timer.resume:timer.pause}>{timer.status==='paused'?'Resume':'Pause'}</button><div className="grid2"><button className="btn ghost" onClick={timer.skip}>Skip step</button><button className="btn ghost" onClick={timer.reset}>Reset</button></div></>}
 <p className="muted">{beepEnabled?'Sound on. Keep this app open for audible cues; your phone may silence audio while locked.':'Sound off.'}</p></div>;
}
