import {assertTable,canonical} from '@elysium/contracts';
import {hash,validateForestryDefinition,validateForestrySpecies,validateForestryOutput,validateForestryMutation} from '@neonei/catalog/source';
import type {ForestryPage,ForestrySearch,ForestryOutput,ForestryMutation} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {ForestryPage,ForestrySearch};
export async function readForestryInfo(read:(endpoint:string,signal?:AbortSignal)=>Promise<unknown>,search:ForestrySearch,signal?:AbortSignal):Promise<ForestryPage>{
  const raw=await read('/forestry-info?'+new URLSearchParams({...search,offset:String(search.offset),limit:String(search.limit)}),signal);
  const invalid:()=>never=()=>{throw new ApiError('invalid_response','林业生产与育种资料不完整');};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as ForestryPage;
  try {
    for(const key of ['definitions','rows','species','outputs'] as const)if(!Array.isArray(page[key]))invalid();
    if(page.definitions.length>6||page.rows.length>100||page.species.length>300||page.outputs.length>100)invalid();
    if(page.view!==(search.mode==='breeding'?'mutations':search.species?'outputs':'species')||page.offset!==search.offset||page.limit!==search.limit
      ||!Number.isSafeInteger(page.total)||page.total<0||page.total>1572864||page.rows.length!==Math.max(0,Math.min(page.limit,page.total-page.offset)))invalid();
    const definitions=new Map(page.definitions.map(row=>[row.domain,row]));if(definitions.size!==page.definitions.length)invalid();
    const leaves=[...new Map([...page.definitions,...page.rows,...page.species,...page.outputs].map(row=>[row.id,row])).values()];
    assertTable({kind:'references',records:leaves});
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)assertTable({kind,records:page.related[kind]});
    for(let start=0;start<leaves.length;start+=16)if((await Promise.all(leaves.slice(start,start+16).map(async row=>row.id==='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}))))).some(valid=>!valid))invalid();
    for(const row of page.definitions){if(row.data.kind!=='forestryAddonsDefinition'||row.order!==0||row.data.mode!==search.mode||search.root&&row.data.root!==search.root)invalid();validateForestryDefinition(row.data);}
    const species=new Map(page.species.map(row=>[row.domain+':'+row.data.species,row]));if(species.size!==page.species.length)invalid();
    const needed=new Set<string>();
    for(const row of page.species){const def=definitions.get(row.domain);if(!def||row.data.kind!=='forestryAddonsSpecies')invalid();validateForestrySpecies(row,def.data);for(const form of row.data.specimens)needed.add(form.item);}
    for(const row of page.rows){const def=definitions.get(row.domain);if(!def)invalid();
      if(page.view==='species'){if(row.data.kind!=='forestryAddonsSpecies'||!row.data.listed||!species.has(row.domain+':'+row.data.species))invalid();}
      else if(page.view==='outputs'){if(row.data.kind!=='forestryAddonsOutput'||row.data.species!==search.species)invalid();const output=row as ForestryOutput;const owner=species.get(row.domain+':'+output.data.species);if(!owner)invalid();validateForestryOutput(output,owner,def.data);needed.add(output.data.item);}
      else{if(row.data.kind!=='forestryAddonsMutation')invalid();const mutation=row as ForestryMutation;validateForestryMutation(mutation,def.data);if(!mutation.data.eligible||search.species&&![...mutation.data.parents,mutation.data.result].includes(search.species)||[...mutation.data.parents,mutation.data.result].some(uid=>!species.has(row.domain+':'+uid)))invalid();}
    }
    if(canonical(page.outputs)!==canonical(page.rows.filter(row=>row.data.kind==='forestryAddonsOutput')))invalid();
    if(page.related.categories.length!==page.definitions.length||page.definitions.some(def=>!page.related.categories.some(category=>category.reference===def.domain&&canonical(category.source)===canonical(def.data.source))))invalid();
    const items=new Map(page.related.items.map(item=>[item.id,item])),texts=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
    for(const id of needed){const item=items.get(id);if(!item||!texts.has(item.name)||item.tooltip.some(id=>!texts.has(id))||item.icon&&!textures.has(item.icon))invalid();}
    if(page.related.categories.some(category=>!texts.has(category.name)))invalid();
  }catch(error){if(error instanceof ApiError)throw error;invalid();}return page;
}
