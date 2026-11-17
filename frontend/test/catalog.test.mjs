import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { effectScope } from 'vue';
import test from 'node:test';
import { Atlas, frameAt, stepAt } from '../src/catalog/atlas.ts';
import { amount, chance, ticks } from '../src/catalog/format.ts';
import { Playback } from '../src/catalog/clock.ts';
import { useRequest } from '../src/state/request.ts';
import { quantityBounds } from '../../catalog/src/quantity.ts';
import { assertTable, decodeTable } from '@elysium/contracts';
import { encode } from '@msgpack/msgpack';

function lookupRecipe(id){return {id,source:{owner:'fixture',handler:'lookup',key:'lookup'},category:'cat',order:0,
  inputs:[],outputs:[],properties:{},process:null,grid:null,magic:null,duration:null,energy:null};}

test('GT native closure includes unprojected representatives and rejects altered slot probabilities',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {Query}=await import('../../catalog/src/query.ts');
  const {validateRecipe}=await import('../../catalog/src/recipe-validation.ts');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/gt-zero-fluid-contract.json',import.meta.url),'utf8'));
  const {recipe}=fixture;
  const native=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/gt-native-probability-facts.json',import.meta.url),'utf8'));
  recipe.gtNative=native;
  const choice=(stack,numerator,denominator)=>({...stack,consume:{kind:'chance',chance:{numerator,denominator}},
    returns:[],rule:{kind:'wildcard',meta:false,nbt:true}});
  recipe.inputs=[
    {kind:'item',slot:0,choices:[choice(native.itemInputs[0],'0','1')]},
    {kind:'item',slot:2,choices:[choice(native.itemInputs[2],'1','1')]},
    {kind:'fluid',slot:0,choices:native.fluidAlternatives[0].map(stack=>choice(stack,'1','2'))},
  ];
  for(const [index,numerator,denominator]of [[0,'1','10'],[1,'9','10'],[2,'1','4']])recipe.outputs[index].chance={numerator,denominator};
  // The representative is legitimate native evidence even though [] disables its projected slot.
  native.fluidInputs[1].id=fixture.fluids[0].id;
  const related=await new Query({async records(kind,ids){
    const source=fixture[kind]??[];
    return [...ids].map(id=>source.find(row=>row.id===id)).filter(Boolean)
      .map(row=>({...row,name:'text_fixture',tooltip:[],icon:null}));
  }}).related([recipe]);
  assert.ok(related.fluids.some(fluid=>fluid.id===fixture.fluids[0].id),'Native-only fluid reference was not hydrated');
  const altered=structuredClone(recipe);altered.outputs[2].chance={numerator:'1',denominator:'1'};
  assert.throws(()=>validateRecipe(altered),/GT/);
  const admission=structuredClone(recipe);admission.inputs[0].choices[0].amount='1';
  assert.throws(()=>validateRecipe(admission),/GT/);
});

test('native genetics prototypes keep inputs visible and never manufacture guaranteed material yields',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {recipeChoiceIndex,correlatedRecipeOutput}=await import('../../catalog/src/selection.ts');
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  for(const name of ['imprinter-native-0-en_US','sampler-native-0-en_US','replicator-native-0-en_US','mutatron-semantic','extractor-native-2-en_US']){
    const {recipe}=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/gendustry-${name}-contract.json`,import.meta.url),'utf8'));
    assert.equal(correlatedRecipeOutput(recipe),undefined,'An unobserved genetics prototype became an empty combination selector');
    for(const input of recipe.inputs)assert.equal(recipeChoiceIndex(recipe,{},input),0);
    const result=calculateMaterials(recipe,'3');
    assert.deepEqual(result.outputs,[]);assert.deepEqual(result.returns,[]);
    assert.ok(result.uncertain.some(row=>row.id===recipe.outputs[0].id&&row.amount===null));
  }
});

test('actual genetics transports retain Java identity, exact DNA blockers and separate language rules',async()=>{
  const {readFile}=await import('node:fs/promises'),{canonical}=await import('@elysium/contracts');
  const {validateGendustryGeneticsRecipe,gendustryGeneticsNotes}=await import('../../catalog/src/gendustry-genetics.ts');
  for(const name of ['imprinter-native-0','sampler-native-0','sampler-native-1','transposer-native-0','transposer-native-1','mutatron-native-0','mutatron-locale','replicator-native-0','extractor-native-1','extractor-native-2']){
    let original;
    for(const locale of ['en_US','zh_CN']){
      const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/gendustry-${name}-${locale}-contract.json`,import.meta.url),'utf8'));
      const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
      const items=new Map(fixture.items.map(i=>[i.id,i])),fluids=new Map(fixture.fluids.map(f=>[f.id,f]));
      validateGendustryGeneticsRecipe(row,items,fluids);
      const key=Object.fromEntries(['source','category','inputs','outputs','duration','energy','grid','magic','process'].map(k=>[k,row[k]]));key.properties={};
      key.outputs=row.outputs.map(output=>{if(!output.change)return output;const {id,amount,change,...stable}=output;const {samples,bindings,...edit}=change;return {...stable,change:edit};});
      assert.equal(row.id,'recipe_'+createHash('sha256').update(canonical(key)).digest('hex'));
      if(original)assert.equal(row.id,original);else original=row.id;
      assert.deepEqual(row.properties,{});
      const rules=gendustryGeneticsNotes(row.process,locale==='en_US'?'en-US':'zh-CN').join(' ');
      if(locale==='en_US')assert.doesNotMatch(rules,/\p{Script=Han}/u);else assert.match(rules,/原生|存量|实验耗材/);
      if(name==='mutatron-locale'){
        assert.match(fixture.strings.map(s=>s.text).join(' '),locale==='en_US'?/Native biome condition/:/原生生物群系条件/);
        const unstable=structuredClone(row);unstable.process.roots[0].mutations[0].conditions=['localized text'];
        assert.throws(()=>validateGendustryGeneticsRecipe(unstable,items,fluids));
      }
      if(name.startsWith('extractor')){
        const wrongAmount=structuredClone(row);wrongAmount.outputs[0].amount='1';assert.throws(()=>validateGendustryGeneticsRecipe(wrongAmount,items,fluids));
        const broadened=structuredClone(row);broadened.inputs[0].choices[0].rule={kind:'wildcard',meta:true,nbt:true};
        assert.throws(()=>validateGendustryGeneticsRecipe(broadened,items,fluids));
      }
    }
  }
});

test('Gendustry template roles stay visible without a fabricated successful sample or fixed material output',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {recipeChoiceIndex,correlatedRecipeOutput}=await import('../../catalog/src/selection.ts');
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  const {recipe}=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/gendustry-template-gui-free-contract.json',import.meta.url),'utf8'));
  assert.equal(correlatedRecipeOutput(recipe),undefined,'A missing observation became an empty combination selector');
  for(const input of recipe.inputs)assert.equal(recipeChoiceIndex(recipe,{},input),0,'An unobserved template result hid its input role');
  const result=calculateMaterials(recipe,'3');
  assert.deepEqual(result.outputs,[]);assert.deepEqual(result.returns,[]);
  assert.ok(result.uncertain.some(row=>row.id===recipe.outputs[0].id));
});

