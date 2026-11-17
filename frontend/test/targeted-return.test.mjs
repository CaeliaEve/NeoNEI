import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {validateNativeContainers} from '../../catalog/src/native-container.ts';
import {quantityBounds} from '../../catalog/src/quantity.ts';

function fixture(name){
  return JSON.parse(readFileSync(new URL(`../../../elysium-compiler/contracts/fixtures/targeted-${name}-contract.json`,import.meta.url),'utf8'));
}
function facts(value){return new Map(value.items.map(item=>[item.id,{stackLimit:64,...item}]));}

test('targeted Botania containers accept exact native items without fixed remainders',()=>{
  for(const name of ['container-planet','container-blackhole']){
    const value=fixture(name);
    assert.doesNotThrow(()=>validateNativeContainers(value.recipe,facts(value)));
    const bad=facts(value);
    for(const [id,item]of bad)bad.set(id,{...item,registry:'minecraft:paper'});
    assert.throws(()=>validateNativeContainers(value.recipe,bad));
  }
});

test('ARI workbench containers use current handlers and reject retired lifecycle bindings',()=>{
  const value=fixture('container-planet'),recipe=structuredClone(value.recipe);
  recipe.process=null;
  for(const handler of ['ShapedArcaneRecipeHandler','ShapelessArcaneRecipeHandler']){
    recipe.source={...recipe.source,owner:'aspectrecipeindex',handler:'com.gtnewhorizons.aspectrecipeindex.nei.arcaneworkbench.'+handler};
    assert.doesNotThrow(()=>validateNativeContainers(recipe,facts(value)));
    recipe.source.owner='foreign';
    assert.throws(()=>validateNativeContainers(recipe,facts(value)));
  }
  recipe.source.handler='ru.timeconqueror.tcneiadditions.nei.arcaneworkbench.ArcaneCraftingShapedHandler';
  assert.throws(()=>validateNativeContainers(recipe,facts(value)));
});

test('ARI native infusion accepts target provenance without weakening cost and owner guards',async()=>{
  const {validateRecipe}=await import('../../catalog/src/recipe-validation.ts');
  const value=fixture('random-infusion-false'),recipe=structuredClone(value.recipe);
  recipe.source={...recipe.source,owner:'aspectrecipeindex',handler:'com.gtnewhorizons.aspectrecipeindex.nei.InfusionRecipeHandler'};
  assert.doesNotThrow(()=>validateRecipe(recipe,facts(value)));
  for(const source of [
    {...recipe.source,owner:'foreign'},
    {...recipe.source,handler:'com.gtnewhorizons.aspectrecipeindex.nei.AlchemyRecipeHandler'},
    {...recipe.source,owner:'tcneiadditions',handler:'ru.timeconqueror.tcneiadditions.nei.TCNAInfusionRecipeHandler'},
  ])assert.throws(()=>validateRecipe({...recipe,source},facts(value)));
});

test('wireless upgrade matches only physical cells 0 and 1 and copies actual stack state',async()=>{
  const module=await import('../../catalog/src/wireless-terminal.ts').catch(()=>null);
  assert.ok(module,'Dedicated wireless terminal process is missing');
  const value=fixture('wireless-upgrade'),{recipe}=value,p=recipe.process;
  module.validateWirelessTerminalRecipe(recipe,facts(value));
  const terminal=value.items.find(i=>i.registry===p.terminals[0]),card=value.items.find(i=>i.registry===p.boosters[0]);
  const offered={...terminal,amount:'3'};
  const grid=[offered,card,{registry:'minecraft:diamond',meta:0,nbt:null},...Array(6).fill(null)];
  assert.equal(module.wirelessTerminalMatches(p,grid),true);
  assert.equal(module.wirelessTerminalMatches(p,[card,offered,...Array(7).fill(null)]),false);
  const actual=module.wirelessTerminalResult(p,offered);
  assert.equal(actual.amount,'3');assert.equal(actual.meta,terminal.meta);
  assert.equal(actual.nbt.value.owner.value,'retained');assert.equal(actual.nbt.value[p.flag].value,'1');
  assert.equal(offered.nbt.value[p.flag],undefined);
  for(const [tag,expected]of [[{type:'byte',value:'1'},false],[{type:'int',value:'256'},true],[{type:'string',value:'true'},true]]){
    const copy=structuredClone(grid);copy[0].nbt.value[p.flag]=tag;
    assert.equal(module.wirelessTerminalMatches(p,copy),expected);
  }
  assert.deepEqual(quantityBounds(recipe,recipe.outputs[0]),[1n,2147483647n]);
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  assert.deepEqual(calculateMaterials(recipe,'100').outputs,[]);
  for(const locale of ['zh-CN','en-US']){
    const note=module.wirelessTerminalNote(p,locale);
    assert.match(note,locale==='en-US'?/ignored.*consum|consum.*ignored/:/忽略.*消耗|消耗.*忽略/);
    if(locale==='en-US')assert.doesNotMatch(note,/\p{Script=Han}/u);
  }
  const bad=structuredClone(recipe);bad.outputs[0].change.action.set[p.flag].value='0';
  assert.throws(()=>module.validateWirelessTerminalRecipe(bad,facts(value)));
});

test('random infusion retains zero-inclusive native ranges without claiming a fixed cost',async()=>{
  const module=await import('../../catalog/src/infusion-cost.ts').catch(()=>null);
  assert.ok(module,'Random infusion cost law is missing');
  const {validateNativeInfusionRecipe,nativeInfusionCosts}=await import('../../catalog/src/infusion.ts');
  for(const half of [false,true]){
    const value=fixture(`random-infusion-${half}`),p=value.recipe.process;
    validateNativeInfusionRecipe(value.recipe,facts(value));
    assert.equal(nativeInfusionCosts(p,value.items[0]).aspects,null);
    assert.deepEqual(module.randomInfusionCostRanges(p.randomAspects).map(r=>[r.min,r.max]),half?[[4,7]]:[[0,8]]);
    for(const locale of ['zh-CN','en-US']){
      const note=module.randomInfusionCostNote(p.randomAspects,locale);
      assert.match(note,/500/);if(locale==='en-US')assert.doesNotMatch(note,/\p{Script=Han}/u);
    }
    const bad=structuredClone(value.recipe);bad.process.randomAspects.bases[0].amount='0';
    assert.throws(()=>validateNativeInfusionRecipe(bad,facts(value)));
  }
});

test('random cost evaluation dispatches by stable semantics rather than a mod release',async()=>{
  const {randomInfusionCostRanges}=await import('../../catalog/src/infusion-cost.ts');
  const law={kind:'gadomancy',semantics:'gadomancyRandomCostsV1',halfCap:false,
    refreshMillis:500,bases:[{aspect:'aspect_air',amount:'9'}]};
  assert.deepEqual(randomInfusionCostRanges(law),[{aspect:'aspect_air',min:0,max:8}]);
  assert.deepEqual(randomInfusionCostRanges({...law,halfCap:true}),[{aspect:'aspect_air',min:4,max:7}]);
  assert.throws(()=>randomInfusionCostRanges({...law,semantics:'unreviewedRule'}));
});
