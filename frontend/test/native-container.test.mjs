import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateNativeContainers} from '../../catalog/src/native-container.ts';

test('dynamic returns bind to actual native items and cannot become fixed remainders',()=>{
  for(const name of ['cutter','cosmetic']){
    const {recipe,items}=JSON.parse(readFileSync(new URL(`../../../elysium-compiler/contracts/fixtures/native-container-${name}-contract.json`,import.meta.url),'utf8'));
    const facts=new Map(items.map(item=>[item.id,item]));
    assert.doesNotThrow(()=>validateNativeContainers(recipe,facts));
    for(const change of [r=>r.source.handler='unknown.Machine',r=>r.inputs[0].choices[0].consume.callback='unknown',
      r=>r.inputs[0].choices[0].returns=[{kind:'item',id:items[0].id,amount:'1'}],r=>r.inputs[0].kind='fluid']){
      const bad=structuredClone(recipe);change(bad);assert.throws(()=>validateNativeContainers(bad,facts),/Invalid native/);
    }
    const wrong=new Map(items.map(item=>[item.id,{...item,registry:'minecraft:paper'}]));
    assert.throws(()=>validateNativeContainers(recipe,wrong),/Invalid native/);
  }
});

test('Blood Orb non-orb inputs retain native tool wear and dynamic containers',()=>{
  const {recipe,items}=JSON.parse(readFileSync(new URL('../../../elysium-compiler/contracts/fixtures/native-container-cutter-contract.json',import.meta.url),'utf8'));
  recipe.process={kind:'bloodOrbCrafting'};
  recipe.source.handler='WayofTime.alchemicalWizardry.client.nei.NEIBloodOrbShapedHandler';
  assert.doesNotThrow(()=>validateNativeContainers(recipe,new Map(items.map(item=>[item.id,item]))));
  for(const [callback,registry]of [['thaumicMortar','thaumicbases:mortar'],['railFirestone','Railcraft:firestone.refined']]){
    const changed=structuredClone(recipe);
    changed.inputs[0].choices[0].consume={kind:'nativeContainer',callback};
    const facts=new Map(items.map(item=>[item.id,{...item,registry}]));
    assert.doesNotThrow(()=>validateNativeContainers(changed,facts));
    assert.throws(()=>validateNativeContainers(changed,new Map(items.map(item=>[item.id,item]))),/Invalid native/);
  }
});
