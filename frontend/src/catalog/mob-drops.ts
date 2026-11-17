import {assertTable} from '@elysium/contracts';
import type {MobIndex,MobDropsPage,MobSearch,MobDefinitionRow} from '@neonei/catalog/source';
import type {Related} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {MobIndex,MobDropsPage,MobSearch} from '@neonei/catalog/source';

const invalid=():never=>{throw new ApiError('invalid_response','生物资料缺少完整的原生规则或可见状态');};
function page(raw:unknown,offset:number,limit:number):void {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) invalid();
  const value=raw as {rows:unknown[];total:number;offset:number;limit:number;related:Related};
  if(!Array.isArray(value.rows)||!Number.isSafeInteger(value.total)||value.total<0||value.offset!==offset
    ||value.limit!==limit||value.rows.length>limit||value.rows.length>value.total) invalid();
  try {for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)
    assertTable({kind,records:value.related[kind]});} catch {invalid();}
}
function hydrated(ids:string[],related:Related) {
  const items=new Map(related.items.map(row=>[row.id,row])),strings=new Set(related.strings.map(row=>row.id)),textures=new Set(related.textures.map(row=>row.id));
  for(const id of ids) {const item=items.get(id);if(!item||!strings.has(item.name)||item.tooltip.some(id=>!strings.has(id))||item.icon&&!textures.has(item.icon)) invalid();}
}
function mob(value:MobDefinitionRow,entity:string) {
  if(value.data.kind!=='mobDefinition'||value.data.entity!==entity||!value.data.visible||!Number.isFinite(Number(value.data.maxHealth))
    ||Number(value.data.maxHealth)<=0) invalid();
}
export async function readMobs(read:(path:string,signal?:AbortSignal)=>Promise<unknown>,search:MobSearch,signal?:AbortSignal):Promise<MobIndex> {
  const raw=await read('/mobs?'+new URLSearchParams({...search,offset:String(search.offset),limit:String(search.limit)}),signal);
  page(raw,search.offset,search.limit);const index=raw as MobIndex;
  if(!Array.isArray(index.mobs)||!Array.isArray(index.definitions)) invalid();
  try {assertTable({kind:'references',records:[...index.definitions,...index.mobs]});} catch {invalid();}
  const definitions=new Map(index.definitions.map(row=>[row.domain,row]));
  if(definitions.size!==index.definitions.length||index.definitions.some(row=>row.data.kind!=='mobDropsDefinition'||!row.data.ready||row.data.consuming)
    ||index.total>index.definitions.reduce((sum,row)=>sum+row.data.mobs,0)) invalid();
  const visible=new Map(index.mobs.map(row=>[row.id,row]));
  if(visible.size!==index.mobs.length||index.mobs.length!==index.rows.filter(row=>row.visible).length
    ||new Set(index.rows.map(row=>row.id)).size!==index.rows.length) invalid();
  for(const row of index.rows) {
    const definition=definitions.get(row.domain);
    if(!definition||typeof row.entity!=='string'||!row.entity||row.entity.length>256||typeof row.name!=='string'||!row.name
      ||typeof row.mod!=='string'||!row.mod||typeof row.visible!=='boolean'||!/^refrow_[a-f0-9]{64}$/.test(row.id)) invalid();
    if(row.visible) {
      const fact=visible.get(row.id);if(!fact) invalid();mob(fact,row.entity);
      if(fact.domain!==row.domain||fact.data.drops!==row.drops||fact.data.name!==row.name||fact.data.mod!==row.mod) invalid();
      hydrated(fact.data.representations,index.related);
    } else if(row.drops!==null||visible.has(row.id)||!definition.data.hiddenMode||search.item) invalid();
  }
  return index;
}
export async function readMobDrops(read:(path:string,signal?:AbortSignal)=>Promise<unknown>,entity:string,offset:number,signal?:AbortSignal):Promise<MobDropsPage> {
  const raw=await read('/mobs/'+encodeURIComponent(entity)+'/drops?'+new URLSearchParams({offset:String(offset),limit:'20'}),signal);
  page(raw,offset,20);const details=raw as MobDropsPage;
  if(details.entity!==entity||typeof details.visible!=='boolean'||!details.definition) invalid();
  try {assertTable({kind:'references',records:[details.definition,...details.rows,...(details.mob?[details.mob]:[])]});} catch {invalid();}
  if(details.definition.data.kind!=='mobDropsDefinition'||!details.definition.data.ready||details.definition.data.consuming) invalid();
  if(!details.visible) {
    if(details.mob!==null||details.rows.length||details.total||details.related.items.length||!details.definition.data.hiddenMode) invalid();
    return details;
  }
  if(!details.mob) invalid();mob(details.mob,entity);
  if(details.mob.domain!==details.definition.domain||details.total!==details.mob.data.drops) invalid();
  for(const [index,row] of details.rows.entries()) if(row.data.kind!=='mobDrop'||row.domain!==details.definition.domain
    ||row.data.entity!==entity||row.data.drop!==offset+index||row.data.chanceScale!==10000||!/^\d+$/.test(row.data.amount)||BigInt(row.data.amount)<=0n) invalid();
  hydrated(details.rows.map(row=>row.data.item),details.related);
  return details;
}
