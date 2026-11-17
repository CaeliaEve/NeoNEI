import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('production pool preview binds native rows and owns cache state for each request',async()=>{
  const {NativeBeePoolQuery,validateNativePoolRecipe,readNativePoolPreview,nativePoolNote}=await import('../../catalog/src/botania-pool.ts');
  assert.equal(typeof NativeBeePoolQuery,'function','Native pool contexts need a production preview query');
  const fixtures=await Promise.all([0,1,2,3].map(async i=>JSON.parse(await readFile(
    new URL(`../../../elysium-compiler/contracts/fixtures/botania-native-pool-${i}-contract.json`,import.meta.url),'utf8'))));
  const first=fixtures[0],recipe=first.recipe;
  let reads=0;
  const rows=new Map(first.items.map(row=>[row.id,row]));
  const category={id:recipe.category,program:recipe.process.program};
  const catalog={
    async program(id){assert.equal(id,recipe.process.program);reads++;return first.programs;},
    async record(kind,id){if(kind==='recipes')return fixtures.find(f=>f.recipe.id===id).recipe;
      if(kind==='categories')return category;if(kind==='items')return rows.get(id);throw new Error('unexpected record');},
  };
  const query=new NativeBeePoolQuery(catalog);
  const before=JSON.stringify(first);
  const offered=recipe.inputs[0].choices[0].id;
  const preview=await query.preview(recipe.id,{item:offered,mana:10});
  assert.equal(preview.scope,'serialOwnedSnapshot');
  assert.equal(preview.selection.result.state,'selected');
  assert.equal(preview.selection.result.index,0);
  assert.equal(preview.targetSelected,true);
  assert.deepEqual(readNativePoolPreview(preview),preview);
  assert.deepEqual(await query.preview(recipe.id,{item:offered,mana:10}),preview,'requests cannot share mutable simulation state');
  const blocked=await query.preview(recipe.id,{item:offered,mana:9});
  assert.deepEqual(blocked.selection.result,{state:'insufficientMana',index:0});
  assert.equal(blocked.targetSelected,false);
  assert.equal(reads,1,'shared context is loaded once without caching mutable sessions');
  assert.equal(JSON.stringify(first),before,'preview cannot mutate source-bound records');
  validateNativePoolRecipe(recipe,new Map(first.items.map(row=>[row.id,row])));
  for(const [path,value]of [['mana',99],['index',4095],['nativeRecipe','foreign.Callback']]){
    const changed=structuredClone(recipe);changed.process[path]=value;
    await assert.rejects(()=>query.validate(changed,category,new Map(first.items.map(row=>[row.id,row]))));
  }
  const changed=structuredClone(recipe);changed.outputs[0].change.samples=[{id:changed.outputs[0].id,amount:'1'}];
  assert.throws(()=>validateNativePoolRecipe(changed),/pool/i,'prototypes cannot masquerade as observed successes');
  assert.throws(()=>readNativePoolPreview({...preview,targetSelected:false}),/pool/i,'response status must agree with native selection');
  await assert.rejects(()=>query.preview(recipe.id,{item:offered,mana:2147483648}),/query/i);
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  const bill=calculateMaterials(recipe,'100');
  assert.deepEqual(bill.inputs,[],'a constructor input is not a guaranteed successful consumption');
  assert.deepEqual(bill.outputs,[],'empty native samples must not become fixed outputs');
  assert.equal(bill.uncertain.length,2,'input and output remain conditional on the native snapshot');
  assert.doesNotMatch(nativePoolNote(preview,'en-US'),/\p{Script=Han}/u);
  assert.match(nativePoolNote(preview,'zh-CN'),/\p{Script=Han}/u);
  const {Api}=await import('../../catalog/src/api.ts');
  const api=new Api(catalog);
  assert.deepEqual(await api.read(['recipes',recipe.id,'pool-preview'],new URLSearchParams({item:offered,mana:'10'})),preview,
    'the same catalog route must serve online and offline execution');
  await assert.rejects(()=>api.read(['recipes',recipe.id,'pool-preview'],new URLSearchParams({item:offered,mana:'2147483648'})),/mana/i);
});

