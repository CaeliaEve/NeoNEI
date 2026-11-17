import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const load = async () => {
  const module = await import('../../catalog/src/recipe-evaluation.ts').catch(() => ({}));
  assert.equal(typeof module.evaluateRecipeFacts, 'function', 'shared recorded-fact evaluator is missing');
  return module;
};
const fixture = async name => JSON.parse(await readFile(
  new URL(`../../../elysium-compiler/contracts/fixtures/${name}-contract.json`, import.meta.url), 'utf8'));
const items = rows => new Map(rows.map(row => [row.id, row]));
const choice = id => ({id,amount:'1',rule:{kind:'exact'},consume:{kind:'consume'},returns:[]});
const product = (id, change = null) => ({kind:'item',slot:0,role:'result',id,amount:'9007199254740993',
  chance:{numerator:'1',denominator:'3'},quantity:null,change});
const basic = () => ({id:'recipe-fixture',source:{owner:'fixture',handler:'fixture',key:'one'},category:'cat',order:0,
  inputs:[{kind:'item',slot:0,choices:[choice('left'),choice('right')]}],outputs:[product('result')],
  properties:{},process:null,grid:null,magic:null,duration:null,energy:null});

test('shared selection preserves correlated empty columns and stable compatible tuple choice', async () => {
  const shared = await import('../../catalog/src/selection.ts').catch(() => ({}));
  assert.equal(typeof shared.selectRecipeChoice,'function','selection is still owned by the frontend');
  const recipe=basic();
  recipe.inputs.push({kind:'item',slot:1,choices:[choice('other')]});
  recipe.outputs=[product('out',{input:0,action:{kind:'fixture'},samples:[{id:'a'},{id:'b'},{id:'c'}],
    bindings:[[0,-1],[1,0],[1,-1]]})];
  const selected={};
  shared.selectRecipeSample(recipe,selected,0);
  shared.selectRecipeChoice(recipe,selected,recipe.inputs[0],1);
  assert.deepEqual(selected,{inputitem0:1,inputitem1:-1});
  assert.equal(shared.recipeSampleIndex(recipe,selected,recipe.outputs[0]),2);
});

test('shared initialization retains native output witnesses and recorded sample correlation', async () => {
  const {initializeRecipeSelection,evaluateRecipeFacts}=await load();
  for(const name of ['native-gt-crafting-shaped','native-ic2-advanced-shaped']){
    const f=await fixture(name),output=f.recipe.outputs[0],index=output.change.samples.length-1;
    const state=initializeRecipeSelection(f.recipe,items(f.items),{sample:{output:0,index}});
    const result=evaluateRecipeFacts(f.recipe,items(f.items),state);
    assert.equal(result.status,'matched',name);
    assert.equal(result.products[0].sample,index,name);
    assert.equal(result.products[0].output.id,output.change.samples[index].id,name);
    assert.equal(result.products[0].evidence,'observed-sample');
    assert.equal(result.products[0].guaranteed,false);
  }
});

test('NBT witnesses retain empty tagged compounds, exact typed longs and unreachable selection state', async () => {
  const {initializeRecipeSelection,evaluateRecipeFacts}=await load();
  const recipe=basic();
  recipe.inputs=[{kind:'item',slot:0,choices:[choice('tagged')]},{kind:'item',slot:1,choices:[choice('empty')]}];
  recipe.process={kind:'craftingNbt'};
  recipe.grid={width:2,height:1,cells:[0,1],mirror:true};
  recipe.outputs=[product('base',{input:0,action:{kind:'craftingNbt',base:{id:'base',amount:'1'}},
    samples:[{id:'base'},{id:'left-result'},{id:'empty-result'}]})];
  const rows=items([{id:'tagged',nbt:{type:'compound',value:{tick:{type:'long',value:'9223372036854775807'}}}},
    {id:'empty',nbt:{type:'compound',value:{}}}]);
  const state=initializeRecipeSelection(recipe,rows);
  const saved=structuredClone(state);
  assert.equal(evaluateRecipeFacts(recipe,rows,state).products[0].output.id,'empty-result');
  assert.equal(evaluateRecipeFacts(recipe,rows,{...state,mirrored:true}).products[0].output.id,'left-result');
  const unreachable=initializeRecipeSelection(recipe,rows,{sample:{output:0,index:0}});
  assert.equal(unreachable.reachable,false);
  assert.equal(evaluateRecipeFacts(recipe,rows,unreachable).status,'unmatched');
  assert.deepEqual(state,saved,'evaluation must not mutate caller-owned state');
  assert.equal(rows.get('tagged').nbt.value.tick.value,'9223372036854775807');
});

