const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const { create, act } = require('react-test-renderer');
const swc = require('next/dist/build/swc');
const root = path.resolve(__dirname, '..');
const date = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

// In-memory transport tests mount the real components. No network or real records.
function database(seed, fail = () => false, rpcs = {}) {
  const tables = structuredClone(seed), writes = [];
  return { tables, writes,
    async rpc(name, args) { writes.push({ op: 'rpc', name, args });
      return rpcs[name] ? { data: rpcs[name](args), error: null } : { data: null, error: { message: `No stub for ${name}` } }; },
    from(table) {
    const q = { table, op: 'select', filters: [], body: null };
    const b = {
      select() { return b; }, eq(k,v) { q.filters.push(r=>r[k]===v); return b; },
      in(k,values) { q.filters.push(r=>values.includes(r[k])); return b; }, range(a,z) { q.range=[a,z]; return b; },
      gte(k,v) { q.filters.push(r=>r[k]>=v); return b; }, lte(k,v) { q.filters.push(r=>r[k]<=v); return b; },
      not(k,op,v) { q.filters.push(r=>r[k]!=v); return b; },
      is(k,v) { q.filters.push(r=>r[k]===v); return b; }, order() { return b; }, limit(n) { q.limit=n; return b; },
      maybeSingle() { q.single=true; return b; }, single() { q.single=true; return b; },
      insert(body) { q.op='insert'; q.body=body; return b; }, upsert(body,options={}) { q.op='upsert'; q.body=body; q.options=options; return b; },
      update(body) { q.op='update'; q.body=body; return b; },
      delete() { q.op='delete'; return b; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (q.op!=='select') writes.push(q);
          if (fail(q)) return { data:null, error:{ message:'Simulated unavailable connection' } };
          tables[table] ||= [];
          let rows=tables[table].filter(r=>q.filters.every(f=>f(r)));
          if (q.op==='insert' || q.op==='upsert') {
            rows=[];
            for (const value of Array.isArray(q.body)?q.body:[q.body]) {
              const conflict=(q.options?.onConflict || 'id').split(',');
              const existing=tables[table].find(r=>conflict.every(k=>value[k]!=null && r[k]===value[k]));
              if (existing && q.op==='upsert') { if (!q.options?.ignoreDuplicates) Object.assign(existing,value); rows.push(existing); continue; }
              const row={id:value.id||`test-${table}-${tables[table].length}`,logged_at:new Date().toISOString(),...value};
              tables[table].push(row); rows.push(row);
            }
          } else if (q.op==='update') rows.forEach(r=>Object.assign(r,q.body));
          else if (q.op==='delete') tables[table]=tables[table].filter(r=>!rows.includes(r));
          if(q.limit) rows=rows.slice(0,q.limit);
          if(q.range) rows=rows.slice(q.range[0],q.range[1]+1);
          return {data:structuredClone(q.single?(rows[0]||null):rows),count:rows.length,error:null};
        }).then(resolve,reject);
      }
    }; return b;
  }};
}

