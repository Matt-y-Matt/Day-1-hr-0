import { shiftDate } from './phase2-data.mjs';

export function buildSchedule(plans, days, overrides, start, end) {
  const result = plans.filter(p=>p.run_type!=='rest').map(p=>({...p,kind:'run',key:`run:${p.id}`,title:`${p.run_type} run`,status:p.schedule_status||'scheduled',revision:p.schedule_revision||0}));
  const add = (day, original, change) => {
    const key=`lift:${day.id}:${original}`, date=change?.date||original;
    if(result.some(x=>x.key===key))return;
    result.push({kind:'lift',id:day.id,key,title:day.name,date,original_date:original,status:change?.schedule_status||'scheduled',revision:change?.revision||0,duration_min:change?.duration_min??day.est_minutes,day:{...day,schedule_ref:key,schedule_date:date}});
  };
  const lifts=days.filter(d=>d.is_active!==false&&!d.is_daily&&d.session_type!=='daily');
  for(let date=start;date<=end;date=shiftDate(date,1)) {
    const wd=((new Date(date+'T12:00:00').getDay()+6)%7)+1;
    for(const day of lifts.filter(d=>d.weekday===wd))add(day,date,overrides.find(o=>o.workout_day_id===day.id&&o.original_date===date));
  }
  for(const o of overrides){const day=lifts.find(d=>d.id===o.workout_day_id);if(day)add(day,o.original_date,o);}
  return result.filter(x=>x.date>=start&&x.date<=end).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}
export function scheduleChange(item, patch={}) {return {kind:item.kind,id:item.id,original_date:item.original_date,from_date:item.date,to_date:item.date,expected_revision:item.revision,status:item.status,duration_min:item.duration_min,action:'move',...patch};}
export function previewSchedule(items,changes){return items.map(item=>{const c=changes.find(c=>c.kind===item.kind&&c.id===item.id&&(item.kind==='run'||c.original_date===item.original_date));return c?{...item,date:c.to_date,status:c.status,duration_min:c.duration_min}:item;});}
export const longRunCap = item => Math.ceil((item.baseline_duration_min??item.duration_min)*1.1);
export function guardrails(items,start){
  const active=items.filter(x=>x.status!=='skipped'), warnings=[];
  const long=active.filter(x=>x.run_type==='long').sort((a,b)=>a.date.localeCompare(b.date));
  const hard=x=>x.run_type==='long'||['threshold','test','race'].includes(x.run_type)||/leg/i.test(x.title);
  for(const run of long){if(active.some(x=>/leg/i.test(x.title)&&x.date===shiftDate(run.date,-1)))warnings.push(`Legs is the day before the long run on ${run.date}.`);}
  for(let i=1;i<long.length;i++)if(long[i].date<shiftDate(long[i-1].date,7))warnings.push(`Long runs on ${long[i-1].date} and ${long[i].date} are less than seven days apart.`);
  for(const x of active.filter(hard))if(active.some(y=>hard(y)&&y.date===shiftDate(x.date,1)))warnings.push(`Hard sessions fall on consecutive days from ${x.date}.`);
  if(Array.from({length:7},(_,i)=>shiftDate(start,i)).every(d=>active.some(x=>x.date===d)))warnings.push('This week has no full rest day.');
  return [...new Set(warnings)];
}