test('actual Gendustry template transport keeps Java identity, native blank returns and separate language notes',async()=>{
  const {readFile}=await import('node:fs/promises'),{canonical}=await import('@elysium/contracts');
  const {validateGendustryTemplateRecipe,gendustryTemplateNote}=await import('../../catalog/src/gendustry-template.ts');
  let original;
  for(const locale of ['','-zh_CN']){
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/gendustry-template-gui-free${locale}-contract.json`,import.meta.url),'utf8'));
    const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
    const items=new Map(fixture.items.map(i=>[i.id,i]));validateGendustryTemplateRecipe(row,items);
    const key=Object.fromEntries(['source','category','inputs','outputs','duration','energy','grid','magic','process'].map(k=>[k,row[k]]));
    key.properties={};key.outputs=row.outputs.map(({id,amount,change,...stable})=>{
      const {samples,bindings,...action}=change;
      return {...stable,change:action};
    });
    assert.equal('recipe_'+createHash('sha256').update(canonical(key)).digest('hex'),row.id);
    if(original)assert.equal(row.id,original);else original=row.id;
    assert.deepEqual(row.properties,{});for(const input of row.inputs)if(input.slot!==row.process.template){
      const c=input.choices[0];assert.equal(c.returns.length,1);assert.equal(items.get(c.returns[0].id).registry,'gendustry:GeneSampleBlank');
    }
    const bad=structuredClone(row);bad.inputs.find(i=>i.slot!==bad.process.template).choices[0].returns=[];
    assert.throws(()=>validateGendustryTemplateRecipe(bad,items));
    const notes=fixture.strings.map(s=>s.text).join(' ');
    if(locale)assert.match(notes,/每份样本返还/);else assert.doesNotMatch(notes,/\p{Script=Han}/u);
  }
  assert.doesNotMatch(gendustryTemplateNote('en-US'),/\p{Script=Han}/u);
  assert.match(gendustryTemplateNote('zh-CN'),/1～8/);
});

test('production hydration refuses native machine processes stripped to generic rules',async()=>{
  const {readFile}=await import('node:fs/promises'),{Query}=await import('../../catalog/src/query.ts');
  for(const name of ['gendustry-imprinter-native-0-en_US','gendustry-extractor-native-2-en_US','gendustry-template-gui-free','inscriber-native-0-en_US','ae-native-greedy','botania-pool-native-0-en_US','botania-runic-native-0-en_US','botania-floating-native-0-en_US']){
    const {recipe}=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`,import.meta.url),'utf8'));
    const generic=structuredClone(recipe);generic.process=null;
    for(const output of generic.outputs)output.change=null;
    for(const input of generic.inputs)for(const choice of input.choices)choice.rule={kind:'exact'};
    await assert.rejects(()=>new Query({async records(){return [];}}).related([generic]),/native|Native|Invalid/);
  }
});

test('recipe listing rejects a corrupted family law before returning its page',async()=>{
  const {readFile}=await import('node:fs/promises'),{Query}=await import('../../catalog/src/query.ts');
  const {recipe}=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/creativecore-owned-stock-contract.json',import.meta.url),'utf8'));
  let row=recipe;
  const query=new Query({
    async record(){return {recipes:[recipe.id]};},
    async records(kind){return kind==='index'?[{id:recipe.id,category:recipe.category}]:[row];},
  });
  const options={item:recipe.inputs[0].choices[0].id,direction:'recipes',category:'',query:'',offset:0,limit:1};
  assert.deepEqual((await query.recipes(options)).rows,[recipe]);
  row=structuredClone(recipe);row.process.consumption='consumeMinimum';
  await assert.rejects(()=>query.recipes(options),/CreativeCore/);
});

test('query admission retains handler, input-rule and output-action corruption guards',async()=>{
  const {Query}=await import('../../catalog/src/query.ts');
  const query=new Query({async records(){return [];}});
  for(const handler of [
    'micdoodle8.mods.galacticraft.core.nei.CircuitFabricatorRecipeHandler',
    'micdoodle8.mods.galacticraft.core.nei.RefineryRecipeHandler',
    'appeng.integration.modules.NEIHelpers.NEIInscriberRecipeHandler',
    'appeng.integration.modules.NEIHelpers.NEIAEShapedRecipeHandler',
    'WayofTime.alchemicalWizardry.client.nei.NEIBloodOrbShapelessHandler',
    'WayofTime.alchemicalWizardry.client.nei.NEIAlchemyRecipeHandler',
    'WayofTime.alchemicalWizardry.client.nei.NEICalcinatorHandler',
    'mrtjp.projectred.core.libmc.recipe.PRShapelessRecipeHandler',
    'vazkii.botania.client.integration.nei.recipe.RecipeHandlerBrewery',
    'vazkii.botania.client.integration.nei.recipe.RecipeHandlerRunicAltar',
    'lumien.randomthings.Handler.ModCompability.NEI.ImbuingStationRecipeHandler',
    'codechicken.nei.recipe.BrewingRecipeHandler',
    'alkalus.main.nei.NEI_Handler_SpinningWheel',
    'witchinggadgets.client.nei.NEISpinningWheelHandler',
    'com.recursive_pineapple.matter_manipulator.client.nei.UpdateRecipeNEIHandler',
    'net.bdew.gendustry.nei.TemplateCraftingHandler',
    'net.bdew.gendustry.nei.ImprinterHandler',
    'net.bdew.gendustry.nei.LiquifierHandler',
  ]){
    const recipe=lookupRecipe('recipe');recipe.source.handler=handler;
    await assert.rejects(()=>query.related([recipe]),undefined,handler);
  }
  for(const kind of ['ae','bloodmagic-altar','nativePoolInput','matterManipulatorInput','matterManipulatorUpgrade']){
    const recipe=lookupRecipe('recipe');
    recipe.inputs=[{kind:'item',slot:0,choices:[{id:'item',amount:'1',rule:{kind},consume:{kind:'consume'},returns:[]}]}];
    await assert.rejects(()=>query.related([recipe]),undefined,kind);
  }
  for(const kind of ['nativePoolResult','nativeInfusion','disguiseInfusion','salisWand','matterManipulator']){
    const recipe=lookupRecipe('recipe');
    recipe.outputs=[{kind:'item',slot:0,id:'item',amount:'1',chance:{numerator:'1',denominator:'1'},role:'result',
      quantity:null,change:{input:0,action:{kind},samples:[]}}];
    await assert.rejects(()=>query.related([recipe]),undefined,kind);
  }
});

