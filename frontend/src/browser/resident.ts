import {shallowRef} from 'vue';
import type {File,Texture} from '@elysium/contracts';
import {Atlas} from '../catalog/atlas';
import {nativeFrame,type NativeLayout} from './native-frame';
import type {Row} from './resident-index';
import {pageLoader} from './paging';
import {pagePrefetch} from './prefetch';
import {verifiedCachedBytes} from './verified-cache';

export const residentStatus=shallowRef('');
export const residentReady=shallowRef(false);
export const residentCatalog=shallowRef('');
let worker:Worker|null=null,seq=0,activeCatalog='',opening:Promise<void>|null=null;
let atlas:Atlas|null=null,layout:NativeLayout|null=null;
let sourceFrames=new Map<string,number>();
const frameKey=(frame:Texture['frames'][number])=>JSON.stringify([frame.path,frame.x,frame.y,frame.width,frame.height]);
let lifetime=new AbortController(),warm=new AbortController();
let predict=pagePrefetch();
let warmTimer:ReturnType<typeof setTimeout>|undefined;
export function cancelPageWarm(){clearTimeout(warmTimer);warm.abort();}
const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
function call(kind:string,args:Record<string,unknown>):Promise<any>{return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker!.postMessage({id,kind,...args});});}

export function prepareResident(catalog:string):Promise<void>{
 if(activeCatalog===catalog&&opening)return opening;
 activeCatalog=catalog;residentCatalog.value=catalog;residentReady.value=false;worker?.terminate();atlas?.close();atlas=null;layout=null;
 sourceFrames.clear();
 lifetime.abort();cancelPageWarm();predict=pagePrefetch();lifetime=new AbortController();const signal=lifetime.signal;
 for(const p of pending.values())p.reject(Error('数据集已切换'));pending.clear();
 opening=(async()=>{
  residentStatus.value='正在准备原生像素浏览…';
  const base='/browser-native/'+catalog+'/',cacheName='neonei.browser.native.3.'+catalog;
  const cache=await caches.open(cacheName);
  const read=async(url:string,active:AbortSignal)=>{active.throwIfAborted();return (await cache.match(url))??fetch(url,{signal:active});};
  const response=await read(base+'manifest.json',signal);if(!response.ok)throw Error('暂无原生像素浏览包');
  const manifestCopy=response.clone(),manifest=await response.json();
  signal.throwIfAborted();
  if(manifest.version!==2||manifest.catalog!==catalog||manifest.size!==64||manifest.edge!==1024
    ||!Number.isSafeInteger(manifest.count)||manifest.count<0||manifest.count>1000000
    ||!Array.isArray(manifest.dimensions)||manifest.dimensions.length!==manifest.count
    ||!Array.isArray(manifest.files)||manifest.files.length!==Math.ceil(manifest.count/256))throw Error('原生浏览包不匹配');
  layout=manifest;
  if(manifest.originalFrames){
   const bytes=await verifiedCachedBytes(cache,base+manifest.originalFrames.path,manifest.originalFrames,signal);
   const mapping=JSON.parse(new TextDecoder().decode(bytes));
   sourceFrames=new Map(mapping.frames.map((f:number[],i:number)=>[JSON.stringify([mapping.paths[f[0]!],...f.slice(1)]),i]));
  }
  atlas=new Atlas({files:manifest.files},base.slice(0,-1),signal,async(file:File,active:AbortSignal)=>{
   return verifiedCachedBytes(cache,base+file.path,file,active);
  },96*1024*1024);
  worker=new Worker(new URL('./resident.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=e=>{const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.value);};
  worker.onerror=()=>{for(const p of pending.values())p.reject(Error('浏览 Worker 失败'));pending.clear();residentReady.value=false;};
  await call('open',{url:base+manifest.index.path,sha256:manifest.index.sha256,bytes:manifest.index.bytes,catalog,cacheName});
  signal.throwIfAborted();
  try{await cache.put(base+'manifest.json',manifestCopy);}catch{/* Storage may be full. */}
  residentReady.value=true;residentStatus.value='原生像素浏览已就绪';
  // Load the small recipe UI code once while idle, so the first click does not waterfall through async components.
  setTimeout(()=>{if(!signal.aborted)void Promise.all([import('../components/MachineTypeIcons.vue'),import('../components/RecipeDisplayRouter.vue'),import('../components/CatalogRecipe.vue')]).catch(()=>{});},0);
 })().catch(error=>{if(signal.aborted)return;residentStatus.value=String(error);atlas?.close();atlas=null;worker?.terminate();worker=null;});
 return opening;
}

export async function residentFrame(sprite:number,signal?:AbortSignal,priority=0){
 if(!atlas||!layout)throw Error('原生图标尚未就绪');
 const frame=nativeFrame(layout,sprite);
 return {...await atlas.acquire(frame.path,signal,priority),frame};
}
export async function residentRows(ids:string[]):Promise<Row[]> { return residentReady.value?call('lookup',{ids}):[]; }
export function residentSourceFrame(frame:Texture['frames'][number],catalog:string,signal?:AbortSignal,priority=0){
 const sprite=catalog===activeCatalog?sourceFrames.get(frameKey(frame)):undefined;
 return atlas&&sprite!==undefined?residentFrame(sprite,signal,priority):null;
}
async function warmRows(rows:Row[],signal:AbortSignal){
 const pages=new Map<string,number>();
 for(const row of rows)if(row.sprite>=0&&layout)pages.set(nativeFrame(layout,row.sprite).path,row.sprite);
 await Promise.allSettled([...pages.values()].map(async sprite=>{const lease=await residentFrame(sprite,signal,10);lease.release();}));
}
const loadPage=pageLoader<Row>((query,mod,offset,limit)=>call('page',{query,mod,offset,limit}),warmRows);
export async function residentPage(query:string,mod:string,offset:number,limit:number):Promise<{rows:Row[];total:number}>{
 if(!residentReady.value)throw Error('原生浏览未就绪');
 cancelPageWarm();warm=new AbortController();const signal=warm.signal;
 const targets=predict(query,mod,offset,limit,performance.now());
 const result=await loadPage(query,mod,offset,limit);
 // Intent is sampled before the async read; late responses cannot change the prediction.
 if(!signal.aborted)warmTimer=setTimeout(()=>{void(async()=>{
  const pages=new Set<string>();
  for(const next of targets(result.total)){
   if(signal.aborted)return;
   const page=await call('page',{query,mod,offset:next,limit});
   for(const row of page.rows as Row[]){
    if(signal.aborted||!layout)return;
    if(row.sprite<0)continue;
    const path=nativeFrame(layout,row.sprite).path;
    if(pages.has(path))continue;
    if(pages.size>=4)return;
    pages.add(path);
    const lease=await residentFrame(row.sprite,signal,10);lease.release();
   }
  }
 })().catch(()=>{});},32);
 return result;
}
