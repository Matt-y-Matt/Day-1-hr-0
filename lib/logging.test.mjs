import test from 'node:test';
import assert from 'node:assert/strict';
import {mealBasis,scaleMeal,commuteValues} from './logging.mjs';
import {exportDates,exportMarkdown} from './export.mjs';
test('serving edits use original nutrition and retain unknown optional macros',()=>{
 const basis={kcal:133,protein_g:10.3,carbs_g:null,fat_g:2.2};const row={...scaleMeal(basis,1.5),nutrient_basis:basis};
 assert.equal(scaleMeal(mealBasis(row),1).kcal,133);assert.equal(scaleMeal(mealBasis(row),1).protein_g,10.3);assert.equal(row.carbs_g,null);assert.throws(()=>scaleMeal(basis,''));assert.throws(()=>scaleMeal(basis,-1));
});
test('commute requires real distance and time and validates optional effort',()=>{
 assert.throws(()=>commuteValues({duration_min:'',distance_km:''}));assert.throws(()=>commuteValues({duration_min:20,distance_km:4,rpe:11}));
 assert.deepEqual(commuteValues({duration_min:20,distance_km:4}).rpe,null);assert.throws(()=>commuteValues({duration_min:20,distance_km:4,hr_avg:150,hr_max:140}));
});
test('export ranges include exactly the requested number of calendar days',()=>{
 assert.deepEqual(exportDates('2026-01-01',1),{start:'2026-01-01',end:'2026-01-01'});assert.equal(exportDates('2026-01-01',7).start,'2025-12-26');
});
test('export includes in-progress sets, per-hand totals, meals, pain-only days and commutes separately',()=>{
 const text=exportMarkdown({sessions:[{id:'s',date:'2026-09-14',workout_days:{name:'Push'},completed_at:null}],logs:[{session_id:'s',set_number:1,reps:8,weight_kg:20,exercises:{name:'DB press',load_unit:'per_hand'}}],pain:[{date:'2026-09-13',movement:'eversion',score:0}],meals:[{date:'2026-09-14',meal:'lunch',custom_name:'Rice | eggs',servings:1,kcal:400,protein_g:20}],runs:[{date:'2026-09-14',run_type:'cycle',commute_direction:'to_work',duration_min:20}]},'2026-09-08','2026-09-14');
 assert.match(text,/in progress/);assert.match(text,/40 kg total/);assert.match(text,/Rice \\\| eggs/);assert.match(text,/2026-09-13/);assert.match(text,/1 commute trips/);assert.match(text,/0 activities/);assert.match(text,/Nutrition totals from meals/);
});
