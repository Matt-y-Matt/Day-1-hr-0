import {supa,today} from './supabase';
export async function loadWorkout(day,userId){
 const s=supa();const [base,override]=await Promise.all([s.from('workout_exercises').select('*, exercises(*)').eq('workout_day_id',day.id).eq('user_id',userId).order('order_index'),s.from('workout_overrides').select('*').eq('user_id',userId).eq('occurrence_ref',day.schedule_ref||`lift:${day.id}:${day.schedule_date||today()}`).maybeSingle()]);
 if(base.error||override.error)throw base.error||override.error;return {items:override.data?.items||base.data||[],override:override.data};
}
