import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { effectScope } from 'vue';
import test from 'node:test';
import { Atlas, frameAt, stepAt } from '../src/catalog/atlas.ts';
import { amount, chance, ticks } from '../src/catalog/format.ts';
import { Playback } from '../src/catalog/clock.ts';
import { useRequest } from '../src/state/request.ts';
import { quantityBounds } from '../../catalog/src/quantity.ts';
import { decodeTable } from '@elysium/contracts';
import { encode } from '@msgpack/msgpack';

test('batch lookup visits keys in partition order while preserving caller order and duplicates', async () => {
  const {Catalog}=await import('../../catalog/src/store.ts');
  const visited=[];
  const reader={record:async(kind,id)=>{visited.push(id);return {id};}};
  const ids=['z','a','z','m'];
  const rows=await Catalog.prototype.records.call(reader,'browse',ids);
  assert.deepEqual(rows.map(row=>row.id),ids);
  assert.deepEqual(visited,['a','m','z']);
});

test('item page seeds icon records so rendering needs no per-icon HTTP reads', async () => {
  const {Catalog}=await import('../src/catalog/client.ts');
  const row={id:'item_fixture',kind:'item',registry:'fixture:item',meta:0,name:'Fixture',tooltip:[],terms:'fixture',icon:null};
  const reader=Object.create(Catalog.prototype);
  reader.recordCache=new Map(); reader.recordCacheBytes=0;
  let calls=0;
  reader.get=async(endpoint)=>{calls++;return endpoint.startsWith('/records/') ? row : {rows:[row],textures:[],total:1,offset:0,limit:1};};
  await reader.items({kind:'all',query:'',mod:'',group:'',collapsed:false,offset:0,limit:1});
  assert.deepEqual(await reader.record('browse',row.id),row);
  assert.equal(calls,1);
});

test('recipe index lookup batches the whole link set without changing page order or counts', async () => {
  const {Query}=await import('../../catalog/src/query.ts');
  const ids=Array.from({length:300},(_,i)=>'r'+i); let reads=0;
  const catalog={record:async()=>({recipes:ids}),records:async(kind,keys)=>{
    if(kind==='index'){reads++;return [...keys].map(id=>({id,category:'cat'}));}
    return [...keys].map(id=>({id}));
  }};
  const result=await new Query(catalog).recipes({item:'x',direction:'recipes',query:'',category:'',offset:120,limit:4});
  assert.equal(result.total,300);assert.deepEqual(result.rows.map(r=>r.id),ids.slice(120,124));
  assert.equal(reads,1);
  assert.deepEqual(result.recipeIds,ids);
});

test('native negative durability remains signed when decoding item tables', () => {
  for (const durability of [-2147483648, -16, -13, -11, -1, 0, 1234, 2147483647]) {
    const item = {id:'item_fixture',registry:'fixture:tool',meta:0,nbt:null,name:'text_fixture',tooltip:[],
      stackLimit:1,durability,tools:{},armor:false,tags:[],icon:null,order:null,aspects:null};
    const decoded = decodeTable(encode({kind:'items',records:[item]}), 'items');
    assert.equal(decoded.records[0].durability, durability);
  }
});