test('cache key hashes match installed Minecraft typed NBT, including Java overflow',async()=>{
  const {nativeNbtHash,nativeNbtEqual}=await import('../../catalog/src/native-nbt.ts');
  assert.equal(typeof nativeNbtHash,'function','Native cache lookup needs a native key hash, not content IDs');
  const cases=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/native-nbt-hash-law.json',import.meta.url),'utf8'));
  for(const row of cases)assert.equal(nativeNbtHash(row.tag),row.nativeHash,`case ${row.case}`);
  assert.equal(nativeNbtEqual(cases[18].tag,cases[19].tag),true,'native equality retains its signed-zero behavior');
  assert.notEqual(nativeNbtHash(cases[18].tag),nativeNbtHash(cases[19].tag),'native cache hash is separate from equality and canonical identity');
  const tooDeep={type:'compound',value:{}};let current=tooDeep;
  for(let i=0;i<50;i++){current.value.next={type:'compound',value:{}};current=current.value.next;}
  assert.throws(()=>nativeNbtHash(tooDeep),/budget/);
});

test('native cache snapshots replay collision chains, mutable keys and access-expiry boundaries',async()=>{
  const {nativePoolCacheLookup}=await import('../../catalog/src/botania-cache.ts');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/magicbees-pool-cache-lookup.json',import.meta.url),'utf8'));
  for(const row of fixture.cases){
    const before=JSON.stringify(row.cache);
    assert.deepEqual(nativePoolCacheLookup(row.cache,row.query,row.now),row.result,row.case);
    assert.equal(JSON.stringify(row.cache),before,'single-instant lookup must not simulate cache access writes');
  }
  const row=fixture.cases[0],bad=structuredClone(row.cache);bad.mask=127;
  assert.throws(()=>nativePoolCacheLookup(bad,row.query,row.now),/cache/);
  assert.throws(()=>nativePoolCacheLookup(row.cache,row.query,'9223372036854775808'),/cache/);
});

test('owned native cache replays Guava 17 serial loads, evictions and mutable-key identity',async()=>{
  const {NativePoolCacheMachine}=await import('../../catalog/src/botania-cache.ts');
  assert.equal(typeof NativePoolCacheMachine,'function','Read-only snapshots cannot preserve ordered native cache effects');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/magicbees-pool-cache-transitions.json',import.meta.url),'utf8'));
  for(const row of fixture.observations){
    const original=JSON.stringify(row.initial),machine=new NativePoolCacheMachine(row.initial);
    for(const [i,step] of row.steps.entries()){
      let at=0,loads=0;
      const actual=machine.get(step.key,()=>{
        assert.ok(at<step.ticks.length,'the native ticker read sequence is exhaustive');
        return step.ticks[at++];
      },id=>{
        loads++;
        const key=machine.key(id);assert.equal(key.type,'compound');
        // Expectations come from real Forestry, not another copy of our parser.
        key.value=structuredClone(step.keyAfter.value);
        return step.result.kind==='nativeError'?{nativeError:true}:{chromosome:step.result.chromosome};
      });
      assert.deepEqual(actual,step.result,`${row.case}/${i}`);
      assert.deepEqual(machine.key(step.key),step.keyAfter,`${row.case}/${i} repairs`);
      assert.equal(at,step.ticks.length,`${row.case}/${i} exact ticker consumption`);
      assert.equal(loads,step.result.kind==='hit'?0:1,`${row.case}/${i} loader count`);
    }
    assert.deepEqual(machine.snapshot(),row.state,`${row.case} native final queues, weights, buckets and aliases`);
    assert.deepEqual(new NativePoolCacheMachine(row.state).snapshot(),row.state,`${row.case} populated state roundtrip`);
    assert.equal(JSON.stringify(row.initial),original,'cache transitions must own their state');
  }
});

