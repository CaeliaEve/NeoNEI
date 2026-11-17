import {errorMessage} from '../i18n/errors.ts';
import {shallowRef} from 'vue';
import type {Texture} from '@elysium/contracts';
import {Atlas} from '../catalog/atlas';
import {animationStorage} from './animation-storage';
import {animationIndex,animationPrograms,type Timeline} from './animation-index';
import {nativeFrame,type NativeLayout} from './native-frame';
import {publishedAnimation} from './published-animations.ts';
export const animationStatus=shallowRef('');
let catalogId='',opening:Promise<void>|null=null,controller=new AbortController(),atlas:Atlas|null=null,layout:NativeLayout|null=null;
let index=new Map<string,Timeline>();
let programs=new Map<string,string>();
export function prepareAnimations(catalog:string):Promise<void>{
 if(catalog===catalogId&&opening)return opening;
 catalogId=catalog;controller.abort();controller=new AbortController();const signal=controller.signal;
 atlas?.close();atlas=null;layout=null;index.clear();programs.clear();animationStatus.value='';
 opening=(async()=>{
  const storage=await animationStorage(catalog,signal);if(!storage)return;
  const bytes=await storage.read(storage.manifest.index,signal);signal.throwIfAborted();
  const parsed=JSON.parse(new TextDecoder().decode(bytes));
  index=animationIndex(parsed,catalog,storage.manifest.count);programs=animationPrograms(parsed,catalog);
  layout=storage.manifest;
  atlas=new Atlas({files:storage.manifest.files},storage.base.slice(0,-1),signal,(file,active)=>storage.read(file,active),48*1024*1024);
 })().catch(error=>{if(!signal.aborted){animationStatus.value=errorMessage(error);opening=null;}});
 return opening;
}
export async function residentAnimation(id:string,catalog:string,signal:AbortSignal){
 const published=publishedAnimation(catalog,id,signal);if(published!==undefined)return published;
 await prepareAnimations(catalog);signal.throwIfAborted();
 if(catalog!==catalogId)return null;
 const program=programs.get(id);if(program)return {kind:'program' as const,texture:program};
 const timeline=index.get(id),active=atlas,geometry=layout;if(!timeline||!active||!geometry)return null;
 const frames=timeline.frames.map(([sprite,ticks])=>({...nativeFrame(geometry,sprite),ticks}));
 const texture={frames,interpolate:timeline.interpolate} as Texture;
 return {kind:'timeline' as const,texture,acquire:(frame:number,consumer:AbortSignal)=>active.acquireFrame(frames[frame]!,consumer,10)};
}
