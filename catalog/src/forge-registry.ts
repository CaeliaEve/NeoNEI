import {canonical,type GeneticReferenceRow,type Item,type Fluid} from '@elysium/contracts';
import {Catalog,Fault} from './store.ts';
import {Query,type Related} from './query.ts';
export type ForgeRow<K extends GeneticReferenceRow['data']['kind']>=Omit<GeneticReferenceRow,'data'>&{data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type ForgeDefinition=ForgeRow<'forgeRegistryDefinition'>;
export type ForgeEntry=ForgeRow<'oreGroup'>|ForgeRow<'fluid'>;
export type ForgeStack=Extract<GeneticReferenceRow['data'],{kind:'oreGroup'}>['members'][number];
export interface ForgeSearch {registry:'oreDictionary'|'fluidRegistry';query:string;item:string;offset:number;limit:number;memberOffset:number;memberLimit:number;choiceOffset:number;choiceLimit:number}
export interface ForgePage {definitions:ForgeDefinition[];rows:ForgeEntry[];total:number;offset:number;limit:number;related:Related}
function invalid():never {throw new Fault('invalid_reference','Forge registry observation or concrete display differs');}
export function validateForgeDefinition(row:ForgeDefinition):void {
  const def=row.data,suffix=def.registry==='oreDictionary'?'OreDictionary':'FluidRegistry';
  if(row.order!==0||def.source.owner!=='neiintegration'||def.source.handler!=='tonius.neiintegration.mods.mcforge.RecipeHandler'+suffix
    ||def.source.key!==def.source.handler||def.consuming||def.entries>262144||!def.enabled&&def.entries!==0)invalid();
}
export function forgeStacks(row:ForgeEntry,search:ForgeSearch):ForgeStack[] {
  return row.data.kind==='oreGroup'?row.data.members.slice(search.memberOffset,search.memberOffset+search.memberLimit)
    :row.data.containers.slice(search.memberOffset,search.memberOffset+search.memberLimit).flatMap(container=>[container.empty,container.filled]);
}
export function forgeTargets(rows:ForgeEntry[],search:ForgeSearch):Array<{kind:'item'|'fluid';id:string}> {
  const result:Array<{kind:'item'|'fluid';id:string}>=[];
  for(const row of rows) {
    for(const stack of forgeStacks(row,search))for(const id of stack.displays.slice(search.choiceOffset,search.choiceOffset+search.choiceLimit))result.push({kind:'item',id});
    if(row.data.kind==='fluid') {
      result.push({kind:'fluid',id:row.data.fluid.id});
      if(row.data.fluid.block?.display)result.push({kind:'item',id:row.data.fluid.block.display});
      for(const container of row.data.containers.slice(search.memberOffset,search.memberOffset+search.memberLimit))result.push({kind:'fluid',id:container.fluid.id});
    }
  }return result;
}
export function validateForgePageFacts(rows:ForgeEntry[],search:ForgeSearch,items:Item[],fluids:Fluid[]):void {
  const itemMap=new Map(items.map(item=>[item.id,item])),fluidMap=new Map(fluids.map(fluid=>[fluid.id,fluid]));
  for(const row of rows) {
    for(const stack of forgeStacks(row,search))for(const id of stack.displays.slice(search.choiceOffset,search.choiceOffset+search.choiceLimit)){
      const item=itemMap.get(id);if(!item||item.meta===32767||item.registry!==stack.registry||canonical(item.nbt)!==canonical(stack.nbt)||stack.meta!==32767&&item.meta!==stack.meta)invalid();
    }
    if(row.data.kind==='fluid') {
      const info=row.data.fluid,base=fluidMap.get(info.id);if(!base||base.registry!==info.registry||base.nbt!==null||info.placeable!==(info.block!==null))invalid();
      if(info.block?.display&&!itemMap.has(info.block.display))invalid();
      for(const container of row.data.containers.slice(search.memberOffset,search.memberOffset+search.memberLimit)) {
        const fact=fluidMap.get(container.fluid.id);if(!fact||fact.registry!==info.registry||canonical(fact.nbt)!==canonical(container.fluid.nbt))invalid();
      }
    }
  }
}
export function forgeMatches(row:ForgeEntry,search:ForgeSearch):boolean {
  const data=row.data,needle=search.query.trim().toLowerCase();
  return (!search.item||data.items.includes(search.item)||data.kind==='fluid'&&(data.fluid.id===search.item||data.containers.some(container=>container.fluid.id===search.item)))
    &&(!needle||(data.kind==='oreGroup'?data.name+' '+data.nativeId:data.fluid.registry+' '+data.fluid.nativeId).toLowerCase().includes(needle));
}
export class ForgeRegistryQuery {
  private readonly catalog:Pick<Catalog,'scan'|'records'>;
  private readonly query:Query;
  constructor(catalog:Catalog){this.catalog=catalog;this.query=new Query(catalog);}
  async page(search:ForgeSearch):Promise<ForgePage> {
    if(!['oreDictionary','fluidRegistry'].includes(search.registry)||search.query.length>256||search.item!==''&&!/^(item|fluid)_[a-f0-9]{64}$/.test(search.item)
      ||!Number.isSafeInteger(search.offset)||search.offset<0||!Number.isSafeInteger(search.limit)||search.limit<1||search.limit>20
      ||!Number.isSafeInteger(search.memberOffset)||search.memberOffset<0||!Number.isSafeInteger(search.memberLimit)||search.memberLimit<1||search.memberLimit>32
      ||!Number.isSafeInteger(search.choiceOffset)||search.choiceOffset<0||!Number.isSafeInteger(search.choiceLimit)||search.choiceLimit<1||search.choiceLimit>32)throw new Fault('invalid_query','Invalid Forge registry query',400);
    const definitions:ForgeDefinition[]=[];
    for await(const row of this.catalog.scan('references'))if(row.data.kind==='forgeRegistryDefinition') {
      const def:ForgeDefinition={...row,data:row.data};validateForgeDefinition(def);definitions.push(def);
      if(definitions.length>2||new Set(definitions.map(row=>row.data.registry)).size!==definitions.length)invalid();
    }
    const definition=definitions.find(row=>row.data.registry===search.registry),matches:Array<{id:string;order:number}>=[];
    let count=0;
    if(definition)for await(const row of this.catalog.scan('references'))if(row.domain===definition.domain&&row.order>0){
      if(row.data.kind!=='oreGroup'&&row.data.kind!=='fluid')invalid();const data=row.data;count++;
      if(!forgeMatches({...row,data} as ForgeEntry,search))continue;
      matches.push({id:row.id,order:row.order});
    }
    if(definition&&count!==definition.data.entries)invalid();
    matches.sort((a,b)=>a.order-b.order);const selected=matches.slice(search.offset,search.offset+search.limit);
    const records=await this.catalog.records('references',new Set(selected.map(row=>row.id)));const rows:ForgeEntry[]=[];
    for(const entry of selected){const row=records.find(row=>row.id===entry.id);if(!row||row.data.kind!=='oreGroup'&&row.data.kind!=='fluid')invalid();rows.push({...row,data:row.data} as ForgeEntry);}
    const categories=[];for await(const category of this.catalog.scan('categories'))if(definitions.some(def=>def.domain===category.reference))categories.push(category.id);
    const related=await this.query.related([],categories,{targets:forgeTargets(rows,search)});
    if(related.categories.length!==definitions.length||definitions.some(def=>!related.categories.some(category=>category.reference===def.domain&&canonical(category.source)===canonical(def.data.source))))invalid();
    validateForgePageFacts(rows,search,related.items,related.fluids);
    const result={definitions,rows,total:matches.length,offset:search.offset,limit:search.limit,related};
    if(JSON.stringify(result).length*2>16*1024*1024)throw new Fault('reference_limit','Forge registry page exceeds its byte budget');return result;
  }
}