test('HTTP recipe reader rejects native processes stripped from a structurally valid response',async()=>{
  const {readFile}=await import('node:fs/promises'),{Catalog}=await import('../src/catalog/client.ts');
  for(const name of ['gendustry-imprinter-native-0-en_US','gendustry-extractor-native-2-en_US','gendustry-template-gui-free','inscriber-native-0-en_US','ae-native-greedy','botania-pool-native-0-en_US','botania-runic-native-0-en_US','botania-floating-native-0-en_US']){
    const {recipe}=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`,import.meta.url),'utf8'));
    const generic=structuredClone(recipe);generic.process=null;
    for(const output of generic.outputs)output.change=null;
    for(const input of generic.inputs)for(const c of input.choices)c.rule={kind:'exact'};
    const client=Object.create(Catalog.prototype);client.details=new Map();client.detailBytes=0;
    client.get=async()=>({recipe:generic,related:Object.fromEntries(['items','fluids','categories','strings','textures','topics'].map(k=>[k,[]]))});
    await assert.rejects(()=>client.recipe(recipe.id));
  }
});

test('actual Inscriber rows preserve plate consumption, process-only references and conditional materials',async()=>{
  const {readFile}=await import('node:fs/promises'),{Query}=await import('../../catalog/src/query.ts');
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  for(let index=0;index<3;index++)for(const locale of ['en_US','zh_CN']){
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/inscriber-native-${index}-${locale}-contract.json`,import.meta.url),'utf8'));
    const recipe=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
    const readItems=new Set();await new Query({async records(kind,ids){if(kind==='items'){for(const id of ids)readItems.add(id);return fixture.items.map(item=>({...item,name:'text_fixture',tooltip:[],icon:null}));}return [];}}).related([recipe]);
    for(const id of [recipe.process.top,recipe.process.bottom,recipe.process.namePress])if(id!=null)assert.ok(readItems.has(id));
    const summary=calculateMaterials(recipe,'3');assert.deepEqual(summary.outputs,[]);assert.equal(summary.uncertain.length,1);
  }
});

test('actual AE native reader rows retain logical holes, alternatives and original Java identity',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {canonical}=await import('@elysium/contracts');
  for(const family of ['shaped','shapeless','wireless','greedy']){
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/ae-native-${family}-contract.json`,import.meta.url),'utf8'));
    const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
    assert.equal(row.inputs.length,family==='greedy'?2:3);assert.equal(row.inputs[0].choices.length,2);
    if(family==='shaped'||family==='wireless')assert.deepEqual(row.grid,{width:2,height:2,cells:[0,1,null,2],mirror:true});
    else assert.equal(row.grid,null);
    const identity=Object.fromEntries(['source','category','inputs','outputs','duration','energy','grid','magic'].map(k=>[k,row[k]]));
    if(row.process!=null)identity.process=row.process;
    identity.properties=Object.fromEntries(Object.entries(row.properties).map(([k,v])=>[k,v.value]));
    assert.equal('recipe_'+createHash('sha256').update(canonical(identity)).digest('hex'),row.id);
  }
});

test('actual Blood semantic rows keep network charging and world effects without native GUI',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {validateBloodRecipe}=await import('../../catalog/src/blood.ts');
  for(const family of ['altar','binding','meteor','charging']){
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/blood-${family}-semantic-contract.json`,import.meta.url),'utf8'));
    const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
    validateBloodRecipe(row);
    assert.throws(()=>validateBloodRecipe({...row,process:null}));
    assert.deepEqual(row.process,fixture.recipe.process);
    if(family==='charging'){
      assert.equal(row.process.canBeFilled,true);assert.equal(row.process.result,'soul-network-charge');
      assert.deepEqual(row.outputs,[]);assert.equal(row.inputs[0].choices[0].consume.kind,'keep');
    }
    if(family==='meteor'){assert.deepEqual(row.outputs,[]);assert.equal(row.process.result,'spatial-weighted-blocks');}
  }
});

test('actual nine Binnie genetic machines retain original identities through the generated contract',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {canonical}=await import('@elysium/contracts');
  for(const specimen of ['acclimatiser-batch','acclimatiser-semantic','sequencer-semantic','analyser-semantic','splicer-semantic','isolator-semantic','inoculator-semantic','genepool-semantic','incubator-semantic','polymeriser-semantic']){
    const machine=specimen.split('-')[0],fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/binnie-genetics-${specimen}-contract.json`,import.meta.url),'utf8'));
    const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
    assert.equal(row.process.kind,'binnie_genetics');assert.equal(row.process.machine,machine);
    const key=Object.fromEntries(['source','category','inputs','outputs','duration','energy','grid','magic','process'].map(k=>[k,row[k]]));
    key.properties=Object.fromEntries(Object.entries(row.properties).map(([k,v])=>[k,v.value]));
    assert.equal('recipe_'+createHash('sha256').update(canonical(key)).digest('hex'),row.id);
  }
});

test('actual Binnie lumbermill keeps saved admission, volume-only tank and output merge conditions',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {validateLumbermillRecipe,lumbermillNote}=await import('../../catalog/src/lumbermill.ts');
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  for(const name of ['binnie-lumbermill-semantic','native-lumbermill-saved-input','native-lumbermill-lazy']){
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`,import.meta.url),'utf8'));
    const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
    const entities={items:new Map(fixture.items.map(item=>[item.id,item])),fluids:new Map(fixture.fluids.map(fluid=>[fluid.id,fluid]))};validateLumbermillRecipe(row,entities);
    assert.match(lumbermillNote(row.process,'en-US'),/retaining existing NBT/);assert.match(lumbermillNote(row.process),/任意已存流体/);
    const result=calculateMaterials(row,'3');assert.equal(result.inputs.length,0);assert.equal(result.outputs.length,0);
    assert.match(result.uncertain[1].note,/10 mB/);assert.match(result.uncertain[2].note,/已有 NBT/);
    const wrong=structuredClone(row);wrong.inputs[1].choices[0].rule={kind:'exact'};assert.throws(()=>validateLumbermillRecipe(wrong));
    const guaranteed=structuredClone(row);guaranteed.outputs[0].quantity=null;guaranteed.outputs[0].amount='6';assert.throws(()=>validateLumbermillRecipe(guaranteed));
    const swap=structuredClone(row);swap.outputs[1].id=swap.outputs[2].id;assert.throws(()=>validateLumbermillRecipe(swap,entities));
    if(name==='native-lumbermill-saved-input')assert.equal(row.process.firstOreName,'binnieWrongFirst');
  }
});

