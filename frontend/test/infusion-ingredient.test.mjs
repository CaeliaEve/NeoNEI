import assert from 'node:assert/strict';
import test from 'node:test';
import {enhancedIngredientMatch, enhancedComponentsMatch} from '../../catalog/src/infusion-ingredient.ts';
import {nativeRunicNote,validateNativeInfusionRecipe} from '../../catalog/src/infusion.ts';

const item = (registry, tags = [], nbt = null) => ({registry, meta: 7, tags, nbt});

test('enhanced wildcard item predicates retain exact NBT checks through OR and defer', () => {
  const tag = {type: 'compound', value: {key: {type: 'int', value: '1'}}};
  const template = {registry: 'native:wood', metadata: 32767, nbt: tag};
  const predicate = {kind: 'deferred', template, rule: {kind: 'any', options: [
    {kind: 'never'}, {kind: 'items', templates: [template], nbt: true},
  ]}};
  assert.equal(enhancedIngredientMatch(predicate, item('native:wood', [], tag)), true);
  assert.equal(enhancedIngredientMatch(predicate, item('native:wood')), false);
  const nan = {type: 'compound', value: {value: {type: 'float', value: '7fc00000'}}};
  const exact = {kind: 'items', templates: [{...template, nbt: nan}], nbt: true};
  assert.equal(enhancedIngredientMatch(exact, item('native:wood', [], nan)), false);
});

test('enhanced matching accepts leftovers but keeps greedy declaration order and exclusive ores', () => {
  const a = {kind: 'ore', name: 'a', exclusive: false};
  const b = {kind: 'ore', name: 'b', exclusive: false};
  const both = item('native:both', ['a', 'b']);
  const onlyA = item('native:a', ['a']);
  assert.equal(enhancedComponentsMatch([a, b], [both, onlyA]), false);
  assert.equal(enhancedComponentsMatch([a, b], [onlyA, both, item('native:extra')]), true);
  assert.equal(enhancedIngredientMatch({...a, exclusive: true}, both), false);
});

test('runic symbolic pedestal counts remain bounded and language specific at INT_MAX', () => {
  const process = {charge: 2147483647, pedestalLimit: 1, pattern: {mode: 'Relaxed'}};
  const en = nativeRunicNote(process, 'en-US');
  assert.match(en, /2147483648 resource pedestals/);
  assert.doesNotMatch(en, /\p{Script=Han}/u);
  assert.match(nativeRunicNote(process, 'zh-CN'), /2147483648 个资源基座/);
});

test('enhanced startup and cycle keep different cardinalities and independent extra stock', () => {
  const names=['center','cycle','first','second'];
  const items=new Map(names.map(id=>[id,{id,registry:'native:'+id,meta:0,nbt:null,tags:[]}]));
  const template=id=>({registry:'native:'+id,metadata:0,nbt:null});
  const requirement={template:template('cycle'),defaultOres:[],ores:[],tagStrings:{},cycleTagStrings:{},copies:2};
  const process={kind:'nativeInfusion',nativeRecipe:'net.glease.tc4tweak.api.infusionrecipe.EnhancedInfusionRecipe',
    declaredInput:template('center'),effect:{kind:'declared'},baseAspects:[],baseInstability:0,pedestalLimit:1,pedestals:[],replacementsActive:false,
    pattern:{mode:'None',startup:'enhanced',allowExtra:true,central:null,components:[requirement],
      predicates:['center','first','second'].map(id=>({kind:'items',templates:[template(id)],nbt:true})),
      states:names.map(id=>({id,ores:[],wildcardOres:[],tagStrings:{},copiedTagStrings:{},pedestalTagStrings:{},augmentKeys:[],copiedAugmentKeys:[],lowercaseKeys:{}}))}};
  const recipe={source:{owner:'aspectrecipeindex',handler:'com.gtnewhorizons.aspectrecipeindex.nei.InfusionRecipeHandler'},grid:null,duration:null,energy:null,
    process,magic:{kind:'infusion',central:0,instability:0,payment:null,creative:false,research:[],aspects:[]},
    inputs:['center','first','second','cycle'].map((id,slot)=>({slot,kind:'item',choices:[{id,amount:'1',consume:{kind:slot===0?'stack':'allocated'},returns:[],rule:{kind:'exact'}}]})),
    outputs:[{slot:0,kind:'item',id:'result',amount:'1',role:'result',quantity:null,change:null,chance:{numerator:'1',denominator:'1'}}]};
  assert.doesNotThrow(()=>validateNativeInfusionRecipe(recipe,items));
  assert.throws(()=>validateNativeInfusionRecipe({...recipe,inputs:recipe.inputs.slice(0,3)},items),/Invalid/);
});
