import {assertTable,canonical} from '@elysium/contracts';
import {hash} from '@neonei/catalog/source';
import type {BartworksPage,BartworksSearch} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {BartworksPage,BartworksSearch} from '@neonei/catalog/source';
const invalid=():never=>{throw new ApiError('invalid_response','Bartworks 矿物资料缺少原生规则或来源不一致');};
export async function readBartworksOres(read:(path:string,signal?:AbortSignal)=>Promise<unknown>,search:BartworksSearch,signal?:AbortSignal):Promise<BartworksPage>{
  const raw=await read('/bartworks-ores?'+new URLSearchParams({...search,offset:String(search.offset),limit:String(search.limit)}),signal);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as BartworksPage;
  try{
    if(!Array.isArray(page.definitions)||page.definitions.length>1||!Array.isArray(page.rows)||page.rows.length>100||!Array.isArray(page.companions)||page.companions.length>4096||!Array.isArray(page.lookups)||page.lookups.length>400||!Array.isArray(page.dimensions)||page.dimensions.length>2)invalid();
    const leaves=[...page.definitions,...page.rows,...page.companions,...page.lookups];assertTable({kind:'references',records:leaves});
    if(new Set(leaves.map(row=>row.id)).size!==leaves.length)invalid();
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)assertTable({kind,records:page.related[kind]});
    for(let start=0;start<leaves.length;start+=32){const checks=await Promise.all(leaves.slice(start,start+32).map(async row=>row.id==='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}))));if(checks.some(ok=>!ok))invalid();}
  }catch{invalid();}
  if(!Number.isSafeInteger(page.total)||page.total<0||page.offset!==search.offset||page.limit!==search.limit||page.rows.length!==Math.max(0,Math.min(page.limit,page.total-page.offset))||new Set(page.dimensions).size!==page.dimensions.length||page.dimensions.some(dim=>!['planet.Ross128b','moon.Ross128ba'].includes(dim)))invalid();
  const definition=page.definitions[0],data=definition?.data,category=page.related.categories[0];
  if(!definition){if(page.rows.length||page.companions.length||page.lookups.length||page.total||page.related.categories.length)invalid();return page;}
  if(data!.kind!=='bartworksOresDefinition'||definition.order!==0||!data!.ready||data!.consuming||data!.source.handler!=='bartworks.neiHandler.OreNEIHandler'||data!.source.key!==data!.source.handler||data!.nativeOverlayPolicy!=='oreFeatureForBothVariantsThenLayerOnlyDedup'||data!.layerDiscovery!=='activeListThenMetadataLookup'||page.related.categories.length!==1||category.reference!==definition.domain||category.source.owner!==data!.source.owner||category.source.handler!==data!.source.handler||category.source.key!==data!.source.key||page.total>(search.mode==='layers'?data!.counts.layers:data!.counts.materials))invalid();
  const items=new Map(page.related.items.map(row=>[row.id,row])),strings=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));if(!strings.has(category.name))invalid();
  const item=(id:string,meta:number)=>{const fact=items.get(id);if(!fact||fact.meta!==meta||fact.nbt!==null||!strings.has(fact.name)||fact.icon&&!textures.has(fact.icon))invalid();};
  const knownMetas=new Set<number>();
  for(const [companion,rows] of [[false,page.rows],[true,page.companions]] as const)for(const row of rows){
    const value=row.data,layer=value.kind==='bartworksOreLayer';
    if(row.domain!==definition.domain||layer!==(companion?search.mode==='materials':search.mode==='layers'))invalid();
    if(value.kind==='bartworksOreLayer'){
      const moon=value.generatorClass==='bartworks.system.oregen.BWWorldGenRoss128ba';
      if(value.ordinal>=data!.counts.layers||row.order!==1+value.ordinal||value.roles.length!==4||value.bwMask>15||value.enabled!==(value.activeOrdinal!==null)||value.activeOrdinal!==null&&value.activeOrdinal!==value.ordinal||!moon&&value.generatorClass!=='bartworks.system.oregen.BWWorldGenRoss128b'||value.dimension.key!==(moon?'moon.Ross128ba':'planet.Ross128b')||value.dimension.provider!==(moon?'bwcrossmod.galacticraft.planets.ross128ba.WorldProviderRoss128ba':'bwcrossmod.galacticraft.planets.ross128b.WorldProviderRoss128b')||!page.dimensions.includes(value.dimension.key))invalid();
      for(let index=0;index<4;index++){const role=value.roles[index];if(role.role!==['primary','secondary','between','sporadic'][index]||role.bartworks!==((value.bwMask&(8>>index))!==0))invalid();item(role.item,role.meta);if(!companion)knownMetas.add(role.meta<<16>>16);}
      if(!companion&&search.dimension&&value.dimension.key!==search.dimension)invalid();
    }else if(value.kind==='bartworksOreMaterial'){
      if(value.key!==`werkstoff:${value.meta}`||value.ordinal>=data!.registeredMaterials||!value.oreFeature&&!value.smallOreFeature||value.samples.length!==2)invalid();
      for(let index=0;index<2;index++){const sample=value.samples[index];if(sample.variant!==(index===0?'ore':'smallOre')||sample.nativeOverlayEligible!==value.oreFeature||(sample.item===null)!==(sample.amount===null))invalid();if(sample.item!==null){if(sample.amount===null||sample.amount<=0)invalid();item(sample.item,value.meta);}}
      if(!companion)knownMetas.add(value.meta);
    }else invalid();
    if(!companion&&search.item&&!(value.kind==='bartworksOreLayer'?value.roles.some(role=>role.item===search.item):value.samples.some(sample=>sample.item===search.item)))invalid();
  }
  if(new Set(page.lookups.map(row=>row.data.meta)).size!==page.lookups.length)invalid();
  for(const row of page.lookups){const value=row.data;if(row.domain!==definition.domain||value.kind!=='bartworksOreLookup'||value.ordinal>=data!.counts.lookups||row.order!==1+data!.counts.layers+data!.counts.materials+value.ordinal||!knownMetas.has(value.meta)||!value.layers.length)invalid();}
  if(search.mode==='layers')for(const row of page.rows)if(row.data.kind==='bartworksOreLayer')for(const meta of new Set(row.data.roles.map(role=>role.meta<<16>>16))){const lookup=page.lookups.find(lookup=>lookup.data.meta===meta);if(!lookup||lookup.data.layers.filter(key=>key===row.data.key).length!==row.data.roles.filter(role=>(role.meta<<16>>16)===meta).length)invalid();}
  return page;
}