test('actual EnderIO enchanter keeps count intervals, whole book slots and signed XP across transport',async()=>{
  const {readFile}=await import('node:fs/promises');
  const names=['level-1','level-2','level-5','stored-divisor','stored-65','ore','ore-alias','signed-fffffff9','signed-7fffffff','signed-80000000'];
  for(const name of names){
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/native-enchanter-${name}-contract.json`,import.meta.url),'utf8'));
    const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
    const {validateEnchanterRecipe,enchanterAccepts,enchanterNote}=await import('../../catalog/src/enchanter.ts');
    const {calculateMaterials}=await import('./helpers/materials.mjs');
    const items=new Map(fixture.items.map(item=>[item.id,item]));validateEnchanterRecipe(row,items);
    const p=row.process;
    assert.ok(enchanterAccepts(p,p.offeredMinimum));assert.ok(enchanterAccepts(p,p.offeredMaximum));
    assert.equal(enchanterAccepts(p,String(BigInt(p.offeredMinimum)-1n)),false);
    assert.equal(enchanterAccepts(p,String(BigInt(p.offeredMaximum)+1n)),false);
    assert.equal(enchanterAccepts(p,'NaN'),false);assert.equal(enchanterAccepts(p,'0003'),false);
    assert.match(enchanterNote(p,'en-US'),/whole book slot/);assert.match(enchanterNote(p),/清空整槽/);
    const materials=calculateMaterials(row,'2');assert.equal(materials.inputs.length,0);assert.equal(materials.outputs.length,0);
    assert.match(materials.uncertain[0].note,/清空整槽/);assert.match(materials.uncertain[1].note,/数量区间/);
    const wrong=structuredClone(row);wrong.process.offeredMaximum=String(BigInt(p.offeredMaximum)-1n);assert.throws(()=>validateEnchanterRecipe(wrong,items));
    const wrongBook=structuredClone(row);wrongBook.inputs[0].choices[0].consume={kind:'consume'};assert.throws(()=>validateEnchanterRecipe(wrongBook,items));
    const badResult=structuredClone(row);badResult.outputs[0].quantity.nominal='2';assert.throws(()=>validateEnchanterRecipe(badResult,items));
  }
});

test('XU mirrored physical witnesses select the native first-tagged result',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {recipeGridCells,recipeSampleIndex}=await import('../../catalog/src/selection.ts');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/xu-literal-first-contract.json',import.meta.url),'utf8'));
  const row=fixture.recipe;
  assert.notEqual(row.process.states[0].output.id,row.process.states[1].output.id);
  assert.deepEqual(recipeGridCells(row),row.process.layout);
  assert.deepEqual(recipeGridCells(row,true),[...row.process.layout.slice(0,3).reverse(),...row.process.layout.slice(3,6).reverse(),...row.process.layout.slice(6).reverse()]);
  assert.equal(recipeSampleIndex(row,{},row.outputs[0],undefined,false),0);
  assert.equal(recipeSampleIndex(row,{},row.outputs[0],undefined,true),1,'Identical input bindings must not hide the mirrored output');
});

test('XU shared lookup is cached and hydrates only the current witness, including prototype',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {reconstructXu,readXuInformation,xuNote}=await import('../../catalog/src/xu-microblock.ts');
  const {Query}=await import('../../catalog/src/query.ts');
  const {Records,Catalog:Client}=await import('../src/catalog/client.ts');
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  for(const name of ['xu-microblock','xu-literal-first','xu-literal-only','xu-untagged-first','xu-untagged-only']){
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`,import.meta.url),'utf8'));
    const recipe=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
    const chunks=decodeTable(encode({kind:'programs',records:fixture.programs}),'programs').records;
    const rules=await reconstructXu(recipe.process.program,chunks);let reads=0;const requested=[];
    const query=new Query({async program(id){reads++;assert.equal(id,recipe.process.program);return chunks;},async records(kind,ids){
      requested.push([kind,[...ids]]);return kind==='items'?[...ids].map(id=>({...fixture.items.find(item=>item.id===id),name:'text_fixture',tooltip:[],icon:null})):[];
    }});
    const related=await query.related([recipe]);await query.related([recipe]);assert.equal(reads,1);
    const info=related.xu[0];assert.equal(info.program,recipe.process.program);assert.equal(info.lookup,rules.settings[0].lookup);
    assert.deepEqual(readXuInformation(related.xu),related.xu);
    const records=new Records(related);assert.equal(records.xu.get(recipe.process.program+'/'+recipe.process.materialId),info);
    const reader=Object.create(Client.prototype);reader.details=new Map();reader.detailBytes=0;reader.get=async()=>({recipe,related:{...related,items:[]}});
    assert.deepEqual((await reader.recipe(recipe.id)).related.xu,related.xu,'HTTP client discarded XU lookup summary');
    assert.ok(requested.some(([kind,ids])=>kind==='items'&&ids.includes(recipe.process.prototype.id)));
    if(name==='xu-literal-first')assert.ok(!requested.some(([kind,ids])=>kind==='items'&&ids.includes(rules.materials[0].block)),'Hydration copied the entire material table');
    assert.equal(calculateMaterials(recipe,'1').outputs.length,0,'Conditional XU result became an unconditional fixed output');
    assert.match(xuNote(info,'en-US'),/native|Native/);
    const changed=structuredClone(chunks);changed[0].offset=1;await assert.rejects(()=>reconstructXu(recipe.process.program,changed));
    assert.throws(()=>readXuInformation([{...info,lookup:'unused',materialId:1}]));
  }
});

test('FMP shared lookup keeps physical cells and ID-zero witnesses without repeating native tables',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {reconstructFmp,fmpNote}=await import('../../catalog/src/fmp.ts');
  const {Query}=await import('../../catalog/src/query.ts');
  const {Records}=await import('../src/catalog/client.ts');
  const {recipeGridCells}=await import('../../catalog/src/selection.ts');
  for(const name of ['fmp-microblock','fmp-stronger-saw','fmp-missing-material']){
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`,import.meta.url),'utf8'));
    const recipe=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
    const chunks=decodeTable(encode({kind:'programs',records:fixture.programs}),'programs').records;
    const rules=await reconstructFmp(recipe.process.program,chunks);assert.equal(rules.materials.length,2);
    assert.deepEqual(recipeGridCells(recipe),recipe.process.layout);assert.throws(()=>recipeGridCells(recipe,true));
    let reads=0;const requested=[];
    const query=new Query({async program(id){reads++;assert.equal(id,recipe.process.program);return chunks;},async records(kind,ids){
      requested.push([kind,[...ids]]);return kind==='items'?[...ids].map(id=>({...fixture.items.find(item=>item.id===id),name:'text_fixture',tooltip:[],icon:null})):[];
    }});
    const related=await query.related([recipe]);await query.related([recipe]);assert.equal(reads,1);
    assert.equal(related.fmp.length,1);assert.equal(related.fmp[0].missingAndUnknownUseZero,true);
    assert.equal(related.fmp[0].aliases,'singleHop');assert.equal(related.fmp[0].saws.length,name==='fmp-missing-material'?0:1);
    assert.ok(requested.some(([kind,ids])=>kind==='items'&&ids.includes(related.fmp[0].block)));
    const records=new Records(related);assert.equal(records.fmp.get(recipe.process.program+'/'+recipe.process.materialId),related.fmp[0]);
    const {Catalog:Client}=await import('../src/catalog/client.ts');const reader=Object.create(Client.prototype);
    reader.details=new Map();reader.detailBytes=0;
    reader.get=async()=>({recipe,related:{...related,items:[]}});
    assert.equal((await reader.recipe(recipe.id)).related.fmp?.length,1,'HTTP client discarded the shared FMP summary');
    assert.match(fmpNote(related.fmp[0]),/缺失或未知.*材质 0/);assert.match(fmpNote(related.fmp[0],'en-US'),/missing or unknown.*ID 0/);
    const changed=structuredClone(chunks);changed[0].offset=1;await assert.rejects(()=>reconstructFmp(recipe.process.program,changed));
    if(name==='fmp-missing-material')assert.equal(recipe.inputs[0].choices[0].rule.nativeText,undefined);
  }
});

test('actual Chisel target and excluded partitions survive hydration and distinguish literal32767',async()=>{
  const {readFile}=await import('node:fs/promises');const {Query}=await import('../../catalog/src/query.ts');
  for(const name of ['chisel-wildcard-semantic','chisel-ore-stack-semantic','chisel-literal-metadata-semantic']){
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`,import.meta.url),'utf8'));
    const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0],reads=[];
    await new Query({async records(kind,ids){reads.push([kind,[...ids]]);return [];}}).related([row]);
    const items=new Set(reads.find(([kind])=>kind==='items')[1]);
    assert.ok(items.has(row.process.target),'Missing original target NBT/count hydration');
    for(const source of row.process.sources)assert.ok(items.has(source.item),'Missing exact exclusion partition hydration');
    const {chiselNote,validateChiselRecipe}=await import('../../catalog/src/chisel.ts');
    validateChiselRecipe(row);assert.match(chiselNote(row.process),/整叠|一次取用/);
    assert.match(chiselNote(row.process,'en-US'),/creative|Unbreaking/);
  }
});

