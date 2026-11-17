import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/browser/frame-player.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {framePlayer}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const select=t=>({index:Math.floor(t/100)%2,next:(Math.floor(t/100)+1)%2,blend:0});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('long native animation acquires only the current frame and clip changes repaint',async()=>{
 const acquired=[],drawn=[];
 const player=framePlayer(t=>({index:Math.floor(t/50)%720,next:(Math.floor(t/50)+1)%720,blend:0}),async index=>{acquired.push(index);return {index,release(){}};},first=>drawn.push(first.index),assert.fail);
 player.tick(0);await flush();player.tick(35000);await flush();
 assert.deepEqual(acquired,[0,700]);assert.deepEqual(drawn,[0,700]);player.close();
 let clips=0;
 const clip=framePlayer(t=>({index:0,next:0,blend:0,phase:Math.floor(t/50)}),async()=>({release(){}}),()=>clips++,assert.fail);
 clip.tick(0);await flush();clip.tick(50);await flush();assert.equal(clips,2);
 clip.close();
});

test('late animated frame cannot paint an obsolete recipe clip',async()=>{
 let finish,drawn=0,released=0;
 const player=framePlayer(t=>({index:0,next:1,blend:0,phase:Math.floor(t/50)}),()=>new Promise(resolve=>finish=resolve),()=>drawn++,assert.fail);
 player.tick(0);player.tick(50);finish({release(){released++;}});await flush();
 assert.equal(drawn,0);assert.equal(released,1);player.close();
});
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

test('inventory programs remain independent of preview pixels and finite timelines',async()=>{
 const {animationPlan}=await import('../../scripts/browser-animation-plan.mjs');
 const {animationIndex,animationPrograms}=await import('../src/browser/animation-index.ts');
 const catalog='a'.repeat(64),id='item_'+'b'.repeat(64),icon='asset_'+'c'.repeat(64);
 const preview={path:'preview',x:0,y:0,width:64,height:64,ticks:1};
 const result=animationPlan([{id,icon}],[{id:icon,frames:[preview],visual:'visual_'+'d'.repeat(64),interpolate:false}]);
 const value={...result.index,catalog};
 assert.equal(result.frames.length,0);assert.equal(animationIndex(value,catalog,0).size,0);
 assert.equal(animationPrograms(value,catalog).get(id),icon);
 const old={version:1,catalog,rows:[],timelines:[]};assert.equal(animationIndex(old,catalog,0).size,0);assert.equal(animationPrograms(old,catalog).size,0);
 assert.throws(()=>animationPrograms({...old,programs:[[id,icon]]},catalog));
 assert.throws(()=>animationPrograms({...value,programs:[[id,icon],[id,icon]]},catalog));
 assert.throws(()=>animationPrograms({...value,rows:[[id,0]]},catalog),'An identity cannot be both a program and a finite timeline');
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
 const catalog='d'.repeat(64),bytes=Buffer.from(JSON.stringify({version:2,catalog,rows:[],timelines:[],programs:[]}));
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

test('current Catalog animations use their published timeline or program without a sidecar',async()=>{
 const {bindPublishedAnimations,publishedAnimation}=await import('../src/browser/published-animations.ts');
 const catalog='e'.repeat(64),signal=new AbortController().signal,released=[];
 const texture={id:'asset_fixture',frames:[{path:'native.webp',x:0,y:0,width:16,height:16,ticks:3},{path:'native.webp',x:16,y:0,width:16,height:16,ticks:7}],interpolate:false};
 const source={entry:async()=>({icon:texture.id}),texture:async()=>texture,reserve:()=>()=>{},
  acquire:async(frame,active)=>{assert.equal(active,signal);return {image:{width:16,height:16},release(){released.push(frame.x);}};}};
 assert.equal(publishedAnimation(catalog,'item_fixture',signal),undefined);
 const unbind=bindPublishedAnimations(catalog,source);
 const timeline=await publishedAnimation(catalog,'item_fixture',signal);assert.equal(timeline.kind,'timeline');assert.equal(timeline.texture,texture);
 const lease=await timeline.acquire(1,signal);lease.release();assert.deepEqual(released,[16]);
 texture.visual='visual_fixture';assert.equal((await publishedAnimation(catalog,'item_fixture',signal)).kind,'program');
 delete texture.visual;texture.frames.splice(1);assert.equal(await publishedAnimation(catalog,'item_fixture',signal),null);
 unbind();assert.equal(publishedAnimation(catalog,'item_fixture',signal),undefined);
});
