import {assertTable,canonical} from '@elysium/contracts';
import {hash} from '@neonei/catalog/source';
import type {GtMineralPage,GtMineralSearch} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {GtMineralPage,GtMineralSearch} from '@neonei/catalog/source';
const invalid=():never=>{throw new ApiError('invalid_response','矿物资料缺少原生规则或来源不一致');};
export async function readGtMinerals(read:(path:string,signal?:AbortSignal)=>Promise<unknown>,search:GtMineralSearch,signal?:AbortSignal):Promise<GtMineralPage>{
  const raw=await read('/gt-minerals?'+new URLSearchParams({...search,offset:String(search.offset),limit:String(search.limit)}),signal);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as GtMineralPage;
  try{
    if(!Array.isArray(page.definitions)||page.definitions.length>2||!Array.isArray(page.dimensions)||page.dimensions.length>4096||page.dimensions.some(dim=>typeof dim!=='string'||!dim||dim.length>256)||!Array.isArray(page.rows)||page.rows.length>100||!Array.isArray(page.shares)||page.shares.length>262144)invalid();
    const references=[...page.definitions,...page.rows,...page.shares];assertTable({kind:'references',records:references});
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)assertTable({kind,records:page.related[kind]});
    for(let start=0;start<references.length;start+=32){const matches=await Promise.all(references.slice(start,start+32).map(async row=>row.id==='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}))));if(matches.some(ok=>!ok))invalid();}
  }catch{invalid();}
  if(!Number.isSafeInteger(page.total)||page.total<0||page.offset!==search.offset||page.limit!==search.limit||page.rows.length!==Math.max(0,Math.min(page.limit,page.total-page.offset))||new Set(page.dimensions).size!==page.dimensions.length)invalid();
  const definitions=new Map(page.definitions.map(row=>[row.domain,row.data]));
  if(definitions.size!==page.definitions.length||new Set(page.definitions.map(row=>row.data.family)).size!==page.definitions.length||page.related.categories.length!==definitions.size)invalid();
  const items=new Map(page.related.items.map(row=>[row.id,row])),strings=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
  let declared=0;
  for(const row of page.definitions){const data=row.data,small=data.family==='smallOre',category=page.related.categories.find(category=>category.reference===row.domain);declared+=data.counts.entries;
    if(data.kind!=='gtMineralsDefinition'||row.order!==0||!data.ready||data.consuming||data.hostPolicy!=='nativeDimensionSevenHosts'||data.shareSemantics!==(small?'relativeAmount':'relativeWeight')||data.restrictBiomeSupport===null&&small||data.restrictBiomeSupport!==null&&!small||!category||!strings.has(category.name)
      ||data.source.handler!==(small?'gtneioreplugin.plugin.gregtech5.PluginGT5SmallOreStat':'gtneioreplugin.plugin.gregtech5.PluginGT5VeinStat')||data.source.key!==(small?'GTOrePluginOreSmall':'GTOrePluginVein')||category.source.owner!==data.source.owner||category.source.handler!==data.source.handler||category.source.key!==data.source.key)invalid();
  }
  if(page.total>declared||search.dimension&&!page.dimensions.includes(search.dimension))invalid();
  const selected=new Set(page.rows.map(row=>row.domain+'\0'+row.data.key));
  for(const share of page.shares){const data=share.data;if(data.kind!=='gtMineralDimensionShare'||!selected.has(share.domain+'\0'+data.key)||!page.dimensions.includes(data.dimension)||data.ordinal>65535)invalid();
    const value=data.numerator/data.denominator;
    if(Number.isFinite(value)){if(data.nonFinite!==null||data.nativeShare===null||data.nativeShare.length>32||!Number.isFinite(Number(data.nativeShare))||Number(data.nativeShare)!==value)invalid();}
    else if(data.nativeShare!==null||data.nonFinite!==(Number.isNaN(value)?'nan':value>0?'positiveInfinity':'negativeInfinity'))invalid();
  }
  for(const row of page.rows){const data=row.data,definition=definitions.get(row.domain);if(!definition)invalid();const small=definition.family==='smallOre',cfg=data.configured;
    if(data.kind!=='gtMineralEntry'||data.ordinal>=definition.counts.entries||row.order!==data.ordinal+1||search.family&&definition.family!==search.family||search.dimension&&!data.displayDimensions.includes(search.dimension)||data.roles.length!==(small?1:4)||data.displayHeight!==`${cfg.minY}-${cfg.maxY}`||data.nativeWeight!==((small?cfg.amount:cfg.weight)!<<16>>16))invalid();
    if(small?(cfg.amount===null||cfg.weight!==null||cfg.density!==null||cfg.size!==null):(cfg.amount!==null||cfg.weight===null||cfg.density===null||cfg.size===null))invalid();
    const roles=small?['small']:['primary','secondary','between','sporadic'];let registry:string|undefined;
    for(let index=0;index<data.roles.length;index++){const role=data.roles[index];if(role.role!==roles[index]||role.hosts.length!==7||role.meta!==(role.material.meta<<16>>16))invalid();
      for(let host=0;host<role.hosts.length;host++){const specimen=role.hosts[host],fact=items.get(specimen.item);if(specimen.host!==host||!fact||fact.meta!==role.meta+(small?16000:0)+host*1000||fact.nbt!==null||!strings.has(fact.name)||fact.icon&&!textures.has(fact.icon)||registry&&registry!==fact.registry)invalid();registry=fact.registry;}
    }
    if(!small&&data.drops.length)invalid();for(const drop of data.drops){const fact=items.get(drop.item);if(drop.amount<=0||!fact||!strings.has(fact.name)||fact.icon&&!textures.has(fact.icon))invalid();}
    const shares=page.shares.filter(share=>share.domain===row.domain&&share.data.key===data.key);
    if(shares.length!==data.displayDimensions.length||new Set(shares.map(share=>share.data.dimension)).size!==shares.length||shares.some(share=>!data.displayDimensions.includes(share.data.dimension)||share.data.numerator!==data.nativeWeight))invalid();
    if(data.generator){const native=data.generator,min=cfg.minY<<16>>16,max=small?Math.max(min+1,cfg.maxY)<<16>>16:Math.max(min+9,cfg.maxY<<16>>16)<<16>>16;
      if(!data.enabledByDefault||native.minY!==min||native.maxY!==max||native.metas.length!==data.roles.length||native.metas.some((meta,index)=>meta!==data.roles[index].meta)||native.flags.endAsteroid===null&&!small||native.flags.endAsteroid!==null&&small)invalid();
      if(small?(native.amount!==(Math.max(1,cfg.amount!)<<16>>16)||native.weight!==null||native.density!==null||native.size!==null):(native.amount!==null||native.weight!==(cfg.weight!<<16>>16)||native.density!==(cfg.density!<<16>>16)||native.size!==(Math.max(1,cfg.size!)<<16>>16)))invalid();
    }else if(data.enabledByDefault||small)invalid();
    if(search.item&&!data.roles.some(role=>role.hosts.some(host=>host.item===search.item))&&!data.drops.some(drop=>drop.item===search.item))invalid();
  }
  return page;
}