test('actual CreativeCore programs preserve stock thresholds, tails and first-equal removal',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {validateCreativeCoreRecipe,creativeCoreSelect,creativeCoreNote}=await import('../../catalog/src/creativecore.ts');
  for(const name of ['shape','stock','greedy','ore','stackinfoblock','stackinfomaterial','remove-equals','tail','empty']){
    const value=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/creativecore-owned-${name}-contract.json`,import.meta.url),'utf8'));
    const row=decodeTable(encode({kind:'recipes',records:[value.recipe]}),'recipes').records[0];validateCreativeCoreRecipe(row);
    assert.match(creativeCoreNote(row.process),/库存门槛/);assert.match(creativeCoreNote(row.process,'en-US'),/stock thresholds/);
    const items=new Map(value.items.map(item=>[item.id,item]));
    if(name==='stock'){
      const offered=Array(9).fill(null),item=items.get(row.inputs[0].choices[0].id);
      offered[0]={item,count:2};assert.equal(creativeCoreSelect(row.process,offered),null);
      offered[0].count=3;assert.equal(creativeCoreSelect(row.process,offered)[0],0);
      assert.equal(row.inputs[0].choices[0].amount,'1');
    }
    if(name==='remove-equals'){
      const b=value.items.find(item=>item.nbt?.value?.marker?.value==='b'),offered=Array(9).fill(null);
      offered[0]={item:b,count:1};offered[1]={item:b,count:1};
      assert.deepEqual(creativeCoreSelect(row.process,offered).slice(0,2),[0,1]);
    }
    if(name==='empty')assert.deepEqual(creativeCoreSelect(row.process,Array(9).fill(null)),Array(9).fill(null));
    const altered=structuredClone(row);altered.process.consumption='consumeMinimum';assert.throws(()=>validateCreativeCoreRecipe(altered));
  }
});

test('actual distillery law keeps priority inputs and conditional inventory placement',async()=>{
  const {readFile}=await import('node:fs/promises');const {Query}=await import('../../catalog/src/query.ts');
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  for(const name of ['native-distillery','native-distillery-priority','native-distillery-production-jar','native-distillery-empty-slot','native-distillery-signed-jars','native-distillery-zero-output','native-distillery-negative-output']){
    const value=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`,import.meta.url),'utf8'));
    const row=decodeTable(encode({kind:'recipes',records:[value.recipe]}),'recipes').records[0];
    const reads=[];await new Query({async records(kind,ids){reads.push([kind,[...ids]]);return [];}}).related([row]);
    const ids=new Set(reads.find(([kind])=>kind==='items')[1]);assert.ok(ids.has(row.process.jar));
    for(const earlier of row.process.earlier)for(const reagent of earlier.reagents)if(reagent)assert.ok(ids.has(reagent.item));
    for(const prototype of row.process.outputs)if(prototype)assert.ok(ids.has(prototype.id));
    assert.equal(row.duration,null);assert.equal(row.energy,null);assert.ok(row.outputs.every(output=>output.amount==null));
    const result=calculateMaterials(row,'2');assert.deepEqual(result.inputs,[]);assert.deepEqual(result.outputs,[]);
    const {validateDistilleryRecipe,distilleryNote,distillerySelected}=await import('../../catalog/src/distillery.ts');validateDistilleryRecipe(row);
    const items=new Map(value.items.map(item=>[item.id,item]));
    assert.ok(distillerySelected(row.process,row.process.reagents.map(reagent=>reagent?items.get(reagent.item):null),Math.max(1,row.process.jars),items));
    assert.match(distilleryNote(row.process,'en-US'),/missing power pauses/);assert.match(distilleryNote(row.process),/原料和罐子仍会扣除/);
  }
});

test('native banner logical layouts and rule-only items survive page hydration',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {Query}=await import('../../catalog/src/query.ts');
  const {recipeGridCells}=await import('../../catalog/src/selection.ts');
  for(const name of ['mask','catalyst','no-dye']) {
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/native-banner-${name}-contract.json`,import.meta.url),'utf8'));
    const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0],reads=[];
    await new Query({async records(kind,ids){reads.push([kind,[...ids]]);return [];}}).related([row]);
    const items=new Set(reads.find(([kind])=>kind==='items')[1]);
    for(const dye of row.process.palette)assert.ok(items.has(dye.id),'Missing native banner dye hydration');
    for(const rule of row.process.rules)if(rule.catalyst)assert.ok(items.has(rule.catalyst),'Missing preceding banner catalyst hydration');
    assert.equal(row.grid,null);
    assert.deepEqual(recipeGridCells(row),row.process.layout);
    assert.throws(()=>recipeGridCells(row,true));
  }
});

test('native galaxy assembly keeps repair priority and conditional material outputs',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/native-galaxy-repair-contract.json',import.meta.url),'utf8'));
  const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
  assert.deepEqual(row,fixture.recipe);
  assert.equal(row.process.repair[0].maximum,250);
  const totals=calculateMaterials(row,'3');
  assert.deepEqual(totals.outputs,[]);
  assert.equal(totals.uncertain.find(item=>item.id===row.outputs[0].id).amount,null);
  assert.match(totals.uncertain.find(item=>item.id===row.outputs[0].id).note,/修理.*优先/);
  const invalid=structuredClone(row);delete invalid.process.repair;
  assert.throws(()=>decodeTable(encode({kind:'recipes',records:[invalid]}),'recipes'));
});

test('QED tag transfer uses last native offered cell and mirrored grid',async()=>{
  const {readFile}=await import('node:fs/promises');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/native-qed-nbt-contract.json',import.meta.url),'utf8'));
  const {recipeSampleIndex,selectCraftingNbtSample}=await import('../../catalog/src/selection.ts');
  const items=new Map(fixture.items.map(item=>[item.id,item])),row=fixture.recipe;
  assert.equal(recipeSampleIndex(row,{},row.outputs[0],items),2);
  assert.equal(recipeSampleIndex(row,{},row.outputs[0],items,true),1);
  assert.equal(selectCraftingNbtSample(row,{},row.outputs[0],1,items),true);
  assert.deepEqual(decodeTable(encode({kind:'recipes',records:[row]}),'recipes').records[0],row);
});

test('native extreme crafting preserves selectors and repair priority in strict tables',async()=>{
  const {readFile}=await import('node:fs/promises');
  for(const name of ['shaped','shapeless','priority','repair']) {
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/native-extreme-${name}-contract.json`,import.meta.url),'utf8'));
    const decoded=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
    assert.deepEqual(decoded,fixture.recipe);
    assert.equal(decoded.process.kind,'extremeCrafting');
    const bad=structuredClone(decoded);bad.process.repair='unadapted';
    assert.throws(()=>decodeTable(encode({kind:'recipes',records:[bad]}),'recipes'));
  }
});

