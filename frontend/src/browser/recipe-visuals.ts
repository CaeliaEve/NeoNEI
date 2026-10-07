import type {Texture} from '@elysium/contracts';
import {Atlas} from '../catalog/atlas.ts';
import {visualStorage} from './visual-storage.ts';
import {visualMapping} from './visual-mapping.ts';
let current='',opening:Promise<void>|null=null,atlas:Atlas|null=null,controller=new AbortController();
let mapping=new Map<string,Texture['frames'][number]>();
export function prepareRecipeVisuals(catalog:string):Promise<void>{
 if(current===catalog&&opening)return opening;
 current=catalog;controller.abort();controller=new AbortController();const signal=controller.signal;
 atlas?.close();atlas=null;mapping.clear();
 opening=(async()=>{
  const storage=await visualStorage(catalog,signal);if(!storage)return;
  const bytes=await storage.read(storage.manifest.mapping,signal);
  signal.throwIfAborted();
  const frames=visualMapping(JSON.parse(new TextDecoder().decode(bytes)),storage.manifest.files);
  atlas=new Atlas({files:storage.manifest.files},storage.base.slice(0,-1),signal,(file,active)=>storage.read(file,active),48*1024*1024);
  mapping=frames;
 })().catch(()=>{/* Optional acceleration; the same original Catalog pixels are the fallback. */});
 return opening;
}
export function recipeVisualFrame(frame:Texture['frames'][number],catalog:string,signal?:AbortSignal,priority=0){
 const crop=current===catalog?mapping.get(JSON.stringify([frame.path,frame.x,frame.y,frame.width,frame.height])):undefined;
 return atlas&&crop?atlas.acquireFrame(crop,signal,priority):null;
}