test('correlated inputs select a complete sample and preserve independent single-axis changes', async () => {
  const api = await import('../src/catalog/selection.ts').catch(() => null);
  assert.ok(api, 'Missing correlated recipe selection');
  const inputs = [{kind:'item',slot:0,choices:[{id:'r0'},{id:'r1'}]}, {kind:'item',slot:1,choices:[{id:'b0'},{id:'b1'}]}, {kind:'item',slot:8,choices:[{id:'b1'}]}];
  const change = {input:0,action:{kind:'integration'},bindings:[[0,0,null],[0,1,null],[1,0,null],[1,1,null],[1,null,0]],samples:[{id:'a'},{id:'b'},{id:'c'},{id:'d'},{id:'d'}]};
  const recipe = {inputs,outputs:[{change}]}, selected = {};
  api.selectRecipeSample(recipe,selected,0);
  assert.equal(api.recipeChoiceIndex(recipe,selected,inputs[2]),-1);
  api.selectRecipeChoice(recipe,selected,inputs[1],1);
  assert.equal(api.recipeSampleIndex(recipe,selected,recipe.outputs[0]),1);
  api.selectRecipeChoice(recipe,selected,inputs[0],1);
  assert.equal(api.recipeSampleIndex(recipe,selected,recipe.outputs[0]),3);
  api.selectRecipeChoice(recipe,selected,inputs[2],0);
  assert.equal(api.recipeSampleIndex(recipe,selected,recipe.outputs[0]),4);
  assert.equal(api.recipeChoiceIndex(recipe,selected,inputs[1]),-1);
  assert.throws(()=>api.selectRecipeChoice(recipe,selected,inputs[1],5),/候选|组合/);
  api.selectRecipeSample(recipe,selected,2);
  assert.equal(api.recipeChoiceIndex(recipe,selected,inputs[0]),1);
  assert.equal(api.recipeChoiceIndex(recipe,selected,inputs[1]),0);
  const simple = {inputs:[inputs[0]],outputs:[{change:{input:0,action:{kind:'patch'},samples:[{id:'x'},{id:'y'}]}}]};
  const single = {};api.selectRecipeChoice(simple,single,inputs[0],1);
  assert.equal(api.recipeSampleIndex(simple,single,simple.outputs[0]),1);
});

test('texture timelines respect frame durations and interpolation while quantities stay exact', () => {
  const texture = { frames: [{ ticks: 2 }, { ticks: 1 }, { ticks: 3 }], interpolate: true };
  assert.deepEqual(frameAt(texture, 75), { index: 0, next: 1, blend: 0.75 });
  assert.deepEqual(frameAt(texture, 100), { index: 1, next: 2, blend: 0 });
  assert.deepEqual(frameAt(texture, 300), { index: 0, next: 1, blend: 0 });
  assert.equal(frameAt({ ...texture, interpolate: false }, 75).blend, 0);
  const clip = [{ ticks: 10 }, { ticks: 30 }, { ticks: 160 }];
  assert.equal(stepAt(clip, 499).index, 0);
  assert.equal(stepAt(clip, 500).index, 1);
  assert.equal(stepAt(clip, 10000).index, 0);
  assert.equal(stepAt(clip, -1).index, 0);
  assert.throws(() => stepAt([], 0), /时间线/);
  assert.throws(() => stepAt(clip, Number.NaN), /时间线/);
  let frame, subscriptions = 0, stopped = 0;
  const playback = new Playback(listener => { frame = listener; subscriptions++; return () => { stopped++; }; });
  let first, second;
  const releaseFirst = playback.subscribe(time => { first = time; });
  frame(100); frame(150);
  const releaseSecond = playback.subscribe(time => { second = time; });
  assert.equal(first, 50); assert.equal(second, 50); assert.equal(subscriptions, 1);
  playback.playing = false; assert.equal(stopped, 1);
  playback.playing = true; frame(1000); frame(1050);
  assert.equal(first, 100); assert.equal(second, 100);
  releaseFirst(); releaseSecond(); assert.equal(stopped, 2);
  playback.close(); assert.equal(stopped, 2);
  assert.equal(amount('9007199254740993'), '9,007,199,254,740,993');
  assert.equal(ticks('21'), '1.05 s');
  assert.equal(chance({ numerator: '1', denominator: '3' }), '1/3 · ≈33.33%');
  assert.equal(chance({ numerator: '0', denominator: '1' }), '0%');
  const squeezed={process:{kind:'forestrySqueezer',chance:{numerator:'1',denominator:'2'}}}, output={kind:'item',amount:null,change:null,chance:{numerator:'1',denominator:'1'},quantity:{kind:'squeezer',nominal:'-2'}};
  assert.deepEqual(quantityBounds({process:{kind:'forestrySqueezer',chance:{numerator:'0',denominator:'1'}}},{...output,quantity:{kind:'squeezer',nominal:'3'}}),[0n,0n]);
  assert.deepEqual(quantityBounds(squeezed,output),[-2n,0n]);
  assert.deepEqual(quantityBounds(squeezed,{...output,kind:'fluid'}),[0n,0n]);
  assert.throws(()=>quantityBounds({process:null},output));
  assert.throws(()=>quantityBounds(squeezed,{...output,quantity:{kind:'squeezer',nominal:'2147483648'}}));
});

