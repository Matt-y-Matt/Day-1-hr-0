'use client';
import {useEffect,useState} from 'react';
import {supa,fmtDate} from '../lib/supabase';
import {photoStats} from '../lib/progress.mjs';
export default function PhotoCompare({photos,daily}){
 const [pose,setPose]=useState(photos[0]?.pose || (photos.length?'legacy':'front'));
 const matching=photos.filter(p=>(p.pose||'legacy')===pose).sort((a,b)=>`${a.date}:${a.created_at}`.localeCompare(`${b.date}:${b.created_at}`));
 const [left,setLeft]=useState(matching[0]?.id||''),[right,setRight]=useState(matching.at(-1)?.id||'');
 useEffect(()=>{setLeft(matching[0]?.id||'');setRight(matching.at(-1)?.id||'');},[pose,photos]);
 const a=photos.find(p=>p.id===left),b=photos.find(p=>p.id===right),one=photoStats(a,daily),two=photoStats(b,daily);
 return <section className="card photo-compare"><div className="row"><h2>Photo compare</h2><small>{photos.length} photo{photos.length===1?'':'s'}</small></div><label>Photo view<select aria-label="Photo view" value={pose} onChange={e=>setPose(e.target.value)}><option value="front">Front</option><option value="back">Back</option><option value="arm">Arm</option>{photos.some(p=>!p.pose)&&<option value="legacy">Previous photos · unspecified view</option>}</select></label>{!matching.length?<p className="muted">No photos for this view yet. Add AM or PM photos in Today.</p>:<><div className="photo-columns">{[[a,left,setLeft,'Earlier photo'],[b,right,setRight,'Later photo']].map(([p,id,set,label])=><div key={label}><label>{label}<select value={id} onChange={e=>set(e.target.value)}>{matching.map(x=><option key={x.id} value={x.id}>{fmtDate(x.date)} · {x.slot?.toUpperCase()} · {new Date(x.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</option>)}</select></label><PrivatePhoto key={id} photo={p}/><p>{photoStats(p,daily).weight??'—'} kg · waist {photoStats(p,daily).waist??'—'} cm</p></div>)}</div>{a?.id===b?.id?<p className="muted">Choose two different photos to compare.</p>:<p>{one.weight!=null&&two.weight!=null?`${(two.weight-one.weight).toFixed(1)} kg change`:'Weight change unavailable'} · {one.waist!=null&&two.waist!=null?`${(two.waist-one.waist).toFixed(1)} cm waist change`:'Waist change unavailable'}</p>}<p className="muted">Measurements match each photo’s date and AM/PM slot. Missing measurements stay blank. Photos remain private.</p></>}</section>;
}
function PrivatePhoto({photo}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true;setUrl('');setError('');if(!photo)return;const load=async()=>{try{const r=await supa().storage.from('photos').createSignedUrl(photo.storage_path,3600);if(r.error)throw r.error;if(!r.data?.signedUrl)throw new Error('Photo unavailable');if(alive)setUrl(r.data.signedUrl);}catch(e){if(alive)setError(e.message);}};load();const timer=setInterval(load,45*60*1000);return()=>{alive=false;clearInterval(timer);};},[photo,retry]);
 return error?<div className="flag" role="alert">Photo unavailable<button className="btn ghost" onClick={()=>setRetry(x=>x+1)}>Retry photo</button></div>:url?<img className="compare-photo" src={url} alt={`${photo.date} ${photo.slot} progress photo`} onError={()=>setError('Could not display photo')}/>:<div className="photo-placeholder">Loading photo…</div>;
}
