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
function database(seed, fail = () => false) {
  const tables = structuredClone(seed), writes = [];
  return { tables, writes, from(table) {
    const q = { table, op: 'select', filters: [], body: null };
    const b = {
      select() { return b; }, eq(k,v) { q.filters.push(r=>r[k]===v); return b; },
      gte(k,v) { q.filters.push(r=>r[k]>=v); return b; }, lte(k,v) { q.filters.push(r=>r[k]<=v); return b; },
      is(k,v) { q.filters.push(r=>r[k]===v); return b; }, order() { return b; }, limit(n) { q.limit=n; return b; },
      maybeSingle() { q.single=true; return b; }, single() { q.single=true; return b; },
      insert(body) { q.op='insert'; q.body=body; return b; }, upsert(body) { q.op='upsert'; q.body=body; return b; },
      update(body) { q.op='update'; q.body=body; return b; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (q.op!=='select') writes.push(q);
          if (fail(q)) return { data:null, error:{ message:'Simulated unavailable connection' } };
          tables[table] ||= [];
          let rows=tables[table].filter(r=>q.filters.every(f=>f(r)));
          if (q.op==='insert' || q.op==='upsert') {
            rows=[];
            for (const value of Array.isArray(q.body)?q.body:[q.body]) {
              const existing=tables[table].find(r=>r.id && r.id===value.id);
              if (existing && q.op==='upsert') continue;
              const row={id:value.id||`test-${table}-${tables[table].length}`,logged_at:new Date().toISOString(),...value};
              tables[table].push(row); rows.push(row);
            }
          } else if (q.op==='update') rows.forEach(r=>Object.assign(r,q.body));
          if(q.limit) rows=rows.slice(0,q.limit);
          return {data:structuredClone(q.single?(rows[0]||null):rows),error:null};
        }).then(resolve,reject);
      }
    }; return b;
  }};
}

function mountSource(file, db) {
  const cache=new Map();
  function load(filename) {
    if(filename.endsWith('.css')) return {};
    if(cache.has(filename)) return cache.get(filename).exports;
    const mod=new Module(filename, module); mod.filename=filename; mod.paths=Module._nodeModulePaths(path.dirname(filename)); cache.set(filename,mod);
    mod.require=name=> {
      if(name.endsWith('/supabase')) return {supa:()=>db,today:date};
      if(name.startsWith('.')) {
        const target=path.resolve(path.dirname(filename),name);
        return load(fs.existsSync(target)?target:target+'.js');
      }
      return require(name);
    };
    const result=swc.transformSync(fs.readFileSync(filename,'utf8'),{filename,isModule:true,jsc:{parser:{syntax:'ecmascript',jsx:true},target:'es2020',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
    mod._compile(result.code,filename); return mod.exports;
  }
  return load(path.join(root,file)).default;
}
const text = n => typeof n==='string'?n:!n?'':(n.children||[]).map(text).join(' ');
const buttons = tree => tree.root.findAllByType('button');
const button = (tree, label) => { const b=buttons(tree).find(n=>text(n).includes(label)); assert.ok(b,`Missing button: ${label}`); return b; };
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