test('request replacement and component disposal prevent late results from changing the page', async () => {
  const scope = effectScope(), request = scope.run(useRequest);
  let resolveFirst, resolveLast;
  const first = request.run(() => new Promise(resolve => { resolveFirst = resolve; }));
  await request.run(async () => 'current');
  resolveFirst('stale');
  await first;
  assert.equal(request.value.value, 'current');
  const last = request.run(() => new Promise(resolve => { resolveLast = resolve; }));
  scope.stop();
  resolveLast('after disposal');
  await last;
  assert.equal(request.value.value, 'current');
  assert.equal(request.loading.value, false);
});

test('decoded atlas pages are shared, pinned while in use, bounded and closed with the session', async context => {
  const buffers = Array.from({ length: 4 }, (_, index) => Buffer.from([index]));
  const files = buffers.map(bytes => {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return { path: 'textures/' + sha256 + '.webp', kind: 'image', bytes: bytes.length, sha256 };
  });
  let calls = 0, closed = 0;
  context.mock.method(globalThis, 'fetch', async url => {
    calls++;
    return new Response(buffers[files.findIndex(file => String(url).endsWith(file.path))]);
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => {
    let disposed = false;
    return { width: 4096, height: 4096, close() { assert.equal(disposed, false); disposed = true; closed++; } };
  } });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'createImageBitmap', original);
    else delete globalThis.createImageBitmap;
  });
  const atlas = new Atlas({ files }, 'http://localhost/assets/catalog', new AbortController().signal);
  const [first, duplicate] = await Promise.all([atlas.acquire(files[0].path), atlas.acquire(files[0].path)]);
  assert.equal(first.image, duplicate.image);
  assert.equal(calls, 1);
  const second = await atlas.acquire(files[1].path);
  const loading = await Promise.allSettled([atlas.acquire(files[2].path), atlas.acquire(files[3].path)]);
  const loaded = loading.filter(result => result.status === 'fulfilled');
  const failed = loading.findIndex(result => result.status === 'rejected');
  assert.equal(loaded.length, 1);
  assert.notEqual(failed, -1);
  assert.match(loading[failed].reason.message, /内存预算/);
  const third = loaded[0].value;
  assert.equal(closed, 1);
  first.release(); first.release(); duplicate.release();
  const fourth = await atlas.acquire(files[failed + 2].path);
  assert.equal(closed, 2);
  atlas.close();
  assert.equal(closed, 5);
  second.release(); third.release(); fourth.release();
  await assert.rejects(atlas.acquire(files[0].path), { name: 'AbortError' });
});

test('visible sprite frames span more than three atlas pages without pinning pages', async context => {
  const buffers = Array.from({length: 5}, (_, i) => Buffer.from([i]));
  const files = buffers.map(bytes => { const sha256 = createHash('sha256').update(bytes).digest('hex'); return {path:`textures/${sha256}.webp`,kind:'image',bytes:1,sha256}; });
  const live = new Set();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  Object.defineProperty(globalThis, 'createImageBitmap', {configurable:true, value:async (input, x, y, width = 4096, height = 4096) => {
    if (!(input instanceof Blob)) assert.ok(live.has(input));
    const image = {width,height,close(){ assert.ok(live.delete(image)); }}; live.add(image); return image;
  }});
  context.after(() => { if(original) Object.defineProperty(globalThis,'createImageBitmap',original); else delete globalThis.createImageBitmap; });
  const atlas = new Atlas({files}, '', new AbortController().signal, async file => buffers[files.indexOf(file)]);
  const frames = files.map(file => ({path:file.path,x:16,y:32,width:64,height:64,ticks:1}));
  const leases = await Promise.all(frames.map(frame => atlas.acquireFrame(frame)));
  assert.equal(leases.length,5);
  assert.ok([...live].filter(image => image.width === 4096).length <= 3);
  leases.forEach(lease => { assert.equal(lease.image.width,64); assert.ok(live.has(lease.image)); });
  const duplicate = await atlas.acquireFrame(frames[0]);
  assert.equal(duplicate.image,leases[0].image);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(atlas.acquireFrame(frames[0],controller.signal),{name:'AbortError'});
  await assert.rejects(atlas.acquireFrame({...frames[0],x:4090}),/裁剪/);
  duplicate.release(); leases.forEach(lease => {lease.release();lease.release();});
  atlas.close(); assert.equal(live.size,0);
});