test('CreativeCore and Enchanter require caller context and evaluate actual gates', async () => {
  const {initializeRecipeSelection,evaluateRecipeFacts}=await load();
  const enchanter=await fixture('native-enchanter-level-2');
  const state=initializeRecipeSelection(enchanter.recipe,items(enchanter.items));
  assert.equal(evaluateRecipeFacts(enchanter.recipe,items(enchanter.items),state).status,'missing-context');
  const accepted={kind:'enderioEnchanter',count:enchanter.recipe.process.offeredMinimum,bookPresent:true};
  assert.equal(evaluateRecipeFacts(enchanter.recipe,items(enchanter.items),state,accepted).status,'matched');
  const blocked=evaluateRecipeFacts(enchanter.recipe,items(enchanter.items),state,{...accepted,bookPresent:false});
  assert.equal(blocked.status,'unmatched');assert.deepEqual(blocked.products,[]);
  const creative=await fixture('creativecore-owned-stock'),rows=items(creative.items);
  const offered=initializeRecipeSelection(creative.recipe,rows);
  assert.equal(evaluateRecipeFacts(creative.recipe,rows,offered).status,'missing-context');
  const counts=creative.recipe.inputs.map(input=>String(Math.max(1,creative.recipe.process.predicates[input.choices[0].rule.input].minimum)));
  assert.equal(evaluateRecipeFacts(creative.recipe,rows,offered,{kind:'creativeCoreCrafting',counts}).status,'matched');
  assert.equal(evaluateRecipeFacts(creative.recipe,rows,offered,{kind:'creativeCoreCrafting',counts:counts.map(()=>'0')}).status,'unmatched');
});

test('native pool and empty genetics samples remain prototypes rather than guaranteed products', async () => {
  const {initializeRecipeSelection,evaluateRecipeFacts}=await load();
  for(const [name,observation,visible]of [
    ['botania-native-pool-0','prototype',true],
    ['gendustry-template-gui-free','unobserved',false],
    ['gendustry-imprinter-native-0-en_US','prototype',true],
  ]){
    const f=await fixture(name),rows=items(f.items),state=initializeRecipeSelection(f.recipe,rows);
    const result=evaluateRecipeFacts(f.recipe,rows,state);
    assert.equal(result.status,'missing-context',name);
    assert.equal(result.observation,observation,name);
    assert.equal(result.products.length>0,visible,name);
    if(visible){assert.equal(result.products[0].evidence,'prototype');assert.equal(result.products[0].guaranteed,false);}
  }
});

test('Matter matching without native normalization is unobserved, not unmatched', async () => {
  const {initializeRecipeSelection,evaluateRecipeFacts}=await load();
  const recipe=basic(),center={id:'left',registry:'native:mm',meta:0,nbt:null},component={id:'right',registry:'native:meta',meta:95,nbt:null};
  const upgrade={name:'Mining',ordinal:1,id:95,bit:1,providesCaps:4};
  recipe.inputs=[{kind:'item',slot:0,choices:[choice(center.id)]},{kind:'item',slot:1,choices:[choice(component.id)]}];
  recipe.process={kind:'matterManipulatorUpgrade',manipulator:center.registry,metaItems:[component.registry],
    mappings:[{metadata:95,upgrade}],defaultUpgrade:null,upgrade,states:[]};
  const rows=items([center,component]),state=initializeRecipeSelection(recipe,rows);
  const result=evaluateRecipeFacts(recipe,rows,state);
  assert.equal(result.status,'matched');
  assert.equal(result.observation,'unobserved');
  assert.equal(result.reason,'native-normalization-unobserved');
  assert.deepEqual(result.products,[]);
});

