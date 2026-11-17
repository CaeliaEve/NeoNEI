import {assertTable} from '@elysium/contracts';
import type {ItemAspectSources} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {ItemAspectSources} from '@neonei/catalog/source';

export async function readItemAspectSources(read:(path:string,signal?:AbortSignal)=>Promise<unknown>,aspect:string,offset:number,signal?:AbortSignal):Promise<ItemAspectSources> {
  const raw=await read('/aspects/'+encodeURIComponent(aspect)+'/sources?offset='+offset+'&limit=20',signal);
  const invalid=():never=>{throw new ApiError('invalid_response','物品要素来源记录不完整');};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) invalid();
  const page=raw as ItemAspectSources;
  if(page.aspect!==aspect||page.offset!==offset||page.limit!==20||!Number.isSafeInteger(page.total)||page.total<0
    ||!Array.isArray(page.rows)||!Array.isArray(page.definitions)||page.rows.length>20||page.rows.length>page.total
    ||![true,false,null].includes(page.visible)||!page.gaps
    ||!['cacheMiss','invalidKey','noAspects'].every(key=>Number.isSafeInteger(page.gaps[key])&&page.gaps[key]>=0)) invalid();
  try {
    assertTable({kind:'references',records:[...page.definitions,...page.rows]});
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const) assertTable({kind,records:page.related[kind]});
  } catch {invalid();}
  const domains=new Set(page.definitions.map(row=>row.domain));
  if(domains.size!==page.definitions.length||page.definitions.some(row=>row.data.kind!=='itemAspectsDefinition'||!row.data.ready||row.data.consuming)
    ||page.definitions.some(row=>row.data.visibility==='allRegisteredAspects')&&page.visible!==true
    ||page.total>page.definitions.reduce((sum,row)=>sum+row.data.scans,0)
    ||page.related.categories.some(category=>!category.reference||!domains.has(category.reference))
    ||new Set(page.rows.map(row=>row.id)).size!==page.rows.length
    ||page.visible!==true&&page.total!==0) invalid();
  const items=new Map(page.related.items.map(item=>[item.id,item]));
  const texts=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
  for(const row of page.rows) {
    if(row.data.kind!=='itemAspectObservation'||row.data.status!=='available'||!domains.has(row.domain)||!row.data.item) invalid();
    const item=items.get(row.data.item!);
    if(!item||!texts.has(item.name)||item.tooltip.some(id=>!texts.has(id))||item.icon&&!textures.has(item.icon)
      ||JSON.stringify(item.aspects)!==JSON.stringify(row.data.aspects)
      ||!row.data.aspects?.some(a=>a.aspect===aspect&&BigInt(a.amount)>0n)) invalid();
  }
  return page;
}