test('native AE2 translated explanations keep stable recipes and distinct locale text',async()=>{
  const {readFile}=await import('node:fs/promises');
  const fixtures=await Promise.all(['en_US','zh_CN'].map(async locale=>JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/ae-world-locale-4-${locale}-contract.json`,import.meta.url),'utf8'))));
  const rows=fixtures.map(fixture=>decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0]);
  assert.equal(rows[0].id,rows[1].id);
  assert.deepEqual(rows[0].process,rows[1].process);
  assert.ok(!('description' in rows[0].process));
  assert.equal(rows[0].notes[0].key,rows[1].notes[0].key);
  assert.equal(rows[0].notes[0].source,'appeng.core.localization.GuiText#inWorldFluix');
  assert.notEqual(rows[0].notes[0].text,rows[1].notes[0].text);
  fixtures.forEach((fixture,i)=>assert.equal(fixture.strings.find(text=>text.id===rows[i].notes[0].text).locale,['en_US','zh_CN'][i]));
  const old=structuredClone(rows[0]);old.process.description='localized process text';
  assert.throws(()=>decodeTable(encode({kind:'recipes',records:[old]}),'recipes'));
  const invalid=structuredClone(rows[0]);invalid.process.action={kind:'unadapted'};
  assert.throws(()=>decodeTable(encode({kind:'recipes',records:[invalid]}),'recipes'),error=>{
    assert.ok(error.message.length<=2048,'Strict validation flooded the user with unrelated schema branches');
    assert.match(error.message,/Invalid table:/);return true;
  });
  for(const kind of [undefined,'__proto__','future-kind'])assert.throws(()=>decodeTable(encode({kind,records:[]})));
});

test('native Railcraft independent fuel stays outside fixed per-batch materials',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/native-rail-blast-fuel-contract.json',import.meta.url),'utf8'));
  const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
  assert.equal(row.process.kind,'railcraftBlast');
  assert.equal(row.process.fuel.tick,'masterServerBurnBudgetMinusFiveEvenIdle');
  assert.equal(row.process.fuel.reload,'positiveInputRecipeOutputRoomUnpausedBudgetAtMostTenPositiveBurnAddSignedInt');
  const totals=calculateMaterials(row,'2'),fuel=row.process.fuel.allowed[0].item;
  assert.ok(!totals.inputs.some(item=>item.id===fuel));
  assert.equal(totals.uncertain.find(item=>item.id===fuel).amount,null);
  assert.match(totals.uncertain.find(item=>item.id===fuel).note,/独立可选燃料.*不按配方/);
  assert.equal(totals.outputs[0].amount,'6');
  const invalid=structuredClone(fixture.recipe);invalid.process.fuel.filter='ignoreNbt';
  assert.throws(()=>decodeTable(encode({kind:'recipes',records:[invalid]}),'recipes'));
});

test('native rolling NBT result keeps its machine process, tag projection and uncertain totals',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {recipeSampleIndex}=await import('../../catalog/src/selection.ts');
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/native-rolling-nbt-contract.json',import.meta.url),'utf8'));
  const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
  assert.equal(row.process.kind,'rolling');assert.equal(row.process.copyNbt,true);
  assert.equal(recipeSampleIndex(row,{},row.outputs[0],new Map(fixture.items.map(item=>[item.id,item]))),1);
  const totals=calculateMaterials(row,'2');assert.deepEqual(totals.outputs,[]);
  assert.match(totals.uncertain[0].note,/最后.*标签.*镜像/);
});

test('native AE2 ender-dust admission decodes independently of generic ore membership',async()=>{
  const {readFile}=await import('node:fs/promises');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/ae-world-locale-5-en_US-contract.json',import.meta.url),'utf8'));
  const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
  assert.deepEqual(row.inputs[1].choices[0].rule,{kind:'ae2EnderDust',ore:'dustEnder',metadata:0});
  const invalid=structuredClone(fixture.recipe);invalid.inputs[1].choices[0].rule.metadata=-1;
  assert.throws(()=>decodeTable(encode({kind:'recipes',records:[invalid]}),'recipes'));
});

test('native AE2 facade transport retains normalized block metadata without changing the input texture', async()=>{
  const {readFile}=await import('node:fs/promises');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/ae-facade-normalized-contract.json',import.meta.url),'utf8'));
  const row=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes').records[0];
  assert.equal(row.process.textureMetadata,4);
  assert.equal(fixture.items.find(item=>item.id===row.process.texture).meta,0);
  const invalid=structuredClone(fixture.recipe);invalid.process.textureMetadata=-1;
  assert.throws(()=>decodeTable(encode({kind:'recipes',records:[invalid]}),'recipes'));
});

test('native Railcraft literal wildcard decodes with concrete item visuals and rejects other negative metadata rules', async()=>{
  const {readFile}=await import('node:fs/promises');
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/native-rail-literal-wildcards-contract.json',import.meta.url),'utf8'));
  assert.ok(fixture.items.every(item=>item.meta>=0));
  const decoded=decodeTable(encode({kind:'recipes',records:[fixture.recipe]}),'recipes');
  assert.deepEqual(decoded.records[0].inputs[0].choices.slice(1).map(choice=>choice.rule.value),[-1,32767]);
  const invalid=structuredClone(fixture.recipe);invalid.inputs[0].choices[1].rule.value=-2;
  assert.throws(()=>decodeTable(encode({kind:'recipes',records:[invalid]}),'recipes'));
});

test('Binnie genepool preview retains bounds for other admitted genomes', () => {
  const product={slot:0,kind:'fluid',amount:null,change:null,chance:{numerator:'1',denominator:'1'},quantity:{kind:'potential',stat:'binnie:geneticTransform',nominal:'10',sample:'10'}};
  const process={kind:'binnie_genetics',machine:'genepool',domain:{rootClass:'forestry.apiculture.genetics.BeeHelper'}};
  assert.deepEqual(quantityBounds({process},product),[0n,50n]);
  assert.deepEqual(quantityBounds({process:{...process,domain:{rootClass:'forestry.lepidopterology.genetics.ButterflyRoot'}}},product),[0n,10n]);
  assert.deepEqual(quantityBounds({process},{...product,kind:'item',quantity:{...product.quantity,nominal:'1',sample:'1'}}),[0n,1n]);
  assert.throws(()=>quantityBounds({process:null},product));
  assert.throws(()=>quantityBounds({process:{...process,machine:'analyser'}},product));
  assert.throws(()=>quantityBounds({process},{...product,quantity:{...product.quantity,nominal:'51',sample:'51'}}));
});

test('Chisel stack conversion and disappearing tools keep conditional quantity bounds', () => {
  const process={kind:'chisel',mode:'single',targetCount:3};
  const product={slot:0,kind:'item',amount:null,change:null,chance:{numerator:'1',denominator:'1'},quantity:{kind:'potential',stat:'chisel:selection',nominal:'3',sample:'3'}};
  assert.deepEqual(quantityBounds({process},product),[0n,3n]);
  assert.deepEqual(quantityBounds({process:{...process,mode:'stack'}},{...product,quantity:{...product.quantity,nominal:'1',sample:'1'}}),[0n,2147483647n]);
  const tool={slot:1,kind:'item',role:'return',amount:'1',quantity:null,chance:{numerator:'1',denominator:'1'},change:{input:1,action:{kind:'chiselTool',source:0,mode:'single'},samples:[]}};
  assert.deepEqual(quantityBounds({process},tool),[0n,2147483647n]);
  assert.deepEqual(quantityBounds({process:null},{...tool,change:null}),[1n,1n]);
  assert.throws(()=>quantityBounds({process:null},product));
});

test('Harvest native draws preserve replacement, integer weights and unreachable candidates', () => {
  const product = (slot, nominal) => ({slot,kind:'item',amount:null,change:null,chance:{numerator:'1',denominator:'1'},quantity:{kind:'harvest',nominal}});
  const garden={process:{kind:'harvestDrops',mode:'garden',draws:4,weights:[1,1]}};
  assert.deepEqual(quantityBounds(garden,product(0,'1')),[0n,4n]);
  const trap={process:{kind:'harvestDrops',mode:'fish',draws:1,weights:[0,3]}};
  assert.deepEqual(quantityBounds(trap,product(0,'2')),[0n,0n]);
  assert.deepEqual(quantityBounds(trap,product(1,'3')),[3n,3n]);
  for (const process of [null,{...garden.process,draws:0},{...garden.process,weights:[0,0]},
    {...garden.process,weights:[2147483647,1]},{...garden.process,weights:[-1,2]}]) {
    assert.throws(()=>quantityBounds({process},product(0,'1')));
  }
  assert.throws(()=>quantityBounds(garden,product(2,'1')));
  assert.throws(()=>quantityBounds(garden,product(0,'2147483648')));
});

test('Blood altar previews never turn whole-stack multiplication into guaranteed per-batch yield', () => {
  const product={slot:0,kind:'item',amount:null,change:null,chance:{numerator:'1',denominator:'1'},quantity:{kind:'bloodAltar',nominal:'3'}};
  const altar={process:{kind:'bloodmagic-altar',canBeFilled:false}};
  assert.deepEqual(quantityBounds(altar,product),[0n,2147483647n]);
  for (const process of [null,{...altar.process,canBeFilled:true}]) assert.throws(()=>quantityBounds({process},product));
  assert.throws(()=>quantityBounds(altar,{...product,kind:'fluid'}));
  assert.throws(()=>quantityBounds(altar,{...product,quantity:{kind:'bloodAltar',nominal:'0'}}));
});

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
    return [...keys].map(id=>lookupRecipe(id));
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
  const api = await import('../../catalog/src/selection.ts').catch(() => null);
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

test('vanilla NBT selection uses the last tagged offered cell and follows horizontal mirroring', async () => {
  const { recipeSampleIndex, selectCraftingNbtSample, recipeGridCells } = await import('../../catalog/src/selection.ts');
  const recipe = {process:{kind:'craftingNbt'},grid:{width:2,height:2,mirror:true,cells:[0,1,null,2]},
    inputs:[{kind:'item',slot:0,choices:[{id:'tagged'}]},{kind:'item',slot:1,choices:[{id:'empty'}]},
      {kind:'item',slot:2,choices:[{id:'plain'},{id:'tagged'}]}],
    outputs:[{change:{input:0,action:{kind:'craftingNbt',base:{id:'base',amount:'3'}},
      samples:[{id:'base'},{id:'owner'},{id:'empty-result'},{id:'base'},{id:'owner'}]}}]};
  const items = new Map([['tagged',{nbt:{type:'compound',value:{owner:{type:'string',value:'retained'}}}}],
    ['empty',{nbt:{type:'compound',value:{}}}],['plain',{nbt:null}]]);
  assert.equal(recipeSampleIndex(recipe,{},recipe.outputs[0],items),2);
  assert.equal(recipeSampleIndex(recipe,{},recipe.outputs[0],items,true),1);
  assert.equal(recipeSampleIndex(recipe,{inputitem2:1},recipe.outputs[0],items,true),4);
  assert.throws(()=>recipeSampleIndex(recipe,{},recipe.outputs[0]),/NBT|原生/);
  assert.throws(()=>recipeSampleIndex(recipe,{},recipe.outputs[0],new Map()),/输入|物品/);
  const untagged = new Map([...items].map(([id])=>[id,{nbt:null}]));
  assert.equal(recipeSampleIndex(recipe,{},recipe.outputs[0],untagged),0);
  assert.deepEqual(recipeGridCells(recipe,true),[1,0,2,null]);
  const selection = {};
  const mirror = selectCraftingNbtSample(recipe,selection,recipe.outputs[0],1,items);
  assert.equal(mirror,true);
  assert.equal(recipeSampleIndex(recipe,selection,recipe.outputs[0],items,mirror),1);
  assert.equal(selectCraftingNbtSample(recipe,{},recipe.outputs[0],0,items),undefined);
});

test('native NBT equality follows actual Java floats, compounds and empty-list types', async () => {
  const {nativeNbtEqual}=await import('../../catalog/src/native-nbt.ts');
  const {readFile}=await import('node:fs/promises');
  const cases=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/gt-native-tag-equality.json',import.meta.url),'utf8'));
  for(const specimen of cases) assert.equal(nativeNbtEqual(specimen.left,specimen.right),specimen.nativeEqual,specimen.name);
  assert.equal(nativeNbtEqual(null,null),true);
  assert.equal(nativeNbtEqual(null,{type:'compound',value:{}}),false);
});

test('GT native result selection binds folded witnesses, offered order and signed-zero tags',async()=>{
  const {gtCraftingSampleIndex,gtCraftingWitness}=await import('../../catalog/src/gt-crafting.ts');
  const {readFile}=await import('node:fs/promises');
  for(const name of ['overwrite','keeping']) {
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/native-gt-crafting-${name}-contract.json`,import.meta.url),'utf8'));
    const recipe=fixture.recipe,items=new Map(fixture.items.map(item=>[item.id,item]));
    recipe.process.states.forEach((_,index)=>{
      const witness=gtCraftingWitness(recipe,index);
      assert.equal(gtCraftingSampleIndex(recipe,witness.choices,witness.order,items),index);
    });
    const choices=recipe.inputs.map(()=>0),order=recipe.inputs.map((_,index)=>index);
    const forward=gtCraftingSampleIndex(recipe,choices,order,items),reverse=gtCraftingSampleIndex(recipe,choices,order.toReversed(),items);
    if(name==='keeping')assert.notEqual(forward,reverse,'native-equal signed-zero tags still preserve the FIRST exact result identity');
    assert.throws(()=>gtCraftingSampleIndex(recipe,choices,order.map(()=>0),items),/order|顺序/);
    const missing=structuredClone(recipe);missing.process.states.pop();missing.outputs[0].change.samples.pop();
    const wanted=gtCraftingWitness(recipe,recipe.process.states.length-1);
    assert.throws(()=>gtCraftingSampleIndex(missing,wanted.choices,wanted.order,items),/missing|缺少/);
  }
  const neutral=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/native-gt-crafting-neutral-contract.json',import.meta.url),'utf8'));
  const items=new Map(neutral.items.map(item=>[item.id,item]));
  assert.equal(gtCraftingSampleIndex(neutral.recipe,[0,0],[0,1],items),undefined);
  assert.equal(gtCraftingSampleIndex(neutral.recipe,[1,1],[0,1],items),0);
});

