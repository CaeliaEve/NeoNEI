import type {Entry,Texture} from '@elysium/contracts';
import type {Lease} from '../catalog/atlas.ts';

interface PublishedSource {
 entry:(id:string,signal:AbortSignal)=>Promise<Pick<Entry,'icon'>>;
 texture:(id:string,signal:AbortSignal)=>Promise<Texture>;
 acquire:(frame:Texture['frames'][number],signal:AbortSignal)=>Promise<Lease>;
 reserve:(bytes:number)=>()=>void;
}
const sources=new Map<string,PublishedSource>();

/** Current Catalogs own their animation references, pixels and resource lifetime. */
export function bindPublishedAnimations(catalog:string,source:PublishedSource):()=>void {
 sources.set(catalog,source);
 return ()=>{if(sources.get(catalog)===source)sources.delete(catalog);};
}
export function claimPublishedCanvas(catalog:string,bytes:number):(()=>void)|undefined {
 return sources.get(catalog)?.reserve(bytes);
}
export function publishedAnimation(catalog:string,id:string,signal:AbortSignal) {
 const source=sources.get(catalog);
 if(!source)return undefined;
 return (async()=>{
  signal.throwIfAborted();
  const entry=await source.entry(id,signal);
  signal.throwIfAborted();
  if(!entry.icon)return null;
  const texture=await source.texture(entry.icon,signal);
  signal.throwIfAborted();
  if(texture.visual)return {kind:'program' as const,texture};
  if(texture.frames.length<2)return null;
  return {kind:'timeline' as const,texture,acquire:(frame:number,consumer:AbortSignal)=>{
   const value=texture.frames[frame];
   if(!value)return Promise.reject(new Error('Animation frame is outside its published timeline'));
   return source.acquire(value,consumer);
  }};
 })();
}
