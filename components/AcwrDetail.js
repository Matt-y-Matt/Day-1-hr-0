'use client';
import { useEffect, useState } from 'react';
import { supa, today, fmtDate } from '../lib/supabase';
import { allRows } from '../lib/export-client';
import { shiftDate } from '../lib/phase2-data.mjs';
import { activityLoad } from '../lib/activity-load.mjs';
export default function AcwrDetail({ onClose, userId }) {
  const [basis,setBasis]=useState('time'),[sport,setSport]=useState('running');
  const [runs,setRuns]=useState(null),[error,setError]=useState('');
  const end=today();
  useEffect(()=>{let alive=true;allRows(()=>supa().from('runs').select('*').eq('user_id',userId).gte('date',shiftDate(end,-27)).lte('date',end).order('date').order('id')).then(r=>{if(alive)setRuns(r);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[userId,end]);
  const data=runs?activityLoad(runs,sport,basis,end):null,unit={time:'minutes',distance:'km',load:'Garmin load'}[basis];
  return <div className="wrap logging-screen acwr-screen"><div className="row"><h1>Acute : chronic</h1><button className="chip" onClick={onClose}>Close</button></div>
    <div className="seg" aria-label="Activity">{['running','cycling'].map(s=><button key={s} className={sport===s?'on':''} onClick={()=>setSport(s)}>{s==='running'?'Running':'Cycling'}</button>)}</div>
    <div className="seg" aria-label="Load basis">{['time','distance','load'].map(b=><button key={b} className={basis===b?'on':''} onClick={()=>setBasis(b)}>{b==='time'?'Time':b==='distance'?'Distance':'Load'}</button>)}</div>
    {error&&<p role="alert" className="flag">{error}</p>}{!data&&!error&&<p>Loading recorded activities…</p>}
    {data&&<><section className="card key"><div className="row"><strong>{sport==='running'?'Running':'Cycling'} ratio</strong><b className="big">{data.ratio==null?'—':data.ratio.toFixed(2)}</b></div><p>Measured in {unit}. Includes {sport} commutes; excludes other activities.</p></section>
    <section className="card"><h2>The arithmetic</h2><p>ACWR = last 7 days ÷ (last 28 days ÷ 4).</p><p>Acute · {shiftDate(end,-6)} to {end}: <b>{data.acute.toFixed(1)} {unit}</b></p><p>28-day total · {shiftDate(end,-27)} to {end}: <b>{data.total.toFixed(1)} {unit}</b></p><p>Chronic weekly average: <b>{data.chronic.toFixed(1)} {unit}</b></p><p className="muted">{data.missing} activities missing this measurement. A missing baseline displays —. This describes recorded volume, not a safety verdict.</p></section>
    <section className="card table-scroll"><h2>Every session counted</h2><table><thead><tr><th>Date</th><th>Kind</th><th>{unit}</th><th>Window</th></tr></thead><tbody>{data.rows.map((r,i)=><tr key={r.id||i}><td>{fmtDate(r.date)}</td><td>{r.run_type}{r.commute_direction?' · commute':''}</td><td>{r.value.toFixed(1)}</td><td>{r.in_acute?'acute + chronic':'chronic only'}</td></tr>)}</tbody></table>{!data.rows.length&&<p>No recorded {sport} on this basis in the last 28 days.</p>}</section></>}
  </div>;
}
