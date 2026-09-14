import { supa } from './supabase';
import { buildSchedule } from './schedule.mjs';
export async function loadSchedule(userId,start,end){
  const s=supa();
  const results=await Promise.all([
    s.from('run_plan').select('*').eq('user_id',userId).gte('date',start).lte('date',end),
    s.from('workout_days').select('*').eq('user_id',userId).eq('is_active',true),
    s.from('lift_schedule').select('*').eq('user_id',userId),
  ]);
  for(const r of results)if(r.error)throw r.error;
  return buildSchedule(...results.map(r=>r.data||[]),start,end);
}
