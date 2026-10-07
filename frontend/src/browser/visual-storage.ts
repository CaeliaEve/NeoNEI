import type {File} from '@elysium/contracts';
import {verifiedCachedBytes} from './verified-cache.ts';
export async function visualStorage(catalog:string,signal?:AbortSignal){
 const base='/recipe-visuals/'+catalog+'/',cache=await caches.open('neonei.recipe.visuals.1.'+catalog);
 const response=await cache.match(base+'manifest.json')??await fetch(base+'manifest.json',{signal});
 if(response.status===404)return null;
 if(!response.ok)throw Error('配方图层包读取失败');
 const copy=response.clone(),manifest=await response.json() as {version:number;catalog:string;files:File[];mapping:File};
 const valid=(file:File)=>file&&Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=16*1024*1024&&/^[a-f0-9]{64}$/.test(file.sha256);
 if(manifest.version!==1||manifest.catalog!==catalog||!Array.isArray(manifest.files)||manifest.files.length>4096
  ||manifest.files.some(file=>!valid(file)||!/^textures\/[a-f0-9]{64}\.png$/.test(file.path))
  ||!valid(manifest.mapping)||manifest.mapping.path!=='mapping.json')throw Error('配方图层包清单无效');
 try{await cache.put(base+'manifest.json',copy);}catch{/* Original Catalog textures remain available. */}
 return {manifest,base,cache,read:(file:File,active?:AbortSignal,required=false)=>verifiedCachedBytes(cache,base+file.path,file,active,required)};
}
