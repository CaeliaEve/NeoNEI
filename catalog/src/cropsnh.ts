import type { CropsNhCropKey, CropsNhSection, GeneticReferenceRow, ReferenceData } from '@elysium/contracts';
import { type Catalog, Fault } from './store.ts';
import type { Page, Related } from './query.ts';

export interface CropsNhSearch { section:CropsNhSection; crop:string; query:string; offset:number; limit:number }
export type CropsNhDefinitionRow = GeneticReferenceRow & {data:Extract<ReferenceData,{kind:'cropsNhDefinition'}>};
export type CropsNhLeaf = GeneticReferenceRow & {data:Extract<ReferenceData,{
  kind:'cropsNhCrop'|'cropsNhAlternateSeed'|'cropsNhMutation'|'cropsNhMutationPool'
}>};
export interface CropsNhPage extends Page<CropsNhLeaf> {
  section:CropsNhSection; definitions:CropsNhDefinitionRow[]; related:Related;
}
export const cropsNhKinds = {
  crops:'cropsNhCrop', alternateSeeds:'cropsNhAlternateSeed',
  mutations:'cropsNhMutation', mutationPools:'cropsNhMutationPool',
} as const;
const handlers:Record<CropsNhSection,string> = {
  crops:'NEICropsNHCropHandler', alternateSeeds:'NEICropsNHAlternateSeedHandler',
  mutations:'NEICropsNHCropstickBreedingHandler', mutationPools:'NEICropsNHMutationPoolHandler',
};

export function validateCropsNhDefinition(row:CropsNhDefinitionRow):void {
  const def=row.data;
  if(row.order!==0||def.kind!=='cropsNhDefinition'||def.consuming||def.semantics!=='cropsnhRegistriesV1'
    ||def.source.owner!=='cropsnh'||!Object.hasOwn(handlers,def.section)||!def.source.key
    ||def.source.handler!=='com.gtnewhorizon.cropsnh.compatibility.NEI.'+handlers[def.section]
    ||!Number.isSafeInteger(def.entries)||def.entries<0||def.entries>65536)
    throw new Fault('invalid_reference','Invalid CropsNH registration definition');
}

export function cropsNhCropKeys(row:CropsNhLeaf):readonly CropsNhCropKey[] {
  const data=row.data;
  switch(data.kind) {
    case 'cropsNhCrop': case 'cropsNhAlternateSeed': return [data.crop];
    case 'cropsNhMutation': return [data.output,...data.parents];
    case 'cropsNhMutationPool': return data.members;
  }
}

export function cropsNhItemIds(row:CropsNhLeaf):string[] {
  const ids=cropsNhCropKeys(row).map(crop=>crop.seed),data=row.data;
  if(data.kind==='cropsNhCrop') {
    for(const stack of [...data.drops.map(drop=>drop.stack),...data.alternateSeeds,...data.duplicationCatalysts])
      if(stack.item)ids.push(stack.item);
  }
  if(data.kind==='cropsNhCrop'||data.kind==='cropsNhMutation')
    for(const req of data.requirements)if(req.kind==='machineCatalyst')for(const stack of req.items)if(stack.item)ids.push(stack.item);
  return ids;
}

export function cropsNhMatches(row:CropsNhLeaf, search:Pick<CropsNhSearch,'crop'|'query'>):boolean {
  const keys=cropsNhCropKeys(row);
  if(search.crop&&!keys.some(key=>key.crop===search.crop))return false;
  const data=row.data;
  const text=[...keys.map(key=>key.crop),data.kind==='cropsNhMutationPool'?data.pool:'',
    data.kind==='cropsNhAlternateSeed'?data.registry:''].join(' ').toLowerCase();
  return search.query.toLowerCase().trim().split(/\s+/).every(term=>text.includes(term));
}

/** On-demand bounded scans; no agriculture index is resident during item browsing. */
export class CropsNhQuery {
  private readonly catalog:Pick<Catalog,'scan'|'records'>;
  constructor(catalog:Pick<Catalog,'scan'|'records'>) { this.catalog=catalog; }
  async page(search:CropsNhSearch):Promise<CropsNhPage> {
    if(!Object.hasOwn(cropsNhKinds,search.section)||search.crop.length>256||search.query.length>256
      ||!Number.isSafeInteger(search.offset)||search.offset<0||!Number.isSafeInteger(search.limit)||search.limit<1||search.limit>100)
      throw new Fault('invalid_query','Invalid CropsNH reference query',400);
    const definitions:CropsNhDefinitionRow[]=[];
    for await(const row of this.catalog.scan('references'))if(row.data.kind==='cropsNhDefinition'&&row.data.section===search.section) {
      const definition=row as CropsNhDefinitionRow; validateCropsNhDefinition(definition);
      definitions.push(definition);
      if(definitions.length>16)throw new Fault('reference_limit','CropsNH domain budget exceeded');
    }
    definitions.sort((a,b)=>a.domain.localeCompare(b.domain));
    const domains=new Map(definitions.map(row=>[row.domain,row]));
    if(domains.size!==definitions.length)throw new Fault('invalid_reference','Duplicate CropsNH domain');
    const rows:CropsNhLeaf[]=[],counts=new Map<string,number>();
    let total=0,bytes=0;
    for await(const row of this.catalog.scan('references')) {
      const definition=domains.get(row.domain);
      if(!definition||row.data.kind==='cropsNhDefinition')continue;
      if(row.data.kind!==cropsNhKinds[search.section]||row.order<1||row.order>definition.data.entries)
        throw new Fault('invalid_reference','Mixed CropsNH reference domain');
      const count=(counts.get(row.domain)??0)+1;counts.set(row.domain,count);
      if(count>definition.data.entries)throw new Fault('invalid_reference','Oversized CropsNH reference domain');
      const leaf=row as CropsNhLeaf;
      if(!cropsNhMatches(leaf,search))continue;
      if(total>=search.offset&&rows.length<search.limit) {
        bytes+=JSON.stringify(row).length*2;
        if(bytes>16*1024*1024)throw new Fault('reference_limit','CropsNH response byte budget exceeded');
        rows.push(leaf);
      }
      total++;
    }
    if(definitions.some(row=>(counts.get(row.domain)??0)!==row.data.entries))
      throw new Fault('invalid_reference','Incomplete CropsNH reference domain');
    const items=await this.catalog.records('items',new Set(rows.flatMap(cropsNhItemIds)));
    const categories=[];
    for await(const category of this.catalog.scan('categories'))
      if(category.reference&&domains.has(category.reference))categories.push(category);
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(item=>[item.name,...item.tooltip]),...categories.map(row=>row.name)]));
    const textures=await this.catalog.records('textures',new Set(items.flatMap(item=>item.icon?[item.icon]:[])));
    return {section:search.section,definitions,rows,total,offset:search.offset,limit:search.limit,
      related:{items,categories,strings,textures,fluids:[],topics:[]}};
  }
}
