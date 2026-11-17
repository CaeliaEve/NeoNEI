import {assertTable,canonical} from '@elysium/contracts';
import {hash,validateProjectBlueDefinition,validateProjectBlueRule,validateProjectBlueContext,validateProjectBlueExample,projectBlueExampleItems} from '@neonei/catalog/source';
import type {ProjectBluePage,ProjectBlueSearch} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {ProjectBluePage,ProjectBlueSearch};
export async function readProjectBlue(read:(endpoint:string,signal?:AbortSignal)=>Promise<unknown>,search:ProjectBlueSearch,signal?:AbortSignal):Promise<ProjectBluePage>{
  const raw=await read('/projectblue?'+new URLSearchParams({mode:search.mode,offset:String(search.offset),limit:String(search.limit)}),signal);
  function invalid():never{throw new ApiError('invalid_response','ProjectBlue 原生规则、材料或动态输出不完整');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as ProjectBluePage;
  try {
    if(page.definition===undefined||!Array.isArray(page.rules)||!Array.isArray(page.roles)||!Array.isArray(page.materials)||!Array.isArray(page.examples)
      ||page.offset!==search.offset||page.limit!==search.limit||!Number.isSafeInteger(page.total)||page.total<0||page.examples.length!==Math.max(0,Math.min(search.limit,page.total-search.offset)))invalid();
    const leaves=[...(page.definition?[page.definition]:[]),...page.rules,...page.roles,...page.materials,...page.examples];assertTable({kind:'references',records:leaves});
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)assertTable({kind,records:page.related[kind]});
    for(let start=0;start<leaves.length;start+=16){const valid=await Promise.all(leaves.slice(start,start+16).map(async row=>row.id==='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}))));if(valid.some(value=>!value))invalid();}
    if(!page.definition){if(leaves.length||page.total||page.related.categories.length)invalid();return page;}
    const definition=page.definition,def=definition.data;if(def.kind!=='projectBlueDefinition')invalid();validateProjectBlueDefinition(definition);
    if(page.rules.length!==def.counts.rules||page.roles.length!==def.counts.roles||page.materials.length>def.counts.materials||page.total>def.counts.examples||page.related.categories.length!==1
      ||leaves.some(row=>row.domain!==definition.domain)||page.related.categories[0]?.reference!==definition.domain||canonical(page.related.categories[0]?.source)!==canonical(def.source))invalid();
    for(const[index,row]of page.rules.entries()){if(row.data.kind!=='projectBlueRule'||row.data.index!==index)invalid();validateProjectBlueRule(row);}
    if(page.roles.some(row=>row.data.kind!=='projectBlueItem')||page.materials.some(row=>!['projectBlueCachedMaterial','projectBlueRegisteredMaterial','projectBlueMaterialAlias'].includes(row.data.kind)))invalid();
    validateProjectBlueContext(page.roles,page.materials);
    const items=new Map(page.related.items.map(item=>[item.id,item]));let previous=0;const needed=new Set<string>();
    for(const row of page.examples){const rule=page.rules[row.data.rule];if(row.data.kind!=='projectBlueExample'||!rule||row.order<=previous||search.mode!=='all'&&rule.data.mode!==search.mode)invalid();previous=row.order;validateProjectBlueExample(def,rule,row,page.roles,page.materials,items);for(const id of projectBlueExampleItems(row))needed.add(id);}
    const texts=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));if(!texts.has(page.related.categories[0]!.name))invalid();
    for(const id of needed){const item=items.get(id);if(!item||!texts.has(item.name)||item.tooltip.some(id=>!texts.has(id))||item.icon&&!textures.has(item.icon))invalid();}
  }catch(error){if(error instanceof ApiError)throw error;invalid();}return page;
}
