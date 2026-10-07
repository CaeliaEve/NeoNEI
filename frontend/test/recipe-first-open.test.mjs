import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRecipes} from '../src/catalog/bootstrap.ts';

test('first open uses the known first recipe and keeps all category names and IDs',async()=>{
 const calls=[];
 const catalog={
  directory:async()=>({links:{recipes:['r0','r1'],uses:['u']},recipes:[{id:'a',count:1},{id:'b',count:1}],uses:[{id:'c',count:1}],related:{categories:[{id:'a',name:'sa'},{id:'b',name:'sb'},{id:'c',name:'sc'}],strings:[{id:'sa',text:'A'},{id:'sb',text:'B'},{id:'sc',text:'C'}]}}),
  recipe:async id=>{calls.push(id);return {recipe:{id,category:'a'},related:{categories:[{id:'a',name:'sa'}],strings:[{id:'sa',text:'A'},{id:'item-name',text:'Wood'}],items:[],fluids:[],textures:[],views:[],tracks:[],topics:[]}};},
  recipes:async()=>{assert.fail('first open redundantly scanned the directory');},
 };
 const result=await initialRecipes(catalog,'item','recipes');
 assert.deepEqual(calls,['r0']);
 assert.deepEqual(result.producedBy.recipeIds,['r0','r1']);
 assert.equal(result.usedIn.total,1);
 assert.deepEqual(result.producedBy.related.categories.map(r=>r.id),['a','b','c']);
 assert.equal(result.producedBy.related.strings.find(r=>r.id==='item-name').text,'Wood');
});

test('visible recipe reads do not wait for speculative debounce; stale work is rejected',async()=>{
 const module=await import('../src/browser/recipe-scheduling.ts').catch(()=>null);
 assert.ok(module,'recipe request scheduling missing');
 let timerUsed=false;
 const {recipeReadReady}=module;
 assert.equal(await recipeReadReady('visible',()=>true,async()=>{timerUsed=true;}),true);
 assert.equal(timerUsed,false);
 assert.equal(await recipeReadReady('prefetch',()=>false,async()=>{}),false);
});

test('recipe art mapping keeps native frame dimensions and rejects out-of-page slices',async()=>{
 const module=await import('../src/browser/visual-mapping.ts').catch(()=>null);
 assert.ok(module,'recipe art mapping missing');
 const file={path:'textures/'+'a'.repeat(64)+'.png',bytes:10,sha256:'a'.repeat(64)};
 const data={paths:['textures/original.webp'],frames:[[0,12,24,512,628,0,0,0]]};
 const map=module.visualMapping(data,[file]);
 assert.deepEqual(map.get(JSON.stringify(['textures/original.webp',12,24,512,628])),{path:file.path,x:0,y:0,width:512,height:628,ticks:1});
 assert.throws(()=>module.visualMapping({...data,frames:[[0,12,24,512,628,0,700,0]]},[file]),/范围/);
 assert.throws(()=>module.visualMapping({...data,frames:[[0,12,24,512,628,2,0,0]]},[file]),/范围/);
});

test('verified PNG recipe pages reach the image decoder with PNG media type',async()=>{
 const {Atlas}=await import('../src/catalog/atlas.ts');
 const {createHash}=await import('node:crypto');
 const bytes=new Uint8Array([137,80,78,71]),sha256=createHash('sha256').update(bytes).digest('hex');
 const file={path:'textures/'+sha256+'.png',bytes:bytes.length,sha256,kind:'image'};
 const original=globalThis.createImageBitmap;let mime='';
 globalThis.createImageBitmap=async blob=>{mime=blob.type;return {width:1024,height:1024,close(){}};};
 const atlas=new Atlas({files:[file]},'/recipe-visuals/test',new AbortController().signal,async()=>bytes);
 try{const lease=await atlas.acquire(file.path);lease.release();assert.equal(mime,'image/png');}
 finally{atlas.close();globalThis.createImageBitmap=original;}
});

test('missing optional art falls back to original pixels but an aborted view never retries',async()=>{
 const module=await import('../src/browser/visual-mapping.ts');
 assert.equal(typeof module.withFrameFallback,'function');
 let fallback=0;
 assert.equal(await module.withFrameFallback(Promise.reject(Error('corrupt optional pack')),async()=>{fallback++;return 'original';}),'original');
 const controller=new AbortController();controller.abort();
 await assert.rejects(module.withFrameFallback(null,async()=>{fallback++;},controller.signal),{name:'AbortError'});
 assert.equal(fallback,1);
});
