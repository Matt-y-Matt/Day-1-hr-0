'use client';
import {useEffect,useState} from 'react';
import {supa,today,fmtDate} from '../lib/supabase';
import {allRows} from '../lib/export-client';
import {DEFAULT_SETTINGS} from '../lib/settings.mjs';
import {pacePoints,paceLabel,runningActivity,strengthRows} from '../lib/progress.mjs';
import {PAIN_MOVEMENTS,shiftDate,latestPain} from '../lib/phase2-data.mjs';
import {loadLabel} from '../lib/gym.mjs';
import PhotoCompare from './PhotoCompare';
function Trend({label,points,color='var(--accent)',format=v=>String(v)}){
 if(!points.length)return <div className="card"><strong>{label}</strong><p className="muted">No recorded data.</p></div>;
 const min=Math.min(...points.map(p=>p.v)),max=Math.max(...points.map(p=>p.v)),range=max-min||1;const coordinates=points.map((p,i)=>`${points.length===1?50:i/(points.length-1)*100},${56-(p.v-min)/range*48}`).join(' ');
 return <section className="card"><div className="row"><strong>{label}</strong><b>{format(points.at(-1).v)}</b></div>{points.length>1?<svg className="progress-trend" viewBox="0 0 100 64" preserveAspectRatio="none" role="img" aria-label={`${label}: ${format(points[0].v)} on ${points[0].d} to ${format(points.at(-1).v)} on ${points.at(-1).d}`}><polyline fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" points={coordinates}/></svg>:<p className="muted">One recorded point.</p>}<small>{fmtDate(points[0].d)}: {format(points[0].v)} → {fmtDate(points.at(-1).d)}: {format(points.at(-1).v)}</small></section>;
}
export default function Progress({userId,revision}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true;setData(null);setError('');(async()=>{
  const [runs,pain,daily,photos,logs,load,settings,projection,ratio]=await Promise.all([
   ...[['runs','*'],['pain_logs','*'],['daily_log','*'],['photos','*']].map(([table,select])=>allRows(()=>supa().from(table).select(select).eq('user_id',userId).lte('date',today()).order('date').order('id'))),
   allRows(()=>supa().from('set_logs').select('*, exercises(name,category,load_unit,priority_tier), sessions(date)').eq('user_id',userId).order('id')),
   supa().from('v_load_weekly').select('*').eq('user_id',userId).order('week_start'),supa().from('user_settings').select('*').eq('user_id',userId).maybeSingle(),supa().rpc('marathon_projection'),supa().rpc('acwr')]);
  for(const r of [load,settings,projection,ratio])if(r.error)throw r.error;if(alive)setData({runs,pain,daily,photos,logs,load:load.data||[],settings:{...DEFAULT_SETTINGS,...settings.data},projection:projection.data?.[0],ratio:ratio.data?.[0]});
 })().catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[userId,revision,retry]);
 if(error)return <div className="wrap"><h1>Progress</h1><div className="flag" role="alert">Could not load progress: {error}</div><button className="btn ghost" onClick={()=>setRetry(x=>x+1)}>Retry</button></div>;
 if(!data)return <div className="wrap"><h1>Progress</h1><p>Loading recorded progress…</p></div>;
 const runs=data.runs.filter(runningActivity),longs=runs.filter(r=>r.run_type==='long'&&Number(r.duration_min)>0),pace=pacePoints(runs,data.settings.hr_ceiling),strength=strengthRows(data.logs);
 const weeks=new Map();for(const r of runs){const start=shiftDate(r.date,-((new Date(r.date+'T12:00:00').getDay()+6)%7));const w=weeks.get(start)||{date:start,count:0,minutes:0,km:0,long:0};w.count++;w.minutes+=Number(r.duration_min||0);w.km+=Number(r.distance_km||0);if(r.run_type==='long')w.long=Math.max(w.long,Number(r.duration_min||0));weeks.set(start,w);}
 return <div className="wrap logging-screen"><h1>Progress</h1><p className="sub">{runs.length} recorded runs{runs.length?` · since ${fmtDate(runs[0].date)}`:''} · {data.settings.race_name} {fmtDate(data.settings.race_date)}</p>
 <section className="card key"><h2>Marathon estimate</h2>{data.projection?<><strong className="big">{data.projection.projected_time}</strong><p>Recent long-run pace: {paceLabel(Number(data.projection.pace_per_km))} /km</p><p className="muted">Legacy heuristic: average of the latest three qualifying long runs at HR ≤140, minus 45 seconds/km, extrapolated to 42.195 km. This is an estimate, not a measured race result.</p></>:<p className="muted">Not enough qualifying long-run distance, time and HR data.</p>}</section>
 <section className="card"><div className="row"><strong>Acute : chronic recorded load</strong><b>{data.ratio?.ratio??'—'}</b></div><p>Last 7 days {data.ratio?.acute??'—'} · 28-day weekly average {data.ratio?.chronic_avg??'—'}</p><small>Uses recorded load only. Missing load records limit this comparison.</small></section>
 <Trend label="Long-run duration" points={longs.map(r=>({d:r.date,v:Number(r.duration_min)}))} format={v=>`${v} min`}/><Trend label={`Running pace at HR ≤${data.settings.hr_ceiling}`} points={pace} format={v=>`${paceLabel(v)} /km`} color="#5aa9e6"/>
 {PAIN_MOVEMENTS.map((m,i)=><Trend key={m} label={`Cold pain · ${m}`} points={[...new Set(data.pain.map(p=>p.date))].sort().flatMap(d=>{const p=latestPain(data.pain,d)[m];return p?.score!=null?[{d,v:Number(p.score)}]:[];})} format={v=>`${v}/10`} color={i?'#5aa9e6':'#e0a53a'}/>)}
 <Trend label="Threshold pace" points={runs.filter(r=>r.run_type==='threshold'&&r.distance_km>0&&r.duration_min>0).map(r=>({d:r.date,v:r.duration_min/r.distance_km}))} format={v=>`${paceLabel(v)} /km`}/>
 <h2>Strength · recorded best set per day</h2>{strength.length?strength.map(s=><section className="card" key={s.id}><strong>{s.exercise.priority_tier} · {s.exercise.name}</strong><p>{s.last.hold_seconds!=null?`${s.last.hold_seconds}s hold`: `${loadLabel(s.last.weight_kg,s.exercise.load_unit)} · ${s.last.reps??'—'} reps`}</p><small>First recorded: {s.first.hold_seconds!=null?`${s.first.hold_seconds}s`: `${loadLabel(s.first.weight_kg,s.exercise.load_unit)} · ${s.first.reps??'—'} reps`} · {s.dates} session day(s)</small>{s.unchanged&&<p className="muted">Best load and reps unchanged across the last three recorded days.</p>}</section>):<p className="muted">No strength sets recorded yet.</p>}
 <Trend label="AM weight" points={data.daily.filter(d=>d.weight_am_kg!=null).map(d=>({d:d.date,v:Number(d.weight_am_kg)}))} format={v=>`${v} kg`}/><Trend label="Waist" points={data.daily.filter(d=>d.waist_cm!=null).map(d=>({d:d.date,v:Number(d.waist_cm)}))} format={v=>`${v} cm`}/><Trend label="Resting HR" points={data.daily.filter(d=>d.resting_hr!=null).map(d=>({d:d.date,v:Number(d.resting_hr)}))} format={v=>`${v} bpm`}/>
 <PhotoCompare photos={data.photos} daily={data.daily}/><h2>Weekly running</h2><div className="card table-scroll"><table><thead><tr><th>Week</th><th>Runs</th><th>Km</th><th>Min</th><th>Long</th></tr></thead><tbody>{[...weeks.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(w=><tr key={w.date}><td>{fmtDate(w.date)}</td><td>{w.count}</td><td>{w.km.toFixed(1)}</td><td>{Math.round(w.minutes)}</td><td>{w.long||'—'}</td></tr>)}</tbody></table>{!weeks.size&&<p>No running history.</p>}</div><h2>Weekly load</h2><div className="card table-scroll"><table><thead><tr><th>Week</th><th>Run</th><th>Cycle</th><th>Lift</th><th>Total</th></tr></thead><tbody>{data.load.slice(-12).reverse().map(w=><tr key={w.week_start}><td>{fmtDate(w.week_start)}</td><td>{w.run_load??'—'}</td><td>{w.cycle_load??'—'}</td><td>{w.lift_load??'—'}</td><td>{w.total_load??'—'}</td></tr>)}</tbody></table></div>
 </div>;
}
