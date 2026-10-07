import type {File,Texture} from '@elysium/contracts';
/** Optional derived art must never make a valid original Catalog unusable. */
export async function withFrameFallback<T>(primary:Promise<T>|null,fallback:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
 if(primary){try{return await primary;}catch(error){
  if(signal?.aborted||(error instanceof Error&&error.name==='AbortError'))throw error;
 }}
 signal?.throwIfAborted();
 return fallback();
}
export function visualMapping(value:unknown,files:File[]):Map<string,Texture['frames'][number]>{
 const data=value as {paths:string[];frames:number[][]};
 if(!data||!Array.isArray(data.paths)||!data.paths.every(p=>typeof p==='string')||!Array.isArray(data.frames)||data.frames.length>100000)throw Error('配方图层映射无效');
 const result=new Map<string,Texture['frames'][number]>();
 for(const row of data.frames){
  if(!Array.isArray(row)||row.length!==8||!row.every(Number.isSafeInteger))throw Error('配方图层映射无效');
  const [source,x,y,width,height,page,dx,dy]=row as [number,number,number,number,number,number,number,number];
  if(!data.paths[source]||!files[page]||Math.min(x,y,dx,dy)<0||width<=0||height<=0||dx+width>1024||dy+height>1024)throw Error('配方图层裁片超出范围');
  const key=JSON.stringify([data.paths[source],x,y,width,height]);
  if(result.has(key))throw Error('配方图层映射重复');
  result.set(key,{path:files[page]!.path,x:dx,y:dy,width,height,ticks:1});
 }
 return result;
}
