import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeNbtInt} from '../../catalog/src/native-nbt.ts';

test('logical mana mirror metadata preserves Java float rounding and physical identity',async()=>{
  const {nativeItemMetadata}=await import('../../catalog/src/native-item-metadata.ts');
  for(const [mana,want]of [[0,1000],[1000,999],[1000000,0],[16777217,-15777],[2147483647,-2146483],[-2147483648,2148483]]){
    const item={registry:'Botania:manaMirror',meta:123,nbt:{type:'compound',value:{mana:{type:'int',value:String(mana)}}}};
    assert.equal(nativeItemMetadata(item),want);
    assert.equal(item.meta,123);
    assert.equal(nativeItemMetadata({...item,registry:'minecraft:paper'}),123);
  }
  assert.equal(nativeItemMetadata({registry:'Botania:manaMirror',meta:123,nbt:null}),1000);
  assert.equal(nativeNbtInt({type:'long',value:'4294968296'}),1000);
});
