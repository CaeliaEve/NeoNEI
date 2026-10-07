import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/browser/frame-player.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {framePlayer}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const select=t=>({index:Math.floor(t/100)%2,next:(Math.floor(t/100)+1)%2,blend:0});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('same first pixels keep independent native timelines and invalid references are rejected',async()=>{
 const {animationPlan}=await import('../../scripts/browser-animation-plan.mjs');
 const {animationIndex}=await import('../src/browser/animation-index.ts');
 const catalog='a'.repeat(64),id='item_'+'b'.repeat(64),other='fluid_'+'c'.repeat(64);
 const f={path:'a',x:0,y:0,width:16,height:16,ticks:2};
 const textures=[{id:'t1',frames:[f,{...f,x:16,ticks:4}],interpolate:false},{id:'t2',frames:[f,{...f,x:32,ticks:3}],interpolate:true}];
 const pack=animationPlan([{id,icon:'t1'},{id:other,icon:'t2'}],textures);
 assert.equal(pack.frames.length,3);const raw={...pack.index,catalog};
 const index=animationIndex(raw,catalog,3);
 assert.deepEqual(index.get(id).frames,[[0,2],[1,4]]);assert.deepEqual(index.get(other).frames,[[0,2],[2,3]]);assert.equal(index.get(other).interpolate,true);
 raw.timelines[0].frames[1][0]=3;assert.throws(()=>animationIndex(raw,catalog,3));
});
test('native tick changes draw once and every acquired frame is released',async()=>{
 let acquired=0,released=0;const drawn=[];
 const player=framePlayer(select,async index=>{acquired++;return {index,release(){released++;}};},(a,b,blend)=>drawn.push([a.index,b?.index,blend]),assert.fail);
 player.tick(0);await flush();player.tick(50);await flush();player.tick(100);await flush();
 assert.deepEqual(drawn,[[0,undefined,0],[1,undefined,0]]);assert.equal(acquired,2);assert.equal(released,2);player.close();
});
test('scrolling away cancels acquisition and prevents late painting',async()=>{
 let finish,signal,released=0,drawn=0;
 const player=framePlayer(select,(_index,s)=>{signal=s;return new Promise(r=>finish=r);},()=>drawn++,assert.fail);
 player.tick(0);player.close();finish({release(){released++;}});await flush();
 assert.equal(signal.aborted,true);assert.equal(drawn,0);assert.equal(released,1);
});
test('slow old frame never paints after time advances; errors release partial interpolation',async()=>{
 let finish,released=0;const drawn=[];
 const player=framePlayer(select,()=>new Promise(r=>finish=r),a=>drawn.push(a),assert.fail);
 player.tick(0);player.tick(100);finish({release(){released++;}});await flush();
 assert.equal(drawn.length,0);assert.equal(released,1);player.close();
 const errors=[];const other=framePlayer(()=>({index:0,next:1,blend:.5}),async index=>{if(index)throw Error('missing');return {release(){released++;}};},assert.fail,e=>errors.push(String(e)));
 other.tick(0);await flush();assert.equal(released,2);assert.deepEqual(errors,['Error: missing']);other.close();
});

test('animation initialization retries the same catalog after a transient failure',async()=>{
 const {createHash}=await import('node:crypto');
 const built=await build({entryPoints:['src/browser/animations.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const catalog='d'.repeat(64),bytes=Buffer.from(JSON.stringify({version:1,catalog,rows:[],timelines:[]}));
 const manifest={version:2,catalog,size:64,edge:1024,count:0,dimensions:[],files:[],index:{path:'index.json',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};
 const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;let requests=0;
 globalThis.caches={open:async()=>({match:async()=>undefined,put:async()=>{}})};
 globalThis.fetch=async url=>{
  requests++;if(requests===1)throw new TypeError('temporary disconnect');
  return String(url).endsWith('manifest.json')?new Response(JSON.stringify(manifest)):new Response(bytes);
 };
 try{
  const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
  await api.prepareAnimations(catalog);assert.match(api.animationStatus.value,/temporary disconnect/);
  await api.prepareAnimations(catalog);
  assert.equal(requests,3,'the next visible consumer must retry manifest and index');
  assert.equal(api.animationStatus.value,'');
  await api.prepareAnimations(catalog);assert.equal(requests,3,'successful initialization remains shared');
 }finally{globalThis.fetch=originalFetch;if(originalCaches===undefined)delete globalThis.caches;else globalThis.caches=originalCaches;}
});
