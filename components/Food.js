'use client';
import { useEffect, useRef, useState } from 'react';
import { loadSchedule } from '../lib/schedule-client';
import { MEALS, mealBasis, scaleMeal, nutritionTotal, numberField } from '../lib/logging.mjs';
import { supa, today } from '../lib/supabase';

export function FoodCard({ userId, dayType, onOpen }) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => { let alive = true; (async () => {
    const results = await Promise.all([supa().from('v_daily_nutrition').select('*').eq('user_id', userId).eq('date', today()).maybeSingle(), supa().from('user_settings').select('*').eq('user_id', userId).maybeSingle(), supa().from('foods').select('*').eq('is_favourite', true).order('name').limit(3)]);
    if (!alive) return;
    if (results.some(r => r.error)) { setError('Could not load food totals.'); return; }
    setData({ total: results[0].data || {}, settings: results[1].data || {}, favourites: results[2].data || [] });
  })().catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [userId]);
  const kcal = data?.total.kcal || 0, protein = data?.total.protein_g || 0;
  const target = data?.settings[`kcal_${dayType}`] ?? ({ rest: 1800, easy: 2000, run_lift: 2300, long: 2700 }[dayType]);
  const pTarget = data?.settings.protein_g ?? 155;
  return <section className="card food-card" aria-label="Food · today"><div className="row"><strong>Food · today</strong><span className="u-sub">{data ? `${kcal} / ${target} kcal` : '—'}</span></div>
    {data && <><div className="food-bar"><i style={{ width: `${Math.min(100, kcal / target * 100)}%` }}/></div><div className="row muted"><span>{Math.max(0,target-kcal)} kcal left</span><span>{protein} / {pTarget}g P</span></div><div className="food-bar protein"><i style={{ width: `${Math.min(100,protein / pTarget * 100)}%` }}/></div></>}
    {error && <p role="alert" className="muted">{error}</p>}
    <button className="btn ghost food-search" onClick={() => onOpen()}>Search food… <span className="u-label">1 tap</span></button>
    <div className="food-chips">{data?.favourites.map(f => <button className="pill" key={f.id} onClick={() => onOpen(f)}>{f.name}</button>)}<button className="pill" onClick={() => onOpen({ custom: true })}>+ Custom</button></div>
  </section>;
}

