'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { initialTimer, reconcileTimer, timerAction, validTimerState } from './timer-engine.mjs';

let audioContext;
export function unlockTimerAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioContext ||= new Audio();
    audioContext.resume().catch(() => {});
  } catch {}
}
function beep() {
  try {
    if (!audioContext || audioContext.state !== 'running') return;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.frequency.value = 880; gain.gain.value = 0.18;
    oscillator.start(); oscillator.stop(audioContext.currentTime + 0.22);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch {}
}

export default function useTimer({ durations, storageKey, beepEnabled = false, autoStart = false }) {
  const signature = JSON.stringify(durations);
  const [state, setState] = useState(initialTimer);
  const ref = useRef(initialTimer());
  const ready = useRef(false);
  const commit = useCallback(next => {
    const previous = ref.current;
    ref.current = next; setState(next);
    if (storageKey && (next.deadline !== previous.deadline || next.status !== previous.status || next.index !== previous.index || next.status !== 'running')) try { localStorage.setItem(storageKey, JSON.stringify({ signature, state: next })); } catch {}
  }, [storageKey, signature]);
  useEffect(() => {
    ready.current = false;
    let next = initialTimer();
    if (storageKey) try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved?.signature === signature && validTimerState(saved.state, durations)) next = saved.state;
    } catch {}
    if (autoStart && next.status === 'idle') next = timerAction(next, 'start', durations, Date.now());
    commit(reconcileTimer(next, durations, Date.now())); ready.current = true;
  }, [storageKey, signature, autoStart, commit]);
  useEffect(() => {
    const tick = () => {
      if (!ready.current || ref.current.status !== 'running') return;
      const previous = ref.current, next = reconcileTimer(previous, durations, Date.now());
      if (beepEnabled && next.index !== previous.index) beep();
      commit(next);
    };
    const interval = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [signature, beepEnabled, commit]);
  const act = action => { if (beepEnabled) unlockTimerAudio(); commit(timerAction(ref.current, action, durations, Date.now())); };
  return { ...state, left: Math.ceil(state.remainingMs / 1000), start: () => act('start'), pause: () => act('pause'), resume: () => act('resume'), skip: () => act('skip'), reset: () => act('reset'), extend: () => act('extend') };
}
