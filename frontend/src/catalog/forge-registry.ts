import {assertTable,canonical} from '@elysium/contracts';
import {hash,validateForgeDefinition,validateForgePageFacts,forgeTargets,forgeMatches} from '@neonei/catalog/source';
import type {ForgePage,ForgeSearch} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {ForgePage,ForgeSearch};
export async function readForgeRegistry(read:(endpoint:string,signal?:AbortSignal)=>Promise<unknown>,search:ForgeSearch,signal?:AbortSignal):Promise<ForgePage> {
  const raw=await read('/forge-registry?'+new URLSearchParams(Object.entries(search).map(([key,value])=>[key,String(value)])),signal);
  function invalid():never{throw new ApiError('invalid_response','Forge 注册资料、原始模板或可见内容不完整');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as ForgePage;
  try {
    if(!Array.isArray(page.definitions)||page.definitions.length>2||!Array.isArray(page.rows)||!Number.isSafeInteger(page.total)||page.total<0||page.total>262144
      ||page.offset!==search.offset||page.limit!==search.limit||page.rows.length!==Math.max(0,Math.min(search.limit,page.total-search.offset)))invalid();
    const leaves=[...page.definitions,...page.rows];assertTable({kind:'references',records:leaves});
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)assertTable({kind,records:page.related[kind]});
    const registries=new Set<string>();for(const def of page.definitions){if(def.data.kind!=='forgeRegistryDefinition'||registries.has(def.data.registry))invalid();registries.add(def.data.registry);validateForgeDefinition(def);}
    const definition=page.definitions.find(def=>def.data.registry===search.registry);if(!definition&&page.total||definition&&page.total>definition.data.entries)invalid();
    let prior=0;for(const row of page.rows){if(!forgeMatches(row,search)||!definition||row.domain!==definition.domain||row.order<=prior||row.order>definition.data.entries||row.data.kind!==(search.registry==='oreDictionary'?'oreGroup':'fluid'))invalid();prior=row.order;}
    for(const row of leaves)if(row.id!=='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data})))invalid();
    validateForgePageFacts(page.rows,search,page.related.items,page.related.fluids);
    const texts=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
    for(const target of forgeTargets(page.rows,search)){
      const record=target.kind==='item'?page.related.items.find(item=>item.id===target.id):page.related.fluids.find(fluid=>fluid.id===target.id);
      if(!record||!texts.has(record.name)||record.icon&&!textures.has(record.icon)||'tooltip'in record&&record.tooltip.some(id=>!texts.has(id)))invalid();
    }
    if(page.related.categories.length!==page.definitions.length||page.definitions.some(def=>!page.related.categories.some(category=>category.reference===def.domain&&canonical(category.source)===canonical(def.data.source)&&texts.has(category.name))))invalid();
  }catch(error){if(error instanceof ApiError)throw error;invalid();}return page;
}
