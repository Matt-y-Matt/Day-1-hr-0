import {supa} from './supabase';
export async function allRows(query){const rows=[];for(let offset=0;;offset+=500){const r=await query().range(offset,offset+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows;}}
export async function loadExport(userId,start,end){
 const definitions=[['runs','runs','*'],['sessions','sessions','*, workout_days(name,is_daily)'],['pain','pain_logs','*'],['daily','daily_log','*'],['meals','meal_logs','*, foods(name)'],['changes','plan_changes','*'],['photos','photos','id,date,slot']];
 const results=await Promise.all(definitions.map(async([key,table,select])=>[key,await allRows(()=>supa().from(table).select(select).eq('user_id',userId).gte('date',start).lte('date',end).order('date').order('id'))]));
 const data=Object.fromEntries(results);data.logs=[];const ids=data.sessions.map(s=>s.id);
 for(let i=0;i<ids.length;i+=100)data.logs.push(...await allRows(()=>supa().from('set_logs').select('*, exercises(name,load_unit)').in('session_id',ids.slice(i,i+100)).order('id')));
 return data;
}
