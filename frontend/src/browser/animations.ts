import {shallowRef} from 'vue';
import type {Texture} from '@elysium/contracts';
import {Atlas} from '../catalog/atlas';
import {animationStorage} from './animation-storage';
import {animationIndex,type Timeline} from './animation-index';
import {nativeFrame,type NativeLayout} from './native-frame';
export const animationStatus=shallowRef('');
let catalogId='',opening:Promise<void>|null=null,controller=new AbortController(),atlas:Atlas|null=null,layout:NativeLayout|null=null;
let index=new Map<string,Timeline>();
export function prepareAnimations(catalog:string):Promise<void>{
 if(catalog===catalogId&&opening)return opening;
 catalogId=catalog;controller.abort();controller=new AbortController();const signal=controller.signal;
 atlas?.close();atlas=null;layout=null;index.clear();animationStatus.value='';
 opening=(async()=>{
  const storage=await animationStorage(catalog,signal);if(!storage)return;
  const bytes=await storage.read(storage.manifest.index,signal);signal.throwIfAborted();
  index=animationIndex(JSON.parse(new TextDecoder().decode(bytes)),catalog,storage.manifest.count);
  layout=storage.manifest;
  atlas=new Atlas({files:storage.manifest.files},storage.base.slice(0,-1),signal,(file,active)=>storage.read(file,active),48*1024*1024);
 })().catch(error=>{if(!signal.aborted){animationStatus.value=String(error);opening=null;}});
 return opening;
}
export async function residentAnimation(id:string,catalog:string,signal:AbortSignal){
 await prepareAnimations(catalog);signal.throwIfAborted();
 if(catalog!==catalogId)return null;
 const timeline=index.get(id),active=atlas,geometry=layout;if(!timeline||!active||!geometry)return null;
 const frames=timeline.frames.map(([sprite,ticks])=>({...nativeFrame(geometry,sprite),ticks}));
 const texture={frames,interpolate:timeline.interpolate} as Texture;
 return {texture,acquire:(frame:number,consumer:AbortSignal)=>active.acquireFrame(frames[frame]!,consumer,10)};
}