test('browser and recipe atlases share the decoded memory ceiling',async context=>{
 const bytes=Buffer.from([9]),sha256=createHash('sha256').update(bytes).digest('hex');
 const file={path:`textures/${sha256}.webp`,kind:'image',bytes:1,sha256};
 const original=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap');let closed=0;
 Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async()=>({width:4096,height:4096,close(){closed++;}})});
 const atlases=Array.from({length:4},()=>new Atlas({files:[file]},'',new AbortController().signal,async()=>bytes));
 context.after(()=>{atlases.forEach(a=>a.close());if(original)Object.defineProperty(globalThis,'createImageBitmap',original);else delete globalThis.createImageBitmap;});
 const leases=[];for(const atlas of atlases.slice(0,3))leases.push(await atlas.acquire(file.path));
 await assert.rejects(atlases[3].acquire(file.path),/内存预算/);
 leases[0].release();const last=await atlases[3].acquire(file.path);
 assert.equal(closed,2);last.release();leases.slice(1).forEach(l=>l.release());
});

test('interleaved icons decode each atlas once and reuse released sprites within budget', async context => {
  const buffers=Array.from({length:5},(_,i)=>Buffer.from([i]));
  const files=buffers.map(bytes=>{const sha256=createHash('sha256').update(bytes).digest('hex');return {path:`textures/${sha256}.webp`,kind:'image',bytes:1,sha256};});
  let loads=0; const live=new Set();
  const original=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap');
  Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async(input,x,y,width=4096,height=4096)=>{
    const image={width,height,close(){assert.ok(live.delete(image));}};live.add(image);return image;
  }});
  context.after(()=>{if(original)Object.defineProperty(globalThis,'createImageBitmap',original);else delete globalThis.createImageBitmap;});
  const atlas=new Atlas({files},'',new AbortController().signal,async file=>{loads++;return buffers[files.indexOf(file)];});
  context.after(()=>atlas.close());
  const frames=[0,1].flatMap(x=>files.map(file=>({path:file.path,x:x*64,y:0,width:64,height:64,ticks:1})));
  const leases=await Promise.all(frames.map(frame=>atlas.acquireFrame(frame)));
  assert.equal(loads,5,'Each atlas should be decoded only once per burst');
  const image=leases[0].image;
  leases.forEach(lease=>lease.release());
  const again=await atlas.acquireFrame(frames[0]);assert.equal(again.image,image);again.release();
});

test('negative native durations are reported as anomalous rather than converted to seconds', () => {
  for (const raw of ['-2147483569', '-2147483571', '-1']) {
    assert.equal(ticks(raw), '原生耗时异常（' + raw + ' tick）');
  }
  assert.equal(ticks('0'), '0 s');
  assert.equal(ticks('21'), '1.05 s');
});

