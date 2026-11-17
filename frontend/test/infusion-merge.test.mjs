import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeInfusionMergeResult} from '../../catalog/src/infusion-merge.ts';
import {nativeNbtFloatBits} from '../../catalog/src/native-nbt.ts';

const item=(id,nbt,tool=false)=>({id,registry:'fixture:'+id,meta:4,nbt,tools:tool?{axe:0}:{},armor:false});
test('tool-query short circuit retains only the actually invoked output edits',()=>{
 const input=item('input',{type:'compound',value:{BloodMagicTool:{type:'compound',value:{harvestLvlaxe:{type:'int',value:'0'}}}}},true),base=item('base',null);
 const law={kind:'nativeInfusionMerge',base:{id:base.id,amount:'1'},tools:true,keys:['unrelated'],queries:{input:{input:{kind:'spell'},output:{kind:'spell'}}}};
 const result=nativeInfusionMergeResult(law,input,'3',base);
 assert.deepEqual(result,{registry:'fixture:base',meta:4,amount:'1',nbt:{type:'compound',value:{}}});
 assert.equal(base.nbt,null);assert.equal(input.nbt.value.BloodMagicTool.value.harvestLvlaxe.value,'0');
 const empty=item('empty',null);law.queries={empty:{input:{kind:'spell'},output:null}};
 assert.equal(nativeInfusionMergeResult(law,empty,'1',base).nbt,null);
 law.queries.empty.output={kind:'spell'};assert.throws(()=>nativeInfusionMergeResult(law,empty,'1',base));
});
test('NBT long-to-float follows direct Java narrowing at a double-rounding boundary',()=>{
 assert.equal(nativeNbtFloatBits({type:'long',value:'4611686293305294849'}),'5e800001');
 assert.equal(nativeNbtFloatBits({type:'long',value:'-4611686293305294849'}),'de800001');
 assert.equal(nativeNbtFloatBits({type:'float',value:'80000000'}),'80000000');
});
test('native compound keys remain data when merging into an owned output',()=>{
 const input=item('input',JSON.parse('{"type":"compound","value":{"__proto__":{"type":"compound","value":{"marker":{"type":"int","value":"7"}}}}}'));
 const base=item('base',{type:'compound',value:{}});
 const law={kind:'nativeInfusionMerge',base:{id:'base',amount:'1'},keys:null,tools:false,queries:null};
 const result=nativeInfusionMergeResult(law,input,'1',base);
 assert.equal(Object.hasOwn(result.nbt.value,'__proto__'),true);
 assert.equal(result.nbt.value.__proto__.value.marker.value,'7');
 assert.equal(Object.getPrototypeOf(result.nbt.value),Object.prototype);assert.deepEqual(base.nbt.value,{});
});
