import {assertTable,canonical,type NativeDiagramComponent} from '@elysium/contracts';
import {hash,validateEnderDefinition,validateEnderState,validateEnderComponent} from '@neonei/catalog/source';
import type {EnderPage,EnderSearch} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {EnderPage,EnderSearch};
export async function readEnderStorage(read:(endpoint:string,signal?:AbortSignal)=>Promise<unknown>,search:EnderSearch,signal?:AbortSignal):Promise<EnderPage>{
  const raw=await read('/ender-storage?'+new URLSearchParams(Object.entries(search).map(([key,value])=>[key,String(value)])),signal);
  function invalid():never{throw new ApiError('invalid_response','末影存储快照、槽位或原始数据不完整');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as EnderPage;
  try{
    if(!Array.isArray(page.definitions)||page.definitions.length>2||!Array.isArray(page.states)||!Array.isArray(page.slots)||page.offset!==search.offset||page.limit!==search.limit||!Number.isSafeInteger(page.total)||page.total<0||page.total>8192||page.states.length!==Math.max(0,Math.min(search.limit,page.total-search.offset)))invalid();
    const leaves=[...page.definitions,...page.states];assertTable({kind:'references',records:leaves});if(new Set(leaves.map(row=>row.id)).size!==leaves.length)invalid();
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)assertTable({kind,records:page.related[kind]});
    for(const row of leaves)if(row.id!=='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data})))invalid();
    const seen=new Set<string>();for(const def of page.definitions){if(def.order!==0||def.data.kind!=='enderStorageDefinition'||seen.has(def.data.group))invalid();seen.add(def.data.group);validateEnderDefinition(def.data);}
    const def=page.definitions.find(def=>!search.type||def.data.storageType===search.type);
    const components:NativeDiagramComponent[]=[],slots:EnderPage['slots']=[];if(def)components.push(def.data.personalLockItem);
    if(search.item){const item=page.related.items.find(item=>item.id===search.item);if(page.states.length&&(!def||!item||!def.data.queryRules.some(rule=>rule.registry===item.registry&&(rule.highMetadata===null||item.meta>>12===rule.highMetadata))))invalid();}
    for(const row of page.states){if(!def||row.data.kind!=='enderStorageState'||search.state&&search.state!==row.id||search.owner&&row.data.owner!==(search.owner==='global'?'global':def.data.personalOwner)||search.frequency&&row.data.frequency!==Number(search.frequency))invalid();await validateEnderState(row,def);
      const c=row.data.contents;if(c.kind==='item'){const visible=c.slots.slice(search.slotOffset,search.slotOffset+search.slotLimit);for(const slot of visible)if(slot)components.push(slot.component);slots.push({state:row.id,offset:search.slotOffset,limit:search.slotLimit,total:c.slots.length,slots:visible});}else if(c.fluid)components.push(c.fluid);
    }
    if(canonical(slots)!==canonical(page.slots))invalid();
    const items=new Map(page.related.items.map(item=>[item.id,item])),fluids=new Map(page.related.fluids.map(fluid=>[fluid.id,fluid])),texts=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));
    for(const value of components){const component=await validateEnderComponent(value);if(component.fact===null)continue;const record=component.kind==='item'?items.get(component.fact):fluids.get(component.fact);if(!record||record.registry!==component.registry||canonical(record.nbt)!==canonical(component.nbt)||component.kind==='item'&&(!('meta'in record)||record.meta!==component.meta)||!texts.has(record.name)||record.icon&&!textures.has(record.icon)||'tooltip'in record&&record.tooltip.some(id=>!texts.has(id)))invalid();}
    if(page.related.categories.length!==page.definitions.length||page.definitions.some(def=>!page.related.categories.some(category=>category.reference===def.domain&&canonical(category.source)===canonical(def.data.source)&&texts.has(category.name))))invalid();
  }catch(error){if(error instanceof ApiError)throw error;invalid();}return page;
}
