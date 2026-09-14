import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,validateSettings} from './settings.mjs';
import {workoutPayload} from './workout.mjs';
import {pacePoints,paceLabel,photoStats,strengthRows} from './progress.mjs';
test('settings validate HR relationships and retain explicit zero-invalid targets',()=>{
 assert.equal(validateSettings({...DEFAULT_SETTINGS,kcal_easy:'2100'}).kcal_easy,2100);assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,hr_target_low:150}));assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,protein_g:0}));
});
test('workout edits require disable reasons, distinct exercises, and valid rep ranges',()=>{
 const item={id:'a',exercise_id:'e',sets:3,rep_min:8,rep_max:10,rest_seconds:90,is_enabled:true};assert.equal(workoutPayload([item])[0].target_weight_kg,null);assert.throws(()=>workoutPayload([item,{...item,id:'b'}]));assert.throws(()=>workoutPayload([item,{...item,id:'b',exercise_id:'f',is_enabled:false}]));assert.throws(()=>workoutPayload([{...item,rep_max:7}]));
});
test('running pace excludes walking cycling and commutes and uses mm:ss formatting',()=>{
 const base={date:'2026-09-14',duration_min:30,distance_km:5,hr_avg:130};const points=pacePoints(['easy','walk','cycle'].map(run_type=>({...base,run_type})).concat({...base,run_type:'easy',commute_direction:'to_work'}),135);assert.equal(points.length,1);assert.equal(paceLabel(6.5),'6:30');assert.equal(paceLabel(null),'—');
});
test('photo stats never borrow another date or AM weight for a PM photo',()=>{
 const daily=[{date:'2026-09-14',weight_am_kg:70,waist_cm:80}];assert.deepEqual(photoStats({date:'2026-09-14',slot:'pm'},daily),{weight:null,waist:80});assert.deepEqual(photoStats({date:'2026-09-15',slot:'am'},daily),{weight:null,waist:null});
});
test('strength compares one best set per date and needs three dates to flag unchanged',()=>{
 const logs=['2026-09-01','2026-09-08','2026-09-14'].map(date=>({exercise_id:'e',weight_kg:20,reps:8,exercises:{name:'Press',load_unit:'per_hand'},sessions:{date}}));assert.equal(strengthRows(logs)[0].unchanged,true);assert.equal(strengthRows(logs.slice(0,2))[0].unchanged,false);assert.equal(strengthRows([...logs,{...logs[2],reps:10}])[0].unchanged,false);
});
