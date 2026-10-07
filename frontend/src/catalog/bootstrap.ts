import type {Catalog} from './client.ts';
export async function initialRecipes(catalog:Catalog,item:string,direction:'recipes'|'uses'='recipes',signal?:AbortSignal,priority=0){
 signal?.throwIfAborted();
 const directory=await catalog.directory(item,signal,priority),links=directory.links;
 signal?.throwIfAborted();
 const chosen=links[direction].length?direction:direction==='recipes'?'uses':'recipes';
 const empty=(mode:'recipes'|'uses')=>({rows:[],recipeIds:links[mode],categories:directory[mode],related:directory.related,total:links[mode].length,offset:0,limit:1});
 let producedBy=empty('recipes') as Awaited<ReturnType<Catalog['recipes']>>,usedIn=empty('uses') as Awaited<ReturnType<Catalog['recipes']>>;
 if(links[chosen].length){
  const detail=await catalog.recipe(links[chosen][0]!,signal,priority);
  signal?.throwIfAborted();
  const merge=<T extends {id:string}>(a:T[],b:T[])=>[...new Map([...a,...b].map(row=>[row.id,row])).values()];
  const result={...empty(chosen),rows:[detail.recipe],related:{...detail.related,
   categories:merge(detail.related.categories,directory.related.categories),
   strings:merge(detail.related.strings,directory.related.strings)}};
  if(chosen==='recipes')producedBy=result;else usedIn=result;
 }
 return {links,producedBy,usedIn};
}
