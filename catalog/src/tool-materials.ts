import { canonical, type GeneticReferenceRow, type ReferenceData, type ToolMaterial, type Item, type Nbt } from '@elysium/contracts';
import { Catalog, Fault } from './store.ts';
import type { Related } from './query.ts';
export interface ToolMaterialSearch { domain: string; query: string; offset: number; limit: number }
export interface ToolMaterialPage { domain: string; definition: GeneticReferenceRow | null; total: number; offset: number; limit: number; rows: GeneticReferenceRow[]; parts: GeneticReferenceRow[]; related: Related }
const DOMAIN = /^reference_[a-f0-9]{64}$/;
const MAX_MATERIALS = 4096;
const MAX_PARTS = 262144;
function materialRow(row: GeneticReferenceRow): row is GeneticReferenceRow & { data: Extract<ReferenceData, { kind: 'toolMaterial' }> } { return row.data.kind === 'toolMaterial'; }
function partRow(row: GeneticReferenceRow): row is GeneticReferenceRow & { data: Extract<ReferenceData, { kind: 'toolMaterialPart' }> } { return row.data.kind === 'toolMaterialPart'; }
export function validateToolMaterialDisplay(part:Extract<ReferenceData,{kind:'toolMaterialPart'}>,item:Item|undefined):void {
  const invalid=():never=>{throw new Fault('invalid_reference','Native tool material display differs from its template binding');};
  const binding=part.displayBinding,template=part.template;
  if(!part.display){if(template.meta!==32767||binding)invalid();return;}
  let expected:Nbt|null=template.nbt??null;
  if(binding){
    if(binding.kind!=='tgregInventory'||binding.version!=='1.7.10-GTNH-1.0.28'||!template.registry.startsWith('TGregworks:tGregToolPart')
      ||template.meta<0||template.meta===32767||!binding.material||binding.material.length>128
      ||expected&&(expected.type!=='compound'||Object.hasOwn(expected.value,'material')))invalid();
    expected={type:'compound',value:{...(expected?.type==='compound'?expected.value:{}),material:{type:'string',value:binding.material}}};
  }
  if(!item||item.id!==part.display||item.registry!==template.registry||item.meta===32767
    ||template.meta!==32767&&item.meta!==template.meta||canonical(item.nbt)!==canonical(expected))invalid();
}
export async function toolMaterials(catalog: Pick<Catalog,'scan'|'records'>, search: ToolMaterialSearch): Promise<ToolMaterialPage> {
  if (!Number.isSafeInteger(search.offset) || search.offset < 0 || !Number.isSafeInteger(search.limit) || search.limit < 1 || search.limit > 100 || search.query.length > 256 || (search.domain !== '' && !DOMAIN.test(search.domain))) throw new Fault('invalid_query', 'Invalid tool material query', 400);
  const definitions: Array<GeneticReferenceRow & { data: Extract<ReferenceData, { kind: 'toolMaterialsDefinition' }> }> = [];
  const materials: Array<GeneticReferenceRow & { data: Extract<ReferenceData, { kind: 'toolMaterial' }> }> = [];
  const parts: Array<GeneticReferenceRow & { data: Extract<ReferenceData, { kind: 'toolMaterialPart' }> }> = [];
  for await (const row of catalog.scan('references')) {
    if (row.data.kind === 'toolMaterialsDefinition') definitions.push(row as typeof definitions[number]);
    else if (materialRow(row)) materials.push(row);
    else if (partRow(row)) parts.push(row);
    if (definitions.length > 1 || materials.length > MAX_MATERIALS || parts.length > MAX_PARTS) throw new Fault('reference_limit', 'Tool material catalogue exceeds its budget', 400);
  }
  const definition = definitions[0] ?? null;
  const domain = search.domain || definition?.domain || '';
  if (search.domain && (!definition || definition.domain !== search.domain)) throw new Fault('not_found', 'Tool material domain not found', 404);
  if (definition && definition.domain !== domain) throw new Fault('reference_limit', 'Tool material definition domain mismatch', 400);
  const selected = materials.filter(row => row.domain === domain).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const selectedParts = parts.filter(row => row.domain === domain).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (definition && (definition.data.materials !== selected.length || definition.data.parts !== selectedParts.length)) throw new Fault('reference_limit', 'Tool material definition counts do not match records', 400);
  const knownIds = new Set(selected.map(row => row.data.material.materialId));
  for (const part of selectedParts) if (!knownIds.has(part.data.materialId)) throw new Fault('reference_limit', 'Tool material part has no owning material', 400);
  const query = search.query.trim().toLowerCase();
  const filtered = selected.filter(row => { const material: ToolMaterial = row.data.material; const haystack = String(material.materialId) + ' ' + material.materialName + ' ' + material.localizedName + ' ' + material.localizationString + ' ' + material.prefixName; return !query || haystack.toLowerCase().includes(query); });
  const page = filtered.slice(search.offset, search.offset + search.limit);
  const pageIds = new Set(page.map(row => row.data.material.materialId));
  const pageParts = selectedParts.filter(part => pageIds.has(part.data.materialId));
  const ids = new Set<string>(); for (const part of pageParts) if (part.data.display) ids.add(part.data.display);
  const related: Related = { items: await catalog.records('items', ids), fluids: [], categories: [], strings: [], textures: [], topics: [] };
  const displayItems=new Map(related.items.map(item=>[item.id,item]));
  for(const part of pageParts)validateToolMaterialDisplay(part.data,part.data.display?displayItems.get(part.data.display):undefined);
  related.strings=await catalog.records('strings',new Set(related.items.flatMap(item=>[item.name,...item.tooltip])));
  related.textures=await catalog.records('textures',new Set(related.items.flatMap(item=>item.icon?[item.icon]:[])));
  return { domain, definition, total: filtered.length, offset: search.offset, limit: search.limit, rows: page, parts: pageParts, related };
}
