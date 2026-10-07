import type {File} from '@elysium/contracts';
import type {NativeLayout} from './native-frame';
import {verifiedCachedBytes} from './verified-cache';
export async function animationStorage(catalog:string,signal?:AbortSignal){
 const base='/browser-animations/'+catalog+'/',cache=await caches.open('neonei.browser.animations.1.'+catalog);
 const response=await cache.match(base+'manifest.json')??await fetch(base+'manifest.json',{signal});
 if(response.status===404)return null;
 if(!response.ok)throw Error('浏览动画包读取失败');
 const copy=response.clone(),manifest=await response.json() as Omit<NativeLayout,'files'>&{version:number;catalog:string;index:File;files:File[]};
 const valid=(f:File)=>f&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=16*1024*1024&&/^[a-f0-9]{64}$/.test(f.sha256);
 if(manifest.version!==2||manifest.catalog!==catalog||manifest.size!==64||manifest.edge!==1024
  ||!Number.isSafeInteger(manifest.count)||manifest.count<0||manifest.count>1000000
  ||!Array.isArray(manifest.dimensions)||manifest.dimensions.length!==manifest.count
  ||manifest.dimensions.some(d=>!Array.isArray(d)||d.length!==2||d.some(n=>!Number.isInteger(n)||n<1||n>64))
  ||!Array.isArray(manifest.files)||manifest.files.length!==Math.ceil(manifest.count/256)
  ||manifest.files.some(f=>!valid(f)||f.path!=='textures/'+f.sha256+'.webp')
  ||!valid(manifest.index)||manifest.index.path!=='index.json')throw Error('浏览动画清单不匹配');
 try{await cache.put(base+'manifest.json',copy);}catch{/* Online use remains available. Offline save requires persistence below. */}
 return {manifest,base,cache,read:(file:File,active?:AbortSignal,required=false)=>verifiedCachedBytes(cache,base+file.path,file,active,required)};
}
