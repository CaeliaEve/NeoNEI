import {ResidentIndex} from './resident-index';
import {verifiedCachedBytes} from './verified-cache';
let index:ResidentIndex|null=null;
self.onmessage=async(event)=>{
 const {id,kind,...args}=event.data;
 try{
  if(kind==='open'){
   const cache=await caches.open(args.cacheName ?? 'neonei.browser.'+args.catalog);
   const bytes=await verifiedCachedBytes(cache,args.url,{bytes:args.bytes,sha256:args.sha256});
   const data=JSON.parse(new TextDecoder().decode(bytes));
   if(data.catalog!==args.catalog)throw Error('浏览索引身份不符');index=new ResidentIndex(data.rows,data.groups);
   self.postMessage({id,value:true});
  }else {if(!index)throw Error('浏览索引未就绪');self.postMessage({id,value:kind==='lookup'?index.lookup(args.ids):index.page(args.query,args.mod,args.offset,args.limit)});}
 }catch(error){self.postMessage({id,error:String(error)});}
};
