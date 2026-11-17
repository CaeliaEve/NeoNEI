import assert from 'node:assert/strict';
import test from 'node:test';
import {matterManipulatorSelect, matterManipulatorResult, matterManipulatorNote, validateMatterManipulatorRecipe} from '../../catalog/src/matter-manipulator.ts';

const tag=(type,value)=>({type,value});
const compound=value=>tag('compound',value);
const input={id:'input',registry:'native:manipulator',meta:7,nbt:compound({installedUpgrades:tag('int_array',['0','0']),unrelated:tag('string','removed by native save')}),tags:[]};
const component={id:'component',registry:'native:meta',meta:95,nbt:compound({ignored:tag('byte','1')}),tags:[]};
const upgrade={name:'Mining',ordinal:1,id:95,bit:1,providesCaps:4};
const earlier={name:'Storage',ordinal:0,id:94,bit:0,providesCaps:2};
const process={kind:'matterManipulatorUpgrade',nativeRecipe:'com.recursive_pineapple.matter_manipulator.common.items.RecipeInstallUpgrade',
  version:'0.0.51-GTNH',codec:'mm0051GsonV1',tier:0,manipulator:input.registry,upgrade,upgrades:[earlier,upgrade],allowed:[upgrade],metaItems:['native:meta','native:secondMeta'],
  mappings:[{metadata:95,upgrade}],defaultUpgrade:null,
  states:[{id:input.id,origin:'nativeItemList',normalized:compound({jv:tag('byte','1'),dv:tag('byte','0'),config:compound({}),charge:tag('float','00000000'),
    installedUpgrades:{type:'list',element:'end',value:[]},upgradeProvidedCapabilities:tag('byte','0')})}]};

test('Matter upgrade uses native MetaItem metadata lookup, two occupied cells and the stored bit gate',()=>{
  assert.equal(matterManipulatorSelect(process,[component,input])?.status,'observed');
  assert.equal(matterManipulatorSelect(process,[input,{...component,registry:'native:secondMeta'}])?.status,'observed');
  assert.equal(matterManipulatorSelect(process,[input,{...component,registry:'native:other'}]),null);
  assert.equal(matterManipulatorSelect(process,[input,component,null,null,null,null,null,null,null,component]),null);
  const installed={...input,id:'installed',nbt:compound({installedUpgrades:tag('byte_array','AAE=')})};
  assert.equal(matterManipulatorSelect(process,[installed,component]),null);
});

test('Matter 0.0.51 output replaces the whole root and preserves the native pre-install capability moment',()=>{
  const output=matterManipulatorResult(process,input);
  assert.equal(output.value.installedUpgrades.value,'AAE=');
  assert.equal(output.value.upgradeProvidedCapabilities.value,'0');
  assert.equal(Object.hasOwn(output.value,'unrelated'),false);
  assert.equal(output.value.jv.value,'1');
  const english=matterManipulatorNote(process,'en-US');
  assert.match(english,/entire NBT root/);assert.doesNotMatch(english,/\p{Script=Han}/u);
});

test('unobserved Matter state remains a codec condition rather than an invented output',()=>{
  const other={...input,id:'unobserved'};
  assert.equal(matterManipulatorSelect(process,[other,component])?.status,'unobserved');
  assert.equal(matterManipulatorResult(process,other),null);
  assert.throws(()=>matterManipulatorSelect(process,[{...input,nbt:compound({installedUpgrades:tag('string','not a native array')})},component]),/BitSet/);
});

test('Matter validation binds the native process, state normalization and result without allowing generic downgrade',()=>{
  const result={...input,id:'result',nbt:matterManipulatorResult(process,input)};
  const choice=(item,kind)=>({id:item.id,amount:'1',rule:{kind},consume:{kind:'consume'},returns:[]});
  const recipe={source:{handler:'com.recursive_pineapple.matter_manipulator.client.nei.UpdateRecipeNEIHandler'},process,
    properties:{},inputs:[{kind:'item',slot:0,choices:[choice(input,'matterManipulatorInput')]},
      {kind:'item',slot:1,choices:[choice(component,'matterManipulatorUpgrade')]}],
    outputs:[{kind:'item',slot:0,role:'result',id:result.id,amount:'1',chance:{numerator:'1',denominator:'1'},
      change:{input:0,action:{kind:'matterManipulator'},samples:[{id:result.id,amount:'1'}]}}]};
  const items=new Map([input,component,result].map(item=>[item.id,item]));
  validateMatterManipulatorRecipe(recipe,items);
  assert.throws(()=>validateMatterManipulatorRecipe({...recipe,process:null},items));
  const changed=structuredClone(recipe);changed.process.states[0].normalized.value.upgradeProvidedCapabilities=tag('byte','4');
  assert.throws(()=>validateMatterManipulatorRecipe(changed,items));
  assert.throws(()=>validateMatterManipulatorRecipe(recipe,new Map([...items,[result.id,{...result,nbt:input.nbt}]])));
});
