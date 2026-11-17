import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { encode } from '@msgpack/msgpack';
import { canonical, collections, formats } from '@elysium/contracts';
import { Catalog, hash } from '../../catalog/src/store.ts';
import { Api } from '../../catalog/src/api.ts';
import { readGeneticReferences } from '../src/catalog/references.ts';
import { readItemAspectSources } from '../src/catalog/item-aspects.ts';
import { readLexicon } from '../src/catalog/lexicon.ts';

const search = {domain:'',root:'',query:'',offset:0,limit:20};
test('ProjectBlue native rules keep their grid predicates and hydrate only visible examples',async()=>{
  const {api}=await nativeCatalog('native-projectblue-reference','references');
  const search={mode:'all',offset:0,limit:1};
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const page=await api.read(['projectblue'],new URLSearchParams({mode:'all',offset:'0',limit:'1'}));
  assert.equal(page.definition.data.kind,'projectBlueDefinition');assert.equal(page.rules.length,3);assert.equal(page.examples.length,1);
  const {readProjectBlue}=await import('../src/catalog/projectblue.ts');
  assert.deepEqual(await readProjectBlue(read,search),page);
  assert.deepEqual(page.rules[0].data.requiredEmpty,[1,3]);assert.deepEqual(page.rules[0].data.ignored,[2,5,6,7,8]);
  const needed=new Set([...page.examples[0].data.cells.filter(Boolean).map(stack=>stack.item),page.examples[0].data.output.item]);
  assert.equal(page.related.items.length,needed.size);
  assert.deepEqual(await readProjectBlue(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),search),page);
  const bad=structuredClone(page);bad.rules[0].data.requiredEmpty=[];
  await assert.rejects(readProjectBlue(async()=>bad,search),error=>error.code==='invalid_response');
  const changed=structuredClone(page);const saw=changed.roles.find(row=>row.data.roles.includes('saw'));saw.data.maxDamage=null;
  saw.id='refrow_'+await hash(canonical({domain:saw.domain,order:saw.order,data:saw.data}));
  await assert.rejects(readProjectBlue(async()=>changed,search),error=>error.code==='invalid_response');
});
test('actual Java zero-fluid rows retain native family semantics and preparation costs', async () => {
  const { validateZeroFluidRecipe, zeroFluidNote } = await import('../../catalog/src/zero-fluid.ts');
  const { calculateMaterials } = await import('./helpers/materials.mjs');
  const { decodeTable } = await import('@elysium/contracts');
  for (const name of ['gt-zero-fluid', 'gt-presence-fluid', 'vat-zero-fluid']) {
    const value = JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`, import.meta.url), 'utf8'));
    const recipe = decodeTable(encode({kind:'recipes',records:[value.recipe]}),'recipes').records[0];
    validateZeroFluidRecipe(recipe);
    const input = recipe.inputs.find(input => input.kind === 'fluid');
    const choice = input.choices[0];
    assert.equal(choice.amount, '0');
    assert.match(zeroFluidNote(choice.rule.policy, 'en-US'), /fluid/);
    const materials = calculateMaterials(recipe, '3');
    if (name === 'gt-zero-fluid') {
      assert.equal(materials.tools.length, 0);
      assert.equal(materials.uncertain.find(row => row.kind === 'fluid').amount, '0');
    } else assert.equal(materials.tools.find(row => row.kind === 'fluid').amount, '0');
    for (const patch of [{amount:'1'}, {consume:{kind:'consume'}}, {rule:{kind:'exact'}}]) {
      const changed = structuredClone(recipe);
      Object.assign(changed.inputs.find(input => input.kind === 'fluid').choices[0], patch);
      assert.throws(() => validateZeroFluidRecipe(changed));
    }
    const changed = structuredClone(recipe); changed.source.handler = 'unknown.NativeRecipe';
    assert.throws(() => validateZeroFluidRecipe(changed));
    if (name === 'gt-presence-fluid') {
      const missing = structuredClone(recipe); missing.inputs.pop();
      assert.throws(() => validateZeroFluidRecipe(missing));
    }
  }
});
test('Forge registries retain raw templates and typed container observations through paged online/offline API',async()=>{
  const {readForgeRegistry}=await import('../src/catalog/forge-registry.ts');
  const {api}=await nativeCatalog('native-forge-registry','domains');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const search={registry:'oreDictionary',query:'fixtureWild',item:'',offset:0,limit:4,memberOffset:0,memberLimit:1,choiceOffset:0,choiceLimit:1};
  const page=await readForgeRegistry(read,search);
  assert.equal(page.total,1);assert.equal(page.rows[0].data.members[0].meta,32767);assert.equal(page.rows[0].data.members[0].amount,0);
  assert.equal(page.related.items.length,1,'Only the visible native variant should be hydrated');
  assert.equal(page.related.items[0].meta,3);assert.equal(page.related.items[0].nbt.value.raw.value,'retained');
  await assert.rejects(readForgeRegistry(async()=>page,{...search,query:'anotherGroup'}),error=>error.code==='invalid_response');
  const next=await readForgeRegistry(read,{...search,choiceOffset:1});assert.equal(next.related.items.length,1);assert.equal(next.related.items[0].meta,9);
  const empty=await readForgeRegistry(read,{...search,query:'fixtureEmpty'});assert.equal(empty.total,1);assert.deepEqual(empty.rows[0].data.members,[]);
  const fluid=await readForgeRegistry(read,{...search,registry:'fluidRegistry',query:'water',memberLimit:32});
  const tagged=fluid.rows[0].data.containers.find(container=>container.fluid.amount===250);
  assert.equal(tagged.fluid.nbt.value.batch.value,'registered');assert.equal(tagged.empty.amount,2);assert.equal(tagged.filled.amount,3);
  assert.ok(fluid.related.fluids.some(item=>item.id===tagged.fluid.id));
  const lava=await readForgeRegistry(read,{...search,registry:'fluidRegistry',query:'lava'});assert.equal(lava.rows[0].data.fluid.luminosity,15);
  assert.deepEqual(await readForgeRegistry(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),search),page);
  for(const mutation of ['items','tags','origin']){
    const bad=structuredClone(page);if(mutation==='items')bad.related.items=[];
    if(mutation==='tags')bad.related.items[0].nbt=null;
    if(mutation==='origin')bad.related.categories[0].source.owner='foreign';
    await assert.rejects(readForgeRegistry(async()=>bad,search),error=>error.code==='invalid_response');
  }
  await assert.rejects(api.read(['forge-registry'],new URLSearchParams({registry:'foreign'})),error=>error.code==='invalid_query');
});

test('EnderStorage snapshots retain unloaded channels and stored slots while paging visible contents',async()=>{
  const {readEnderStorage}=await import('../src/catalog/ender-storage.ts');
  const {api}=await nativeCatalog('enderstorage','domains');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const search={type:'item',owner:'global',query:'',frequency:'',item:'',state:'',offset:0,limit:1,slotOffset:40,slotLimit:1};
  const page=await readEnderStorage(read,search);
  assert.equal(page.total,1);assert.equal(page.states[0].data.layer,'loadedServer');
  assert.equal(page.states[0].data.contents.slots.length,54);assert.equal(page.slots[0].slots[0].amount,'7');
  assert.equal(page.related.items.length,2);
  const personal=await readEnderStorage(read,{...search,owner:'personal',slotOffset:8});
  assert.equal(personal.states[0].data.owner,'Player|Test');assert.equal(personal.states[0].data.layer,'persistedServer');assert.equal(personal.slots[0].slots[0].amount,'5');
  const tank=await readEnderStorage(read,{...search,type:'liquid',slotOffset:0});
  assert.deepEqual(tank.states[0].data.colours,[3,2,1]);assert.equal(tank.states[0].data.contents.amount,'1250');assert.equal(tank.related.fluids.length,1);
  assert.deepEqual(await readEnderStorage(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),search),page);
  const bad=structuredClone(page);bad.slots[0].slots[0].amount='9';
  await assert.rejects(readEnderStorage(async()=>bad,search),error=>error.code==='invalid_response');
  const {api:emptyApi}=await nativeCatalog('enderstorage-empty');
  const empty=await readEnderStorage(async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return emptyApi.read(url.pathname.slice(1).split('/'),url.searchParams);},search);
  assert.equal(empty.total,0);assert.equal(empty.definitions[0].data.ready,true);assert.deepEqual(empty.states,[]);
});
test('Native diagrams keep logical cells, optional quantities, template components and hydrate only visible alternatives',async()=>{
  const {readDiagrams}=await import('../src/catalog/diagrams.ts');
  const {api}=await nativeCatalog('nei-diagram');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const search={group:'',query:'',item:'',direction:'',diagram:'',offset:0,limit:1,cellOffset:0,cellLimit:1,choiceOffset:0,choiceLimit:1,annotationOffset:1,annotationLimit:8};
  const page=await readDiagrams(read,search);
  assert.equal(page.total,1);assert.equal(page.diagrams[0].data.content.cells.length,3);
  assert.equal(page.diagrams[0].data.nativeSlotInsertions,2);
  assert.deepEqual(page.definitions[0].data.selection.empty,{kind:'slotInsertionsBelow',minimum:3});
  const nativeSearch={...search,selection:'native'};
  assert.equal((await readDiagrams(read,nativeSearch)).total,0);
  assert.equal((await readDiagrams(read,{...nativeSearch,action:page.actions[0].data.key})).total,0);
  await assert.rejects(readDiagrams(async()=>page,nativeSearch),error=>error.code==='invalid_response');
  const {nativeDiagramSelected}=await import('../../catalog/src/diagrams.ts');
  const policy={...page.definitions[0].data.selection,showEmptyDiagrams:true};
  assert.equal(nativeDiagramSelected(page.diagrams[0].data,policy,{item:'native-query'}),false);
  assert.equal(nativeDiagramSelected(page.diagrams[0].data,policy,{action:page.actions[0].data.key,item:'native-query'}),true);
  for(const [visibility,key,shownWhenHeld] of [['SHOW_ON_SHIFT','shift',true],['HIDE_ON_SHIFT','shift',false],['SHOW_ON_CTRL','ctrl',true],['HIDE_ON_CTRL','ctrl',false]]) {
    const p={...policy,visibility};
    assert.equal(nativeDiagramSelected(page.diagrams[0].data,p,{item:'native-query',[key]:true}),shownWhenHeld);
    assert.equal(nativeDiagramSelected(page.diagrams[0].data,p,{item:'native-query',[key]:false}),!shownWhenHeld);
    assert.equal(nativeDiagramSelected(page.diagrams[0].data,p,{}),true);
  }
  assert.equal(page.cells[0].alternatives[0].amount,'7');assert.equal(page.related.items.length,1);assert.equal(page.related.fluids.length,0);
  const fluid=await readDiagrams(read,{...search,choiceOffset:2});assert.equal(fluid.cells[0].alternatives[0].amount,'1250');assert.equal(fluid.related.items.length,0);assert.equal(fluid.related.fluids.length,1);
  const template=await readDiagrams(read,{...search,cellOffset:2});assert.equal(template.cells[0].alternatives[0].component.meta,32767);assert.equal(template.related.items.length,0);
  const unspecified=await readDiagrams(read,{...search,choiceOffset:1});assert.equal(unspecified.cells[0].alternatives[0].amount,null);
  const wide=await readDiagrams(read,{...search,choiceOffset:3});assert.equal(wide.cells[0].alternatives[0].component.meta,65535);
  for(const item of ['item_549630af7911edcd6b306b0895bf4e3ba98e19b09bca6af80ace4733a4876ae2','item_92989dd821f654a3070578432ec4d5a11066d0e0c2ae5d842e83d440e0b0fe8d']) {
    const query=await readDiagrams(read,{...search,item,direction:'usage'});
    assert.equal(query.total,1);assert.equal(query.lookups[0].data.original.fact,item);
    assert.equal(query.matches[0].data.query,'usage');
    assert.notEqual(query.matches[0].data.component.fact,item);
    const wrong=structuredClone(query);wrong.lookups[0].data.bindings=[];
    await assert.rejects(readDiagrams(async()=>wrong,{...search,item,direction:'usage'}),error=>error.code==='invalid_response');
  }
  assert.deepEqual(await readDiagrams(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),search),page);
  assert.equal((await readDiagrams(read,{...search,action:page.actions[0].data.key})).total,1);
  await assert.rejects(readDiagrams(read,{...search,action:'unknown'}),error=>error.code==='invalid_query');
  const bad=structuredClone(page);bad.cells[0].alternatives[0].amount='1';await assert.rejects(readDiagrams(async()=>bad,search),error=>error.code==='invalid_response');
  await assert.rejects(read('/diagrams?group=unknown'),error=>error.code==='invalid_query');
  for(const params of ['selection=unknown','shift=1','ctrl=true&ctrl=false'])await assert.rejects(read('/diagrams?'+params),error=>error.code==='invalid_query');
});
test('Grouped native queries page multiple destinations without repeating the NBT binding',async()=>{
  const {readDiagrams}=await import('../src/catalog/diagrams.ts');
  const {fixture,api}=await nativeCatalog('nei-diagram-grouped');
  const item=fixture.records.find(row=>row.data.kind==='neiDiagramLookup').data.original.fact;
  const search={group:'',query:'',item,direction:'usage',diagram:'',offset:0,limit:2,cellOffset:0,cellLimit:1,choiceOffset:0,choiceLimit:1,annotationOffset:0,annotationLimit:1};
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const page=await readDiagrams(read,search);
  assert.equal(page.total,120);assert.equal(page.diagrams.length,2);assert.equal(page.matches.length,1);
  assert.equal(page.matches[0].data.diagrams.length,120);
  assert.ok(page.diagrams.every(row=>page.matches[0].data.diagrams.includes(row.data.diagram)));
  assert.equal(page.lookups[0].data.original.nbt.value['native-query-payload'].value.length,32768);
  assert.equal((await readDiagrams(read,{...search,offset:118})).diagrams.length,2);
  assert.equal((await readDiagrams(read,{...search,direction:'crafting'})).total,120);
  assert.deepEqual(await readDiagrams(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),search),page);
  for(const diagrams of [[0,0],[999]]){
    const bad=structuredClone(page);bad.matches[0].data.diagrams=diagrams;
    const row=bad.matches[0];row.id='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}));
    await assert.rejects(readDiagrams(async()=>bad,search),error=>error.code==='invalid_response');
  }
});
test('Compact diagram bindings hydrate both original and normalized item facts through online and offline reads',async()=>{
  const {readDiagrams}=await import('../src/catalog/diagrams.ts');
  const {fixture,api}=await nativeCatalog('nei-diagram-grouped','records',async fixture=>{
    for(const row of fixture.records){
      const key=row.data.kind==='neiDiagramBinding'?'component':row.data.kind==='neiDiagramLookup'?'original':null;
      if(key&&row.data[key].kind==='item')row.data[key]={kind:'itemFact',fact:row.data[key].fact};
    }
    const domain='reference_'+await hash(canonical({kind:'neiDiagrams',records:fixture.records.map(row=>row.data)}));
    for(const row of fixture.records){row.domain=domain;row.id='refrow_'+await hash(canonical({domain,order:row.order,data:row.data}));}
  });
  const item=fixture.records.find(row=>row.data.kind==='neiDiagramLookup').data.original.fact;
  const search={group:'',query:'',item,direction:'usage',diagram:'',offset:0,limit:2,cellOffset:0,cellLimit:1,choiceOffset:0,choiceLimit:1,annotationOffset:0,annotationLimit:1};
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const page=await readDiagrams(read,search);
  assert.equal(page.total,120);
  assert.equal(page.matches[0].data.component.kind,'itemFact');
  assert.equal(page.lookups[0].data.original.kind,'itemFact');
  assert.equal(page.related.items.find(record=>record.id===item).nbt.value['native-query-payload'].value.length,32768);
  assert.ok(page.related.items.some(record=>record.id===page.matches[0].data.component.fact),'The normalized binding fact must be available even when its cell is outside this page');
  assert.deepEqual(await readDiagrams(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),search),page);
  const bad=structuredClone(page);bad.related.items=bad.related.items.filter(record=>record.id!==page.matches[0].data.component.fact);
  await assert.rejects(readDiagrams(async()=>bad,search),error=>error.code==='invalid_response');
});
test('Actual five GT generators retain native material queries and the separate circuit overview',async()=>{
  const {readDiagrams}=await import('../src/catalog/diagrams.ts');
  const {api}=await nativeCatalog('gt-diagram-generators','domains');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const search={group:'',query:'',item:'',direction:'',diagram:'',offset:0,limit:1,cellOffset:0,cellLimit:1,choiceOffset:0,choiceLimit:1,annotationOffset:0,annotationLimit:1};
  const first=await readDiagrams(read,search);assert.equal(first.definitions.length,5);
  for(const definition of first.definitions){
    const page=await readDiagrams(read,{...search,group:definition.data.group});assert.ok(page.total>0);
    assert.deepEqual(await readDiagrams(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),{...search,group:definition.data.group}),page);
    if(definition.data.group.endsWith('.circuits')) {
      const overview=await readDiagrams(read,{...search,group:definition.data.group,action:page.actions[0].data.key});
      assert.equal(overview.total,1);assert.ok(page.total>overview.total);
    }
  }
});
test('Native information preserves translated text, unmatched pages and quantities with shared offline queries',async()=>{
  const {readInformation}=await import('../src/catalog/information.ts');
  const {api}=await nativeCatalog('nei-information','domains');
  const search={backend:'',query:'',item:'',document:'',includeUnmatched:true,offset:0,limit:20,linkOffset:0,linkLimit:8};
  const read=async endpoint=>{const url=new URL(endpoint,'http://fixture');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const page=await readInformation(read,search);
  assert.equal(page.total,4);
  assert.deepEqual(page.rows[0].data.items.map(link=>link.amount),['3','5']);
  assert.equal(page.rows.filter(row=>!row.data.listed).length,1);
  assert.equal(page.rows[0].data.lines[0],'Native translated paragraph');
  const shown=await readInformation(read,{...search,includeUnmatched:false});assert.equal(shown.total,3);
  const filtered=await readInformation(read,{...search,query:'Specific second'});assert.equal(filtered.total,1);
  const firstLink=await readInformation(read,{...search,document:page.rows[0].id,linkLimit:1});
  assert.equal(firstLink.rows[0].data.items.length,2);assert.equal(firstLink.links[0].items[0].amount,'3');assert.equal(firstLink.related.items.length,1);
  const nextLink=await readInformation(read,{...search,document:page.rows[0].id,linkLimit:1,linkOffset:1});assert.equal(nextLink.links[0].items[0].amount,'5');
  const bad=structuredClone(page);bad.rows[0].data.lines=['missing paragraph'];
  await assert.rejects(readInformation(async()=>bad,search),error=>error.code==='invalid_response');
  const absent=structuredClone(page);delete absent.rows[0].data.precise;
  await assert.rejects(readInformation(async()=>absent,search),error=>error.code==='invalid_response');
  await assert.rejects(read('/information?backend=unknown'),error=>error.code==='invalid_query');
});
test('Native Forestry Addons reference preserves specialties, Float rates and complete parent forms without consuming recipes',async()=>{
  const {readForestryInfo}=await import('../src/catalog/forestry-info.ts');
  const {api}=await nativeCatalog('forestry-addons','domains');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const options={mode:'produce',root:'rootBees',species:'',query:'',offset:0,limit:12};
  const list=await readForestryInfo(read,options);
  assert.equal(list.view,'species');assert.equal(list.total,2);assert.equal(list.rows.length,2);assert.equal(list.outputs.length,0);
  assert.equal(list.related.items.length,2,'Species overview hydrated every product item');
  const products=await readForestryInfo(read,{...options,species:list.rows[0].data.species});
  assert.equal(products.view,'outputs');assert.equal(products.total,3);
  assert.equal(products.rows.filter(row=>row.data.role==='specialty').length,1);
  assert.ok(products.rows.some(row=>row.data.amount==='5'));
  assert.ok(products.rows.some(row=>row.data.rate.decimal==='1.5E-4'));
  assert.equal(products.species[0].data.jubilance,'§eNative fixture jubilance');
  const breeds=await readForestryInfo(read,{...options,mode:'breeding'});
  assert.equal(breeds.total,2,'Secret route was leaked or duplicate registration lost');
  assert.equal(breeds.rows[0].data.base.decimal,'0.015');assert.equal(breeds.species[0].data.specimens.length,3);
  assert.deepEqual(await readForestryInfo(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),{...options,mode:'breeding'}),breeds);
  await assert.rejects(readForestryInfo(async()=>({...products,related:{...products.related,items:[]}}),{...options,species:list.rows[0].data.species}),error=>error.code==='invalid_response');
  await assert.rejects(read('/forestry-info?mode=invalid'),error=>error.code==='invalid_query');
});
test('Native lathe rules page only hydrates current states and preserves next-state and tool break semantics',async()=>{
  const {readLathe}=await import('../src/catalog/lathe.ts');
  const {fixture,api}=await nativeCatalog('lathe-reference');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const options={workpiece:'',state:'',tool:'',toolState:'',offset:0,limit:12,toolOffset:0,toolLimit:12};
  const page=await readLathe(read,options);
  assert.equal(page.workpieces.length,2);assert.equal(page.tools.length,1);
  assert.deepEqual(page.state.data.lanes,[3,3,3,3,3]);assert.equal(page.state.data.transitions[0].roll.tickets,1677722);
  assert.ok(page.related.items.length<30,'A state page hydrated the complete workpiece state graph');
  const after=page.state.data.transitions[0].after;
  const next=await readLathe(read,{...options,workpiece:page.workpiece.data.workpiece,state:after});
  assert.deepEqual(next.state.data.lanes,[2,3,3,3,3]);
  const last=fixture.records.find(row=>row.data.kind==='latheToolState'&&row.data.damage===49);
  const worn=await readLathe(read,{...options,toolState:last.data.item});assert.equal(worn.toolState.data.after,null);
  const emptyTool=await readLathe(read,{...options,tool:'none'});assert.equal(emptyTool.tool,null);assert.equal(emptyTool.toolState,null);
  assert.deepEqual(await readLathe(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),options),page);
  const bad=structuredClone(page);bad.state.data.transitions[0].roll.tickets--;
  await assert.rejects(readLathe(async()=>bad,options),error=>error.code==='invalid_response');
  await assert.rejects(readLathe(async()=>({...page,related:{...page.related,items:[]}}),options),error=>error.code==='invalid_response');
  await assert.rejects(read('/lathe?state='+page.workpieces[1].data.workpiece),error=>error.code==='invalid_query');
});
test('Native firework callback samples retain grid colors, conditional Flight and malformed NBT outcomes',async()=>{
  const {readFireworks}=await import('../src/catalog/fireworks.ts');
  const {evaluateFireworkExample}=await import('../../catalog/src/fireworks.ts');
  const {fixture,api}=await nativeCatalog('firework-reference');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const options={offset:0,limit:100};
  const page=await readFireworks(read,options);
  assert.equal(page.total,fixture.records.length-1);
  const items=new Map(page.related.items.map(item=>[item.id,item]));
  for(const row of page.examples){
    const output=evaluateFireworkExample(page.definition.data,row.data,items);
    if(row.data.failure)assert.equal(output.status,'malformedExplosion');
    else if(!row.data.output)assert.equal(output.status,'unmatched');
    else{assert.equal(output.status,'output');const item=items.get(row.data.output.item);assert.equal(output.registry,item.registry);assert.equal(output.meta,item.meta);assert.deepEqual(output.nbt,item.nbt);}
  }
  const emptyRocket=page.examples.find(row=>row.data.label==='rocket-3-0');
  assert.deepEqual(items.get(emptyRocket.data.output.item).nbt,{type:'compound',value:{}});
  assert.ok(page.examples.find(row=>row.data.label==='fade-wrong-explosion').data.failure);
  assert.ok(page.related.items.every(item=>item.nbt?.type!=='compound'||!item.nbt.value.Explosion||item.nbt.value.Explosion.type==='compound'));
  const overwrite=structuredClone(page);overwrite.examples.find(row=>row.data.failure).data.failure.inputs[0].slot=1;
  await assert.rejects(readFireworks(async()=>overwrite,options),error=>error.code==='invalid_response');
  assert.deepEqual(await readFireworks(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),options),page);
  const bad=structuredClone(page);bad.examples[0].data.output.amount='3';
  await assert.rejects(readFireworks(async()=>bad,options),error=>error.code==='invalid_response');
  await assert.rejects(readFireworks(async()=>({...page,related:{...page.related,items:[]}}),options),error=>error.code==='invalid_response');
});

test('Et Futurum firework samples retain three rockets and flight without a star',async()=>{
  const {api}=await nativeCatalog('fireworks-fixed');
  const {readFireworks}=await import('../src/catalog/fireworks.ts');
  const {evaluateFirework}=await import('../../catalog/src/fireworks.ts');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const page=await readFireworks(read,{offset:0,limit:100}),sample=page.examples.find(row=>row.data.label==='rocket-3-0');
  const result=evaluateFirework(page.definition.data,sample.data.inputs,new Map(page.related.items.map(item=>[item.id,item])));
  assert.equal(result.amount,'3');assert.equal(result.nbt.value.Fireworks.value.Flight.value,'3');
  assert.equal(result.nbt.value.Fireworks.value.Explosions,undefined);
  const bad=structuredClone(page);bad.definition.data.outputAmount='1';
  await assert.rejects(readFireworks(async()=>bad,{offset:0,limit:100}),error=>error.code==='invalid_response');
});

test('TGreg inventory displays preserve raw templates and reject altered material bindings',async()=>{
  const {api}=await nativeCatalog('tconstruct-tgreg-display');
  const {readToolMaterials}=await import('../src/catalog/tool-materials.ts');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const options={domain:'',query:'',offset:0,limit:20},page=await readToolMaterials(read,options);
  assert.equal(page.parts[0].data.template.nbt,null);assert.equal(page.parts[0].data.displayBinding.material,'Iron');
  assert.equal(page.related.items[0].nbt.value.material.value,'Iron');
  for(const absent of [false,true]){
    const bad=structuredClone(page);
    if(absent)delete bad.parts[0].data.displayBinding;else bad.parts[0].data.displayBinding.material='Gold';
    await assert.rejects(readToolMaterials(async()=>bad,options),error=>error.code==='invalid_response');
  }
});
test('Native furnace fuel rules preserve ordered duplicates, exhausted containers and page hydration',async()=>{
  const {readFurnaceFuels}=await import('../src/catalog/furnace-fuels.ts');
  const {fixture,api}=await nativeCatalog('fuel-reference');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const options={query:'',item:'',offset:0,limit:2};
  const page=await readFurnaceFuels(read,options);
  assert.equal(page.total,4);assert.deepEqual(page.rows.map(row=>row.data.burnTicks),[1600,20000]);
  assert.equal(page.rows[1].data.candidates[0].container.amount,'1');
  assert.equal(page.related.items.length,3);
  const second=await readFurnaceFuels(read,{...options,offset:2});
  assert.equal(second.rows[0].data.candidates[0].container.amount,'2');
  assert.equal(second.rows[1].data.candidates[0].item,page.rows[0].data.candidates[0].item);
  assert.deepEqual(await readFurnaceFuels(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),options),page);
  assert.equal((await readFurnaceFuels(read,{...options,item:page.rows[0].data.candidates[0].item})).total,2);
  assert.equal((await readFurnaceFuels(read,{...options,query:'minecraft:lava_bucket'})).total,1);
  assert.equal((await readFurnaceFuels(read,{...options,query:'missing native fuel'})).total,0);
  assert.equal((await readFurnaceFuels(read,{...options,offset:4})).rows.length,0);
  const bad=structuredClone(page);bad.rows[0].data.burnTicks=1;
  await assert.rejects(readFurnaceFuels(async()=>bad,options),error=>error.code==='invalid_response');
  await assert.rejects(readFurnaceFuels(async()=>({...page,related:{...page.related,items:[]}}),options),error=>error.code==='invalid_response');
  await assert.rejects(read('/furnace-fuels?limit=101'),error=>error.code==='invalid_query');
  assert.equal(fixture.records.length,5);
});
test('Actual Java dynamic fuel rules hydrate every branch and retain resource policy without fixed returns',async()=>{
  const {readFurnaceFuels}=await import('../src/catalog/furnace-fuels.ts');
  const {fixture,api}=await nativeCatalog('fuel-dynamic-semantic');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const options={query:'',item:'',offset:0,limit:20};
  const page=await readFurnaceFuels(read,options);
  assert.deepEqual(page.rows,fixture.records.slice(1));assert.equal(page.total,14);
  assert.ok(page.rows.every(row=>row.data.candidates.every(candidate=>candidate.container===null&&candidate.containerRule)));
  const crystal=page.rows.at(-1).data.candidates[0].containerRule;
  assert.equal(crystal.kind,'bloodMagicLavaCrystal');assert.equal(crystal.energyUsed,25);
  assert.equal(crystal.resourcePolicy,'ownerNameServerWorldZeroCreateNetworkDebitIfEnough');
  const ids=new Set(page.related.items.map(item=>item.id));
  for(const row of page.rows)for(const candidate of row.data.candidates){
    const rule=candidate.containerRule;
    for(const id of rule.kind==='railcraftFirestone'?[rule.degradedBase,rule.normalReturn?.item,rule.degradedReturn?.item]:[rule.returned.item])
      if(id)assert.ok(ids.has(id),'Dynamic branch item was not hydrated');
  }
  const degraded=page.rows[0].data.candidates[0].containerRule.degradedBase;
  assert.ok((await readFurnaceFuels(read,{...options,item:degraded})).total>0);
  assert.deepEqual(await readFurnaceFuels(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),options),page);
  const missing=structuredClone(page);missing.related.items=missing.related.items.filter(item=>item.id!==degraded);
  await assert.rejects(readFurnaceFuels(async()=>missing,options),error=>error.code==='invalid_response');
  for(const field of ['degradationThreshold','normalReturn']){
    const bad=structuredClone(page),row=bad.rows[0],rule=row.data.candidates[0].containerRule;
    if(field==='degradationThreshold')rule.degradationThreshold='0.5';else rule.normalReturn.amount='2';
    row.id='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}));
    await assert.rejects(readFurnaceFuels(async()=>bad,options),error=>error.code==='invalid_response');
  }
});

test('Native quest requirements and one-of rewards survive strict online/offline declaration queries',async()=>{
  const {readQuests}=await import('../src/catalog/quests.ts');
  const {fixture,api}=await nativeCatalog('betterquesting-rules');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const options={query:'',quest:'',item:'',offset:0,limit:20};
  const page=await readQuests(read,options);assert.equal(page.total,1);
  const quest=page.rows[0].data;
  assert.equal(quest.tasks.length,13);assert.equal(quest.rewards.length,6);
  assert.equal(quest.tasks[0].rule.items.length,17);
  assert.equal(quest.tasks[1].rule.optional,true);
  assert.equal(quest.rewards[1].rule.selectionCount,1);
  assert.equal(quest.rewards[4].rule.criteria,'deathCount');
  assert.deepEqual(quest.prerequisites.map(row=>row.state),['hidden','missing']);
  assert.deepEqual(await readQuests(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),options),page);
  assert.equal((await readQuests(read,{...options,quest:quest.questUuid})).total,1);
  assert.equal((await readQuests(read,{...options,quest:'00000000-0000-0000-0000-000000000002'})).total,0);
  assert.equal((await readQuests(read,{...options,item:fixture.items[0].id})).total,1);
  assert.equal((await readQuests(read,{...options,query:'not-a-native-quest'})).total,0);
  assert.equal((await readQuests(read,{...options,offset:1})).rows.length,0);
  const bad=structuredClone(page);bad.rows[0].data.rewards[1].rule.selectionCount=2;
  await assert.rejects(readQuests(async()=>bad,options),error=>error.code==='invalid_response');
  await assert.rejects(readQuests(async()=>({...page,related:{...page.related,items:[]}}),options),error=>error.code==='invalid_response');
  const wrong=structuredClone(page);wrong.rows[0].data.prerequisites[0].state='visible';
  await assert.rejects(readQuests(async()=>wrong,options),error=>error.code==='invalid_response');
  const extra=structuredClone(page);extra.rows[0].data.tasks[6].rule.consume=true;
  await assert.rejects(readQuests(async()=>extra,options),error=>error.code==='invalid_response');
  assert.ok(!JSON.stringify(page).includes('PRIVATE PLAYER HISTORY'));
  assert.ok(!JSON.stringify(page).includes('PRIVATE HIDDEN DECLARATION'));
  assert.equal(page.related.fluids[0].id,fixture.fluids[0].id);
});
test('Bartworks mineral API preserves disabled layers, both variants and duplicate native lookups',async()=>{
  const {readBartworksOres}=await import('../src/catalog/bartworks-ores.ts');
  const {api}=await nativeCatalog('bartworks-ores');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const options={mode:'layers',query:'',dimension:'',item:'',offset:0,limit:20};
  const page=await readBartworksOres(read,options);assert.equal(page.total,2);
  assert.equal(page.rows[1].data.enabled,false);assert.equal(page.rows[1].data.activeOrdinal,null);
  assert.equal(page.lookups[0].data.layers.length,4);assert.equal(page.companions[0].data.samples.length,2);
  const material=await readBartworksOres(read,{...options,mode:'materials'});assert.equal(material.total,1);assert.equal(material.rows[0].data.oreFeature,true);assert.equal(material.rows[0].data.smallOreFeature,false);
  assert.equal((await readBartworksOres(read,{...options,query:'disabled'})).total,1);
  assert.equal((await readBartworksOres(read,{...options,offset:2})).rows.length,0);
  assert.deepEqual(await readBartworksOres(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),options),page);
  const corrupt=structuredClone(page);corrupt.rows[0].data.roles[0].bartworks=false;
  await assert.rejects(readBartworksOres(async()=>corrupt,options),error=>error.code==='invalid_response');
  await assert.rejects(readBartworksOres(async()=>({...page,related:{...page.related,items:[]}}),options),error=>error.code==='invalid_response');
});
test('GT minerals preserve live heights, layers, hosts and non-finite display shares through shared API',async()=>{
  const {readGtMinerals}=await import('../src/catalog/gt-minerals.ts');
  const options={family:'',dimension:'',query:'',item:'',offset:0,limit:20};
  for(const field of ['small','veins']){
    const {api}=await nativeCatalog('gt-minerals',field);
    const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
    const page=await readGtMinerals(read,options);assert.equal(page.total,1);
    assert.equal(page.rows[0].data.roles.length,field==='small'?1:4);
    assert.equal(page.rows[0].data.roles[0].hosts.length,7);
    assert.ok(page.rows[0].data.dimensions.some(row=>row.name==='Nether'&&!row.enabled));
    if(field==='small'){
      assert.equal(page.rows[0].data.configured.amount,0);assert.equal(page.rows[0].data.generator.amount,1);
      assert.equal(page.rows[0].data.generator.maxY,11);assert.equal(page.rows[0].data.drops[0].amount,2);
      assert.equal(page.shares[0].data.nativeShare,null);assert.equal(page.shares[0].data.nonFinite,'nan');
    }else{assert.equal(page.rows[0].data.drops.length,0);assert.equal(page.shares[0].data.nativeShare,'1.0');}
    assert.equal((await readGtMinerals(read,{...options,query:'fixture'})).total,1);
    assert.equal((await readGtMinerals(read,{...options,item:page.rows[0].data.roles[0].hosts[0].item})).total,1);
    assert.equal((await readGtMinerals(read,{...options,offset:1})).rows.length,0);
    assert.deepEqual(await readGtMinerals(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),options),page);
    const altered=structuredClone(page);altered.rows[0].data.roles[0].hosts.pop();
    await assert.rejects(readGtMinerals(async()=>altered,options),error=>error.code==='invalid_response');
    await assert.rejects(readGtMinerals(async()=>({...page,shares:[]}),options),error=>error.code==='invalid_response');
    await assert.rejects(readGtMinerals(async()=>({...page,related:{...page.related,items:[]}}),options),error=>error.code==='invalid_response');
    await assert.rejects(read('/gt-minerals?family=unknown'),error=>error.code==='invalid_query');
  }
});
test('Underground fluids keep native tickets, projection and unresolved configs through shared API',async()=>{
  const {readUndergroundFluids}=await import('../src/catalog/underground-fluids.ts');
  const {api}=await nativeCatalog('underground-fluids');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const options={dimension:'',query:'',fluid:'',offset:0,limit:20};
  const page=await readUndergroundFluids(read,options);
  assert.equal(page.total,6);assert.equal(page.dimensions[0].data.nullTickets,3);
  assert.equal(page.related.fluids.length,5);assert.equal(page.displays.length,5);
  assert.equal(page.rows.filter(row=>row.data.fluid===null).length,1);
  assert.ok(page.rows.every(row=>row.data.selectedTickets>=166&&row.data.selectedTickets<=167));
  assert.equal(page.displays[0].data.nativeChance,1666);
  const second=await readUndergroundFluids(read,{...options,offset:2,limit:2});
  assert.equal(second.rows.length,2);assert.equal(second.related.fluids.length,2);
  assert.equal((await readUndergroundFluids(read,{...options,query:'fixture_oil_5'})).related.fluids.length,0);
  assert.equal((await readUndergroundFluids(read,{...options,dimension:'0'})).total,6);
  assert.deepEqual(await readUndergroundFluids(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),options),page);
  const changed=structuredClone(page);changed.rows[0].data.selectedTickets++;
  await assert.rejects(readUndergroundFluids(async()=>changed,options),error=>error.code==='invalid_response');
  await assert.rejects(readUndergroundFluids(async()=>({...page,displays:[]}),options),error=>error.code==='invalid_response');
  await assert.rejects(readUndergroundFluids(async()=>({...page,related:{...page.related,fluids:[]}}),options),error=>error.code==='invalid_response');
  await assert.rejects(read('/underground-fluids?dimension=not-real'),error=>error.code==='invalid_query');
});
test('BBAB tree retains all eligible routes, native first ancestry and analyzed specimens',async()=>{
  const {readBeeTree}=await import('../src/catalog/bee-tree.ts');
  const {api}=await nativeCatalog('bee-tree');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const options={species:'',direction:'origins',query:'',offset:0,limit:20};
  const page=await readBeeTree(read,options);
  assert.equal(page.total,2);assert.equal(page.rows.length,2);
  assert.equal(page.rows[0].data.result,page.rows[1].data.result);
  assert.deepEqual(page.rows[0].data.chance,{numerator:'3',denominator:'40'});
  const result=page.rows[0].data.result;
  const tree=await readBeeTree(read,{...options,species:result});
  assert.equal(tree.lineage.route.data.ordinal,0);
  assert.equal(tree.lineage.children.length,2);
  assert.equal(tree.lineage.children[0].route,null);
  assert.equal(tree.related.items.length,6);
  assert.equal((await readBeeTree(read,{...options,species:'fixture.bee.a',direction:'crosses'})).total,2);
  assert.equal((await readBeeTree(read,{...options,query:'missing'})).total,0);
  assert.equal((await readBeeTree(read,{...options,offset:1,limit:1})).rows.length,1);
  assert.deepEqual(await readBeeTree(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),{...options,species:result}),tree);
  const missing=structuredClone(tree);missing.related.items=[];
  await assert.rejects(readBeeTree(async()=>missing,{...options,species:result}),error=>error.code==='invalid_response');
  const hidden=structuredClone(page);hidden.rows[0].data.secret=true;
  await assert.rejects(readBeeTree(async()=>hidden,options),error=>error.code==='invalid_response');
  await assert.rejects(api.read(['bee-tree'],new URLSearchParams({direction:'invalid'})),error=>error.code==='invalid_query');
});
test('Reactor reference preserves fuel units, four product roles and state-dependent extraction',async()=>{
  const {readDraconicReactor}=await import('../src/catalog/draconic-reactor.ts');
  const {api}=await nativeCatalog('draconic-reactor');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const page=await readDraconicReactor(read);
  assert.equal(page.definition.data.consuming,false);
  assert.deepEqual(page.definition.data.fuels.map(row=>row.units),['1296','144','16']);
  assert.deepEqual(page.definition.data.products.map(row=>row.units),['16','144','1296','11664']);
  assert.equal(page.definition.data.manualStackUpgradeThreshold,64);
  assert.equal(page.definition.data.config.outputMultiplier,'1.5');
  assert.equal(page.related.items.length,8);
  assert.deepEqual(await readDraconicReactor(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint)))),page);
  const missing=structuredClone(page);missing.related.items=[];
  await assert.rejects(readDraconicReactor(async()=>missing),error=>error.code==='invalid_response');
});
test('Infernal references preserve conditional pools, duplicate entries and loaded NBT quantities',async()=>{
  const {readInfernalPools}=await import('../src/catalog/infernal-drops.ts');
  const {fixture,api}=await nativeCatalog('infernal-drops');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const page=await readInfernalPools(read,{tier:'elite',offset:0,limit:20});
  assert.equal(page.rows.length,2);assert.equal(page.total,2);
  assert.equal(page.rows[0].data.item,page.rows[1].data.item);
  assert.equal(page.rows[0].data.amount,'3');
  assert.deepEqual(page.related.items[0].nbt,fixture.items.find(item=>item.id===page.rows[0].data.item).nbt);
  assert.deepEqual(page.definition.data.dimensionBlacklist,[-1,7]);
  assert.equal(page.definition.data.scope,'nativeClientConfiguration');
  assert.equal((await readInfernalPools(read,{tier:'inferno',offset:0,limit:20})).total,0);
  const ultra=await readInfernalPools(read,{tier:'ultra',offset:0,limit:20});
  assert.equal(ultra.rows[0].data.enchantmentKind,'nativeRandomEnchantedBook');
  assert.deepEqual(await readInfernalPools(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),{tier:'elite',offset:0,limit:20}),page);
  const missing=structuredClone(page);missing.related.items=[];
  await assert.rejects(readInfernalPools(async()=>missing,{tier:'elite',offset:0,limit:20}),error=>error.code==='invalid_response');
  const changed=structuredClone(page);changed.rows[0].data.tier='ultra';
  await assert.rejects(readInfernalPools(async()=>changed,{tier:'elite',offset:0,limit:20}),error=>error.code==='invalid_response');
  const changedOrigin=structuredClone(page);changedOrigin.related.categories[0].reference='reference_'+'0'.repeat(64);
  await assert.rejects(readInfernalPools(async()=>changedOrigin,{tier:'elite',offset:0,limit:20}),error=>error.code==='invalid_response');
  const disabledApi=(await nativeCatalog('infernal-drops','disabled')).api;
  const disabledRead=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return disabledApi.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const disabled=await readInfernalPools(disabledRead,{tier:'elite',offset:0,limit:20});
  assert.equal(disabled.definition.data.enabled,false);assert.equal(disabled.total,0);assert.deepEqual(disabled.rows,[]);
  await assert.rejects(api.read(['infernal-drops'],new URLSearchParams({tier:'unknown'})),error=>error.code==='invalid_query');
});
test('Mob references retain conditional drop rules and hide undiscovered details through shared API',async()=>{
  const {readMobs,readMobDrops}=await import('../src/catalog/mob-drops.ts');
  const options={query:'',item:'',offset:0,limit:20};
  const {fixture,api}=await nativeCatalog('mob-drops-visible');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const index=await readMobs(read,options);
  assert.equal(index.total,1);assert.equal(index.rows[0].visible,true);assert.equal(index.mobs.length,1);
  const entity=index.rows[0].entity;
  const drops=await readMobDrops(read,entity,0);
  assert.equal(drops.rows[0].data.amount,'3');assert.equal(drops.rows[0].data.baseChance,12500);
  assert.equal(drops.rows[0].data.variableChance,true);assert.equal(drops.rows[0].data.enchantmentPower,30);
  assert.equal(drops.rows[0].data.modifiers[0].payload,'400a000000000000');
  assert.deepEqual(drops.related.items.find(item=>item.id===drops.rows[0].data.item).nbt,fixture.items.find(item=>item.id===drops.rows[0].data.item).nbt);
  assert.deepEqual(await readMobDrops(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),entity,0),drops);
  assert.equal((await readMobs(read,{...options,item:drops.rows[0].data.item})).total,1);
  const hidden=(await nativeCatalog('mob-drops')).api;
  const hiddenRead=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return hidden.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const locked=await readMobs(hiddenRead,options);
  assert.equal(locked.rows[0].visible,false);assert.equal(locked.rows[0].drops,null);
  assert.deepEqual(locked.mobs,[]);assert.deepEqual(locked.related.items,[]);
  const unavailable=await readMobDrops(hiddenRead,entity,0);
  assert.equal(unavailable.visible,false);assert.equal(unavailable.mob,null);assert.deepEqual(unavailable.rows,[]);
  const missing=structuredClone(drops);missing.related.items=[];
  await assert.rejects(readMobDrops(async()=>missing,entity,0),error=>error.code==='invalid_response');
  const wrong=structuredClone(drops);wrong.rows[0].data.entity='another';
  await assert.rejects(readMobDrops(async()=>wrong,entity,0),error=>error.code==='invalid_response');
});
test('Database rejects missing row arrays and malformed related facts as response errors', async () => {
  for (const data of [{}, {total:0,offset:0,limit:20,roots:[],chromosomes:[],domain:''},
    {total:0,offset:0,limit:20,rows:[],roots:[],chromosomes:[],domain:null},
    {total:0,offset:0,limit:20,rows:[],roots:[],chromosomes:[],domain:'',definition:null,related:null}]) {
    await assert.rejects(readGeneticReferences(async()=>data,search), error=>error.code==='invalid_response');
  }
});

async function nativeCatalog(name='binnie-genetics-reference-rows',field='records',transform) {
  const fixture = JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/'+name+'-contract.json',import.meta.url),'utf8'));
  if(transform)await transform(fixture);
  const references=field==='domains'?fixture.domains.flat():fixture[field] ?? fixture.reference.records;
  // Retire GUI-only metadata in this in-memory specimen; preserve the archived input bytes.
  if(name==='firework-reference'){
    delete references[0].data.nativeTemplates;
    const domain='reference_'+await hash(canonical({kind:'fireworkRules',records:references.map(row=>row.data)}));
    for(const row of references){row.domain=domain;row.id='refrow_'+await hash(canonical({domain,order:row.order,data:row.data}));}
  }
  const strings=[{id:'text_native_database',locale:'en_US',text:'Native Genetics Database'}];
  const items=(fixture.items??[]).map(item=>({tags:[],durability:0,stackLimit:64,tools:{},armor:false,tooltip:[],icon:null,order:null,aspects:null,name:strings[0].id,...item}));
  const source=references[0].data.source;
  const categories=(field==='domains'?fixture.domains:[references]).map((rows,i)=>({id:'category_native_database'+(i?'_'+i:''),source:rows[0].data.source,name:strings[0].id,machines:[],order:i,icon:null,program:null,reference:rows[0].domain}));
  const aspects=(fixture.aspects??[]).map(aspect=>({...aspect,name:strings[0].id,description:strings[0].id,color:4294967295,icon:null}));
  const topics=aspects.map((aspect,order)=>({id:aspect.id,kind:'aspect',name:aspect.source.key,terms:aspect.source.key,order,icon:null,image:null}));
  const fluids=(fixture.fluids??[]).map(fluid=>({icon:null,name:strings[0].id,...fluid}));
  const tables={references,items,fluids,strings,categories,aspects,topics};
  const files=[],counts={},storage=new Map();
  for (const kind of collections) {
    const records=(tables[kind]??[]).slice().sort((a,b)=>a.id.localeCompare(b.id));
    counts[kind]=records.length;
    for (let start=0;start<Math.max(records.length,1);start+=4096) {
      const rows=records.slice(start,start+4096),bytes=encode({kind,records:rows});
      const path=`tables/${kind}/part-${String(start/4096).padStart(6,'0')}.msgpack`;
      storage.set(path,bytes);files.push({path,kind,encoding:'msgpack',bytes:bytes.byteLength,sha256:await hash(bytes),rows:rows.length,first:rows[0]?.id??null,last:rows.at(-1)?.id??null});
    }
  }
  files.sort((a,b)=>a.path.localeCompare(b.path));
  const content={format:'elysium.catalog',revision:formats.catalog.revision,compiler:'fixture',source:'a'.repeat(64),environment:'b'.repeat(64),locale:'en_US',scope:'complete',counts,files};
  const manifest={id:await hash(canonical(content)),...content};
  return {fixture,api:new Api(await Catalog.open(manifest,async file=>storage.get(file.path)))};
}

test('Actual Java aspect records pass Catalog table decoding and the shared online/offline API',async()=>{
  const {fixture,api}=await nativeCatalog('aspect-combinations');
  for (const aspect of fixture.aspects) {
    const result=await api.read(['aspects',aspect.id],new URLSearchParams());
    assert.equal(result.references[0].data.consuming,false);
    assert.deepEqual(result.references[1].data.components,aspect.components);
    assert.equal(result.references[1].data.visible,aspect.discovered);
    assert.equal(result.related.categories[0].reference,fixture.records[0].domain);
    assert.deepEqual(JSON.parse(JSON.stringify(result)),result);
  }
});

test('Scanned item sources preserve aspect amounts, duplicate provenance and cache gaps',async()=>{
  const {fixture,api}=await nativeCatalog('item-aspects');
  const aspect=fixture.aspects.find(row=>row.source.key==='aer').id;
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const page=await readItemAspectSources(read,aspect,0);
  assert.equal(page.total,2,'Two native scan keys referencing one item must retain provenance');
  assert.equal(page.related.items.length,1);
  assert.equal(page.rows[0].data.aspects.find(row=>row.aspect===aspect).amount,'12');
  assert.deepEqual(page.gaps,{cacheMiss:1,invalidKey:1,noAspects:0});
  assert.deepEqual(page.related.items[0].nbt,fixture.items[0].nbt);
  assert.deepEqual(await readItemAspectSources(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),aspect,0),page);
  const changed=structuredClone(page);changed.rows[0].data.aspects[0].amount='999';
  await assert.rejects(readItemAspectSources(async()=>changed,aspect,0),error=>error.code==='invalid_response');
  const hidden=structuredClone(page);hidden.visible=false;
  await assert.rejects(readItemAspectSources(async()=>hidden,aspect,0),error=>error.code==='invalid_response');
  assert.equal((await readItemAspectSources(read,aspect,20)).rows.length,0);
});

test('Configured scanned-item sources remain queryable without discovered knowledge',async()=>{
  for(const discovered of [false,null]){
    const {fixture,api}=await nativeCatalog('item-aspects','configuredRecords',fixture=>{
      fixture.aspects.find(row=>row.source.key==='aer').discovered=discovered;
    });
    const aspect=fixture.aspects.find(row=>row.source.key==='aer').id;
    const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
    const page=await readItemAspectSources(read,aspect,0);
    assert.equal(page.visible,true);assert.equal(page.total,2);
    assert.equal(page.definitions[0].data.visibility,'allRegisteredAspects');
    const contradictory={...page,visible:false,total:0,rows:[]};
    await assert.rejects(()=>readItemAspectSources(async()=>contradictory,aspect,0),error=>error.code==='invalid_response');
  }
  const {fixture,api}=await nativeCatalog('item-aspects','records',fixture=>{
    fixture.aspects.find(row=>row.source.key==='aer').discovered=false;
  });
  const aspect=fixture.aspects.find(row=>row.source.key==='aer').id;
  const hidden=await api.read(['aspects',aspect,'sources'],new URLSearchParams());
  assert.equal(hidden.visible,false);assert.equal(hidden.total,0);
});

test('Native lexicon descriptions survive shared API with item filtering and strict source validation',async()=>{
  const {fixture,api}=await nativeCatalog('botania-lexicon');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const search={query:'',item:'',offset:0,limit:20};
  const page=await readLexicon(read,search);
  assert.equal(page.total,1);assert.equal(page.definitions[0].data.consuming,false);
  assert.equal(page.rows[0].data.items[0].quickInfo.value,'§aNative line\nSecond line');
  assert.equal(page.rows[0].data.knowledge.autoUnlock,true);
  assert.equal(page.rows[0].data.tagline,null);
  assert.equal((await readLexicon(read,{...search,item:fixture.items[0].id,query:'Second line'})).total,1);
  assert.equal((await readLexicon(read,{...search,query:'nonexistent'})).total,0);
  assert.deepEqual(await readLexicon(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),search),page);
  const bad=structuredClone(page);bad.rows[0].data.items[0].quickInfo.key='unrelated';
  await assert.rejects(readLexicon(async()=>bad,search),error=>error.code==='invalid_response');
  await assert.rejects(readLexicon(async()=>({...page,related:{...page.related,items:[]}}),search),error=>error.code==='invalid_response');
});

test('Database native leaves and gene NBT survive the online and offline shared API',async()=>{
  const {fixture,api}=await nativeCatalog();
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const offline=await readGeneticReferences(read,search);
  const online=await readGeneticReferences(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),search);
  assert.deepEqual(online,offline);
  assert.equal(online.total,fixture.reference.records[0].data.counts.genes);
  assert.equal(online.rows.length,20);
  assert.deepEqual(online.definition.data.explanation,fixture.reference.records[0].data.explanation);
  for(const row of online.rows)for(const id of [row.data.gene.serum,row.data.gene.genome,row.data.gene.sequence]) {
    assert.deepEqual(online.related.items.find(item=>item.id===id).nbt,fixture.items.find(item=>item.id===id).nbt);
  }
  const gene=online.rows[0].data.gene;
  const filtered=await readGeneticReferences(read,{...search,root:gene.root,query:gene.allele,offset:0});
  assert.ok(filtered.total>0);assert.ok(filtered.rows.every(row=>row.data.gene.root===gene.root&&row.data.gene.allele.toLowerCase().includes(gene.allele.toLowerCase())));
  const next=await readGeneticReferences(read,{...search,offset:20});
  assert.ok(next.rows.every(row=>!online.rows.some(previous=>previous.id===row.id)));
  await assert.rejects(readGeneticReferences(async()=>({...online,rows:[{...online.rows[0],domain:'reference_'+'0'.repeat(64)}]}),search),error=>error.code==='invalid_response');
  await assert.rejects(readGeneticReferences(async()=>({...online,related:{...online.related,items:[]}}),search),error=>error.code==='invalid_response');
  await assert.rejects(readGeneticReferences(async()=>({...online,definition:null}),search),error=>error.code==='invalid_response');
  await assert.rejects(read('/references?limit=101'),error=>error.code==='invalid_query');
  await assert.rejects(read('/references?root=not-a-native-root'),error=>error.code==='invalid_query');
});

test('Tool materials preserve native stats and parts through shared online/offline paging',async()=>{
  const {fixture,api}=await nativeCatalog('tconstruct-tool-materials');
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const {readToolMaterials}=await import('../src/catalog/tool-materials.ts');
  const options={domain:'',query:'',offset:0,limit:20};
  const offline=await readToolMaterials(read,options);
  const online=await readToolMaterials(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),options);
  assert.deepEqual(online,offline);assert.equal(online.total,1);
  assert.equal(online.rows[0].data.material.materialId,31);
  assert.equal(online.rows[0].data.material.bow,null);
  assert.deepEqual(online.parts[0].data.template.nbt,fixture.items[0].nbt);
  assert.equal(online.related.items[0].id,fixture.items[0].id);
  assert.equal((await readToolMaterials(read,{...options,query:'missing'})).total,0);
  await assert.rejects(readToolMaterials(async()=>({...online,parts:[]}),options),error=>error.code==='invalid_response');
  await assert.rejects(read('/tool-materials?limit=101'),error=>error.code==='invalid_query');
});


test('Villager offers retain quantities and frequency through shared API and strict client', async () => {
  const {fixture,api}=await nativeCatalog('villager-trades');
  const {readVillagerTrades}=await import('../src/catalog/villager-trades.ts');
  const options={domain:'',profession:'',item:'',direction:'all',offset:0,limit:20};
  const read=async endpoint=>{const url=new URL(endpoint,'https://catalog.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
  const local=await readVillagerTrades(read,options);
  const network=await readVillagerTrades(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),options);
  assert.deepEqual(local,network); assert.equal(local.total,1);
  assert.deepEqual(local.rows[0].data,fixture.records[1].data);
  assert.equal(local.rows[0].data.nativeFrequency,'1.25');
  const input=local.rows[0].data.inputs[0].item, output=local.rows[0].data.output.item;
  assert.equal((await readVillagerTrades(read,{...options,item:input,direction:'uses'})).total,1);
  assert.equal((await readVillagerTrades(read,{...options,item:input,direction:'recipes'})).total,0);
  assert.equal((await readVillagerTrades(read,{...options,item:output,direction:'recipes'})).total,1);
  assert.equal((await readVillagerTrades(read,{...options,offset:1})).rows.length,0);
  await assert.rejects(read('/villager-trades?profession=1.2'),error=>error.code==='invalid_query');
  await assert.rejects(readVillagerTrades(async()=>({...local,related:{...local.related,items:[]}}),options),error=>error.code==='invalid_response');
  await assert.rejects(readVillagerTrades(async()=>({...local,professions:[]}),options),error=>error.code==='invalid_response');
});
