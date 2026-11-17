import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

test('fast paging predicts ahead, resets on reversal/filter and never prefetches outside the result', async()=>{
 const api=await import('../src/browser/prefetch.ts').catch(()=>null);assert.ok(api,'adaptive prefetch missing');
 const plan=api.pagePrefetch();
 plan('', '',0,72,0);
 const forward=plan('', '',720,72,80)(10000);
 assert.ok(forward.length>1 && forward.length<=4);
 assert.ok(forward.every(n=>n>720));
 const reverse=plan('', '',648,72,100)(10000);
 assert.equal(reverse[0],576);assert.ok(reverse.every(n=>n<648));
 assert.deepEqual(plan('iron','',0,72,110)(30),[]);
 assert.deepEqual(plan('iron','',0,72,120)(73),[72]);
});

test('corrupt cached bytes are replaced only after the same declared asset verifies',async()=>{
 const api=await import('../src/browser/verified-cache.ts').catch(()=>null);assert.ok(api,'verified cache missing');
 const good=new TextEncoder().encode('native pixels'),file={bytes:good.length,sha256:createHash('sha256').update(good).digest('hex')};
 let saved=new Response('broken'),calls=0;
 const cache={match:async()=>saved.clone(),put:async(_url,value)=>{saved=value;}};
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>{calls++;return new Response(good);};
  assert.deepEqual(await api.verifiedCachedBytes(cache,'http://localhost/a',file),good);
  assert.equal(calls,1);assert.equal(await saved.clone().text(),'native pixels');
  await api.verifiedCachedBytes(cache,'http://localhost/a',file);assert.equal(calls,1);
  saved=new Response('broken');globalThis.fetch=async()=>{calls++;return new Response('wrong');};
  await assert.rejects(api.verifiedCachedBytes(cache,'http://localhost/a',file),/校验/);
  assert.equal(calls,2);assert.equal(await saved.text(),'broken');
 }finally{globalThis.fetch=original;}
});

test('shell handover only activates the fully verified build matching the open document',async()=>{
 const api=await import('../src/offline/shell-handover.ts').catch(()=>null);assert.ok(api,'shell handover missing');
 const worker={state:'installed',sent:[],postMessage(value){this.sent.push(value);}};
 assert.equal(await api.activateMatchingShell(worker,'new',async()=>({build:'old',ready:true})),false);
 assert.equal(await api.activateMatchingShell(worker,'new',async()=>({build:'new',ready:false})),false);
 assert.equal(worker.sent.length,0);
 assert.equal(await api.activateMatchingShell(worker,'new',async()=>({build:'new',ready:true})),true);
 assert.deepEqual(worker.sent,[{kind:'shell-activate',build:'new'}]);
});

test('failed replacement shell install preserves the previous offline shell',async()=>{
 const {build}=await import('esbuild');const {runInNewContext}=await import('node:vm');
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/offline/service.ts',import.meta.url))],bundle:true,write:false,format:'iife',platform:'browser',
  define:{__SHELL__:JSON.stringify({build:'replacement',files:[{url:'/index.html',integrity:'sha256-bad'}]})}});
 const stored=new Set(['neonei.shell.previous']);const handlers={};let work;
 const cache={match:async()=>undefined};
 const scope={location:{origin:'http://localhost'},registration:{active:{}},clients:{matchAll:async()=>[]},addEventListener:(kind,handler)=>handlers[kind]=handler};
 runInNewContext(bundle.outputFiles[0].text,{self:scope,URL,Response,Request,TextEncoder,TextDecoder,Uint8Array,crypto,structuredClone,
  caches:{keys:async()=>[...stored],open:async name=>{stored.add(name);return cache;},delete:async name=>stored.delete(name)},fetch:async()=>new Response('',{status:503})});
 handlers.install({waitUntil(value){work=value;}});await assert.rejects(work,/unavailable/);
 assert.ok(stored.has('neonei.shell.previous'),'failed install removed the working offline shell');
});

test('aborted background bootstrap stops before requesting the recipe page',async()=>{
 const {initialRecipes}=await import('../src/catalog/bootstrap.ts');const controller=new AbortController();let pages=0;
 const catalog={directory:async()=>{controller.abort();return {links:{recipes:['r'],uses:[]},recipes:[],uses:[],related:{}};},recipes:async()=>{pages++;return {};}};
 await assert.rejects(initialRecipes(catalog,'item','recipes',controller.signal,10),{name:'AbortError'});
 assert.equal(pages,0);
});

