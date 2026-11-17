import {ResidentIndex} from './resident-index';
import {verifiedCachedBytes} from './verified-cache';
import {Catalog,Query,Fault} from '@neonei/catalog/source';
import type {Entry} from '@elysium/contracts';
import {publishedCatalog} from './published-source.ts';
let index:ResidentIndex|null=null;
let published:Catalog|null=null,query:Query|null=null;
const row=(entry:Entry)=>({id:entry.id,name:entry.name,registry:entry.registry,terms:entry.terms,group:entry.group,sprite:-1});
self.onmessage=async(event)=>{
 const {id,kind,...args}=event.data;
 try{
  if(kind==='openPublished'){
   published=await publishedCatalog(args.manifest,args.offline);query=new Query(published);index=null;
   self.postMessage({id,value:true});
  }else if(kind==='open'){
   const cache=await caches.open(args.cacheName ?? 'neonei.browser.'+args.catalog);
   const bytes=await verifiedCachedBytes(cache,args.url,{bytes:args.bytes,sha256:args.sha256});
   const data=JSON.parse(new TextDecoder().decode(bytes));
   if(data.catalog!==args.catalog)throw Error('Browser index identity mismatch');index=new ResidentIndex(data.rows,data.groups);
   self.postMessage({id,value:true});
  }else if(published&&query){
   const value=kind==='lookup'?(await Promise.all(args.ids.map((key:string)=>published!.record('browse',key).catch(error=>{
    if(error instanceof Fault&&error.code==='record_missing')return null;throw error;
   })))).filter((entry):entry is Entry=>entry!==null).map(row)
    :await query.items({kind:'all',query:args.query,mod:args.mod,group:'',collapsed:true,offset:args.offset,limit:args.limit}).then(page=>({...page,rows:page.rows.map(row)}));
   self.postMessage({id,value});
  }else {if(!index)throw Error('Browser index is not ready');self.postMessage({id,value:kind==='lookup'?index.lookup(args.ids):index.page(args.query,args.mod,args.offset,args.limit)});}
 }catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};
