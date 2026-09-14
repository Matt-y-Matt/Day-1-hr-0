import {shiftDate} from './phase2-data.mjs';
import {nutritionTotal} from './logging.mjs';
export function exportDates(end,days){return {start:shiftDate(end,-(days-1)),end};}
const value=x=>x==null?'—':String(x);
const clean=x=>value(x).replaceAll('|','\\|').replaceAll('\r','').replaceAll('\n',' / ');
export function exportMarkdown(data,start,end){
 const {runs=[],sessions=[],logs=[],pain=[],daily=[],meals=[],changes=[],photos=[]}=data;
 const rows=(title,heads,records)=>`\n### ${title}\n${records.length?`| ${heads.join(' | ')} |\n| ${heads.map(()=>'---').join(' | ')} |\n${records.map(r=>'| '+r.map(clean).join(' | ')+' |').join('\n')}\n`:'None recorded.\n'}`;
 let out=`# Training · ${start} to ${end}\n\n${runs.filter(r=>!r.commute_direction).length} activities · ${runs.filter(r=>r.commute_direction).length} commute trips · ${sessions.filter(s=>s.completed_at&&!s.workout_days?.is_daily).length} completed lifting sessions\n`;
 out+=rows('Activities',['Date','Type','Minutes','Km','HR avg/max','RPE','Load','TE','Cadence','Under 135 min','Temp C','Ascent m','Shoes','Feel','Notes'],runs.filter(r=>!r.commute_direction).map(r=>[r.date,r.run_type,r.duration_min,r.distance_km,`${value(r.hr_avg)}/${value(r.hr_max)}`,r.rpe,r.exercise_load,r.training_effect,r.cadence_avg,r.min_under_135,r.temp_c,r.elevation_m,r.shoes,r.feel_1_5,r.notes]));
 out+=rows('Commutes',['Date','Direction','Mode','Minutes','Km','RPE','Carried kg','HR avg/max','Load','TE','Notes'],runs.filter(r=>r.commute_direction).map(r=>[r.date,r.commute_direction,r.run_type,r.duration_min,r.distance_km,r.rpe,r.carried_load_kg,`${value(r.hr_avg)}/${value(r.hr_max)}`,r.exercise_load,r.training_effect,r.notes]));
 for(const dailyBlock of [false,true]){
  out+=`\n### ${dailyBlock?'Daily block':'Lifting'}\n`;const selected=sessions.filter(s=>!!s.workout_days?.is_daily===dailyBlock);if(!selected.length)out+='None recorded.\n';
  for(const s of selected){out+=`\n**${clean(s.date)} · ${clean(s.workout_days?.name||'Workout')} · ${s.completed_at?'completed':'in progress'}**\n\nFeel ${value(s.feel_1_5)}/5 · Duration ${value(s.duration_min)} min · Load ${value(s.exercise_load)} · TE ${value(s.training_effect)}\n`;
   if(s.session_note)out+=`\nNote: ${clean(s.session_note)}\n`;
   const sets=logs.filter(l=>l.session_id===s.id).sort((a,b)=>String(a.exercise_id).localeCompare(String(b.exercise_id))||a.set_number-b.set_number);
   for(const l of sets){const unit=l.exercises?.load_unit||'unit unavailable';out+=`- ${clean(l.exercises?.name||'Exercise unavailable')} · set ${l.set_number}: ${l.hold_seconds!=null?l.hold_seconds+'s':value(l.reps)+' reps'} · ${value(l.weight_kg)} kg ${unit}${unit==='per_hand'&&l.weight_kg!=null?` (${l.weight_kg*2} kg total)`:''} · RIR ${value(l.rir)}\n`;}
   if(!sets.length)out+='No sets recorded.\n';
  }
 }
 out+=rows('Pain',['Date','Site','Movement','Score /10','Note'],pain.map(p=>[p.date,p.site,p.movement,p.score,p.note]));
 out+=rows('Body and diary',['Date','AM kg','PM kg','Waist cm','Sleep h','Resting HR','Legs /10','Legacy kcal','Legacy protein g','Note'],daily.map(d=>[d.date,d.weight_am_kg,d.weight_pm_kg,d.waist_cm,d.sleep_hours,d.resting_hr,d.legs_feel_1_10,d.calories,d.protein_g,d.note]));
 out+=rows('Meals',['Date','Meal','Food','Servings','Kcal','Protein g','Carbs g','Fat g'],meals.map(m=>[m.date,m.meal,m.custom_name||m.foods?.name||'Food unavailable',m.servings,m.kcal,m.protein_g,m.carbs_g,m.fat_g]));
 const dates=[...new Set(meals.map(m=>m.date))].sort();out+=rows('Nutrition totals from meals',['Date','Kcal','Protein g'],dates.map(d=>{const t=nutritionTotal(meals.filter(m=>m.date===d));return[d,t.kcal,t.protein_g];}));
 out+='\nMeal totals and legacy daily nutrition values are shown separately; they are not added together. Missing values are —, not zero.\n';
 out+=rows('Programme changes',['Logged','Session','Action','From','To','Minutes before/after','Reason','Note'],changes.map(c=>[c.date,c.session_ref,c.action,c.from_date,c.to_date,`${value(c.from_value)}/${value(c.to_value)}`,c.reason,c.note]));
 out+=rows('Photo records',['Date','Slot'],photos.map(p=>[p.date,p.slot]));
 return out;
}
