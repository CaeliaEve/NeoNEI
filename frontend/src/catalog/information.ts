import {assertTable,canonical} from '@elysium/contracts';
import {hash,validateInformationDefinition,validateInformationEntry} from '@neonei/catalog/source';
import type {InformationPage,InformationSearch} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {InformationPage,InformationSearch};
export async function readInformation(read:(endpoint:string,signal?:AbortSignal)=>Promise<unknown>,search:InformationSearch,signal?:AbortSignal):Promise<InformationPage>{
  const raw=await read('/information?'+new URLSearchParams({...search,offset:String(search.offset),limit:String(search.limit),includeUnmatched:String(search.includeUnmatched),linkOffset:String(search.linkOffset),linkLimit:String(search.linkLimit)}),signal);
  function invalid():never {throw new ApiError('invalid_response','原生信息页数据不完整');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as InformationPage;
  try{
    if(!Array.isArray(page.definitions)||page.definitions.length>2||!Array.isArray(page.rows)||page.rows.length>100||!Array.isArray(page.links)||page.links.length!==page.rows.length||page.offset!==search.offset||page.limit!==search.limit
      ||!Number.isSafeInteger(page.total)||page.total<0||page.total>524288||page.rows.length!==Math.max(0,Math.min(page.limit,page.total-page.offset)))invalid();
    const definitions=new Map(page.definitions.map(row=>[row.domain,row]));if(definitions.size!==page.definitions.length)invalid();
    const leaves=[...page.definitions,...page.rows];assertTable({kind:'references',records:leaves});
    if(new Set(leaves.map(row=>row.id)).size!==leaves.length)invalid();
    for(const kind of ['items','fluids','categories','strings','textures','topics']as const)assertTable({kind,records:page.related[kind]});
    for(let start=0;start<leaves.length;start+=16)if((await Promise.all(leaves.slice(start,start+16).map(async row=>row.id==='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}))))).some(valid=>!valid))invalid();
    for(const row of page.definitions){if(row.order!==0||row.data.kind!=='neiInformationDefinition'||search.backend&&row.data.backend!==search.backend)invalid();validateInformationDefinition(row.data);}
    const items=new Map(page.related.items.map(item=>[item.id,item])),texts=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
    for(const [index,row] of page.rows.entries()){if(row.data.kind!=='neiInformationPage')invalid();const def=definitions.get(row.domain);if(!def)invalid();validateInformationEntry(row,def.data);
      if(search.document&&row.id!==search.document||!search.includeUnmatched&&!row.data.listed||search.item&&!row.data.items.some(link=>link.item===search.item))invalid();
      const links=page.links[index]!;if(links.row!==row.id||links.offset!==search.linkOffset||links.limit!==search.linkLimit||links.total!==row.data.items.length||canonical(links.items)!==canonical(row.data.items.slice(search.linkOffset,search.linkOffset+search.linkLimit)))invalid();
      for(const link of links.items){const item=items.get(link.item);if(!item||!texts.has(item.name)||item.tooltip.some(id=>!texts.has(id))||item.icon&&!textures.has(item.icon))invalid();}
    }
    if(page.related.categories.length!==page.definitions.length||page.definitions.some(def=>!page.related.categories.some(category=>category.reference===def.domain&&canonical(category.source)===canonical(def.data.source)&&texts.has(category.name))))invalid();
  }catch(error){if(error instanceof ApiError)throw error;invalid();}return page;
}