test('transient asset failures stop after one retry and aborts never retry',async()=>{
 const {verifiedCachedBytes}=await import('../src/browser/verified-cache.ts');const original=globalThis.fetch;
 const cache={match:async()=>undefined,put:async()=>{throw Error('must not save');}};const file={bytes:1,sha256:'bad'};let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;if(calls===1)return new Response('',{status:503});throw new TypeError('connection closed');};
  await assert.rejects(verifiedCachedBytes(cache,'http://localhost/a',file));assert.equal(calls,2);
  const controller=new AbortController();controller.abort();
  await assert.rejects(verifiedCachedBytes(cache,'http://localhost/a',file,controller.signal),{name:'AbortError'});assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});

test('a new recipe first frame overtakes pending animation frames',async context=>{
 const {Atlas}=await import('../src/catalog/atlas.ts');const bytes=Buffer.from('page');
 const sha256=createHash('sha256').update(bytes).digest('hex'),path=`textures/${sha256}.webp`;
 const original=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap');let release,started;const seen=[];
 const waiting=new Promise(resolve=>started=resolve);
 Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async(input,x,y,width=128,height=128)=>{
  if(!(input instanceof Blob)){seen.push(x);if(x===0){started();await new Promise(resolve=>release=resolve);}}
  return {width,height,close(){}};
 }});
 const atlas=new Atlas({files:[{kind:'image',path,bytes:bytes.length,sha256}]},'',new AbortController().signal,async()=>bytes);
 context.after(()=>{atlas.close();if(original)Object.defineProperty(globalThis,'createImageBitmap',original);else delete globalThis.createImageBitmap;});
 const frame=x=>({path,x,y:0,width:16,height:16,ticks:1});
 const first=atlas.acquireFrame(frame(0));await waiting;
 const background=atlas.acquireFrame(frame(16),undefined,10),foreground=atlas.acquireFrame(frame(32));
 release();const leases=await Promise.all([first,background,foreground]);leases.forEach(x=>x.release());
 assert.deepEqual(seen,[0,32,16]);
});

test('browser, recipe and animation bitmap reads reserve a foreground decode slot',async context=>{
 const {decodeImage}=await import('../src/catalog/image-decoder.ts');
 const original=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap');
 const seen=[];let releaseBackground;
 Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async source=>{
  seen.push(source);
  if(source==='animation-one')await new Promise(resolve=>releaseBackground=resolve);
  return {width:16,height:16,close(){}};
 }});
 context.after(()=>{releaseBackground?.();if(original)Object.defineProperty(globalThis,'createImageBitmap',original);else delete globalThis.createImageBitmap;});
 const signal=new AbortController().signal;
 const first=decodeImage('animation-one',signal,10);
 const queued=decodeImage('animation-two',signal,10);
 const visible=await decodeImage('visible-recipe',signal,0);visible.close();
 assert.deepEqual(seen,['animation-one','visible-recipe']);
 releaseBackground();(await first).close();(await queued).close();
 assert.deepEqual(seen,['animation-one','visible-recipe','animation-two']);
});

test('an abandoned in-flight bitmap closes when its native decode finishes',async context=>{
 const {decodeImage}=await import('../src/catalog/image-decoder.ts');
 const original=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap');
 let release,started,closed=0;const waiting=new Promise(resolve=>started=resolve);
 Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async()=>{
  started();await new Promise(resolve=>release=resolve);
  return {width:16,height:16,close(){closed++;}};
 }});
 context.after(()=>{release?.();if(original)Object.defineProperty(globalThis,'createImageBitmap',original);else delete globalThis.createImageBitmap;});
 const controller=new AbortController(),request=decodeImage(new Blob(['page']),controller.signal);
 await waiting;controller.abort();await assert.rejects(request,{name:'AbortError'});
 release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(closed,1);
});

test('a cold speculative atlas does not block a visible first frame', {timeout:2000},async context=>{
 const {Atlas}=await import('../src/catalog/atlas.ts');const original=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap');
 const buffers=[Buffer.from('background'),Buffer.from('visible')],files=buffers.map(bytes=>{const sha256=createHash('sha256').update(bytes).digest('hex');return {kind:'image',bytes:bytes.length,sha256,path:`textures/${sha256}.webp`};});
 let release,started;const waiting=new Promise(resolve=>started=resolve);
 Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async()=>({width:16,height:16,close(){}})});
 const atlas=new Atlas({files},'',new AbortController().signal,async file=>{
  if(file===files[0]){started();await new Promise(resolve=>release=resolve);return buffers[0];}return buffers[1];
 });
 context.after(()=>{release?.();atlas.close();if(original)Object.defineProperty(globalThis,'createImageBitmap',original);else delete globalThis.createImageBitmap;});
 const frame=path=>({path,x:0,y:0,width:16,height:16,ticks:1});
 const background=atlas.acquireFrame(frame(files[0].path),undefined,10);await waiting;
 const foreground=await atlas.acquireFrame(frame(files[1].path));foreground.release();
 release();(await background).release();
});
