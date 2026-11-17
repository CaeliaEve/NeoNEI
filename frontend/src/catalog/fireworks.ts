import { assertTable, canonical } from '@elysium/contracts';
import { hash, fireworkMaterials, fireworkExampleItems, validateFireworkDefinition, validateFireworkExample } from '@neonei/catalog/source';
import type { FireworkPage, FireworkSearch } from '@neonei/catalog/source';
import { ApiError } from './transport.ts';
export type { FireworkPage, FireworkSearch } from '@neonei/catalog/source';
const invalid=():never=>{throw new ApiError('invalid_response','烟花规则、原生 NBT 或回调结果不一致');};
export async function readFireworks(read:(path:string,signal?:AbortSignal)=>Promise<unknown>,search:FireworkSearch,signal?:AbortSignal):Promise<FireworkPage>{
  const raw=await read('/fireworks?'+new URLSearchParams({offset:String(search.offset),limit:String(search.limit)}),signal);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as FireworkPage;
  try{
    if(!Array.isArray(page.examples)||page.examples.length>100||page.definition===undefined)invalid();
    const leaves=[...(page.definition?[page.definition]:[]),...page.examples];assertTable({kind:'references',records:leaves});
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)assertTable({kind,records:page.related[kind]});
    for(let start=0;start<leaves.length;start+=16){const valid=await Promise.all(leaves.slice(start,start+16).map(async row=>row.id==='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}))));if(valid.some(value=>!value))invalid();}
    if(page.offset!==search.offset||page.limit!==search.limit||!Number.isSafeInteger(page.total)||page.total<0||page.total>256
      ||page.examples.length!==Math.max(0,Math.min(page.limit,page.total-page.offset)))invalid();
    if(!page.definition){if(page.total||page.examples.length||page.related.categories.length)invalid();return page;}
    const definition=page.definition,def=definition.data,category=page.related.categories[0];
    if(def.kind!=='fireworkDefinition'||definition.order!==0||def.examples!==page.total||!category||page.related.categories.length!==1
      ||category.reference!==definition.domain||canonical(category.source)!==canonical(def.source))invalid();
    const items=new Map(page.related.items.map(row=>[row.id,row]));validateFireworkDefinition(def,items);
    let previous=page.offset;const needed=new Set(fireworkMaterials(def));
    for(const row of page.examples){if(row.data.kind!=='fireworkExample'||row.domain!==definition.domain||row.order!==previous+1)invalid();previous=row.order;validateFireworkExample(def,row,items);for(const id of fireworkExampleItems(row))needed.add(id);}
    const texts=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
    if(!texts.has(category.name))invalid();
    for(const id of needed){const item=items.get(id);if(!item||!texts.has(item.name)||item.tooltip.some(id=>!texts.has(id))||item.icon&&!textures.has(item.icon))invalid();}
  }catch(error){if(error instanceof ApiError)throw error;invalid();}
  return page;
}
