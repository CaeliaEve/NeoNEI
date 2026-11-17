import {assertTable,canonical} from '@elysium/contracts';
import {hash,latheStateItems,latheToolItems,validateLatheDefinition,validateLatheState,validateLatheToolState} from '@neonei/catalog/source';
import type {LathePage,LatheSearch} from '@neonei/catalog/source';
import {ApiError} from './transport.ts';
export type {LathePage,LatheSearch} from '@neonei/catalog/source';
function invalid():never{throw new ApiError('invalid_response','车床原生状态、刀具或变换规则不一致');}
export async function readLathe(read:(path:string,signal?:AbortSignal)=>Promise<unknown>,search:LatheSearch,signal?:AbortSignal):Promise<LathePage>{
  const raw=await read('/lathe?'+new URLSearchParams({...search,offset:String(search.offset),limit:String(search.limit),toolOffset:String(search.toolOffset),toolLimit:String(search.toolLimit)}),signal);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const page=raw as LathePage;
  try{
    for(const field of ['workpieces','tools','afterStates','afterTools','samples'] as const)if(!Array.isArray(page[field])||page[field].length>100)invalid();
    for(const field of ['definition','workpiece','state','tool','toolState'] as const)if(page[field]===undefined)invalid();
    const unique=new Map([...page.workpieces,...page.tools,...page.afterStates,...page.afterTools,...page.samples,
      ...[page.definition,page.workpiece,page.state,page.tool,page.toolState].filter(row=>row!==null)].map(row=>[row.id,row]));
    const leaves=[...unique.values()];assertTable({kind:'references',records:leaves});
    for(const kind of ['items','fluids','categories','strings','textures','topics'] as const)assertTable({kind,records:page.related[kind]});
    for(let start=0;start<leaves.length;start+=16){const valid=await Promise.all(leaves.slice(start,start+16).map(async row=>row.id==='refrow_'+await hash(canonical({domain:row.domain,order:row.order,data:row.data}))));if(valid.some(value=>!value))invalid();}
    if(page.offset!==search.offset||page.limit!==search.limit||page.toolOffset!==search.toolOffset||page.toolLimit!==search.toolLimit
      ||!Number.isSafeInteger(page.total)||page.total<0||page.total>262144||!Number.isSafeInteger(page.toolTotal)||page.toolTotal<0||page.toolTotal>262144
      ||page.workpieces.length!==Math.max(0,Math.min(page.limit,page.total-page.offset))||page.tools.length!==Math.max(0,Math.min(page.toolLimit,page.toolTotal-page.toolOffset)))invalid();
    if(!page.definition){if(leaves.length||page.total||page.toolTotal||page.related.categories.length)invalid();return page;}
    const definition=page.definition,def=definition.data,category=page.related.categories[0];
    if(def.kind!=='latheDefinition'||definition.order!==0||leaves.some(row=>row.domain!==definition.domain)||!category||page.related.categories.length!==1
      ||category.reference!==definition.domain||canonical(category.source)!==canonical(def.source))invalid();validateLatheDefinition(def);
    if(page.total!==def.counts.workpieces||page.toolTotal!==def.counts.tools||page.afterStates.length>16||page.afterTools.length>1||page.samples.length>24)invalid();
    const items=new Map(page.related.items.map(row=>[row.id,row]));const needed=new Set<string>();
    for(const work of [...page.workpieces,...(page.workpiece?[page.workpiece]:[])]){
      if(work.data.kind!=='latheWorkpiece'||!work.data.callbackClass||work.data.width<1||work.data.width>64||!work.data.initial.length||work.data.initial.length>16||work.data.initial.some(radius=>radius<1||radius>work.data.width))invalid();needed.add(work.data.workpiece);
    }
    for(const tool of [...page.tools,...(page.tool?[page.tool]:[])]){
      if(tool.data.kind!=='latheTool'||!tool.data.callbackClass||tool.data.damage<0||tool.data.maximum<1||tool.data.maximum>65536)invalid();needed.add(tool.data.tool);
    }
    if(page.total>0&&!page.workpiece||page.toolTotal>0&&!page.tool&&search.tool!=='none')invalid();
    if(page.workpiece){
      if(search.workpiece&&page.workpiece.data.workpiece!==search.workpiece||!page.state||page.state.data.kind!=='latheState'||page.state.data.item!==(search.state||page.workpiece.data.workpiece))invalid();
      const targets=new Map(page.afterStates.map(row=>[row.data.item,row]));if(targets.size!==page.afterStates.length||page.state.data.transitions.length!==page.afterStates.length)invalid();
      validateLatheState(page.state,page.workpiece,items,targets);
      for(const row of page.afterStates){if(row.data.kind!=='latheState')invalid();validateLatheState(row,page.workpiece,items);}
      for(const row of [page.state,...page.afterStates])for(const id of latheStateItems(row))needed.add(id);
    }else if(page.state||page.afterStates.length)invalid();
    if(page.tool){
      if(search.tool&&page.tool.data.tool!==search.tool||!page.toolState||page.toolState.data.kind!=='latheToolState'||page.toolState.data.item!==(search.toolState||page.tool.data.tool))invalid();
      const targets=new Map(page.afterTools.map(row=>[row.data.item,row]));if(page.afterTools.length!==(page.toolState.data.after?1:0))invalid();validateLatheToolState(page.toolState,page.tool,items,targets);
      for(const row of page.afterTools){if(row.data.kind!=='latheToolState')invalid();validateLatheToolState(row,page.tool,items);}
      for(const row of [page.toolState,...page.afterTools])for(const id of latheToolItems(row))needed.add(id);
    }else if(page.toolState||page.afterTools.length)invalid();
    for(const sample of page.samples){if(sample.data.kind!=='latheSample'||sample.data.item!==(sample.data.role==='workpiece'?page.workpiece?.data.workpiece:page.tool?.data.tool))invalid();needed.add(sample.data.item);}
    const texts=new Set(page.related.strings.map(row=>row.id)),textures=new Set(page.related.textures.map(row=>row.id));if(!texts.has(category.name))invalid();
    for(const id of needed){const item=items.get(id);if(!item||!texts.has(item.name)||item.tooltip.some(id=>!texts.has(id))||item.icon&&!textures.has(item.icon))invalid();}
  }catch(error){if(error instanceof ApiError)throw error;invalid();}
  return page;
}