test('IC2 Advanced selects actual Java double-charge states and native compact grids',async()=>{
  const {ic2AdvancedSampleIndex,ic2AdvancedWitness,ic2AdvancedGrid}=await import('../../catalog/src/ic2-advanced.ts');
  const {readFile}=await import('node:fs/promises');
  for(const name of ['shaped','electric']){
    const fixture=JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/native-ic2-advanced-${name}-contract.json`,import.meta.url),'utf8'));
    const recipe=fixture.recipe,items=new Map(fixture.items.map(item=>[item.id,item]));
    recipe.process.states.forEach((_,index)=>{const witness=ic2AdvancedWitness(recipe,index);assert.equal(ic2AdvancedSampleIndex(recipe,witness.choices,witness.order,items),index);});
    if(name==='shaped')assert.deepEqual(ic2AdvancedGrid(recipe),recipe.grid.cells);
    else {assert.equal(recipe.process.states.length,2);assert.notEqual(ic2AdvancedSampleIndex(recipe,[0,0],[0,1],items),ic2AdvancedSampleIndex(recipe,[1,0],[0,1],items));}
    const bad=structuredClone(recipe);bad.process.charges[0][0]='0';assert.throws(()=>ic2AdvancedSampleIndex(bad,recipe.inputs.map(()=>0),recipe.inputs.map((_,i)=>i),items),/double bits/);
    const missing=structuredClone(recipe);missing.process.states.pop();missing.outputs[0].change.samples.pop();const witness=ic2AdvancedWitness(recipe,recipe.process.states.length-1);assert.throws(()=>ic2AdvancedSampleIndex(missing,witness.choices,witness.order,items),/missing/);
  }
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
    async records(kind,ids) { if(kind==='browse')return [...ids].map(id=>rows.find(r=>r.id===id));if(kind==='index')return [{id:'recipe_x',owner:'mod',handler:'machine',category:'cat',targets:['item_a']}];if(kind==='recipes')return [lookupRecipe('recipe_x')];return []; }
  };
  const q=new Query(catalog), options={query:'',mod:'',kind:'all',group:'',collapsed:false,offset:0,limit:10};
  assert.deepEqual((await q.items(options)).rows.map(r=>r.id),['item_b','item_c','item_a']);
  assert.deepEqual((await q.items({...options,collapsed:true})).rows.map(r=>r.id),['item_a','item_c']);
  assert.deepEqual((await q.items({...options,collapsed:true,offset:1,limit:1})).rows,[rows[2]]);
  assert.deepEqual((await q.items({...options,query:'iron',collapsed:true})).rows,[rows[0]]);
  assert.deepEqual((await q.facets()).mods,[{id:'mod',count:2},{id:'other',count:1}]);
  assert.deepEqual((await q.recipes({item:'item_a',direction:'recipes',category:'',query:'iron',offset:0,limit:10})).rows,[lookupRecipe('recipe_x')]);
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


test('headless recipe hydration retains notes and icon animation without GUI collections', async () => {
  const { Query } = await import('../../catalog/src/query.ts');
  const data = {
    categories:[{id:'category',source:{owner:'fixture',handler:'lookup',key:'lookup'},order:0,
      name:'category-name',icon:null,machines:[],notes:[{key:'native:machine',source:'Machine#rule',text:'machine-note'}]}],
    items:[{id:'item',registry:'fixture:item',meta:0,nbt:null,stackLimit:64,durability:0,
      tools:{},armor:false,tags:[],name:'item-name',tooltip:[],icon:'item-animation'}],
    fluids:[],topics:[],
    strings:['category-name','machine-note','recipe-note','item-name'].map(id=>({id,locale:'en_US',text:id})),
    textures:[{id:'item-animation',width:16,height:16,frames:[
      {path:'atlas.png',x:0,y:0,width:16,height:16,ticks:2},
      {path:'atlas.png',x:16,y:0,width:16,height:16,ticks:3}],interpolate:false}],
  };
  const catalog={records:async(kind,ids)=>{
    if(!Object.hasOwn(data,kind))throw new Error('Unsupported current collection: '+kind);
    const wanted=new Set(ids);return data[kind].filter(row=>wanted.has(row.id));
  }};
  const recipe={...lookupRecipe('recipe'),category:'category',notes:[{key:'native:rule',source:'Recipe#rule',text:'recipe-note'}],
    inputs:[{kind:'item',slot:0,choices:[{id:'item',amount:'1',consume:{kind:'consume'},rule:{kind:'exact'},returns:[]}]}]};
  const related=await new Query(catalog).related([recipe]);
  assert.deepEqual(related.textures,data.textures);
  assert.deepEqual(new Set(related.strings.map(row=>row.id)),new Set(data.strings.map(row=>row.id)));
  assert.equal(Object.hasOwn(related,'views'),false);
  assert.equal(Object.hasOwn(related,'tracks'),false);
});

test('current transport refuses retired recipe GUI tables and fields',()=>{
  assert.throws(()=>assertTable({kind:'views',records:[]}));
  assert.throws(()=>assertTable({kind:'tracks',records:[]}));
  const recipe=lookupRecipe('recipe');
  delete recipe.view;
  assert.doesNotThrow(()=>assertTable({kind:'recipes',records:[recipe]}));
  assert.throws(()=>assertTable({kind:'recipes',records:[{...recipe,view:null}]}));
});
