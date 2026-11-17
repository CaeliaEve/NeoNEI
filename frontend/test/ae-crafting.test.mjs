import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('AE native greedy order matches all 648 real workbench probes and ignores offered NBT',async()=>{
  const module=await import('../../catalog/src/ae-crafting.ts').catch(()=>null);
  assert.ok(module,'AE native cell matcher is missing');
  const {recipe}=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/ae-native-greedy-contract.json',import.meta.url),'utf8'));
  const cases=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/ae-native-greedy-parity.json',import.meta.url),'utf8'));
  assert.equal(cases.length,648);
  for(const row of cases){
    assert.equal(module.aeCraftingSelect(recipe.process,row.offered)!==null,row.matched,JSON.stringify(row.offered));
    assert.equal(module.aeCraftingSelect(recipe.process,row.offered.map(item=>item?{...item,nbt:{type:'compound',value:{custom:{type:'string',value:'ignored'}}}}:null))!==null,row.matched);
  }
  const apple={registry:'minecraft:apple',meta:0},carrot={registry:'minecraft:carrot',meta:0};
  assert.equal(module.aeCraftingSelect(recipe.process,[apple,carrot,...Array(7).fill(null)]),null);
  assert.notEqual(module.aeCraftingSelect(recipe.process,[carrot,apple,...Array(7).fill(null)]),null);
  const {calculateMaterials}=await import('./helpers/materials.mjs');
  assert.deepEqual(calculateMaterials(recipe,'100').outputs,[]);
  const {items}=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/ae-native-greedy-contract.json',import.meta.url),'utf8'));
  const facts=new Map(items.map(item=>[item.id,item]));module.validateAeCraftingRecipe(recipe,facts);
  assert.throws(()=>module.validateAeCraftingRecipe({...recipe,process:null},facts));
  const wrong=structuredClone(recipe);wrong.inputs[0].choices[0].rule.nbt=false;assert.throws(()=>module.validateAeCraftingRecipe(wrong,facts));
  for(const locale of ['zh-CN','en-US']){
    const note=module.aeCraftingNote(recipe.process,locale);assert.match(note,locale==='en-US'?/first.*remaining/:/首个.*剩余/);
    if(locale==='en-US')assert.doesNotMatch(note,/\p{Script=Han}/u);
  }
  const shaped=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/ae-native-shaped-contract.json',import.meta.url),'utf8')).recipe.process;
  const paper={registry:'minecraft:paper',meta:0};
  assert.notEqual(module.aeCraftingSelect(shaped,[null,apple,paper,null,null,apple,null,null,null]),null);
  const mirrored=[paper,apple,null,apple,null,null,null,null,null];
  assert.notEqual(module.aeCraftingSelect(shaped,mirrored),null);
  assert.equal(module.aeCraftingSelect({...shaped,mirror:false},mirrored),null);
  assert.equal(module.aeCraftingSelect(shaped,[apple,paper,null,null,apple,null,null,null,carrot]),null);
});
