import type { GeneticReferenceRow } from '@elysium/contracts';
import { Fault, type Catalog } from './store.ts';

type Row<K extends GeneticReferenceRow['data']['kind']> = Omit<GeneticReferenceRow,'data'> & {data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type StructureDefinition = Row<'structureCatalogDefinition'>;
export type StructureController = Row<'structureCatalogController'>;
export type StructureComponent = Row<'structureComponentLookup'>;
export interface StructureInformation {definition:StructureDefinition;controller:StructureController}
interface Index {information:Map<string,StructureInformation>;components:Map<string,StructureComponent[]>}

/** Shared HTTP/offline projection. Native unmatched keys remain visible, never fake item IDs. */
export class StructureReferenceQuery {
  private readonly catalog:Pick<Catalog,'scan'>;
  private pending?:Promise<Index>;
  constructor(catalog:Pick<Catalog,'scan'>) {this.catalog=catalog;}
  private index() {return this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});}
  private async load():Promise<Index> {
    const domains=new Map<string,GeneticReferenceRow[]>();let bytes=0,memberships=0;
    for await(const row of this.catalog.scan('references')) {
      if(!['structureCatalogDefinition','structureCatalogController','structureComponentLookup'].includes(row.data.kind))continue;
      bytes+=JSON.stringify(row).length*2;
      if(bytes>64*1024*1024)throw new Fault('reference_limit','Native structure information index exceeds budget');
      let rows=domains.get(row.domain);if(!rows){rows=[];domains.set(row.domain,rows);}rows.push(row);
    }
    const index:Index={information:new Map(),components:new Map()};
    for(const [domain,rows] of domains) {
      rows.sort((a,b)=>a.order-b.order);
      const first=rows[0];
      if(!first||first.data.kind!=='structureCatalogDefinition'||rows.some((row,i)=>row.order!==i))throw new Fault('invalid_reference','Incomplete native structure reference order');
      const definition:StructureDefinition={...first,data:first.data},counts=definition.data.counts;
      const handler=definition.data.family==='gt'?'blockrenderer6343.integration.gregtech.GTNEIMultiblockHandler':'blockrenderer6343.integration.structurelib.StructureCompatNEIHandler';
      if(!definition.data.ready||definition.data.consuming||definition.data.source.handler!==handler
        ||rows.length!==1+counts.controllers+counts.lookups)throw new Fault('invalid_reference','Native structure family or coverage differs');
      const controllers=new Map<string,StructureController>();let tiers=0,unresolved=0;
      const projections=new Map<string,string>();
      const projection=(hash:string,items:string[])=>{
        const data=JSON.stringify(items),previous=projections.get(hash);
        if(previous!==undefined&&previous!==data)throw new Fault('invalid_reference','Native tier/component matching disagrees');projections.set(hash,data);
      };
      for(let ordinal=0;ordinal<counts.controllers;ordinal++) {
        const row=rows[ordinal+1]!;
        if(row.data.kind!=='structureCatalogController'||row.data.ordinal!==ordinal||controllers.has(row.data.structure)||index.information.has(row.data.structure))throw new Fault('invalid_reference','Native structure controller ownership differs');
        const controller:StructureController={...row,data:row.data};controllers.set(controller.data.structure,controller);
        index.information.set(controller.data.structure,{definition,controller});index.components.set(controller.data.structure,[]);
        for(const tier of controller.data.tierItems){projection(tier.nativeHash,tier.items);tiers++;}
      }
      for(const row of rows.slice(1+counts.controllers)) {
        if(row.data.kind!=='structureComponentLookup'||row.data.structures.length===0)throw new Fault('invalid_reference','Invalid native component association');
        const lookup:StructureComponent={...row,data:row.data};projection(lookup.data.nativeHash,lookup.data.items);
        if(lookup.data.items.length===0)unresolved++;
        const seen=new Set<string>();
        for(const structure of lookup.data.structures) {
          if(!controllers.has(structure)||seen.has(structure))throw new Fault('invalid_reference','Native component lacks its captured controller');seen.add(structure);
          if(++memberships>2097152)throw new Fault('reference_limit','Native component association index exceeds budget');
          bytes+=8;if(bytes>64*1024*1024)throw new Fault('reference_limit','Native structure membership index exceeds budget');
          index.components.get(structure)!.push(lookup);
        }
      }
      if(tiers!==counts.tierLookups||unresolved!==counts.unresolvedLookups)throw new Fault('invalid_reference','Native structure evidence counts differ');
      for(const rows of index.components.values())if(rows.some(row=>row.domain===domain))rows.sort((a,b)=>a.order-b.order);
    }
    return index;
  }
  async information(id:string):Promise<StructureInformation|null> {return(await this.index()).information.get(id)??null;}
  async page(id:string,offset:number,limit:number) {
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Fault('invalid_query','Invalid native component page',400);
    const index=await this.index(),rows=index.components.get(id)??[];
    return {rows:rows.slice(offset,offset+limit),total:rows.length,offset,limit};
  }
}
