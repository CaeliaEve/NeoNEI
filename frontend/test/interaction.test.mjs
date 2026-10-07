import test from 'node:test';
import assert from 'node:assert/strict';
test('interaction packing keeps every record, splits bounded chunks and rejects altered bytes',async()=>{
 const module=await import('../../catalog/src/interaction.ts').catch(()=>null);assert.ok(module,'interaction reader missing');
 const {packRows,PackedCatalog}=module;const rows=Array.from({length:141},(_,i)=>({id:String(i).padStart(3,'0'),value:i}));
 const packed=await packRows('items',rows,32);assert.ok(packed.length>4);
 const files=packed.map(p=>p.file),bytes=new Map(packed.map(p=>[p.file.path,p.bytes]));
 const catalog=new PackedCatalog({id:'catalog'},files,async file=>bytes.get(file.path));
 assert.deepEqual((await catalog.records('items',['140','000','070'])).map(r=>r.value),[140,0,70]);
 const bad=new PackedCatalog({id:'catalog'},files,async()=>new TextEncoder().encode('[]'));
 await assert.rejects(bad.record('items','000'),/integrity/i);
});
test('compact navigation resolves both directions without copying long IDs into every link',async()=>{
 const {packRows,PackedCatalog}=await import('../../catalog/src/interaction.ts');
 const parts=await packRows('directory',[{id:'item',recipes:[1,0],uses:[0],topics:['aspect']}]);
 const catalog=new PackedCatalog({id:'catalog'},parts.map(p=>p.file),async()=>parts[0].bytes,[{id:'r0',category:'c0'},{id:'r1',category:'c1'}]);
 assert.deepEqual(await catalog.record('links','item'),{id:'item',recipes:['r1','r0'],uses:['r0'],topics:['aspect']});
 assert.deepEqual((await catalog.directory('item')).recipes.map(row=>row.category),['c1','c0']);
});