test('owned pool law replays native repair, historical object identity and offered-stack output',async()=>{
  const {nativeBeePoolEvaluate}=await import('../../catalog/src/botania-bee.ts');
  for(const name of ['magicbees-pool-snapshot-law','magicbees-pool-cache-law']){
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/${name}.json`,import.meta.url),'utf8'));
    for(const row of fixture.observations){
      const before=JSON.stringify([fixture.source,row.input,row.reads]);
      assert.deepEqual(nativeBeePoolEvaluate(fixture.source,fixture.form,fixture.inputSpecies,fixture.outputSpecies,row.input,row.reads),row.result,`${name}/${row.case??row.result.state}`);
      assert.equal(JSON.stringify([fixture.source,row.input,row.reads]),before,'snapshot law must own all NBT repair/output writes');
    }
  }
});

test('pool callback carries native match-time repairs forward after rejection and failure',async()=>{
  const {nativeBeePoolTransition}=await import('../../catalog/src/botania-bee.ts');
  assert.equal(typeof nativeBeePoolTransition,'function','Pool priority needs the repaired offered stack even after a mismatch');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/magicbees-pool-transition-law.json',import.meta.url),'utf8'));
  for(const row of fixture.observations){
    const before=JSON.stringify([fixture.source,row.input,row.reads]);
    const actual=nativeBeePoolTransition(fixture.source,fixture.form,fixture.inputSpecies,fixture.outputSpecies,row.input,row.reads);
    assert.deepEqual(actual,row.transition,row.case);
    assert.equal(JSON.stringify([fixture.source,row.input,row.reads]),before,'transitions must own repair and result writes');
    if(actual.result.state==='matched'){
      actual.result.output.nbt.value.unrelated={type:'string',value:'changed-result'};
      assert.notEqual(actual.offeredAfter.nbt.value.unrelated.value,'changed-result','output copy cannot mutate the offered stack');
    }
  }
});

test('ordered pool selection runs match effects before catalyst checks and retains first-match mana blocking',async()=>{
  const {nativeBeePoolSelect}=await import('../../catalog/src/botania-selection.ts');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/magicbees-pool-selection-law.json',import.meta.url),'utf8'));
  for(const row of fixture.observations){
    const before=JSON.stringify(row);
    assert.deepEqual(nativeBeePoolSelect(fixture.source,row.entries,row.input,row.alchemy,row.conjuration,row.mana,row.traces),row.selection,row.case);
    assert.equal(JSON.stringify(row),before,'ordered selection cannot mutate program, trace or input');
  }
  const row=fixture.observations[0];
  assert.throws(()=>nativeBeePoolSelect(fixture.source,row.entries,row.input,row.alchemy,row.conjuration,row.mana,[{index:1,reads:[{kind:'miss'}]}]),/selection/,'unvisited callbacks cannot consume traces');
});

test('pool sessions share native cache effects and persistent per-recipe output caches',async()=>{
  const {NativeBeePoolSession}=await import('../../catalog/src/botania-session.ts');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/magicbees-pool-session.json',import.meta.url),'utf8'));
  const session=new NativeBeePoolSession(fixture.source,fixture.entries,fixture.cache);
  for(const [i,row] of fixture.observations.entries()){
    let at=0;
    const actual=session.select(row.input,row.alchemy,row.conjuration,row.mana,()=>{
      assert.ok(at<row.ticks.length);return row.ticks[at++];
    });
    assert.deepEqual(actual,row.selection,`session invocation ${i}`);
    assert.deepEqual(session.outputs(),row.outputs,`persistent output caches ${i}`);
    assert.deepEqual(session.cacheState(),row.cache,`persistent native genome cache ${i}`);
    assert.equal(at,row.ticks.length,'native cache clock-read sequence');
  }
  const last=fixture.observations.at(-1).outputs[0];
  assert.deepEqual(session.takeOutput(0),last,'getOutput returns current cached result');
  assert.deepEqual(session.takeOutput(0),fixture.entries[0].prototype,'getOutput then resets to constructor output');
  assert.throws(()=>session.select(fixture.observations[0].input,true,false,100,()=>{throw new Error('ticker unavailable');}),/ticker unavailable/);
  assert.throws(()=>session.cacheState(),/session/,'unsupported/aborted transitions cannot be reused as valid cache state');
  assert.throws(()=>session.outputs(),/session/,'a failed transition invalidates the whole detached session');
});

test('shared pool transport preserves native registry order and rejects missing or changed chunks',async()=>{
  const {reconstructNativeBeePool}=await import('../../catalog/src/botania-session.ts');
  assert.equal(typeof reconstructNativeBeePool,'function','Stateful pool rules need a bounded shared catalog transport');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/magicbees-pool-program.json',import.meta.url),'utf8'));
  const native=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/magicbees-pool-session.json',import.meta.url),'utf8'));
  const result=await reconstructNativeBeePool(fixture.program,[...fixture.chunks].reverse());
  assert.deepEqual(result.source,native.source);
  assert.deepEqual(result.entries,native.entries);
  assert.deepEqual(result.cache,native.cache);
  for(let i=0;i<fixture.chunks.length;i++){
    await assert.rejects(reconstructNativeBeePool(fixture.program,fixture.chunks.filter((_,at)=>at!==i)),/program/);
  }
  await assert.rejects(reconstructNativeBeePool(fixture.program,[...fixture.chunks,fixture.chunks[0]]),/program/);
  const changed=structuredClone(fixture.chunks);
  changed.find(chunk=>chunk.data.kind==='beePoolEntries').data.rows[0].mana++;
  await assert.rejects(reconstructNativeBeePool(fixture.program,changed),/program/);
});
