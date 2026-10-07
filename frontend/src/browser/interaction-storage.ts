import type {Part} from '@neonei/catalog/source';
import {verifiedCachedBytes} from './verified-cache';
import {visualStorage} from './visual-storage';
import {animationStorage} from './animation-storage';
export async function interactionStorage(catalog:string,signal?:AbortSignal){
 const base='/interaction/'+catalog+'/',cache=await caches.open('neonei.interaction.1.'+catalog);
 const manifestResponse=await cache.match(base+'manifest.json')??await fetch(base+'manifest.json',{signal});
 if(!manifestResponse.ok)return null;
 const copy=manifestResponse.clone(),manifest=await manifestResponse.json();
 if(manifest.version!==1||manifest.catalog!==catalog||!Array.isArray(manifest.files)||manifest.files.some((f:Part)=>!/^\w+\/[a-f0-9]{64}\.json\.gz$/.test(f.path)||f.bytes>16*1024*1024||f.rawBytes>16*1024*1024))throw Error('交互包清单不匹配');
 try{await cache.put(base+'manifest.json',copy);}catch{}
 const read=(file:Part,active?:AbortSignal,required=false)=>verifiedCachedBytes(cache,base+file.path,file,active,required);
 const keys=manifest.keys?await read(manifest.keys,signal):null;
 const keyData=keys?JSON.parse(await new Response(new Blob([keys as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).text()):null;
 return {manifest,read,cache,base,keys:keyData?.keys.map((row:[string,number])=>({id:row[0],category:keyData.categories[row[1]]}))??[]};
}
export async function prepareInteractionSave(catalog:string,signal:AbortSignal){
 const store=await interactionStorage(catalog,signal);
 const tasks:Array<{bytes:number;save:()=>Promise<unknown>}>=[];
 const animations=await animationStorage(catalog,signal);
 if(animations){
  for(const file of [...animations.manifest.files,animations.manifest.index])
   tasks.push({bytes:file.bytes,save:()=>animations.read(file,signal,true)});
  await animations.cache.put(animations.base+'manifest.json',new Response(JSON.stringify(animations.manifest)));
 }
 const visuals=await visualStorage(catalog,signal);
 if(visuals)for(const file of [...visuals.manifest.files,visuals.manifest.mapping])
  tasks.push({bytes:file.bytes,save:()=>visuals.read(file,signal,true)});
 if(store)for(const file of [...store.manifest.files,...(store.manifest.keys?[store.manifest.keys]:[])])
  tasks.push({bytes:file.bytes,save:()=>store.read(file,signal,true)});
 const base='/browser-native/'+catalog+'/',cache=await caches.open('neonei.browser.native.3.'+catalog);
 const response=await cache.match(base+'manifest.json')??await fetch(base+'manifest.json',{signal});
 if(response.ok){
  const copy=response.clone(),manifest=await response.json();
  if(manifest.version!==2||manifest.catalog!==catalog)throw Error('原生浏览包清单不匹配');
  for(const file of [...manifest.files,manifest.index,...(manifest.originalFrames?[manifest.originalFrames]:[])]){
   if(!/^(textures\/[a-f0-9]{64}\.webp|index\.json|original-frames\.json)$/.test(file.path))throw Error('原生浏览文件路径无效');
   tasks.push({bytes:file.bytes,save:async()=>{
    await verifiedCachedBytes(cache,base+file.path,file,signal,true);
   }});
  }
  // The manifest itself must persist too; a ready marker alone cannot open a cold session.
  await cache.put(base+'manifest.json',copy);
 }else if(response.status!==404)throw Error('原生浏览清单读取失败');
 return {totalFiles:tasks.length,totalBytes:tasks.reduce((n,t)=>n+t.bytes,0),save:async(progress:(files:number,bytes:number)=>void)=>{
  let next=0,files=0,bytes=0;
  await Promise.all(Array.from({length:3},async()=>{while(next<tasks.length){signal.throwIfAborted();const task=tasks[next++]!;await task.save();files++;bytes+=task.bytes;progress(files,bytes);}}));
  if(store)await store.cache.put(store.base+'ready',new Response('1'));
 }};
}