test('decay adapter preserves signed-long overflow, malformed state faults and bounded steps', async () => {
  const {evaluateDecayContext}=await load();
  const f=await fixture('native-decay-state'),process=f.recipe.process;
  const result=evaluateDecayContext(process,{kind:'decayChest',state:'saved',tick:'9223372036854775807'});
  assert.ok(result.steps<=20);
  assert.equal(result.input.value.TickableItem.value.Tick.value,'9223372036854775807');
  assert.equal(evaluateDecayContext(process,{kind:'decayChest',state:'fault'}).outcome,'fault');
  assert.throws(()=>evaluateDecayContext(process,{kind:'decayChest',state:'saved',tick:'9223372036854775808'}),/tick/i);
  assert.throws(()=>evaluateDecayContext(process,{kind:'decayChest',state:'saved',tick:'01'}),/tick/i);
});

test('recorded output keeps exact amount/chance while unknown execution laws are unsupported', async () => {
  const {initializeRecipeSelection,evaluateRecipeFacts}=await load();
  const recipe=basic(),state=initializeRecipeSelection(recipe,new Map());
  const result=evaluateRecipeFacts(recipe,new Map(),state);
  assert.equal(result.status,'matched');
  assert.equal(result.products[0].output.amount,'9007199254740993');
  assert.deepEqual(result.products[0].output.chance,{numerator:'1',denominator:'3'});
  assert.equal(result.products[0].conditional,true);
  assert.equal(result.products[0].guaranteed,false);
  const unsupported=evaluateRecipeFacts({...recipe,process:{kind:'forestrySqueezer'}},new Map(),state);
  assert.equal(unsupported.status,'unsupported');
  assert.equal(unsupported.products[0].evidence,'prototype');
});

test('GT recorded probabilities do not certify native machine matching or reference-only execution', async () => {
  const {initializeRecipeSelection,evaluateRecipeFacts}=await load();
  const recipe=basic();
  recipe.gtNative=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/gt-native-probability-facts.json',import.meta.url),'utf8'));
  const state=initializeRecipeSelection(recipe,new Map());
  const unresolved=evaluateRecipeFacts(recipe,new Map(),state);
  assert.equal(unresolved.status,'missing-context');
  assert.equal(unresolved.reason,'gt-machine-context-required');
  assert.equal(unresolved.products[0].evidence,'prototype');
  assert.equal(unresolved.products[0].guaranteed,false);
  recipe.gtNative.fake=true;
  recipe.gtNative.policy.execution='referenceOnly';
  const reference=evaluateRecipeFacts(recipe,new Map(),state);
  assert.equal(reference.status,'unsupported');
  assert.equal(reference.reason,'gt-reference-only');
});

test('public request parser rejects malformed bounded payloads before catalog access', async () => {
  const {readRecipeSelectionRequest}=await load();
  const valid={catalog:'a'.repeat(64),recipe:'recipe-one',choices:[0],order:[0],mirrored:false};
  assert.deepEqual(readRecipeSelectionRequest(valid),valid);
  for(const delta of [{choices:[1.5]},{choices:[-2]},{mirrored:'true'},{order:[0,0]},
    {context:{kind:'creativeCoreCrafting',counts:['2147483648']}},{extra:true},{choices:Array(82).fill(0)}]){
    assert.throws(()=>readRecipeSelectionRequest({...valid,...delta}),/selection|context|order|count/i);
  }
  assert.throws(()=>readRecipeSelectionRequest(JSON.parse('{"catalog":"'+'a'.repeat(64)+'","recipe":"x","__proto__":{}}')),/selection/i);
});

test('world-only daisy witnesses retain a prototype without pretending a concrete block was offered',async()=>{
  const {initializeRecipeSelection,evaluateRecipeFacts}=await load();
  const recipe=basic();recipe.inputs=[];
  recipe.process={kind:'botaniaWorld',machine:'daisy',inputSlots:[null]};
  const result=evaluateRecipeFacts(recipe,new Map(),initializeRecipeSelection(recipe,new Map()));
  assert.equal(result.status,'missing-context');
  assert.equal(result.reason,'world-block-required');
  assert.equal(result.products[0].evidence,'prototype');
});

