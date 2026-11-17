import {assertTable} from '@elysium/contracts';
import type {LexiconPage,LexiconSearch} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {LexiconPage,LexiconSearch} from '@neonei/catalog/source';

export async function readLexicon(read:(path:string,signal?:AbortSignal)=>Promise<unknown>,search:LexiconSearch,signal?:AbortSignal):Promise<LexiconPage> {
  const params=new URLSearchParams({...search,offset:String(search.offset),limit:String(search.limit)});
  const raw=await read('/lexicon?'+params,signal);
  const invalid=():never=>{throw new ApiError('invalid_response','辞典资料缺少完整的原生记录');};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) invalid();
  const page=raw as LexiconPage;
  if(!Array.isArray(page.rows)||!Array.isArray(page.definitions)||!Number.isSafeInteger(page.total)||page.total<0
    ||page.offset!==search.offset||page.limit!==search.limit||page.rows.length>page.limit||page.rows.length>page.total) invalid();
  try {
    assertTable({kind:'references',records:[...page.definitions,...page.rows]});
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const) assertTable({kind,records:page.related[kind]});
  } catch {invalid();}
  const domains=new Set(page.definitions.map(row=>row.domain));
  if(domains.size!==page.definitions.length||page.definitions.some(row=>row.data.kind!=='lexiconDefinition'||row.data.consuming)
    ||page.total>page.definitions.reduce((sum,row)=>sum+row.data.entries,0)||new Set(page.rows.map(row=>row.id)).size!==page.rows.length
    ||page.related.categories.some(category=>!category.reference||!domains.has(category.reference))) invalid();
  const items=new Map(page.related.items.map(row=>[row.id,row]));
  const texts=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
  for(const row of page.rows) {
    if(row.data.kind!=='lexiconEntry'||!domains.has(row.domain)||row.data.entry!==row.data.name.key
      ||search.item&&!row.data.items.some(item=>item.item===search.item)) invalid();
    for(const fact of row.data.items) {
      const item=items.get(fact.item);
      if(!item||!texts.has(item.name)||item.tooltip.some(id=>!texts.has(id))||item.icon&&!textures.has(item.icon)
        ||fact.quickInfo.key!==(fact.hasQuickInfo?'botania.nei.quickInfo:'+fact.nativeKey:'botania.nei.lexicaNoInfo')) invalid();
    }
  }
  return page;
}