function mountSource(file, db, exportName='default') {
  const cache=new Map();
  function load(filename) {
    if(filename.endsWith('.css')) return {};
    if(filename.endsWith('.json')) return JSON.parse(fs.readFileSync(filename,'utf8'));
    if(cache.has(filename)) return cache.get(filename).exports;
    const mod=new Module(filename, module); mod.filename=filename; mod.paths=Module._nodeModulePaths(path.dirname(filename)); cache.set(filename,mod);
    mod.require=name=> {
      if(name.endsWith('/supabase')) return {...load(path.join(root,'lib/supabase.js')),supa:()=>db,today:date};
      if(name.startsWith('.')) {
        const target=path.resolve(path.dirname(filename),name);
        return load(fs.existsSync(target)?target:target+'.js');
      }
      return require(name);
    };
    const result=swc.transformSync(fs.readFileSync(filename,'utf8'),{filename,isModule:true,jsc:{parser:{syntax:'ecmascript',jsx:true},target:'es2020',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
    mod._compile(result.code,filename); return mod.exports;
  }
  return load(path.join(root,file))[exportName];
}
const text = n => typeof n==='string'?n:!n?'':(n.children||[]).map(text).join(' ');
const buttons = tree => tree.root.findAllByType('button');
const button = (tree, label) => { const b=buttons(tree).find(n=>text(n).replace(/\s+/g,' ').includes(label)); assert.ok(b,`Missing button: ${label}`); return b; };
async function flush() { await act(async()=>{for(let i=0;i<5;i++) await new Promise(resolve=>setImmediate(resolve));}); }
let mounted;
test.before(async()=>{await swc.loadBindings();});
test.beforeEach(()=>{
  const values=new Map(); global.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  global.window={}; global.document={addEventListener(){},removeEventListener(){}};
});
test.afterEach(()=>{if(mounted)act(()=>mounted.unmount());mounted=null;delete global.window;delete global.document;delete global.localStorage;});

test('pain keeps missing distinct from zero and one rapid save writes exactly one pair', async()=>{
  const db=database({pain_logs:[]}); const Pain=mountSource('components/PainLog.js',db); let closed=0;
  await act(async()=>{mounted=create(React.createElement(Pain,{userId:'test-user',onClose:()=>closed++}));}); await flush();
  assert.equal(button(mounted,'Save both scores').props.disabled,true);
  for(const label of ['Dorsiflexion 0 out of 10','Eversion 0 out of 10']) await act(async()=>mounted.root.findByProps({'aria-label':label}).props.onClick());
  assert.equal(button(mounted,'Save both scores').props.disabled,false);
  const save=button(mounted,'Save both scores').props.onClick;
  await act(async()=>{await Promise.all([save(),save()]);});
  assert.equal(db.tables.pain_logs.length,2); assert.equal(db.writes.length,1); assert.equal(closed,1);
  assert.deepEqual(db.tables.pain_logs.map(r=>r.score),[0,0]);
  assert.ok(db.tables.pain_logs.every(r=>r.user_id==='test-user'&&r.date===date()&&r.site==='left_ankle_extensor'));
});

test('pain failed save remains open with an error and does not report success', async()=>{
  const db=database({pain_logs:[]},q=>q.op!=='select');const Pain=mountSource('components/PainLog.js',db);let closed=0;
  await act(async()=>{mounted=create(React.createElement(Pain,{userId:'test-user',onClose:()=>closed++}));});await flush();
  for(const label of ['Dorsiflexion 1 out of 10','Eversion 0 out of 10']) await act(async()=>mounted.root.findByProps({'aria-label':label}).props.onClick());
  await act(async()=>button(mounted,'Save both scores').props.onClick());
  assert.equal(closed,0);assert.equal(db.tables.pain_logs.length,0);assert.match(text(mounted.toJSON()),/not saved|unavailable connection/);
});

function dailySeed(hold=null, logs=[]) {
  return {workout_days:[{id:'day',user_id:'test-user',is_daily:true,is_active:true,name:'Test routine'}],workout_exercises:[{id:'item',user_id:'test-user',workout_day_id:'day',exercise_id:'exercise',is_enabled:true,sets:3,rep_min:8,rep_max:8,hold_seconds:hold,rest_seconds:0,exercises:{name:'Test movement',cue_execution:'Test cue'}}],sessions:[{id:'session',user_id:'test-user',workout_day_id:'day',date:date(),started_at:new Date().toISOString(),completed_at:null}],set_logs:logs.map(n=>({id:`set-${n}`,user_id:'test-user',session_id:'session',exercise_id:'exercise',set_number:n,reps:8}))};
}
test('daily resume fills a missing middle set and completes only after a successful save', async()=>{
  const db=database(dailySeed(null,[1,3]));const Daily=mountSource('components/DailyBlock.js',db);
  await act(async()=>{mounted=create(React.createElement(Daily,{userId:'test-user',onClose(){}}));});await flush();
  await act(async()=>button(mounted,'Continue · item').props.onClick());
  assert.ok(button(mounted,'Log set 2'));assert.equal(db.writes.length,0);
  const save=button(mounted,'Log set 2').props.onClick;await act(async()=>{await Promise.all([save(),save()]);});
  assert.equal(db.tables.set_logs.length,3);assert.deepEqual(db.tables.set_logs.map(r=>r.set_number).sort(),[1,2,3]);
  assert.ok(db.tables.sessions[0].completed_at);
});
test('daily expired hold restores ready but never writes before explicit confirmation', async()=>{
  const db=database(dailySeed(45,[]));const Daily=mountSource('components/DailyBlock.js',db);
  localStorage.setItem(`timer:test-user:daily:day:${date()}:item:1`,JSON.stringify({signature:'[45]',state:{status:'running',index:0,deadline:Date.now()-1000,remainingMs:45000}}));
  await act(async()=>{mounted=create(React.createElement(Daily,{userId:'test-user',onClose(){}}));});await flush();
  await act(async()=>button(mounted,'Continue · item').props.onClick());await flush();
  assert.equal(db.writes.length,0);assert.equal(button(mounted,'Log completed hold 1').props.disabled,false);
  await act(async()=>button(mounted,'Log completed hold 1').props.onClick());
  assert.equal(db.tables.set_logs.length,1);assert.equal(db.tables.set_logs[0].hold_seconds,45);assert.equal(db.tables.sessions[0].completed_at,null);
});
test('daily failed set write leaves progress unchanged and supports retry', async()=>{
  let failed=true;const db=database(dailySeed(null,[]),q=>q.table==='set_logs'&&q.op!=='select'&&failed);const Daily=mountSource('components/DailyBlock.js',db);
  await act(async()=>{mounted=create(React.createElement(Daily,{userId:'test-user',onClose(){}}));});await flush();
  await act(async()=>button(mounted,'Continue · item').props.onClick());await act(async()=>button(mounted,'Log set 1').props.onClick());
  assert.equal(db.tables.set_logs.length,0);assert.match(text(mounted.toJSON()),/Could not finish saving/);
  failed=false;await act(async()=>button(mounted,'Log set 1').props.onClick());assert.equal(db.tables.set_logs.length,1);
});

test('daily reconciles a saved set after a failed session update without inserting twice', async()=>{
  let failed=true;const db=database(dailySeed(null,[]),q=>q.table==='sessions'&&q.op==='update'&&failed);const Daily=mountSource('components/DailyBlock.js',db);
  await act(async()=>{mounted=create(React.createElement(Daily,{userId:'test-user',onClose(){}}));});await flush();
  await act(async()=>button(mounted,'Continue · item').props.onClick());await act(async()=>button(mounted,'Log set 1').props.onClick());
  assert.equal(db.tables.set_logs.length,1);assert.match(text(mounted.toJSON()),/Could not finish saving/);
  failed=false;await act(async()=>button(mounted,'Log set 1').props.onClick());
  assert.equal(db.tables.set_logs.length,1);assert.equal(db.writes.filter(q=>q.table==='set_logs').length,1);
});

test('unreadable prescribed daily exercises prevent a false complete result', async()=>{
  const seed=dailySeed(null,[1,2]);seed.workout_exercises.push({...seed.workout_exercises[0],id:'missing',exercise_id:'hidden-exercise',sets:1,exercises:null});
  const db=database(seed);const Daily=mountSource('components/DailyBlock.js',db);
  await act(async()=>{mounted=create(React.createElement(Daily,{userId:'test-user',onClose(){}}));});await flush();
  assert.match(text(mounted.toJSON()),/cannot be marked complete/);
  await act(async()=>button(mounted,'Continue · item').props.onClick());await act(async()=>button(mounted,'Log set 3').props.onClick());
  assert.equal(db.tables.set_logs.length,3);assert.equal(db.tables.sessions[0].completed_at,null);
  assert.equal(buttons(mounted).some(n=>text(n)==='Done'),false);
});

test('two daily instances logging the same session set create only one canonical row', async()=>{
  const db=database(dailySeed(null,[]));const Daily=mountSource('components/DailyBlock.js',db);
  await act(async()=>{mounted=create(React.createElement(React.Fragment,null,...[1,2].map(key=>React.createElement(Daily,{key,userId:'test-user',onClose(){}}))));});await flush();
  const starts=buttons(mounted).filter(n=>text(n).includes('Continue · item'));
  await act(async()=>starts.forEach(n=>n.props.onClick()));
  const saves=buttons(mounted).filter(n=>text(n).includes('Log set 1'));
  assert.equal(saves.length,2);await act(async()=>{await Promise.all(saves.map(n=>n.props.onClick()));});
  assert.equal(db.tables.set_logs.length,1);assert.equal(db.tables.set_logs[0].set_number,1);
});

function gymSeed(logs=[]) {
  return { ...dailySeed(null,logs), workout_exercises:[{id:'item',user_id:'test-user',workout_day_id:'day',exercise_id:'exercise',is_enabled:true,sets:3,rep_min:8,rep_max:10,target_weight_kg:14,rest_seconds:90,exercises:{name:'Dumbbell press',priority_tier:'A',load_unit:'per_hand',rir_target:'2–3',increment_kg:2}}], v_last_performance:[],v_progression_suggestions:[] };
}
async function mountGym(db) {
  const Session=mountSource('components/Session.js',db);
  await act(async()=>{mounted=create(React.createElement(Session,{day:{id:'day',name:'Test lift'},userId:'test-user',onExit(){}}));}); await flush();
}
test('gym edit loads saved values, updates the same row and never advances or starts rest',async()=>{
  const seed=gymSeed([1]);seed.set_logs[0].weight_kg=14;
  const db=database(seed); await mountGym(db);
  await act(async()=>mounted.root.findByProps({'aria-label':'Set 1, completed'}).props.onClick());
  assert.equal(mounted.root.findByProps({'aria-label':'Load'}).props.value,14);
  assert.ok(mounted.root.findByProps({'data-mode':'edit'}));
  await act(async()=>mounted.root.findByProps({'aria-label':'Load'}).props.onChange({target:{value:'16.5'}}));
  await act(async()=>button(mounted,'Update set 1').props.onClick());
  assert.equal(db.tables.set_logs.length,1);assert.equal(db.tables.set_logs[0].id,'set-1');assert.equal(db.tables.set_logs[0].weight_kg,16.5);
  assert.ok(button(mounted,'Update set 1'));assert.match(text(mounted.toJSON()),/33 kg total/);assert.doesNotMatch(text(mounted.toJSON()),/Start set 2 now/);
  capture('set-edit',mounted);
});
test('gym new set saves once, uses prescribed rest and returns to the next missing set',async()=>{
  const db=database(gymSeed([]));await mountGym(db);
  const save=button(mounted,'Log set 1').props.onClick;
  await act(async()=>{await Promise.all([save(),save()]);});
  assert.equal(db.tables.set_logs.length,1);
  assert.ok(mounted.root.findByProps({'aria-label':'90 seconds remaining'}));
  capture('rest',mounted);
  await act(async()=>button(mounted,'Start set 2 now').props.onClick());
  assert.ok(button(mounted,'Log set 2'));assert.equal(db.tables.set_logs.length,1);
});
test('gym failed save does not advance or create a success state',async()=>{
  const db=database(gymSeed([]),q=>q.table==='set_logs' && q.op!=='select');await mountGym(db);
  await act(async()=>button(mounted,'Log set 1').props.onClick());
  assert.ok(button(mounted,'Log set 1'));assert.equal(db.tables.set_logs.length,0);assert.match(text(mounted.toJSON()),/Not saved/);
});
test('gym deletion removes only the selected set and restores pending mode',async()=>{
  const db=database(gymSeed([1,3]));await mountGym(db);
  await act(async()=>mounted.root.findByProps({'aria-label':'Set 1, completed'}).props.onClick());
  await act(async()=>button(mounted,'Delete set 1').props.onClick());
  assert.deepEqual(db.tables.set_logs.map(s=>s.set_number),[3]);assert.ok(button(mounted,'Log set 1'));
});
test('gym read failures cannot create a replacement session',async()=>{
  const db=database(gymSeed([1]),q=>q.table==='sessions');await mountGym(db);
  assert.match(text(mounted.toJSON()),/Simulated unavailable connection/);assert.equal(db.writes.length,0);
  assert.equal(buttons(mounted).some(b=>text(b).includes('Log set')),false);
});
test('body opens empty, accepts measurements and collapses only with both weights and all six photo views',async()=>{
  const db=database({daily_log:[{id:'body',user_id:'test-user',date:date(),weight_am_kg:71,weight_pm_kg:null,waist_cm:83}],photos:['am','pm'].flatMap(slot=>['front','back','arm'].map(pose=>({id:slot+pose,user_id:'test-user',date:date(),slot,pose,storage_path:'test'})))});
  db.storage={from:()=>({createSignedUrl:async()=>({data:{signedUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}})})};
  const Body=mountSource('components/BodyCard.js',db);
  await act(async()=>{mounted=create(React.createElement(Body,{userId:'test-user'}));});await flush();
  assert.equal(mounted.root.findByProps({'aria-label':'PM weight'}).props.value,'');
  assert.ok(mounted.root.findAll(n=>n.props.className?.includes('is-empty')).length);
  capture('body-expanded',mounted);
  await act(async()=>mounted.root.findByProps({'aria-label':'PM weight'}).props.onChange({target:{value:'72.4'}}));
  await act(async()=>mounted.root.findByType('form').props.onSubmit({preventDefault(){}}));
  // Transport supports ID conflicts; the returned saved record is still the real component's data.
  assert.ok(mounted.root.findByProps({'aria-expanded':'false'}));
  await act(async()=>button(mounted,'Body · daily').props.onClick());
  assert.equal(mounted.root.findByProps({'aria-label':'PM weight'}).props.value,72.4);
});
test('Week renders all seven days and two Friday pills, and performs no writes',async()=>{
  const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7)+4);const friday=d.toLocaleDateString('en-CA');
  const db=database({run_plan:[{id:'run',date:friday,run_type:'easy',duration_min:40}],workout_days:[{id:'pull',name:'Upper Pull',weekday:5,is_active:true,is_daily:false}],sessions:[],runs:[],v_load_weekly:[]});
  const Week=mountSource('components/Week.js',db);await act(async()=>{mounted=create(React.createElement(Week));});await flush();
  const rows=mounted.root.findAll(n=>n.props['data-date']);assert.equal(rows.length,7);
  const fridayRow=rows.find(r=>r.props['data-date']===friday);assert.match(text(fridayRow),/easy run/);assert.match(text(fridayRow),/Upper Pull/);assert.equal(fridayRow.findAll(n=>n.props.className?.includes('week-session')).length,2);assert.equal(db.writes.length,0);
  capture('week',mounted);
});
function capture(name, tree) {
  if (!process.env.PHASE3_CAPTURE) return;
  const render=n=>typeof n==='string'?n:!n?null:React.createElement(n.type,{...Object.fromEntries(Object.entries(n.props).filter(([k])=>!k.startsWith('on'))),...(['input','textarea','select'].includes(n.type) && (n.props.value != null || n.props.checked != null) ? {readOnly:true,onChange:()=>{}}: {})},...(n.children||[]).map(render));
  const markup=require('react-dom/server').renderToStaticMarkup(render(tree.toJSON()));
  const fontFile=path.join(root,"..","artifacts","reference","00.html"); const fonts=fs.existsSync(fontFile)?fs.readFileSync(fontFile,"utf8").match(/<style>([\s\S]*?)<\/style>/)?.[1]?.replace(/url\("([^"]+)"\)/g,'url("../reference/$1")')||"":"";
  const css=['app/globals.css','components/phase2-timers.css','components/phase2-dashboard.css','components/phase3.css','components/phase4.css','components/phase5.css','components/phase6.css','components/standalone.css'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
  const dir=path.join(root,'..','artifacts','phase3-preview');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,`${name}.html`),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 3 ${name} · synthetic test data</title><style>:root{--font-sans:"IBM Plex Sans",sans-serif;--font-mono:"IBM Plex Mono",monospace}${fonts}${css}</style>${markup}`);
}

test('Today composes the cockpit in order, with one Food card and nothing after the session',async()=>{
  const seed=gymSeed([]);seed.workout_days=[{id:'day',user_id:'test-user',name:'Upper Push',is_active:true,is_daily:false,weekday:((new Date().getDay()+6)%7)+1}];
  Object.assign(seed,{run_plan:[{id:'run',user_id:'test-user',date:date(),run_type:'easy',duration_min:40}],pain_logs:[],photos:[],daily_log:[],v_daily_nutrition:[],user_settings:[],foods:[],v_session_intensity:[],v_commute_weekly:[]});
  const db=database(seed);const Today=mountSource('components/Today.js',db);
  await act(async()=>{mounted=create(React.createElement(Today,{userId:'test-user',onFood(){},onPain(){},onDaily(){},onRun(){},onStart(){},subtabs:React.createElement('div',null,'Today / Progress')}));});await flush();
  const content=text(mounted.toJSON());
  const labels=['Today / Progress','Pain not scored cold','Daily · tendon','Body · daily','Food · today','Commute','Start run'];
  const positions=labels.map(label=>{const p=content.indexOf(label);assert.ok(p>=0,label);return p;});
  assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));assert.equal(buttons(mounted).filter(b=>text(b).includes('Search food')).length,1);
  const children=mounted.toJSON().children.filter(n=>typeof n!=='string');assert.equal(children.at(-1).props.className,'today-session');
  capture('today',mounted);
});
test('body failed save stays expanded and retains typed values',async()=>{
  const db=database({daily_log:[],photos:[]},q=>q.op!=='select');const Body=mountSource('components/BodyCard.js',db);
  await act(async()=>{mounted=create(React.createElement(Body,{userId:'test-user'}));});await flush();
  await act(async()=>mounted.root.findByProps({'aria-label':'AM weight'}).props.onChange({target:{value:'71.7'}}));
  await act(async()=>mounted.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(mounted.root.findByProps({'aria-label':'AM weight'}).props.value,'71.7');assert.match(text(mounted.toJSON()),/Not saved/);assert.equal(db.tables.daily_log.length,0);
});
test('body upload retry reuses the uploaded object and creates one photo row',async()=>{
  let fail=true, uploads=0;
  const db=database({daily_log:[],photos:[]},q=>fail && q.table==='photos' && q.op!=='select');
  db.storage={from:()=>({upload:async()=>{uploads++;return {data:{},error:null};},createSignedUrl:async()=>({data:{signedUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}})})};
  const Body=mountSource('components/BodyCard.js',db);await act(async()=>{mounted=create(React.createElement(Body,{userId:'test-user'}));});await flush();
  const change=()=>mounted.root.findByProps({'aria-label':'AM front upload'}).props.onChange({target:{files:[{name:'test.png',size:100,lastModified:1,type:'image/png'}],value:'test.png'}});
  await act(change);assert.equal(db.tables.photos.length,0);assert.equal(uploads,1);fail=false;
  await act(change);assert.equal(db.tables.photos.length,1);assert.equal(uploads,1);assert.equal(db.tables.photos[0].user_id,'test-user');
});
test('food saves serving-adjusted nutrition once on repeated taps',async()=>{
  const db=database({foods:[],meal_logs:[]});const Food=mountSource('components/Food.js',db);
  await act(async()=>{mounted=create(React.createElement(Food,{userId:'test-user',initialFood:{id:'food',name:'Test food',kcal:100,protein_g:20},onClose(){}}));});await flush();
  await act(async()=>mounted.root.findByProps({'aria-label':'Servings'}).props.onChange({target:{value:'1.5'}}));
  const save=button(mounted,'Add to snack').props.onClick;await act(async()=>Promise.all([save(),save()]));
  assert.equal(db.tables.meal_logs.length,1);assert.equal(db.tables.meal_logs[0].kcal,150);assert.equal(db.tables.meal_logs[0].protein_g,30);
});


test('schedule move requires explicit swap or stack and retry preserves request identity',async()=>{
 const a={id:'a',user_id:'test-user',date:date(),run_type:'easy',duration_min:40};
 const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);const dest=tomorrow.toLocaleDateString('en-CA');
 const db=database({run_plan:[a,{id:'b',user_id:'test-user',date:dest,run_type:'long',duration_min:100}],workout_days:[],lift_schedule:[],runs:[]});
 const calls=[];let closed=0,changed=0;db.rpc=async(name,args)=>{calls.push(args);return {error:calls.length===1?{message:'Connection interrupted'}:null};};
 const Editor=mountSource('components/ScheduleEditor.js',db);
 await act(async()=>{mounted=create(React.createElement(Editor,{userId:'test-user',item:{...a,key:'run:a',kind:'run',title:'easy run',status:'scheduled',revision:0},onClose:()=>closed++,onChanged:()=>changed++}));});await flush();
 assert.equal(button(mounted,'Save change').props.disabled,true);
 await act(async()=>button(mounted,'Swap dates').props.onClick());assert.equal(button(mounted,'Save change').props.disabled,false);
 await act(async()=>button(mounted,'Save change').props.onClick());assert.equal(closed,0);assert.match(text(mounted.toJSON()),/Connection interrupted/);
 await act(async()=>button(mounted,'Save change').props.onClick());assert.equal(closed,1);assert.equal(changed,1);assert.equal(calls[0].p_changes.length,2);assert.equal(calls[0].p_request_id,calls[1].p_request_id);assert.equal(calls[0].p_changes[1].to_date,date());
 capture('schedule-move',mounted);
});


test('commute opens without writing, keeps failed input, and saves a trip once',async()=>{
 let fail=true,closed=0;const db=database({runs:[]},q=>fail&&q.op!=='select');const Commute=mountSource('components/Commute.js',db,'CommuteLog');
 await act(async()=>{mounted=create(React.createElement(Commute,{userId:'test-user',direction:'to_work',onClose:()=>closed++}));});await flush();assert.equal(db.writes.length,0);
 const numeric=mounted.root.findAllByType('input').filter(x=>x.props.inputMode==='decimal');
 await act(async()=>{numeric[0].props.onChange({target:{value:'8.4'}});numeric[1].props.onChange({target:{value:'27'}});});
 await act(async()=>button(mounted,'Save trip').props.onClick());assert.equal(closed,0);assert.match(text(mounted.toJSON()),/Not saved/);assert.equal(numeric[0].props.value,'8.4');
 fail=false;const save=button(mounted,'Save trip').props.onClick;await act(async()=>{await Promise.all([save(),save()]);});assert.equal(db.tables.runs.length,1);assert.equal(db.tables.runs[0].duration_min,27);assert.equal(db.tables.runs[0].user_id,'test-user');assert.equal(closed,1);capture('commute',mounted);
});

test('custom food is reusable and meal retries do not duplicate saved foods',async()=>{
 let fail=true;const db=database({foods:[],meal_logs:[],user_settings:[],run_plan:[],workout_days:[],lift_schedule:[]},q=>fail&&q.table==='meal_logs'&&q.op!=='select');const Food=mountSource('components/Food.js',db);
 await act(async()=>{mounted=create(React.createElement(Food,{userId:'test-user',initialFood:{custom:true},onClose(){}}));});await flush();
 const inputs=mounted.root.findAllByType('input');const values=['Rice bowl','1 bowl','550','22','',''];await act(async()=>{inputs.filter(x=>!x.props.type&&!x.props['aria-label']).forEach((x,i)=>x.props.onChange({target:{value:values[i]}}));mounted.root.findByProps({type:'checkbox'}).props.onChange({target:{checked:true}});});
 await act(async()=>button(mounted,'Add to snack').props.onClick());assert.equal(db.tables.foods.length,1);assert.equal(db.tables.meal_logs.length,0);assert.match(text(mounted.toJSON()),/Not saved/);
 fail=false;await act(async()=>button(mounted,'Add to snack').props.onClick());assert.equal(db.tables.foods.length,1);assert.equal(db.tables.meal_logs.length,1);assert.equal(db.tables.meal_logs[0].food_id,db.tables.foods[0].id);assert.equal(db.tables.meal_logs[0].carbs_g,null);capture('food',mounted);
});

test('diary preserves missing pain versus zero and retains failed check-in fields',async()=>{
 const db=database({daily_log:[{user_id:'test-user',date:date(),weight_am_kg:70}],pain_logs:[{id:'p',user_id:'test-user',date:date(),site:'left_ankle_extensor',movement:'eversion',score:0}],sessions:[],runs:[],v_daily_nutrition:[]});let args;db.rpc=async(n,a)=>{args=a;return {error:{message:'Offline'}};};const Diary=mountSource('components/Diary.js',db);
 await act(async()=>{mounted=create(React.createElement(Diary,{userId:'test-user'}));});await flush();assert.match(text(mounted.toJSON()),/dorsiflexion.*—/);assert.match(text(mounted.toJSON()),/eversion.*0/);
 const inputs=mounted.root.findAllByType('input').filter(x=>x.props.inputMode==='decimal');await act(async()=>inputs[0].props.onChange({target:{value:'7.5'}}));await act(async()=>button(mounted,'Save diary').props.onClick());assert.equal(args.p_daily.sleep_hours,7.5);assert.equal(args.p_daily.resting_hr,null);assert.equal(args.p_daily.weight_am_kg,undefined);assert.equal(inputs[0].props.value,'7.5');assert.match(text(mounted.toJSON()),/Not saved: Offline/);capture('diary',mounted);
});

test('export read failure cannot copy an incomplete report',async()=>{
 const db=database({},q=>q.table==='meal_logs');let copied=false;Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{copied=true;}}},configurable:true});const Export=mountSource('components/ExportPanel.js',db);
 await act(async()=>{mounted=create(React.createElement(Export,{userId:'test-user'}));});await act(async()=>button(mounted,'Build & copy').props.onClick());assert.equal(copied,false);assert.match(text(mounted.toJSON()),/Export failed/);assert.equal(mounted.root.findAllByType('textarea').length,0);delete global.navigator;
});


test('food serving edits update one row and deletion refreshes totals only after confirmation',async()=>{
 const row={id:'meal',user_id:'test-user',date:date(),meal:'lunch',custom_name:'Eggs',servings:1,kcal:140,protein_g:13,nutrient_basis:{kcal:140,protein_g:13},foods:null};const db=database({foods:[],meal_logs:[row],user_settings:[],run_plan:[],workout_days:[],lift_schedule:[]});const Food=mountSource('components/Food.js',db);
 await act(async()=>{mounted=create(React.createElement(Food,{userId:'test-user',onClose(){}}));});await flush();await act(async()=>button(mounted,'Eggs 1 serving').props.onClick());await act(async()=>mounted.root.findByProps({'aria-label':'Servings'}).props.onChange({target:{value:'2'}}));await act(async()=>button(mounted,'Update food').props.onClick());assert.equal(db.tables.meal_logs.length,1);assert.equal(db.tables.meal_logs[0].kcal,280);
 await act(async()=>mounted.root.findByProps({'aria-label':'Delete Eggs'}).props.onClick());assert.equal(db.tables.meal_logs.length,1);await act(async()=>button(mounted,'Confirm delete').props.onClick());assert.equal(db.tables.meal_logs.length,0);assert.match(text(mounted.toJSON()),/0\s+\/\s+1800\s+kcal/);
});

test('export pagination fetches beyond the API first page',async()=>{
 const allRows=mountSource('lib/export-client.js',{},'allRows');const rows=Array.from({length:1001},(_,i)=>({id:i}));let pages=0;const result=await allRows(()=>({range:async(a,z)=>{pages++;return {data:rows.slice(a,z+1),error:null};}}));assert.equal(result.length,1001);assert.equal(pages,3);
});


test('gym resumes its saved prescription after programme changes',async()=>{
 const seed=gymSeed([]);seed.sessions[0].workout_snapshot=[{...seed.workout_exercises[0],exercise_id:'original',exercises:{...seed.workout_exercises[0].exercises,name:'Original press'}}];seed.workout_exercises[0].exercises.name='Replacement press';const db=database(seed);await mountGym(db);assert.match(text(mounted.toJSON()),/Original press/);assert.doesNotMatch(text(mounted.toJSON()),/Replacement press/);await act(async()=>button(mounted,'Log set 1').props.onClick());assert.equal(db.tables.set_logs[0].exercise_id,'original');
});

test('today-only exercise override is used and captured when the workout starts',async()=>{
 const seed=gymSeed([]);seed.sessions=[];seed.workout_overrides=[{user_id:'test-user',occurrence_ref:`lift:day:${date()}`,items:[{...seed.workout_exercises[0],exercise_id:'swap',exercises:{...seed.workout_exercises[0].exercises,name:'Temporary press'}}]}];const db=database(seed);await mountGym(db);assert.match(text(mounted.toJSON()),/Temporary press/);await act(async()=>button(mounted,'Log set 1').props.onClick());assert.equal(db.tables.sessions[0].workout_snapshot[0].exercise_id,'swap');assert.equal(db.tables.workout_exercises[0].exercise_id,'exercise');
});

test('settings failed save retains typed targets and only successful save updates app',async()=>{
 let fail=true,saved=0;const db=database({user_settings:[],workout_days:[]},q=>fail&&q.op!=='select');const Settings=mountSource('components/Settings.js',db);await act(async()=>{mounted=create(React.createElement(Settings,{user:{id:'test-user',email:'test@example.test'},onSaved:()=>saved++}));});await flush();const input=mounted.root.findAllByType('input').find(x=>x.props.value===2000);await act(async()=>input.props.onChange({target:{value:'2100'}}));await act(async()=>button(mounted,'Save settings').props.onClick());assert.equal(saved,0);assert.equal(input.props.value,'2100');fail=false;await act(async()=>button(mounted,'Save settings').props.onClick());assert.equal(db.tables.user_settings[0].kcal_easy,2100);assert.equal(saved,1);capture('settings',mounted);
});

test('workout edit submits all rows atomically and stays open after rejected save',async()=>{
 const seed=gymSeed([]);seed.workout_days[0].is_daily=false;seed.workout_days[0].plan_revision=2;seed.exercises=[];const db=database(seed);let payload,closed=0;db.rpc=async(n,args)=>{payload=args;return {error:{message:'Workout changed on another device'}};};const Editor=mountSource('components/WorkoutEditor.js',db);await act(async()=>{mounted=create(React.createElement(Editor,{userId:'test-user',day:{id:'day',name:'Push'},onChanged(){},onClose:()=>closed++}));});await flush();const setInput=mounted.root.findAllByType('input').find(x=>x.props.value===3);await act(async()=>setInput.props.onChange({target:{value:'4'}}));await act(async()=>button(mounted,'Save programme').props.onClick());assert.equal(payload.p_revision,2);assert.equal(payload.p_items[0].sets,4);assert.equal(closed,0);assert.match(text(mounted.toJSON()),/another device/);capture('workout-editor',mounted);
});

test('photo comparison signs selected private paths and keeps missing measurements blank',async()=>{
 const paths=[];const db={storage:{from:()=>({createSignedUrl:async(path,ttl)=>{paths.push([path,ttl]);return {data:{signedUrl:'https://example.test/private-photo'},error:null};}})}};const Photos=mountSource('components/PhotoCompare.js',db);const photos=[{id:'a',date:'2026-09-01',slot:'am',storage_path:'test-user/a',created_at:'2026-09-01T08:00:00Z'},{id:'b',date:'2026-09-14',slot:'pm',storage_path:'test-user/b',created_at:'2026-09-14T18:00:00Z'}];await act(async()=>{mounted=create(React.createElement(Photos,{photos,daily:[{date:'2026-09-01',weight_am_kg:70,waist_cm:80}]}));});await flush();assert.equal(paths.length,2);assert.ok(paths.every(x=>x[1]===3600));assert.match(text(mounted.toJSON()),/Weight change unavailable/);assert.equal(mounted.root.findAllByType('img').length,2);
});


test('Progress renders recorded trends and separates pain movements without hardcoded markers',async()=>{
 const uid='test-user';const db=database({runs:[{id:'a',user_id:uid,date:'2026-09-01',run_type:'long',duration_min:60,distance_km:8,hr_avg:130},{id:'b',user_id:uid,date:date(),run_type:'long',duration_min:70,distance_km:10,hr_avg:132}],pain_logs:[{id:'p',user_id:uid,date:date(),site:'left_ankle_extensor',movement:'eversion',score:0}],daily_log:[],photos:[],set_logs:[],v_load_weekly:[],user_settings:[]});db.rpc=async()=>({data:[],error:null});const Progress=mountSource('components/Progress.js',db);await act(async()=>{mounted=create(React.createElement(Progress,{userId:uid}));});await flush();const output=text(mounted.toJSON());assert.match(output,/2\s+recorded runs/);assert.match(output,/Cold pain · dorsiflexion/);assert.match(output,/Cold pain · eversion/);assert.doesNotMatch(output,/62 →|4km →|VT2/);assert.match(output,/No photos for this view yet/);capture('progress',mounted);
});


test('Dashboard restores the week strip and recorded lift chart without writing logs',async()=>{
 const uid='test-user',seed=gymSeed([1]);seed.workout_days[0]={...seed.workout_days[0],is_daily:false,name:'Push',weekday:((new Date().getDay()+6)%7)+1};
 seed.set_logs[0]={...seed.set_logs[0],weight_kg:14,exercises:{name:'Press',load_unit:'per_hand',priority_tier:'A'},sessions:{date:date()}};
 const db=database(seed),Dashboard=mountSource('components/Dashboard.js',db);let opened;
 await act(async()=>{mounted=create(React.createElement(Dashboard,{userId:uid,email:'test@example.test',onWeek:d=>opened=d}));});await flush();
 assert.match(text(mounted.toJSON()),/First recorded/);assert.match(text(mounted.toJSON()),/Resume Push/);assert.equal(db.writes.length,0);
 const day=buttons(mounted).find(b=>b.props['aria-label']?.startsWith('View week containing'));await act(async()=>day.props.onClick());assert.match(opened,/^\d{4}-\d{2}-\d{2}$/);capture('dashboard',mounted);
});


test('daily untimed completion flows through rest to the next set and exercise',async()=>{
 const seed=dailySeed(45,[]);seed.workout_exercises[0].sets=2;seed.workout_exercises[0].rest_seconds=30;
 seed.workout_exercises.push({...seed.workout_exercises[0],id:'second',exercise_id:'second-ex',sets:1,hold_seconds:null,exercises:{name:'Next exercise'}});
 const db=database(seed),Daily=mountSource('components/DailyBlock.js',db);
 await act(async()=>{mounted=create(React.createElement(Daily,{userId:'test-user',onClose(){}}));});await flush();
 await act(async()=>button(mounted,'Continue').props.onClick());
 assert.equal(button(mounted,'Log completed hold 1').props.disabled,false);
 await act(async()=>button(mounted,'Log completed hold 1').props.onClick());
 assert.equal(db.tables.set_logs.length,1);
 await act(async()=>button(mounted,'Skip rest').props.onClick());
 assert.ok(button(mounted,'Log completed hold 2'));
 await act(async()=>button(mounted,'Log completed hold 2').props.onClick());
 await act(async()=>button(mounted,'Skip rest').props.onClick());
 assert.match(text(mounted.toJSON()),/Next exercise/);assert.ok(button(mounted,'Log set 1'));
 await act(async()=>button(mounted,'Log set 1').props.onClick());
 assert.ok(db.tables.sessions[0].completed_at);assert.equal(db.tables.set_logs.length,3);
});

test('extra set survives an uncertain response and can be logged with RIR clickers',async()=>{
 const seed=gymSeed([1,2,3]);seed.sessions[0].workout_snapshot=structuredClone(seed.workout_exercises);
 const db=database(seed);let calls=0;
 db.rpc=async(name,args)=>{assert.equal(name,'add_session_set');calls++;const snapshot=db.tables.sessions[0].workout_snapshot;const item=snapshot[0];if(item.sets===args.p_expected_sets)item.sets++;return calls===1?{error:{message:'Response lost'}}:{data:structuredClone(snapshot)};};
 await mountGym(db);
 await act(async()=>button(mounted,'Add another set').props.onClick());
 assert.match(text(mounted.toJSON()),/Response lost/);assert.equal(db.tables.set_logs.length,3);
 await act(async()=>button(mounted,'Add another set').props.onClick());
 assert.ok(button(mounted,'Log set 4'));assert.equal(db.tables.sessions[0].workout_snapshot[0].sets,4);
 await act(async()=>mounted.root.findByProps({'aria-label':'More RIR'}).props.onClick());
 assert.equal(mounted.root.findByProps({'aria-label':'Reps in reserve'}).props.value,3);
 await act(async()=>button(mounted,'Log set 4').props.onClick());
 assert.equal(db.tables.set_logs.length,4);assert.equal(db.tables.set_logs.at(-1).rir,3);
 assert.equal(db.tables.workout_exercises[0].sets,3);
});

test('six photo views expose independent camera and upload inputs and retain pose',async()=>{
 const db=database({daily_log:[],photos:[]});db.storage={from:()=>({upload:async()=>({data:{}}),createSignedUrl:async()=>({data:{signedUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}})})};
 const Body=mountSource('components/BodyCard.js',db);await act(async()=>{mounted=create(React.createElement(Body,{userId:'test-user'}));});await flush();
 for(const slot of ['AM','PM'])for(const pose of ['front','back','arm']){
  const camera=mounted.root.findByProps({'aria-label':`${slot} ${pose} camera`});const upload=mounted.root.findByProps({'aria-label':`${slot} ${pose} upload`});
  assert.equal(camera.props.capture,'environment');assert.equal(upload.props.capture,undefined);
  await act(async()=>upload.props.onChange({target:{files:[{name:'same.png',size:10,lastModified:1,type:'image/png'}],value:''}}));
 }
 assert.equal(db.tables.photos.length,6);assert.equal(new Set(db.tables.photos.map(p=>p.slot+':'+p.pose)).size,6);
 capture('six-photos',mounted);
});

test('custom food deletion hides search and favourites but retains logged nutrition',async()=>{
 const food={id:'custom',user_id:'test-user',source:'user',name:'My oats',is_favourite:true,is_archived:false,kcal:200,protein_g:10};
 const db=database({foods:[food],meal_logs:[{id:'meal',user_id:'test-user',date:date(),meal:'snack',food_id:'custom',foods:{name:'My oats'},servings:1,kcal:200,protein_g:10}]});const Food=mountSource('components/Food.js',db);
 await act(async()=>{mounted=create(React.createElement(Food,{userId:'test-user',onClose(){}}));});await flush();
 await act(async()=>mounted.root.findByProps({'aria-label':'Delete custom food My oats'}).props.onClick());
 await act(async()=>button(mounted,'Delete custom food').props.onClick());
 assert.equal(db.tables.foods[0].is_archived,true);assert.equal(db.tables.foods[0].is_favourite,false);assert.equal(db.tables.meal_logs[0].kcal,200);assert.equal(db.tables.meal_logs[0].food_id,'custom');
 assert.equal(mounted.root.findAllByProps({'aria-label':'Delete custom food My oats'}).length,0);
});

test('timer ring uses fractional remaining time while its number stays in seconds',async()=>{
 const Ring=mountSource('components/Timers.js',database({}),'TimerRing');await act(async()=>{mounted=create(React.createElement(Ring,{left:30,total:60,remainingMs:29250}));});
 const fill=mounted.root.findAllByType('circle')[1];assert.ok(Math.abs(fill.props.strokeDashoffset-2*Math.PI*104*(1-29.25/60))<0.001);assert.match(text(mounted.toJSON()),/0:30/);
});

test('photo compare changes both choices to matching views and retains legacy photos',async()=>{
 const photos=[{id:'f1',pose:'front',slot:'am',date:'2026-09-01',storage_path:'f1'},{id:'b1',pose:'back',slot:'am',date:'2026-09-01',storage_path:'b1'},{id:'b2',pose:'back',slot:'pm',date:'2026-09-02',storage_path:'b2'},{id:'old',slot:'am',date:'2026-08-01',storage_path:'old'}];
 const db=database({});db.storage={from:()=>({createSignedUrl:async p=>({data:{signedUrl:'https://example.test/'+p}})})};const Compare=mountSource('components/PhotoCompare.js',db);
 await act(async()=>{mounted=create(React.createElement(Compare,{photos,daily:[]}));});await flush();
 await act(async()=>mounted.root.findByProps({'aria-label':'Photo view'}).props.onChange({target:{value:'back'}}));await flush();
 assert.deepEqual(mounted.root.findAllByType('select').slice(1).map(x=>x.props.value),['b1','b2']);
 assert.ok(mounted.root.findAllByType('select').slice(1).every(x=>x.findAllByType('option').length===2));
 await act(async()=>mounted.root.findByProps({'aria-label':'Photo view'}).props.onChange({target:{value:'legacy'}}));await flush();assert.equal(mounted.root.findAllByType('select')[1].props.value,'old');
});


test('Today renders body and food while programme requests are still pending',async()=>{
 const never=new Promise(()=>{});const q=new Proxy({}, {get:(_,key)=>key==='then'?never.then.bind(never):()=>q});
 const Today=mountSource('components/Today.js',{from:()=>q});
 await act(async()=>{mounted=create(React.createElement(Today,{userId:'test-user'}));});
 const content=text(mounted.toJSON());assert.match(content,/Body/);assert.match(content,/Food/);assert.match(content,/Loading today/);assert.doesNotMatch(content,/Full rest day/);
});

// ---------- Fuel ----------
const FUEL_PRODUCTS = [
  { id: 'gel-std', user_id: null, name: 'Decathlon Aptonia gel (standard)', kind: 'gel', carbs_g: 25, ratio: null, note: 'Single-carbohydrate.' },
  { id: 'gel-dual', user_id: null, name: 'Decathlon Aptonia gel 1:0.8', kind: 'gel', carbs_g: 30, ratio: '1:0.8 glucose:fructose', note: 'Dual-source.' },
  { id: 'iso', user_id: null, name: 'Isotonic drink', kind: 'drink', carbs_g: 30, ratio: null, note: null },
];
const RUN = { id: 'run-1', date: date(), run_type: 'long', duration_min: 120, water_ml: null, isotonic_ml: null };
function fuelDb(overrides = {}) {
  return database({
    fuel_products: FUEL_PRODUCTS, fuel_logs: [], runs: [{ ...RUN, ...overrides }],
    v_run_fuel: [{ run_id: 'run-1', date: date(), duration_min: 120, carbs_g: 0, fluid_ml: 0, carbs_per_hr: 0, ml_per_hr: 0, timeline: null }],
  });
}
async function mountFuel(db) {
  const Fuel = mountSource('components/Fuel.js', db);
  await act(async () => { mounted = create(React.createElement(Fuel, { userId: 'test-user', run: RUN, onClose() {}, onChanged() {} })); });
  await flush();
  return mounted;
}

test('fuel records which gel was taken and the minute it was taken', async () => {
  const db = fuelDb();
  const tree = await mountFuel(db);
  await act(async () => tree.root.findByProps({ id: 'fuel-minute' }).props.onChange({ target: { value: '45' } }));
  await act(async () => button(tree, 'Add').props.onClick());
  await flush();
  assert.equal(db.tables.fuel_logs.length, 1);
  const row = db.tables.fuel_logs[0];
  assert.equal(row.at_minute, 45);
  assert.equal(row.qty, 1);
  assert.equal(row.product_id, 'gel-std');
  assert.equal(row.run_id, 'run-1');
  assert.equal(row.user_id, 'test-user');
});

test('fuel refuses a minute past the end of the run rather than recording it', async () => {
  const db = fuelDb();
  const tree = await mountFuel(db);
  await act(async () => tree.root.findByProps({ id: 'fuel-minute' }).props.onChange({ target: { value: '300' } }));
  await act(async () => button(tree, 'Add').props.onClick());
  await flush();
  assert.equal(db.tables.fuel_logs.length, 0);
  assert.match(text(tree.root.findByProps({ role: 'alert' })), /120 min/);
});

test('isotonic volume mirrors a carbohydrate row so carbs per hour is not understated', async () => {
  const db = fuelDb();
  const tree = await mountFuel(db);
  await act(async () => tree.root.findByProps({ id: 'fuel-isotonic' }).props.onChange({ target: { value: '1000' } }));
  await act(async () => tree.root.findByProps({ id: 'fuel-water' }).props.onChange({ target: { value: '500' } }));
  await act(async () => button(tree, 'Save fluid').props.onClick());
  await flush();
  assert.equal(db.tables.runs[0].isotonic_ml, 1000);
  assert.equal(db.tables.runs[0].water_ml, 500);
  // 1000 ml = two 500 ml servings = 60 g carbohydrate the view would otherwise miss.
  const mirrored = db.tables.fuel_logs.filter(r => r.product_id === 'iso');
  assert.equal(mirrored.length, 1);
  assert.equal(mirrored[0].qty, 2);
});

test('clearing isotonic removes its mirrored carbohydrate row', async () => {
  const db = fuelDb({ isotonic_ml: 500 });
  db.tables.fuel_logs.push({ id: 'existing-iso', user_id: 'test-user', run_id: 'run-1', date: date(), product_id: 'iso', at_minute: 0, qty: 1 });
  const tree = await mountFuel(db);
  await act(async () => tree.root.findByProps({ id: 'fuel-isotonic' }).props.onChange({ target: { value: '' } }));
  await act(async () => button(tree, 'Save fluid').props.onClick());
  await flush();
  assert.equal(db.tables.runs[0].isotonic_ml, null);
  assert.equal(db.tables.fuel_logs.filter(r => r.product_id === 'iso').length, 0);
});

// ---------- ACWR transparency ----------
const ACWR = {
  basis: 'time', unit: 'minutes',
  formula: 'ACWR = acute ÷ chronic.',
  why_time: 'Time is the default basis.',
  acute_window: '2026-09-09 to 2026-09-15', chronic_window: '2026-08-19 to 2026-09-15',
  acute: 66, total_28d: 379.2, chronic_avg: 94.8, ratio: 0.7,
  bands: [
    { range: '> 1.5', meaning: 'Spike.' }, { range: '1.3 – 1.5', meaning: 'Climbing fast.' },
    { range: '0.8 – 1.3', meaning: 'Sensible progression.' }, { range: '< 0.8', meaning: 'Detraining or deliberate cutback.' },
  ],
  caveat: 'Gabbett thresholds are contested.',
  rows: [{ date: '2026-09-14', kind: 'run', value: 66, in_acute: true }, { date: '2026-08-30', kind: 'lift', value: 45, in_acute: false }],
};

test('load detail shows the arithmetic and marks the band the ratio falls in', async () => {
  const db = database({}, () => false, { acwr_detail: ({ basis }) => ({ ...ACWR, basis }) });
  const Acwr = mountSource('components/AcwrDetail.js', db);
  await act(async () => { mounted = create(React.createElement(Acwr, { onClose() {} })); });
  await flush();
  const all = text(mounted.root.findByType('div'));
  assert.match(all, /0\.70/);          // the ratio itself
  assert.match(all, /66/);             // acute
  assert.match(all, /94\.8/);          // chronic average
  assert.match(all, /Detraining or deliberate cutback/); // the band it lands in
  assert.match(all, /contested/);      // the honest caveat survives
  // every contributing session is listed, flagged for its window
  assert.match(all, /2026-09-14|14 Sep/);
  assert.match(all, /2026-08-30|30 Aug/);
});

test('load detail re-asks the database when the basis changes', async () => {
  const db = database({}, () => false, { acwr_detail: ({ basis }) => ({ ...ACWR, basis, unit: basis === 'distance' ? 'km' : 'minutes' }) });
  const Acwr = mountSource('components/AcwrDetail.js', db);
  await act(async () => { mounted = create(React.createElement(Acwr, { onClose() {} })); });
  await flush();
  await act(async () => button(mounted, 'Distance').props.onClick());
  await flush();
  const calls = db.writes.filter(w => w.op === 'rpc').map(w => w.args.basis);
  assert.deepEqual(calls, ['time', 'distance']);
  assert.match(text(mounted.root.findByType('div')), /km/);
});