test('large browse tables keep ordering, collapsed groups and recipe search without retaining display rows', async () => {
  const { Query } = await import('../../catalog/src/query.ts');
  const rows = [
    { id:'item_a',kind:'item',registry:'mod:a',order:20,group:'g',terms:'iron first',name:'Iron A',tooltip:['full display A'],icon:null,meta:0 },
    { id:'item_b',kind:'item',registry:'mod:b',order:10,group:'g',terms:'iron other',name:'Iron B',tooltip:['full display B'],icon:null,meta:0 },
    { id:'item_c',kind:'item',registry:'other:c',order:15,group:null,terms:'copper',name:'Copper',tooltip:[],icon:null,meta:0 }
  ];
  const catalog = {
    async all(kind) { if(kind==='browse') throw new Error('Catalog index exceeds the lookup memory budget');return kind==='groups'?[{id:'g',representative:'item_a',members:['item_a','item_b'],collapsed:true,name:null,order:0}]:[]; },
    async *scan(kind) { assert.equal(kind,'browse');yield* rows; },
    async record(kind) { assert.equal(kind,'links');return {recipes:['recipe_x']}; },
    async records(kind,ids) { if(kind==='browse')return [...ids].map(id=>rows.find(r=>r.id===id));if(kind==='index')return [{id:'recipe_x',owner:'mod',handler:'machine',category:'cat',targets:['item_a']}];if(kind==='recipes')return [{id:'recipe_x'}];return []; }
  };
  const q=new Query(catalog), options={query:'',mod:'',kind:'all',group:'',collapsed:false,offset:0,limit:10};
  assert.deepEqual((await q.items(options)).rows.map(r=>r.id),['item_b','item_c','item_a']);
  assert.deepEqual((await q.items({...options,collapsed:true})).rows.map(r=>r.id),['item_a','item_c']);
  assert.deepEqual((await q.items({...options,collapsed:true,offset:1,limit:1})).rows,[rows[2]]);
  assert.deepEqual((await q.items({...options,query:'iron',collapsed:true})).rows,[rows[0]]);
  assert.deepEqual((await q.facets()).mods,[{id:'mod',count:2},{id:'other',count:1}]);
  assert.deepEqual((await q.recipes({item:'item_a',direction:'recipes',category:'',query:'iron',offset:0,limit:10})).rows,[{id:'recipe_x'}]);
});

test('offline icon bursts drain within worker capacity and cancellation does not free a running slot early', async t => {
  const saved = new Map(['window','Worker'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let instance;
  class FakeWorker extends EventTarget {
    active=new Map(); sent=[]; maximum=0;
    constructor(){super();instance=this;}
    postMessage(call){
      if('cancel' in call)return;
      this.active.set(call.id,call);this.sent.push(call);this.maximum=Math.max(this.maximum,this.active.size);
      if(call.operation.kind==='open')queueMicrotask(()=>this.reply(call.id,{manifest:{}}));
    }
    reply(id,value){this.active.delete(id);this.dispatchEvent(new MessageEvent('message',{data:{id,value}}));}
    terminate(){this.active.clear();}
  }
  Object.defineProperty(globalThis,'window',{configurable:true,value:{isSecureContext:true,indexedDB:{},Worker:FakeWorker}});
  Object.defineProperty(globalThis,'Worker',{configurable:true,value:FakeWorker});
  let local;t.after(()=>{local?.close();for(const [k,d] of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
  const {Local}=await import('../src/offline/client.ts');local=await Local.open('fixture');
  const controllers=Array.from({length:200},()=>new AbortController());
  const pending=controllers.map((c,i)=>local.get('/record/'+i,c.signal));const settled=Promise.allSettled(pending);
  assert.ok(instance.maximum<=64,'A burst exceeded the worker hard capacity');
  const started=instance.sent.filter(c=>c.operation.kind==='query').length;
  controllers[100].abort();controllers[0].abort();
  assert.equal(instance.sent.filter(c=>c.operation.kind==='query').length,started,'Canceled running request still occupies a worker slot until acknowledged');
  while(instance.active.size){const [id,call]=instance.active.entries().next().value;instance.reply(id,call.operation.endpoint);}
  const results=await settled;assert.equal(results.filter(r=>r.status==='fulfilled').length,198);assert.equal(results.filter(r=>r.status==='rejected').length,2);
  assert.ok(!instance.sent.some(c=>c.operation.endpoint==='/record/100'),'Canceled queued request was dispatched');
  assert.ok(instance.maximum<=64);
});
