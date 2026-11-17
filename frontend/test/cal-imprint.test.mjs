import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {assertTable} from '@elysium/contracts';
import {evaluateRecipeFacts, initializeRecipeSelection} from '../../catalog/src/recipe-evaluation.ts';
import {validateRecipe} from '../../catalog/src/recipe-validation.ts';
import {calImprintResult} from '../../catalog/src/cal-imprint.ts';

const fixture = () => {
  const machine = {id:'machine',registry:'gregtech:machine',meta:120,nbt:{type:'compound',value:{owner:{type:'string',value:'retained'}}}};
  const imprint = {id:'imprint',registry:'bartworks:CircuitParts',meta:4,nbt:null};
  const result = {...structuredClone(machine),id:'result'};
  result.nbt.value.id_imprint={type:'int',value:'4'};
  const input = (item,slot,role) => ({kind:'item',slot,choices:[{id:item.id,amount:'1',consume:{kind:'consume'},returns:[],
    rule:{kind:'calInput',role,imprintIds:[4,5]}}]});
  const recipe = {id:'recipe_cal',source:{owner:'gregtech',handler:'gregtech.nei.GTNEIImprintHandler',key:'cal'},category:'cal',order:0,
    inputs:[input(machine,0,'machine'),input(imprint,1,'imprint')],
    outputs:[{kind:'item',slot:0,role:'result',id:result.id,amount:'1',quantity:null,chance:{numerator:'1',denominator:'1'},
      change:{input:0,action:{kind:'calImprint',imprint:1},samples:[{id:result.id,amount:'1'}],bindings:[[0,0]]}}],
    process:{kind:'calImprint',nativeRecipe:'gregtech.common.recipes.CALImprintRecipe',machine:0,imprint:1,occupiedLimit:2,
      tag:'id_imprint',imprintIds:[4,5]},properties:{},grid:null,magic:null,duration:null,energy:null};
  return {recipe,items:new Map([machine,imprint,result].map(item=>[item.id,item])),machine,imprint,result};
};

test('CAL 2.9 recorded selection uses enum metadata and preserves the copied machine', () => {
  const f=fixture(),state=initializeRecipeSelection(f.recipe,f.items);
  const result=evaluateRecipeFacts(f.recipe,f.items,state);
  assert.equal(result.status,'matched');
  assert.equal(result.products[0].output.id,'result');
  assert.equal(result.products[0].evidence,'observed-sample');
  f.machine.nbt.value.id_imprint={type:'long',value:'4294967300'};
  assert.equal(evaluateRecipeFacts(f.recipe,f.items,state).status,'unmatched');
  f.machine.nbt.value.Type={type:'string',value:'legacy wins over id_imprint'};
  const legacy=evaluateRecipeFacts(f.recipe,f.items,state);
  assert.equal(legacy.status,'missing-context');
  assert.equal(legacy.reason,'cal-legacy-lookup-required');
  assert.deepEqual(legacy.products,[]);
});

test('CAL validation cannot be bypassed through a missing process or a different handler', () => {
  const f=fixture();
  validateRecipe(f.recipe,f.items);
  f.result.nbt.value.owner.value='lost';
  assert.throws(()=>validateRecipe(f.recipe,f.items),/CAL/);
  delete f.recipe.process;
  assert.throws(()=>validateRecipe(f.recipe,f.items),/CAL/);
  f.recipe.source.handler='other';
  assert.throws(()=>validateRecipe(f.recipe,f.items),/CAL/);
});

test('CAL installation returns a new one-item descriptor without reusing the source identity', () => {
  const f=fixture();
  f.machine.nbt.value.Type={type:'long',value:'9223372036854775807'};
  const before=structuredClone(f.machine),result=calImprintResult(f.recipe.process,f.machine,f.imprint);
  assert.equal(result.amount,'1');
  assert.equal(Object.hasOwn(result,'id'),false);
  assert.deepEqual(result.nbt.value.Type,before.nbt.value.Type);
  assert.deepEqual(f.machine,before);
});

test('target Java CAL facts cross the generated contract and shared selection boundary', async () => {
  const f=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/cal-imprint-contract.json',import.meta.url),'utf8'));
  assertTable({kind:'recipes',records:[f.recipe]});
  const items=new Map(f.items.map(item=>[item.id,item]));
  validateRecipe(f.recipe,items);
  const result=evaluateRecipeFacts(f.recipe,items,initializeRecipeSelection(f.recipe,items));
  assert.equal(result.status,'matched');
  assert.equal(result.products[0].output.id,'item_2e8ff8850422bff764de6856341e61cd92ab99c3a8953ef414cbf89fb9a2a7ea');
  assert.equal(items.get(result.products[0].output.id).nbt.value.owner.value,'retained');
});
