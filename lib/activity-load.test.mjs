import test from 'node:test';
import assert from 'node:assert/strict';
import { activityLoad } from './activity-load.mjs';
test('ACWR isolates sports, exact 7/28-day boundaries, future records and missing load',()=>{
 const end='2026-09-17';
 const runs=[{date:'2026-08-21',run_type:'easy',exercise_load:20},{date:'2026-09-10',run_type:'easy',exercise_load:40},{date:'2026-09-11',run_type:'easy',exercise_load:30},{date:end,run_type:'cycle',exercise_load:100},{date:end,run_type:'easy',exercise_load:null},{date:'2026-08-20',run_type:'easy',exercise_load:999},{date:'2026-09-18',run_type:'easy',exercise_load:999}];
 const a=activityLoad(runs,'running','load',end);assert.equal(a.acute,30);assert.equal(a.total,90);assert.equal(a.chronic,22.5);assert.equal(a.ratio,30/22.5);assert.equal(a.missing,1);
 assert.equal(activityLoad(runs,'cycling','load',end).acute,100);assert.equal(activityLoad([],'running','load',end).ratio,null);
});
