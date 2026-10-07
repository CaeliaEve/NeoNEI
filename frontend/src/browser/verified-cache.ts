type Descriptor={bytes:number;sha256:string};
async function checked(response:Response,file:Descriptor):Promise<Uint8Array>{
 if(!response.ok)throw Error('资源读取失败：'+response.status);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.byteLength!==file.bytes)throw Error('资源长度校验失败');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==file.sha256)throw Error('资源摘要校验失败');
 return bytes;
}

/** Repair only this immutable resource, and never replace a cache entry with unverified data. */
export async function verifiedCachedBytes(cache:Cache,url:string,file:Descriptor,signal?:AbortSignal,required=false):Promise<Uint8Array>{
 signal?.throwIfAborted();
 const cached=await cache.match(url);
 if(cached){
  try{const bytes=await checked(cached,file);signal?.throwIfAborted();return bytes;}
  catch(error){if(signal?.aborted)throw error;}
 }
 signal?.throwIfAborted();
 // One bounded retry for a transient connection/server failure, no integrity-error retries.
 let response:Response|undefined;
 try{
  response=await fetch(url,{signal,cache:'reload'});
 }catch(error){
  if(signal?.aborted||!(error instanceof TypeError)||globalThis.navigator?.onLine===false)throw error;
 }
 if(!response||response.status>=500||response.status===408){
  await response?.body?.cancel();signal?.throwIfAborted();
  response=await fetch(url,{signal,cache:'reload'});
 }
 const bytes=await checked(response,file);signal?.throwIfAborted();
 try{await cache.put(url,new Response(bytes as BodyInit,{headers:{'Content-Type':url.endsWith('.webp')?'image/webp':'application/octet-stream'}}));}
 catch(error){if(required)throw error;}
 return bytes;
}
