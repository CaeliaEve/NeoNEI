import {assertTable,canonical} from '@elysium/contracts';
import {hash} from '@neonei/catalog/source';
import type {UndergroundPage,UndergroundSearch} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {UndergroundPage,UndergroundSearch} from '@neonei/catalog/source';
const invalid=():never=>{throw new ApiError('invalid_response','地下流体资料缺少原生规则或来源不一致');};
export async function readUndergroundFluids(read:(path:string,signal?:AbortSignal)=>Promise<unknown>,search:UndergroundSearch,signal?:AbortSignal):Promise<UndergroundPage>{
  const raw=await read('/underground-fluids?'+new URLSearchParams({...search,offset:String(search.offset),limit:String(search.limit)}),signal);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as UndergroundPage;
  try{
    if(!Array.isArray(page.dimensions)||page.dimensions.length>4096||!Array.isArray(page.rows)||page.rows.length>100||!Array.isArray(page.displays)||page.displays.length>262144)invalid();
    const references=[...(page.definition?[page.definition]:[]),...page.dimensions,...page.rows,...page.displays];
    assertTable({kind:'references',records:references});
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)assertTable({kind,records:page.related[kind]});
    // Immutable native reference leaves are content addressed; catch mutated semantic values too.
    for(let start=0;start<references.length;start+=32){
      const valid=await Promise.all(references.slice(start,start+32).map(async row=>row.id==='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}))));
      if(valid.some(result=>!result))invalid();
    }
  }catch{invalid();}
  if(!Number.isSafeInteger(page.total)||page.total<0||page.offset!==search.offset||page.limit!==search.limit||page.rows.length!==Math.max(0,Math.min(page.limit,page.total-page.offset)))invalid();
  if(!page.definition){if(page.definition!==null||page.total||page.dimensions.length||page.displays.length||page.related.fluids.length||page.related.categories.length)invalid();return page;}
  const definition=page.definition,data=definition.data,category=page.related.categories[0];
  if(data.kind!=='undergroundFluidsDefinition'||!data.ready||data.consuming||definition.order!==0||data.selection!=='nativeThousandTicketsInclusive'
    ||data.amountGeneration!=='nativeFifthPowerVeinData'||data.source.handler!=='gtneioreplugin.plugin.gregtech5.PluginGT5UndergroundFluid'||data.source.key!=='GTOrePluginUndergroundFluid'
    ||data.counts.dimensions!==page.dimensions.length||page.total>data.counts.entries||page.related.categories.length!==1||!category||category.reference!==definition.domain
    ||category.source.owner!==data.source.owner||category.source.handler!==data.source.handler||category.source.key!==data.source.key)invalid();
  const dimensions=new Map(page.dimensions.map(row=>[row.data.dimension,row.data])),fluids=new Map(page.related.fluids.map(row=>[row.id,row]));
  const strings=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
  if(dimensions.size!==page.dimensions.length||!strings.has(category.name))invalid();
  let dimensionEntries=0;
  for(const row of page.dimensions){if(row.data.kind!=='undergroundFluidDimension'||row.data.nullTickets>1000||row.data.entries>65536||row.data.totalWeight>2147483647)invalid();dimensionEntries+=row.data.entries;}
  if(dimensionEntries!==data.counts.entries)invalid();
  for(const row of page.displays)if(row.data.kind!=='undergroundFluidDisplay'||row.data.nativeChance>10000)invalid();
  for(const row of [...page.dimensions,...page.rows,...page.displays])if(row.domain!==definition.domain)invalid();
  for(const row of page.rows){
    const entry=row.data,dimension=dimensions.get(entry.dimension);
    if(entry.kind!=='undergroundFluidEntry'||!dimension||entry.ordinal>=dimension.entries||entry.selectedTickets>1000||entry.minAmount>entry.maxAmount
      ||entry.weight>214748||search.dimension&&entry.dimension!==search.dimension||search.fluid&&entry.fluid!==search.fluid)invalid();
    if(entry.fluid){
      const fluid=fluids.get(entry.fluid);if(!fluid||fluid.registry!==entry.registry||fluid.nbt!==null||!strings.has(fluid.name)||fluid.icon&&!textures.has(fluid.icon))invalid();
      if(dimension.displayDimension&&!page.displays.some(row=>row.data.registry===entry.registry&&row.data.dimension===dimension.displayDimension
        &&row.data.minAmount===entry.minAmount&&row.data.maxAmount===entry.maxAmount&&row.data.nativeChance===Math.floor(entry.weight*10000/dimension.totalWeight)))invalid();
    }
  }
  return page;
}
