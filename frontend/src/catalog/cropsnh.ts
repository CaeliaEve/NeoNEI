import { assertTable, canonical } from '@elysium/contracts';
import { cropsNhCropKeys, cropsNhItemIds, cropsNhKinds, cropsNhMatches, hash, validateCropsNhDefinition } from '@neonei/catalog/source';
import type { CropsNhPage, CropsNhSearch } from '@neonei/catalog/source';
import { ApiError } from './transport.ts';
export type { CropsNhPage, CropsNhSearch };

export async function readCropsNh(read:(path:string,signal?:AbortSignal)=>Promise<unknown>,
  search:CropsNhSearch,signal?:AbortSignal):Promise<CropsNhPage> {
  const raw=await read('/cropsnh?'+new URLSearchParams({...search,offset:String(search.offset),limit:String(search.limit)}),signal);
  const invalid:()=>never=()=>{throw new ApiError('invalid_response','Incomplete CropsNH registration data');};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();
  const page=raw as CropsNhPage;
  try {
    if(!Array.isArray(page.definitions)||!Array.isArray(page.rows)||page.definitions.length>16||page.rows.length>100
      ||page.section!==search.section||page.offset!==search.offset||page.limit!==search.limit
      ||!Number.isSafeInteger(page.total)||page.total<0||page.total>16*65536
      ||page.rows.length!==Math.max(0,Math.min(page.limit,page.total-page.offset)))invalid();
    const leaves=[...page.definitions,...page.rows];
    assertTable({kind:'references',records:leaves});
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)
      assertTable({kind,records:page.related[kind]});
    for(let start=0;start<leaves.length;start+=16) {
      signal?.throwIfAborted();
      const valid=await Promise.all(leaves.slice(start,start+16).map(async row=>
        row.id==='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}))));
      if(valid.some(value=>!value))invalid();
    }
    const domains=new Map(page.definitions.map(row=>[row.domain,row]));
    if(domains.size!==page.definitions.length)invalid();
    for(const row of page.definitions) {
      validateCropsNhDefinition(row);
      if(row.data.section!==search.section)invalid();
    }
    const items=new Map(page.related.items.map(item=>[item.id,item]));
    const texts=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
    for(const row of page.rows) {
      const definition=domains.get(row.domain);
      if(!definition||row.data.kind!==cropsNhKinds[search.section]||row.order<1||row.order>definition.data.entries
        ||!cropsNhMatches(row,search))invalid();
      for(const id of cropsNhItemIds(row)) {
        const item=items.get(id);
        if(!item||!texts.has(item.name)||item.tooltip.some(id=>!texts.has(id))||item.icon&&!textures.has(item.icon))invalid();
      }
      for(const key of cropsNhCropKeys(row)) {
        const seed=items.get(key.seed);
        if(!seed||seed.registry!=='cropsnh:genericSeed'||seed.meta!==0||seed.nbt?.type!=='compound')invalid();
        const crop=seed.nbt.value.crop;
        if(crop?.type!=='string'||crop.value!==key.crop)invalid();
      }
    }
    for(const row of page.definitions)if(!page.related.categories.some(category=>category.reference===row.domain
      &&canonical(category.source)===canonical(row.data.source)&&texts.has(category.name)))invalid();
  } catch(error) {
    if(signal?.aborted)throw signal.reason;
    if(error instanceof ApiError)throw error;
    invalid();
  }
  return page;
}
