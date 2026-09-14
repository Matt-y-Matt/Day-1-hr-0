import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, shiftDate, latestPain, sessionProgress } from './phase2-data.mjs';
test('calendar arithmetic crosses month and year boundaries without UTC conversion', () => {
  assert.equal(localDate(new Date(2026, 8, 14, 0, 1)), '2026-09-14');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
});
test('pain grouping isolates date/site and keeps explicit zero, missing remains absent', () => {
  const rows = [
    { date: '2026-09-14', site: 'left_ankle_extensor', movement: 'dorsiflexion', score: 2, logged_at: '2026-09-14T01:00:00Z' },
    { date: '2026-09-14', site: 'left_ankle_extensor', movement: 'dorsiflexion', score: 0, logged_at: '2026-09-14T02:00:00Z' },
    { date: '2026-09-14', site: 'right_patellar', movement: 'eversion', score: 9 },
    { date: '2026-09-13', site: 'left_ankle_extensor', movement: 'eversion', score: 8 },
  ];
  const result = latestPain(rows, '2026-09-14');
  assert.equal(result.dorsiflexion.score, 0);
  assert.equal(result.eversion, undefined);
});
test('resume finds gaps, ignores duplicate/foreign/disabled sets and only completes whole items', () => {
  const items = [{ exercise_id: 'a', sets: 3 }, { exercise_id: 'b', sets: 2 }, { exercise_id: 'c', sets: 5, is_enabled: false }];
  const logs = [{ exercise_id: 'a', set_number: 1 }, { exercise_id: 'a', set_number: 3 }, { exercise_id: 'a', set_number: 3 }, { exercise_id: 'b', set_number: 1 }, { exercise_id: 'b', set_number: 2 }, { exercise_id: 'c', set_number: 1 }];
  const result = sessionProgress(items, logs);
  assert.equal(result.count, 4); assert.equal(result.total, 5); assert.equal(result.completeItems, 1);
  assert.equal(result.next.item.exercise_id, 'a'); assert.equal(result.next.setNumber, 2);
});
