import type {GeneticReferenceRow} from '@elysium/contracts';
import {type Catalog,Fault} from './store.ts';
import type {Related} from './query.ts';
type Row<K extends GeneticReferenceRow['data']['kind']>=Omit<GeneticReferenceRow,'data'>&{data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type GtMineralDefinition=Row<'gtMineralsDefinition'>;
export type GtMineralEntry=Row<'gtMineralEntry'>;
export type GtMineralShare=Row<'gtMineralDimensionShare'>;
export interface GtMineralSearch {family:string;dimension:string;query:string;item:string;offset:number;limit:number}
export interface GtMineralPage {definitions:GtMineralDefinition[];dimensions:string[];rows:GtMineralEntry[];shares:GtMineralShare[];total:number;offset:number;limit:number;related:Related}
interface Index {definitions:GtMineralDefinition[];dimensions:string[];rows:GtMineralEntry[];shares:Map<string,GtMineralShare[]>}
const key=(domain:string,native:string)=>domain+'\0'+native;

/** The same bounded native-reference index serves HTTP and persistent offline queries. */
export class GtMineralQuery {
  private readonly catalog:Pick<Catalog,'scan'|'records'>;
  private pending?:Promise<Index>;
  constructor(catalog:Pick<Catalog,'scan'|'records'>){this.catalog=catalog;}
  private index(){return this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});}
  private async load():Promise<Index>{
    const result:Index={definitions:[],dimensions:[],rows:[],shares:new Map()};let bytes=0,shares=0;
    for await(const row of this.catalog.scan('references'))if(row.data.kind.startsWith('gtMineral')){
      bytes+=JSON.stringify(row).length*2;if(bytes>64*1024*1024)throw new Fault('reference_limit','GT mineral index exceeds memory budget');
      switch(row.data.kind){
        case 'gtMineralsDefinition':result.definitions.push(row as GtMineralDefinition);if(result.definitions.length>2)throw new Fault('invalid_reference','Ambiguous GT mineral definitions');break;
        case 'gtMineralEntry':result.rows.push(row as GtMineralEntry);if(result.rows.length>131072)throw new Fault('reference_limit','Too many GT mineral definitions');break;
        case 'gtMineralDimensionShare':{const share=row as GtMineralShare,k=key(row.domain,share.data.key),list=result.shares.get(k)??[];list.push(share);result.shares.set(k,list);if(++shares>524288)throw new Fault('reference_limit','Too many GT mineral dimension shares');break;}
      }
    }
    const domains=new Map(result.definitions.map(row=>[row.domain,row]));
    if(domains.size!==result.definitions.length||new Set(result.definitions.map(row=>row.data.family)).size!==result.definitions.length)throw new Fault('invalid_reference','Duplicate GT mineral domains');
    for(const definition of result.definitions){const data=definition.data;
      const entries=result.rows.filter(row=>row.domain===definition.domain),count=[...result.shares.values()].reduce((sum,list)=>sum+list.filter(row=>row.domain===definition.domain).length,0);
      if(!data.ready||data.consuming||definition.order!==0||entries.length!==data.counts.entries||count!==data.counts.dimensionShares)throw new Fault('invalid_reference','Incomplete native GT mineral domain');
    }
    if(result.rows.some(row=>!domains.has(row.domain))||[...result.shares.values()].some(list=>list.some(row=>!domains.has(row.domain))))throw new Fault('invalid_reference','Orphan native GT minerals');
    result.definitions.sort((a,b)=>a.data.family.localeCompare(b.data.family));result.rows.sort((a,b)=>a.domain.localeCompare(b.domain)||a.order-b.order);
    result.dimensions=[...new Set([...result.shares.values()].flat().map(row=>row.data.dimension))].sort();if(result.dimensions.length>4096)throw new Fault('reference_limit','Too many native mineral dimensions');
    for(const list of result.shares.values())list.sort((a,b)=>a.data.dimension.localeCompare(b.data.dimension)||a.data.ordinal-b.data.ordinal);return result;
  }
  async page(search:GtMineralSearch):Promise<GtMineralPage>{
    if(!['','smallOre','vein'].includes(search.family)||search.query.length>256||search.dimension.length>256||search.item&&!/^item_[a-f0-9]{64}$/.test(search.item)||!Number.isSafeInteger(search.offset)||search.offset<0||!Number.isSafeInteger(search.limit)||search.limit<1||search.limit>100)throw new Fault('invalid_query','Invalid native GT mineral query',400);
    const index=await this.index(),definitions=new Map(index.definitions.map(row=>[row.domain,row.data]));
    if(search.dimension&&!index.dimensions.includes(search.dimension))throw new Fault('invalid_query','Unknown native GT mineral dimension',400);
    const query=search.query.trim().toLowerCase(),matching=index.rows.filter(row=>{
      const data=row.data;
      return (!search.family||definitions.get(row.domain)?.family===search.family)&&(!search.dimension||data.displayDimensions.includes(search.dimension))
        &&(!search.item||data.roles.some(role=>role.hosts.some(host=>host.item===search.item))||data.drops.some(drop=>drop.item===search.item))
        &&(!query||`${data.key} ${data.displayName??''} ${data.roles.map(role=>`${role.material.key} ${role.material.name}`).join(' ')} ${data.dimensions.map(dim=>dim.name).join(' ')}`.toLowerCase().includes(query));
    });
    const rows=matching.slice(search.offset,search.offset+search.limit),shares=rows.flatMap(row=>index.shares.get(key(row.domain,row.data.key))??[]);
    const items=await this.catalog.records('items',new Set(rows.flatMap(row=>[...row.data.roles.flatMap(role=>role.hosts.map(host=>host.item)),...row.data.drops.map(drop=>drop.item)])));
    const categories=[];for await(const category of this.catalog.scan('categories'))if(category.reference&&definitions.has(category.reference))categories.push(category);
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(item=>[item.name,...item.tooltip]),...categories.map(row=>row.name)]));
    const textures=await this.catalog.records('textures',new Set(items.flatMap(item=>item.icon?[item.icon]:[])));
    return {definitions:index.definitions,dimensions:index.dimensions,rows,shares,total:matching.length,offset:search.offset,limit:search.limit,related:{items,fluids:[],categories,strings,textures,topics:[]}};
  }
}
