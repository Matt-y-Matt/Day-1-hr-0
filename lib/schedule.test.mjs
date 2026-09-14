import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSchedule,guardrails,longRunCap,previewSchedule,scheduleChange} from './schedule.mjs';
const day={id:'lift',name:'Legs',weekday:4,is_active:true,est_minutes:60};
test('one-week lift moves suppress original and include moved-in occurrences without changing templates',()=>{
 const override={workout_day_id:'lift',original_date:'2026-09-17',date:'2026-09-21',revision:1};
 assert.equal(buildSchedule([], [day],[override],'2026-09-14','2026-09-20').length,0);
 const next=buildSchedule([], [day],[override],'2026-09-21','2026-09-27');
 assert.deepEqual(next.map(x=>x.date),['2026-09-21','2026-09-24']);assert.notEqual(next[0].key,next[1].key);assert.equal(day.weekday,4);
});
test('stacked sessions and skipped occurrences remain distinct; swap preview preserves duration',()=>{
 const items=buildSchedule([{id:'run',run_type:'easy',date:'2026-09-17',duration_min:40}],[day],[],'2026-09-14','2026-09-20');
 assert.equal(items.length,2);const changes=items.map(x=>scheduleChange(x,{to_date:'2026-09-18',action:'stack'}));
 const next=previewSchedule(items,changes);assert.deepEqual(next.map(x=>x.duration_min),items.map(x=>x.duration_min));assert.ok(next.every(x=>x.date==='2026-09-18'));assert.ok(items.every(x=>x.date==='2026-09-17'));
});
test('guardrails flag adjacent legs, hard days, long-run spacing and missing rest without blocking',()=>{
 const items=Array.from({length:7},(_,i)=>({date:`2026-09-${14+i}`,title:'Easy',status:'scheduled'}));
 Object.assign(items[0],{run_type:'long'});Object.assign(items[4],{title:'Legs'});Object.assign(items[5],{run_type:'long'});
 const warnings=guardrails(items,'2026-09-14');assert.equal(warnings.length,4);assert.equal(longRunCap({baseline_duration_min:105,duration_min:135}),116);
 assert.equal(guardrails(items.map(x=>({...x,status:'skipped'})),'2026-09-14').length,0);
});
