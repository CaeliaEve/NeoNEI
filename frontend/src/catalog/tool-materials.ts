import { assertTable, type GeneticReferenceRow } from '@elysium/contracts';
import type { ToolMaterialPage, ToolMaterialSearch } from '@neonei/catalog/source';
import { validateToolMaterialDisplay } from '@neonei/catalog/source';
import { ApiError } from './transport.ts';
export type { ToolMaterialPage, ToolMaterialSearch } from '@neonei/catalog/source';
export async function readToolMaterials(read:(endpoint:string,signal?:AbortSignal)=>Promise<unknown>,search:ToolMaterialSearch,signal?:AbortSignal):Promise<ToolMaterialPage>{
  const value=await read('/tool-materials?'+new URLSearchParams({domain:search.domain,query:search.query,offset:String(search.offset),limit:String(search.limit)}),signal) as ToolMaterialPage;
  if(!value||typeof value!=='object'||!Number.isSafeInteger(value.total)||value.total<0||value.offset!==search.offset||value.limit!==search.limit||!Array.isArray(value.rows)||!Array.isArray(value.parts)||typeof value.domain!=='string'||(value.domain!==''&&!/^reference_[a-f0-9]{64}$/.test(value.domain))||value.rows.length>value.limit||value.rows.length>value.total||(!value.definition&&value.total!==0))throw new ApiError('invalid_response','工具材料响应格式无效');
  try{assertTable({kind:'references',records:[...value.rows,...value.parts,...(value.definition?[value.definition]:[])]});assertTable({kind:'items',records:value.related.items});for(const kind of ['fluids','categories','strings','textures','topics'])assertTable({kind,records:value.related[kind]});}catch{throw new ApiError('invalid_response','工具材料不符合已发布契约');}
  if(value.rows.some(row=>(row.data as any).kind!=='toolMaterial'||row.domain!==value.domain)||value.parts.some(row=>(row.data as any).kind!=='toolMaterialPart'||row.domain!==value.domain)||value.definition&&(value.definition.data as any).kind!=='toolMaterialsDefinition'||value.definition&&value.definition.domain!==value.domain)throw new ApiError('invalid_response','工具材料记录类型错误');
  const ids=new Set(value.rows.map(row=>(row.data as any).material.materialId));
  if(value.parts.some(row=>!ids.has((row.data as any).materialId)||((row.data as any).display&&!value.related.items.some(item=>item.id===(row.data as any).display))))throw new ApiError('invalid_response','工具材料缺少拥有者或物品引用');
  try{const items=new Map(value.related.items.map(item=>[item.id,item]));for(const row of value.parts)if(row.data.kind==='toolMaterialPart')validateToolMaterialDisplay(row.data,row.data.display?items.get(row.data.display):undefined);}
  catch{throw new ApiError('invalid_response','工具材料展示绑定与原始模板不一致');}
  if(value.definition&&((value.definition.data as any).materials<value.rows.length||((value.definition.data as any).parts>0&&value.rows.length>0&&value.parts.length===0)))throw new ApiError('invalid_response','工具材料定义计数无效');
  return value;
}
