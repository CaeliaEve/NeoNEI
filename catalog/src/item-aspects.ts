import type { GeneticReferenceRow, ReferenceData } from '@elysium/contracts';
import { type Catalog, Fault } from './store.ts';
import type { Page, Related } from './query.ts';

export type ItemAspectRow = GeneticReferenceRow & {data:Extract<ReferenceData,{kind:'itemAspectObservation'}>};
export type ItemAspectDefinition = GeneticReferenceRow & {data:Extract<ReferenceData,{kind:'itemAspectsDefinition'}>};
export interface ItemAspectSources extends Page<ItemAspectRow> {
  aspect:string; visible:boolean|null; definitions:ItemAspectDefinition[];
  gaps:{cacheMiss:number;invalidKey:number;noAspects:number}; related:Related;
}

/** Shared online/offline route. Quantities count aspects, never consumed item stacks. */
export class ItemAspectQuery {
  private pending?:Promise<{definitions:ItemAspectDefinition[];observations:ItemAspectRow[];gaps:ItemAspectSources['gaps']}>;
  private readonly catalog:Pick<Catalog,'record'|'records'|'scan'>;
  constructor(catalog:Pick<Catalog,'record'|'records'|'scan'>) { this.catalog=catalog; }

  private index() {
    return this.pending ??= this.load().catch(error=>{this.pending=undefined;throw error;});
  }
  private async load() {
    const definitions:ItemAspectDefinition[]=[],observations:ItemAspectRow[]=[];
    const gaps={cacheMiss:0,invalidKey:0,noAspects:0};
    let weight=0;
    for await(const row of this.catalog.scan('references')) {
      if(row.data.kind!=='itemAspectsDefinition'&&row.data.kind!=='itemAspectObservation') continue;
      weight+=JSON.stringify(row).length*2;
      if(weight>64*1024*1024) throw new Fault('reference_limit','Scanned-item index byte budget exceeded');
      if(row.data.kind==='itemAspectsDefinition') {
        definitions.push(row as ItemAspectDefinition);
        if(definitions.length>16) throw new Fault('reference_limit','Too many scanned-item domains');
      } else {
        observations.push(row as ItemAspectRow);
        if(observations.length>262144) throw new Fault('reference_limit','Scanned-item index budget exceeded');
        if(row.data.status!=='available') gaps[row.data.status]++;
      }
    }
    const domains=new Map(definitions.map(row=>[row.domain,row]));
    const counts=new Map<string,number>();
    for(const row of observations) {
      if(!domains.has(row.domain)) throw new Fault('invalid_reference','Scanned-item definition missing');
      counts.set(row.domain,(counts.get(row.domain)??0)+1);
    }
    if(domains.size!==definitions.length||definitions.some(row=>!row.data.ready||row.data.consuming||row.data.scans!==(counts.get(row.domain)??0)))
      throw new Fault('invalid_reference','Incomplete or unready scanned-item definition');
    return {definitions,observations,gaps};
  }

  async page(id:string,offset:number,limit:number):Promise<ItemAspectSources> {
  const catalog=this.catalog;
  if (!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)
    throw new Fault('invalid_query','Invalid item aspect page',400);
  const aspect=await catalog.record('aspects',id);
  const {definitions,observations,gaps}=await this.index();
  const visibleDomains=new Set(definitions.filter(row=>row.data.visibility==='allRegisteredAspects'||aspect.discovered===true).map(row=>row.domain));
  const visible=visibleDomains.size?true:aspect.discovered??null;
  const selected=observations.filter(row=>visibleDomains.has(row.domain)&&row.data.status==='available'&&row.data.aspects?.some(a=>a.aspect===id&&BigInt(a.amount)>0n));
  const domains=new Set(definitions.map(row=>row.domain));
  if(definitions.some(row=>!row.data.ready||row.data.consuming)||selected.some(row=>!domains.has(row.domain)))
    throw new Fault('invalid_reference','Scanned-item definition missing or unready');
  const amount=(row:ItemAspectRow)=>BigInt(row.data.aspects!.find(a=>a.aspect===id)!.amount);
  selected.sort((a,b)=>amount(a)>amount(b)?-1:amount(a)<amount(b)?1:a.domain.localeCompare(b.domain)||a.order-b.order);
  const rows=selected.slice(offset,offset+limit);
  const items=await catalog.records('items',new Set(rows.map(row=>row.data.item!)));
  const categories=[];
  for await(const category of catalog.scan('categories')) if(category.reference&&domains.has(category.reference)) categories.push(category);
  const strings=await catalog.records('strings',new Set([...items.flatMap(i=>[i.name,...i.tooltip]),...categories.map(c=>c.name)]));
  const textures=await catalog.records('textures',new Set(items.flatMap(i=>i.icon?[i.icon]:[])));
  return {aspect:id,visible,definitions,gaps,rows,total:selected.length,offset,limit,
    related:{items,categories,strings,textures,fluids:[],topics:[]}};
}
}
