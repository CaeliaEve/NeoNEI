import type {GeneticReferenceRow} from '@elysium/contracts';
import {type Catalog,Fault} from './store.ts';
import type {Related} from './query.ts';
type Row<K extends GeneticReferenceRow['data']['kind']>=Omit<GeneticReferenceRow,'data'>&{data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type UndergroundDefinition=Row<'undergroundFluidsDefinition'>;
export type UndergroundDimension=Row<'undergroundFluidDimension'>;
export type UndergroundEntry=Row<'undergroundFluidEntry'>;
export type UndergroundDisplay=Row<'undergroundFluidDisplay'>;
export interface UndergroundSearch {dimension:string;query:string;fluid:string;offset:number;limit:number}
export interface UndergroundPage {definition:UndergroundDefinition|null;dimensions:UndergroundDimension[];rows:UndergroundEntry[];displays:UndergroundDisplay[];total:number;offset:number;limit:number;related:Related}
interface Index {definition:UndergroundDefinition|null;dimensions:UndergroundDimension[];rows:UndergroundEntry[];displays:Map<string,UndergroundDisplay[]>}

/** Shared online/offline bounded index; only the current page hydrates native fluids and icons. */
export class UndergroundFluidQuery {
  private readonly catalog:Pick<Catalog,'scan'|'records'>;
  private pending?:Promise<Index>;
  constructor(catalog:Pick<Catalog,'scan'|'records'>){this.catalog=catalog;}
  private index(){return this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});}
  private async load():Promise<Index>{
    const result:Index={definition:null,dimensions:[],rows:[],displays:new Map()};let bytes=0,displays=0;
    for await(const row of this.catalog.scan('references')) if(row.data.kind.startsWith('undergroundFluid')){
      bytes+=JSON.stringify(row).length*2;
      if(bytes>64*1024*1024)throw new Fault('reference_limit','Underground-fluid index exceeds memory budget');
      switch(row.data.kind){
        case 'undergroundFluidsDefinition':if(result.definition)throw new Fault('invalid_reference','Ambiguous underground-fluid domain');result.definition=row as UndergroundDefinition;break;
        case 'undergroundFluidDimension':result.dimensions.push(row as UndergroundDimension);if(result.dimensions.length>4096)throw new Fault('reference_limit','Too many underground-fluid dimensions');break;
        case 'undergroundFluidEntry':result.rows.push(row as UndergroundEntry);if(result.rows.length>262144)throw new Fault('reference_limit','Too many underground-fluid entries');break;
        case 'undergroundFluidDisplay':{
          const entry=row as UndergroundDisplay,key=entry.data.registry,list=result.displays.get(key)??[];list.push(entry);result.displays.set(key,list);
          if(++displays>262144)throw new Fault('reference_limit','Too many underground-fluid display entries');break;
        }
      }
    }
    const definition=result.definition;
    if(!definition){if(result.dimensions.length||result.rows.length||displays)throw new Fault('invalid_reference','Orphan underground-fluid records');return result;}
    const counts=definition.data.counts;
    if(!definition.data.ready||definition.data.consuming||definition.order!==0||counts.dimensions!==result.dimensions.length||counts.entries!==result.rows.length||counts.displays!==displays)
      throw new Fault('invalid_reference','Incomplete underground-fluid domain');
    for(const row of [...result.dimensions,...result.rows,...[...result.displays.values()].flat()])if(row.domain!==definition.domain)throw new Fault('invalid_reference','Mixed underground-fluid domain');
    result.rows.sort((a,b)=>a.order-b.order);result.dimensions.sort((a,b)=>a.order-b.order);
    for(const list of result.displays.values())list.sort((a,b)=>a.data.ordinal-b.data.ordinal);
    return result;
  }
  async page(search:UndergroundSearch):Promise<UndergroundPage>{
    if(search.dimension.length>256||search.query.length>256||search.fluid&& !/^fluid_[a-f0-9]{64}$/.test(search.fluid)
      ||!Number.isSafeInteger(search.offset)||search.offset<0||!Number.isSafeInteger(search.limit)||search.limit<1||search.limit>100)throw new Fault('invalid_query','Invalid underground-fluid query',400);
    const index=await this.index();
    if(search.dimension&&!index.dimensions.some(row=>row.data.dimension===search.dimension))throw new Fault('invalid_query','Unknown underground-fluid dimension',400);
    const query=search.query.trim().toLowerCase(),dimensions=new Map(index.dimensions.map(row=>[row.data.dimension,row.data]));
    const matches=index.rows.filter(row=>(!search.dimension||row.data.dimension===search.dimension)&&(!search.fluid||row.data.fluid===search.fluid)
      &&(!query||`${row.data.registry} ${row.data.dimension} ${dimensions.get(row.data.dimension)?.displayDimension??''}`.toLowerCase().includes(query)));
    const rows=matches.slice(search.offset,search.offset+search.limit),selected=new Set(rows.map(row=>`${row.data.registry}\0${dimensions.get(row.data.dimension)?.displayDimension??''}`));
    const displays=[...new Set(rows.map(row=>row.data.registry))].flatMap(registry=>index.displays.get(registry)??[]).filter(row=>selected.has(`${row.data.registry}\0${row.data.dimension}`));
    const fluids=await this.catalog.records('fluids',new Set(rows.flatMap(row=>row.data.fluid?[row.data.fluid]:[]))),categories=[];
    if(index.definition)for await(const category of this.catalog.scan('categories'))if(category.reference===index.definition.domain)categories.push(category);
    const strings=await this.catalog.records('strings',new Set([...fluids.map(row=>row.name),...categories.map(row=>row.name)]));
    const textures=await this.catalog.records('textures',new Set(fluids.flatMap(row=>row.icon?[row.icon]:[])));
    return {definition:index.definition,dimensions:index.dimensions,rows,displays,total:matches.length,offset:search.offset,limit:search.limit,
      related:{items:[],fluids,categories,strings,textures,topics:[]}};
  }
}
