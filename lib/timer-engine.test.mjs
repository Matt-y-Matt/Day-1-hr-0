import test from 'node:test';
import assert from 'node:assert/strict';
import { initialTimer, reconcileTimer, timerAction, validTimerState } from './timer-engine.mjs';
test('restoration rejects malformed and inconsistent persisted state', () => {
  assert.equal(validTimerState(initialTimer(), [10]), true);
  const paused = { status: 'paused', index: 0, remainingMs: 5000, deadline: null };
  assert.equal(validTimerState(paused, [10]), true);
  for (const state of [{ ...paused, remainingMs: null }, { ...paused, remainingMs: -1 }, { ...paused, index: 1 }, { ...paused, deadline: 100 }, { ...paused, status: 'done' }]) assert.equal(validTimerState(state, [10]), false);
});
test('background reconciliation carries deadlines across multiple steps', () => {
  const state = timerAction(initialTimer(), 'start', [10, 20, 30], 1000);
  const result = reconcileTimer(state, [10, 20, 30], 36000);
  assert.equal(result.index, 2); assert.equal(result.deadline, 61000); assert.equal(result.remainingMs, 25000);
  assert.equal(reconcileTimer(result, [10, 20, 30], 61000).status, 'done');
});
test('pause preserves exact remainder and resume uses a new deadline', () => {
  const start = timerAction(initialTimer(), 'start', [10], 1000);
  const paused = timerAction(start, 'pause', [10], 3500);
  assert.equal(paused.remainingMs, 7500);
  assert.deepEqual(reconcileTimer(paused, [10], 100000), paused);
  const resumed = timerAction(paused, 'resume', [10], 100000);
  assert.equal(resumed.deadline, 107500);
});
test('skip while paused does not run the following step; reset clears state', () => {
  const paused = timerAction(timerAction(initialTimer(), 'start', [10, 20], 0), 'pause', [10, 20], 1000);
  const skipped = timerAction(paused, 'skip', [10, 20], 2000);
  assert.equal(skipped.index, 1); assert.equal(skipped.status, 'paused'); assert.equal(skipped.remainingMs, 20000);
  assert.deepEqual(timerAction(skipped, 'reset', [10, 20], 3000), initialTimer());
});
test('single daily hold stops at completion without inventing subsequent holds', () => {
  const start = timerAction(initialTimer(), 'start', [45], 0);
  assert.equal(reconcileTimer(start, [45], 900000).index, 1);
  assert.equal(reconcileTimer(start, [45], 900000).status, 'done');
});
test('rest extension adds thirty seconds without resetting elapsed time', () => {
  const start = timerAction(initialTimer(), 'start', [60], 0);
  const extended = timerAction(start, 'extend', [60], 25000);
  assert.equal(extended.deadline, 90000); assert.equal(extended.remainingMs, 65000);
});
