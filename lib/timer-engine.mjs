export function initialTimer() { return { status: 'idle', index: 0, deadline: null, remainingMs: 0 }; }
export function validTimerState(state, durations) {
  if (!state || !['idle', 'running', 'paused', 'done'].includes(state.status)
    || !Number.isInteger(state.index) || state.index < 0 || state.index > durations.length
    || !Number.isFinite(state.remainingMs) || state.remainingMs < 0) return false;
  if (state.status === 'idle') return state.index === 0 && state.deadline === null && state.remainingMs === 0;
  if (state.status === 'done') return state.index === durations.length && state.deadline === null && state.remainingMs === 0;
  if (state.index >= durations.length) return false;
  return state.status === 'running' ? Number.isFinite(state.deadline) : state.deadline === null;
}
export function reconcileTimer(state, durations, now) {
  if (state.status !== 'running') return state;
  let index = state.index, deadline = state.deadline;
  // Carry the original deadline forward: foregrounding never grants extra time.
  while (index < durations.length && now >= deadline) {
    index += 1;
    if (index < durations.length) deadline += durations[index] * 1000;
  }
  return index >= durations.length
    ? { ...state, index, status: 'done', deadline: null, remainingMs: 0 }
    : { ...state, index, deadline, remainingMs: Math.max(0, deadline - now) };
}
export function timerAction(state, action, durations, now) {
  const current = reconcileTimer(state, durations, now);
  if (action === 'reset') return initialTimer();
  if (action === 'start') return durations.length ? { status: 'running', index: 0, deadline: now + durations[0] * 1000, remainingMs: durations[0] * 1000 } : { ...initialTimer(), status: 'done' };
  if (action === 'pause' && current.status === 'running') return { ...current, status: 'paused', deadline: null };
  if (action === 'resume' && current.status === 'paused') return { ...current, status: 'running', deadline: now + current.remainingMs };
  if (action === 'skip' && ['running', 'paused'].includes(current.status)) {
    const index = current.index + 1;
    return index >= durations.length ? { ...current, index, status: 'done', remainingMs: 0, deadline: null }
      : { ...current, index, remainingMs: durations[index] * 1000, deadline: current.status === 'running' ? now + durations[index] * 1000 : null };
  }
  if (action === 'extend' && ['running', 'paused'].includes(current.status)) return { ...current, remainingMs: current.remainingMs + 30000, deadline: current.deadline === null ? null : current.deadline + 30000 };
  return current;
}