// Synthetic family-valid records: no recorded petal/brewery fixtures are available.
const syntheticWorld = machine => {
  const auxiliary = machine === 'petal' ? 16 : 6;
  const rows = [
    {id:'first',registry:'Botania:petal',meta:0,nbt:null},
    {id:'second',registry:'Botania:petal',meta:1,nbt:null},
    {id:'auxiliary',registry:machine==='petal'?'minecraft:wheat_seeds':'Botania:vial',meta:0,nbt:null},
  ];
  const recipe = basic();
  recipe.source = {owner:'Botania',handler:'vazkii.botania.client.integration.nei.recipe.RecipeHandler'
    +(machine==='petal'?'PetalApothecary':'Brewery'),key:'synthetic-order'};
  recipe.inputs = rows.map((row,index)=>({kind:'item',slot:index===2?auxiliary:index,
    choices:[{...choice(row.id),rule:{kind:'wildcard',meta:index===2&&machine==='petal',nbt:true}}]}));
  recipe.outputs = [{...product('result'),amount:'1',chance:{numerator:'1',denominator:'1'}}];
  recipe.process = {kind:'botaniaWorld',version:'1.12.28-GTNH',machine,selector:0,
    predicates:[
      [{registry:'Botania:petal',metadata:0,wildcard:false,species:null,block:null}],
      [{registry:'Botania:petal',metadata:1,wildcard:false,species:null,block:null}],
    ],
    inputSlots:[0,1],priority:[],speciesDominance:{},worldResult:null,
    seed:machine==='petal'?'auxiliary':null,container:machine==='brewery'?6:null,
    mana:machine==='brewery'?100:null,brew:machine==='brewery'?'synthetic-order':null};
  return {recipe,rows:items(rows),auxiliary};
};

for (const machine of ['petal','brewery']) {
  test(`synthetic Botania ${machine} replays normalized ingredient-only selection`,async()=>{
    const {initializeRecipeSelection,evaluateRecipeFacts}=await load();
    const {validateBotaniaWorldRecipe}=await import('../../catalog/src/botania-world.ts');
    const {recipe,rows}=syntheticWorld(machine);
    validateBotaniaWorldRecipe(recipe,rows);
    const state=initializeRecipeSelection(recipe,rows);
    assert.deepEqual(state.order,[0,1]);
    const replay=initializeRecipeSelection(recipe,rows,state);
    assert.deepEqual(replay,state);
    const result=evaluateRecipeFacts(recipe,rows,replay);
    assert.equal(result.status,'matched');
    assert.equal(result.products[0].output.id,'result');
  });

  test(`synthetic Botania ${machine} accepts ingredient permutations`,async()=>{
    const {initializeRecipeSelection,evaluateRecipeFacts}=await load();
    const {recipe,rows}=syntheticWorld(machine);
    const state=initializeRecipeSelection(recipe,rows,{order:[1,0]});
    assert.deepEqual(state.order,[1,0]);
    assert.equal(evaluateRecipeFacts(recipe,rows,state).status,'matched');
  });

  test(`synthetic Botania ${machine} rejects auxiliary slots in offered ingredient order`,async()=>{
    const {initializeRecipeSelection}=await load();
    const {recipe,rows,auxiliary}=syntheticWorld(machine);
    for (const order of [[0,1,auxiliary],[0,auxiliary]]) {
      assert.throws(()=>initializeRecipeSelection(recipe,rows,{order}),error=>
        error.code==='invalid_query'&&/order/i.test(error.message));
    }
  });
}

test('transport reader rejects contradictory statuses and malformed decay/range facts',async()=>{
  const {readRecipeSelectionResult,initializeRecipeSelection,evaluateRecipeFacts}=await load();
  const recipe=basic(),catalog='a'.repeat(64),base={catalog,recipe:recipe.id,
    ...evaluateRecipeFacts(recipe,new Map(),initializeRecipeSelection(recipe,new Map()))};
  for(const delta of [
    {status:'unmatched'},
    {decay:{outcome:'complete',steps:21,input:null,state:null}},
    {decay:{outcome:'complete',steps:0,input:null,state:{type:'compound',value:{tick:{type:'long',value:9223372036854776000}}}}},
    {infusionRanges:[{aspect:'a',min:10,max:9}]},
  ])assert.throws(()=>readRecipeSelectionResult({...base,...delta},catalog,recipe.id),/selection|decay|range|table|contract/i);
});

test('fixed IC2 occupancy masks reject caller order that would otherwise be silently ignored',async()=>{
  const {initializeRecipeSelection}=await load();
  const f=await fixture('native-ic2-advanced-shaped'),rows=items(f.items);
  const state=initializeRecipeSelection(f.recipe,rows);
  assert.throws(()=>initializeRecipeSelection(f.recipe,rows,{order:[...state.order].reverse()}),/order|grid/i);
});
