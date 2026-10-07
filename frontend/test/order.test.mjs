import test from 'node:test';
import assert from 'node:assert/strict';
test('native order matches full metadata and NBT identities, and preserves other catalog entries',async()=>{
 const api=await import('../../scripts/nei-order.mjs').catch(()=>null);assert.ok(api,'NEI order importer missing');
 const nbt=value=>({type:'compound',value:{mode:{type:'int',value}}});
 const items=[{id:'a',registry:'m:x',meta:0,nbt:nbt('1')},{id:'b',registry:'m:x',meta:0,nbt:nbt('2')},{id:'c',registry:'m:y',meta:1}];
 const order=api.matchOrder(items,[{registry:'m:x',meta:0,nbt:nbt('2')},{registry:'m:y',meta:1},{registry:'missing',meta:0}]);
 assert.deepEqual(order.ids,['b','c']);assert.equal(order.unmatched.length,1);
 assert.deepEqual(api.sortNative(items,order.ids).map(x=>x.id),['b','c','a']);
});