export default function FoodLog({userId,initialFood,onClose,onChanged}){
  const [foods,setFoods]=useState([]),[entries,setEntries]=useState([]),[settings,setSettings]=useState({}),[query,setQuery]=useState('');
  const [selected,setSelected]=useState(initialFood||null),[editing,setEditing]=useState(null),[servings,setServings]=useState('1'),[meal,setMeal]=useState('snack');
  const [custom,setCustom]=useState({name:'',serving_desc:'',kcal:'',protein_g:'',carbs_g:'',fat_g:'',save:false});
  const [date,setDate]=useState(today),[dayType,setDayType]=useState('easy'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[deleteId,setDeleteId]=useState(null),[loadError,setLoadError]=useState(false),[retry,setRetry]=useState(0);
  const lock=useRef(false),rowId=useRef(null),foodId=useRef(null);
  useEffect(()=>{let alive=true;setLoading(true);setLoadError(false);setError('');(async()=>{
    const [f,m,s,schedule]=await Promise.all([supa().from('foods').select('*').order('name'),supa().from('meal_logs').select('*, foods(name,serving_desc)').eq('user_id',userId).eq('date',date).order('logged_at'),supa().from('user_settings').select('*').eq('user_id',userId).maybeSingle(),loadSchedule(userId,date,date)]);
    for(const r of [f,m,s])if(r.error)throw r.error;
    if(alive){setFoods(f.data||[]);setEntries(m.data||[]);setSettings(s.data||{});const a=schedule.filter(x=>x.status!=='skipped');setDayType(a.some(x=>x.run_type==='long')?'long':a.some(x=>x.kind==='run')&&a.some(x=>x.kind==='lift')?'run_lift':a.length?'easy':'rest');}
  })().catch(e=>{if(alive){setError(e.message);setLoadError(true);}}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[userId,date,retry]);
  function choose(food,row=null){setSelected(food);setEditing(row);setServings(String(row?.servings||1));if(row)setMeal(row.meal);rowId.current=row?.id||null;foodId.current=null;setError('');setMessage('');}
  async function save(){
    if(lock.current||!selected||loading||loadError)return;lock.current=true;setBusy(true);setError('');
    try{
      if(!date||date>today())throw new Error('Choose today or an earlier date.');
      let basis=editing?mealBasis(editing):selected.custom?Object.fromEntries(['kcal','protein_g','carbs_g','fat_g'].map(k=>[k,numberField(custom[k],k.replace('_g',''),{required:['kcal','protein_g'].includes(k),max:10000})])):selected;
      if(selected.custom&&!editing&&!custom.name.trim())throw new Error('Enter a food name.');
      const scaled=scaleMeal(basis,servings);let id=editing?.food_id||(!selected.custom?selected.id:null);
      if(selected.custom&&!editing&&custom.save){foodId.current ||= crypto.randomUUID();const f={id:foodId.current,user_id:userId,name:custom.name.trim(),serving_desc:custom.serving_desc.trim()||'1 serving',category:'custom',kcal:Math.round(basis.kcal),protein_g:basis.protein_g,carbs_g:basis.carbs_g,fat_g:basis.fat_g,is_local:false,is_favourite:true,source:'user'};const r=await supa().from('foods').upsert(f,{onConflict:'id'}).select('*').single();if(r.error)throw r.error;id=r.data.id;setFoods(old=>[...old.filter(x=>x.id!==id),r.data]);}
      rowId.current ||= crypto.randomUUID();const row={id:rowId.current,user_id:userId,date,meal,food_id:id,custom_name:editing?.custom_name||(selected.custom?custom.name.trim():null),...scaled,nutrient_basis:{kcal:basis.kcal,protein_g:basis.protein_g,carbs_g:basis.carbs_g??null,fat_g:basis.fat_g??null}};
      const r=await supa().from('meal_logs').upsert(row,{onConflict:'id'}).select('*').single();if(r.error)throw r.error;
      setEntries(old=>[...old.filter(x=>x.id!==row.id),{...r.data,foods:{name:selected.name||custom.name,serving_desc:selected.serving_desc||custom.serving_desc}}]);setSelected(null);setEditing(null);rowId.current=null;foodId.current=null;setCustom({name:'',serving_desc:'',kcal:'',protein_g:'',carbs_g:'',fat_g:'',save:false});setMessage(editing?'Food updated.':'Food added.');onChanged?.();
    }catch(e){setError(`Not saved: ${e.message}`);}finally{lock.current=false;setBusy(false);}
  }
  async function remove(row){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const r=await supa().from('meal_logs').delete().eq('id',row.id).eq('user_id',userId).select('id');if(r.error)throw r.error;if(!r.data?.length)throw new Error('Entry unavailable. Reopen the food log.');setEntries(old=>old.filter(x=>x.id!==row.id));setDeleteId(null);onChanged?.();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
  const total=nutritionTotal(entries),target=settings[`kcal_${dayType}`]??({rest:1800,easy:2000,run_lift:2300,long:2700}[dayType]);
  const results=foods.filter(f=>f.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="wrap logging-screen"><div className="row"><h1>Food log</h1><button className="btn ghost compact" disabled={busy} onClick={onClose}>‹ Back</button></div>
    <label>Date<input type="date" max={today()} disabled={busy||!!selected} value={date} onChange={e=>{if(e.target.value)setDate(e.target.value);}}/></label>
    <div className="card"><strong>{loading?'Loading totals…':loadError?'Totals unavailable':`${total.kcal} / ${target} kcal`}</strong><div className="food-bar"><i style={{width:`${Math.min(100,total.kcal/target*100)}%`}}/></div><p>{Math.max(0,target-total.kcal)} kcal left · {total.protein_g} / {settings.protein_g??155}g protein</p><div className="food-bar protein"><i style={{width:`${Math.min(100,total.protein_g/(settings.protein_g??155)*100)}%`}}/></div><small>{dayType.replace('_',' + ')} day target</small></div>
    {error&&<div className="flag" role="alert">{error}{loadError&&<button className="btn ghost" onClick={()=>setRetry(x=>x+1)}>Retry loading</button>}</div>}{message&&<p role="status">{message}</p>}{loading&&<p>Loading food log…</p>}
    {selected?<div className="card"><h2>{editing?'Edit food entry':selected.custom?'Custom food':selected.name}</h2><fieldset disabled={busy||loading||loadError}><label>Meal<select value={meal} onChange={e=>setMeal(e.target.value)}>{MEALS.map(m=><option key={m}>{m}</option>)}</select></label>
      {selected.custom&&!editing&&<>{[['name','Food name'],['serving_desc','Serving description'],['kcal','Calories per serving'],['protein_g','Protein per serving (g)'],['carbs_g','Carbs per serving (g), optional'],['fat_g','Fat per serving (g), optional']].map(([key,label])=><label key={key}>{label}<input inputMode={['name','serving_desc'].includes(key)?'text':'decimal'} value={custom[key]} onChange={e=>setCustom(c=>({...c,[key]:e.target.value}))}/></label>)}<label className="check-label"><input type="checkbox" checked={custom.save} onChange={e=>setCustom(c=>({...c,save:e.target.checked}))}/> Save to my foods · available in future searches</label></>}
      <label>Servings{selected.serving_desc?` · ${selected.serving_desc}`:''}<input aria-label="Servings" inputMode="decimal" value={servings} onChange={e=>setServings(e.target.value)}/></label>
      <button className="btn" onClick={save}>{busy?'Saving…':editing?'Update food':`Add to ${meal}`}</button><button className="btn ghost" onClick={()=>choose(null)}>Cancel</button></fieldset></div>:<>
      <div className="food-chips">{foods.filter(x=>x.is_favourite).slice(0,8).map(f=><button className="pill" key={f.id} onClick={()=>choose(f)}>{f.name}</button>)}</div><label>Search food<input value={query} placeholder="Search food…" onChange={e=>setQuery(e.target.value)}/></label>
      {query&&<button className="chip" onClick={()=>setQuery('')}>Clear search</button>}<p className="muted">{query.trim()?`${results.length} results${results.length>50?' · showing first 50; refine your search':''}`:`Search ${foods.length} foods, or add a custom food.`}</p>
      {(query.trim()?results.slice(0,50):[]).map(f=><button className="food-result" key={f.id} onClick={()=>choose(f)}><strong>{f.name}{f.is_local?' · local':''}</strong><small>{f.serving_desc} · {f.kcal} kcal · {f.protein_g}g P</small></button>)}
      <button className="btn ghost" onClick={()=>choose({custom:true})}>+ Custom food</button>
      <h2>Logged {date===today()?'today':date}</h2>{MEALS.map(m=>{const rows=entries.filter(r=>r.meal===m),sum=nutritionTotal(rows);return <section className="card" key={m}><div className="row"><strong>{m}</strong><small>{sum.kcal} kcal · {sum.protein_g}g P</small></div>{!rows.length&&<p className="muted">Nothing logged.</p>}{rows.map(r=><div className="meal-entry" key={r.id}><button className="food-result" onClick={()=>choose({name:r.custom_name||r.foods?.name||'Food',custom:!r.food_id,serving_desc:r.foods?.serving_desc},r)}><strong>{r.custom_name||r.foods?.name||'Food'}</strong><small>{r.servings} serving(s) · {r.kcal} kcal · {r.protein_g}g P · Edit</small></button>{deleteId===r.id?<div className="row"><button className="btn ghost" disabled={busy} onClick={()=>remove(r)}>Confirm delete</button><button className="chip" disabled={busy} onClick={()=>setDeleteId(null)}>Keep</button></div>:<button className="chip" disabled={busy} aria-label={`Delete ${r.custom_name||r.foods?.name||'food'}`} onClick={()=>setDeleteId(r.id)}>Delete</button>}</div>)}<button className="btn ghost" onClick={()=>{setMeal(m);setQuery('');setMessage(`Choose a food for ${m}.`);window.scrollTo?.(0,0);}}>+ Add to {m}</button></section>;})}
    </>}
  </div>;
}
