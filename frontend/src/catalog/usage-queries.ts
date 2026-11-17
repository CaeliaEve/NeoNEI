import {assertTable,canonical} from '@elysium/contracts';
import {hash,validateUsageDefinition,validateUsageObservation,validateUsageDocument,validateUsageResource} from '@neonei/catalog/source';
import type {UsagePage,UsageSearch} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {UsagePage,UsageSearch};
export async function readUsageQueries(read:(endpoint:string,signal?:AbortSignal)=>Promise<unknown>,search:UsageSearch,signal?:AbortSignal):Promise<UsagePage>{
  const raw=await read('/usage-queries?'+new URLSearchParams(Object.fromEntries(Object.entries(search).map(([key,value])=>[key,String(value)]))),signal);
  function invalid():never{throw new ApiError('invalid_response','Native usage response is inconsistent');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as UsagePage;
  try{
    if(!Array.isArray(page.definitions)||page.definitions.length>1||!Array.isArray(page.rows)||!Array.isArray(page.documents)||!Array.isArray(page.resources)||!Array.isArray(page.directory)||!Array.isArray(page.entries)||page.entries.length!==page.rows.length
      ||page.offset!==search.offset||page.limit!==search.limit||page.documentOffset!==search.documentOffset||page.documentLimit!==search.documentLimit||!Number.isSafeInteger(page.total)||page.total<0||page.total>262144||!Number.isSafeInteger(page.documentTotal)||page.documentTotal<0||page.documentTotal>262144
      ||page.rows.length!==Math.max(0,Math.min(page.limit,page.total-page.offset))||page.documents.length!==Math.max(0,Math.min(page.documentLimit,page.documentTotal-page.documentOffset)))invalid();
    const leaves=[...page.definitions,...page.rows,...page.documents,...page.resources];assertTable({kind:'references',records:leaves});
    for(const kind of ['items','fluids','categories','strings','textures','topics']as const)assertTable({kind,records:page.related[kind]});
    if(new Set(leaves.map(row=>row.id)).size!==leaves.length)invalid();
    for(const row of leaves)if(row.id!=='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data})))invalid();
    const def=page.definitions[0];if(!def){if(leaves.length||page.total||page.documentTotal||page.directory.length)invalid();return page;}
    if(def.order!==0||def.data.kind!=='usageDefinition'||def.data.backend!==search.backend||leaves.some(row=>row.domain!==def.domain))invalid();validateUsageDefinition(def.data);
    if(page.directory.length!==def.data.counts.documents||new Set(page.directory.map(row=>row.key)).size!==page.directory.length||page.directory.some(row=>typeof row.label!=='string'||!/^usage_doc_[a-f0-9]{64}$/.test(row.key)))invalid();
    const directory=new Set(page.directory.map(row=>row.key)),resourceKeys=new Set(page.resources.map(row=>row.data.key));
    for(const row of page.resources){if(row.data.kind!=='usageResource')invalid();await validateUsageResource(row);}
    for(const row of page.documents){if(row.data.kind!=='usageDocument'||!directory.has(row.data.key)||search.document&&row.data.key!==search.document)invalid();await validateUsageDocument(row,def.data,directory,resourceKeys);}
    const neededItems=new Set<string>(),neededFluids=new Set<string>();
    for(const[index,row]of page.rows.entries()){
      if(row.data.kind!=='usageObservation'||search.item&&row.data.input.item!==search.item||search.observation&&row.id!==search.observation)invalid();validateUsageObservation(row,def.data);neededItems.add(row.data.input.item);
      const r=row.data.result,entries=r.kind==='cell'?r.entries:[],slice=page.entries[index]!;
      if(slice.row!==row.id||slice.offset!==search.entryOffset||slice.limit!==search.entryLimit||slice.total!==entries.length||canonical(slice.entries)!==canonical(entries.slice(search.entryOffset,search.entryOffset+search.entryLimit)))invalid();
      for(const entry of slice.entries)(entry.kind==='item'?neededItems:neededFluids).add(entry.id);
      if(r.kind==='manual'&&!directory.has(r.document)||r.kind==='callbacks'&&r.documents.some(key=>!directory.has(key)))invalid();
    }
    for(const doc of page.documents)if(doc.data.content.kind==='manual')for(const image of doc.data.content.images)if(image.kind==='items')for(const id of image.items)neededItems.add(id);
    const strings=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
    for(const[kind,needed]of [['items',neededItems],['fluids',neededFluids]]as const){const actual=page.related[kind];if(actual.length!==needed.size||actual.some(item=>!needed.has(item.id)||!strings.has(item.name)||item.icon&&!textures.has(item.icon)))invalid();}
    if(page.related.categories.length!==1||page.related.categories[0]!.reference!==def.domain||canonical(page.related.categories[0]!.source)!==canonical(def.data.source)||!strings.has(page.related.categories[0]!.name))invalid();
  }catch(error){if(error instanceof ApiError)throw error;invalid();}return page;
}
