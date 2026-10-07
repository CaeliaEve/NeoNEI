import {PackedCatalog,Query,type Collection} from '@neonei/catalog/source';
import {interactionStorage} from './interaction-storage';
let catalog:PackedCatalog|null=null,query:Query|null=null;
self.onmessage=async event=>{
 const {id,kind,manifest,endpoint}=event.data;
 try{
  if(kind==='open'){
   const storage=await interactionStorage(manifest.id);
   if(storage){catalog=new PackedCatalog(manifest,storage.manifest.files,storage.read,storage.keys);query=new Query(catalog);}
   self.postMessage({id,value:!!storage});return;
  }
  if(!catalog||!query)throw Error('交互包未就绪');
  const url=new URL(endpoint,'http://local'),parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent),p=url.searchParams;
  let value:unknown;
  if(parts[0]==='directory')value=await query.directory(parts[1]!);
  else if(parts[0]==='records')value=await catalog.record(parts[1] as Collection,parts[2]!);
  else if(parts[0]==='recipes'&&parts[1]){const recipe=await catalog.record('recipes',parts[1]);value={recipe,related:await query.related([recipe])};}
  else if(parts[0]==='recipes'){
   const result=await query.recipes({item:p.get('item')!,direction:p.get('direction')==='uses'?'uses':'recipes',category:p.get('category')??'',query:p.get('query')??'',offset:Number(p.get('offset')??0),limit:Number(p.get('limit')??1)});
   const related=await query.related(result.rows);
   const categories=await catalog.records('categories',result.categories.map(row=>row.id));
   const strings=await catalog.records('strings',categories.map(row=>row.name));
   related.categories=[...new Map([...related.categories,...categories].map(row=>[row.id,row])).values()];
   related.strings=[...new Map([...related.strings,...strings].map(row=>[row.id,row])).values()];value={...result,related};
  }else throw Error('Unsupported interaction query');
  self.postMessage({id,value});
 }catch(error){self.postMessage({id,error:String(error)});}
};
