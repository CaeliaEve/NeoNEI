import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const fixture=async stem=>JSON.parse(await readFile(new URL(`../../../elysium-compiler/contracts/fixtures/${stem}-contract.json`,import.meta.url),'utf8'));

test('native Botania special fixtures preserve NBT selection, named results and earlier-head priority',async()=>{
  const sdk=await import('../../catalog/src/botania.ts');
  const rows=await Promise.all(['botania-mini-special','botania-mini-priority','botania-head-special','botania-head-priority'].map(fixture));
  for(const row of rows)sdk.validateBotaniaRecipe(row.recipe,new Map(row.items.map(i=>[i.id,i])),new Map(row.strings.map(t=>[t.id,t])),'en_US');
  const [mini,pool,head,priority]=rows,miniItems=new Map(mini.items.map(i=>[i.id,i]));
  const apple=mini.items.find(i=>i.registry==='minecraft:apple');assert.ok(apple);
  assert.equal(sdk.botaniaPoolSelect(mini.recipe,apple,miniItems),true,'native key matching ignores the different item and metadata');
  assert.equal(sdk.botaniaPoolSelect(mini.recipe,{...apple,nbt:null},miniItems),false);
  assert.equal(sdk.botaniaPoolSelect(mini.recipe,{...apple,nbt:{type:'compound',value:{type:{type:'int',value:'1'}}}},miniItems),undefined,'unobserved native NBT stringification remains unavailable');
  const poolItems=new Map(pool.items.map(i=>[i.id,i]));
  assert.equal(sdk.botaniaPoolSelect(pool.recipe,pool.items.find(i=>i.registry==='minecraft:yellow_flower'&&i.nbt==null),poolItems),true);
  assert.equal(sdk.botaniaPoolSelect(pool.recipe,pool.items.find(i=>i.nbt?.value?.type?.value==='daybloom'),poolItems),false);
  const texts=new Map(head.strings.map(t=>[t.id,t])),context=sdk.botaniaNameContext(head.recipe,texts,'en_US');assert.ok(context);
  assert.equal(sdk.botaniaNameContext(head.recipe,texts,'zh_CN'),undefined,'another locale is not a native translation observation');
  const named=head.items.find(i=>i.registry==='minecraft:name_tag'&&i.nbt),blank=head.items.find(i=>i.registry==='minecraft:name_tag'&&!i.nbt),iron=head.items.find(i=>i.registry==='minecraft:iron_ingot');assert.ok(named&&blank&&iron);
  const inventory=tag=>[tag,iron,...Array(14).fill(null)];
  assert.equal(sdk.botaniaRunicSelect(head.recipe.process,inventory(named)),undefined);
  assert.equal(sdk.botaniaRunicSelect(head.recipe.process,inventory(blank),context),null);
  const renamed=name=>{const item=structuredClone(named);item.nbt.value.display.value.Name.value=name;item.nbt.value.unrelated={type:'int',value:'9'};return item;};
  const repeated=structuredClone(head.recipe.process);repeated.predicates.splice(1,0,repeated.predicates[0]);
  assert.deepEqual(sdk.botaniaRunicResult(repeated,[renamed('First Player'),renamed('Last Player'),iron,...Array(13).fill(null)],context),
    {registry:'minecraft:skull',meta:3,amount:'1',nbt:{type:'compound',value:{SkullOwner:{type:'string',value:'Last Player'}}}});
  assert.equal(sdk.botaniaRunicResult(head.recipe.process,inventory(renamed('')),context).nbt,null);
  const priorContext=sdk.botaniaNameContext(priority.recipe,new Map(priority.strings.map(t=>[t.id,t])),'en_US');assert.ok(priorContext);
  assert.notEqual(sdk.botaniaRunicSelect(priority.recipe.process,inventory(blank),priorContext),null);
  assert.equal(sdk.botaniaRunicSelect(priority.recipe.process,inventory(named),priorContext),null);
});
