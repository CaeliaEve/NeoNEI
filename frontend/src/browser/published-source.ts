import {Catalog,Fault,type CatalogManifest} from '@neonei/catalog/source';
import {Shelf} from '../offline/store.ts';
import {body,networkError} from '../catalog/transport.ts';

/** The Compiler's immutable, hashed tables are the worker input; no web-side repack. */
export async function publishedCatalog(manifest:CatalogManifest,offline=false):Promise<Catalog> {
 let opening:Promise<Shelf>|null=null;
 const saved=async(path:string)=>{
  const shelf=await (opening??=Shelf.open()),bytes=await shelf.file(manifest.id,path);
  if(!bytes)throw new Fault('file_missing','离线资料缺少文件：'+path,404);
  return bytes;
 };
 return Catalog.open(manifest,async file=>{
  if(offline||navigator.onLine===false)return saved(file.path);
  try{
   const response=await fetch('/assets/'+manifest.id+'/'+file.path);
   if(!response.ok){await response.body?.cancel();throw new Fault('file_missing','资料文件请求失败：HTTP '+response.status,response.status);}
   return await body(response,file.bytes,file.bytes);
  }catch(error){if(!networkError(error))throw error;return saved(file.path);}
 },manifest.id);
}
