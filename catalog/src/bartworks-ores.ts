import type {GeneticReferenceRow} from '@elysium/contracts';
import {type Catalog,Fault} from './store.ts';
import type {Related} from './query.ts';
type Row<K extends GeneticReferenceRow['data']['kind']>=Omit<GeneticReferenceRow,'data'>&{data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type BartworksDefinition=Row<'bartworksOresDefinition'>;
export type BartworksLayer=Row<'bartworksOreLayer'>;
export type BartworksMaterial=Row<'bartworksOreMaterial'>;
export type BartworksLookup=Row<'bartworksOreLookup'>;
export type BartworksEntry=BartworksLayer|BartworksMaterial;
export interface BartworksSearch{mode:'layers'|'materials';query:string;dimension:string;item:string;offset:number;limit:number}
export interface BartworksPage{definitions:BartworksDefinition[];dimensions:string[];rows:BartworksEntry[];companions:BartworksEntry[];lookups:BartworksLookup[];total:number;offset:number;limit:number;related:Related}
interface Index{definitions:BartworksDefinition[];layers:BartworksLayer[];materials:BartworksMaterial[];lookups:BartworksLookup[];dimensions:string[]}
const items=(row:BartworksEntry)=>row.data.kind==='bartworksOreLayer'?row.data.roles.map(role=>role.item):row.data.samples.flatMap(sample=>sample.item?[sample.item]:[]);
const metas=(row:BartworksEntry)=>row.data.kind==='bartworksOreLayer'?row.data.roles.map(role=>role.meta<<16>>16):[row.data.meta];

/** Shared online/offline native data; only current-page specimens are hydrated. */
export class BartworksOreQuery{
  private readonly catalog:Pick<Catalog,'scan'|'records'>;private pending?:Promise<Index>;
  constructor(catalog:Pick<Catalog,'scan'|'records'>){this.catalog=catalog;}
  private index(){return this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});}
  private async load():Promise<Index>{
    const index:Index={definitions:[],layers:[],materials:[],lookups:[],dimensions:[]};let bytes=0;
    for await(const row of this.catalog.scan('references'))if(row.data.kind.startsWith('bartworksOre')){
      bytes+=JSON.stringify(row).length*2;if(bytes>64*1024*1024)throw new Fault('reference_limit','Bartworks mineral index exceeds memory budget');
      switch(row.data.kind){
        case 'bartworksOresDefinition':index.definitions.push(row as BartworksDefinition);break;
        case 'bartworksOreLayer':index.layers.push(row as BartworksLayer);break;
        case 'bartworksOreMaterial':index.materials.push(row as BartworksMaterial);break;
        case 'bartworksOreLookup':index.lookups.push(row as BartworksLookup);break;
      }
    }
    if(index.definitions.length>1)throw new Fault('invalid_reference','Ambiguous Bartworks mineral source');
    const definition=index.definitions[0];if(definition){const data=definition.data;
      if(!data.ready||data.consuming||definition.order!==0||index.layers.length!==data.counts.layers||index.materials.length!==data.counts.materials||index.lookups.length!==data.counts.lookups||[...index.layers,...index.materials,...index.lookups].some(row=>row.domain!==definition.domain))throw new Fault('invalid_reference','Incomplete Bartworks mineral domain');
    }else if(index.layers.length||index.materials.length||index.lookups.length)throw new Fault('invalid_reference','Orphan Bartworks mineral records');
    index.layers.sort((a,b)=>a.data.ordinal-b.data.ordinal);index.materials.sort((a,b)=>a.data.ordinal-b.data.ordinal);index.lookups.sort((a,b)=>a.data.ordinal-b.data.ordinal);
    index.dimensions=[...new Set(index.layers.map(row=>row.data.dimension.key))].sort();return index;
  }
  async page(search:BartworksSearch):Promise<BartworksPage>{
    if(!['layers','materials'].includes(search.mode)||search.query.length>256||search.dimension.length>256||search.item&&!/^item_[a-f0-9]{64}$/.test(search.item)||!Number.isSafeInteger(search.offset)||search.offset<0||!Number.isSafeInteger(search.limit)||search.limit<1||search.limit>100)throw new Fault('invalid_query','Invalid Bartworks mineral query',400);
    const index=await this.index();if(search.dimension&&!index.dimensions.includes(search.dimension))throw new Fault('invalid_query','Unknown Bartworks dimension',400);
    const query=search.query.trim().toLowerCase(),domain=index.definitions[0]?.domain;
    const lookupMap=new Map(index.lookups.map(row=>[row.data.meta,row]));const layers=new Map(index.layers.map(row=>[row.data.key,row]));
    const matching:(BartworksEntry[])=(search.mode==='layers'?index.layers:index.materials).filter(row=>{
      const data=row.data;
      const dims=data.kind==='bartworksOreLayer'?[data.dimension.key]:lookupMap.get(data.meta)?.data.layers.flatMap(key=>layers.get(key)?[layers.get(key)!.data.dimension.key]:[])??[];
      const words=data.kind==='bartworksOreLayer'?`${data.key} ${data.dimension.key} ${data.dimension.name}`:`${data.key} ${data.name} ${data.defaultName}`;
      return (!search.dimension||dims.includes(search.dimension))&&(!search.item||items(row).includes(search.item))&&(!query||words.toLowerCase().includes(query));
    });
    const rows=matching.slice(search.offset,search.offset+search.limit),selectedMetas=new Set(rows.flatMap(metas));
    const lookups=index.lookups.filter(row=>selectedMetas.has(row.data.meta));
    const linked=new Set(lookups.flatMap(row=>row.data.layers));
    const companions:BartworksEntry[]=search.mode==='layers'?index.materials.filter(row=>selectedMetas.has(row.data.meta)):index.layers.filter(row=>linked.has(row.data.key));
    if(companions.length>4096||JSON.stringify({rows,companions,lookups}).length*2>16*1024*1024)throw new Fault('reference_limit','Bartworks mineral page exceeds response budget');
    const specimens=await this.catalog.records('items',new Set([...rows,...companions].flatMap(items)));
    const categories=[];for await(const category of this.catalog.scan('categories'))if(category.reference===domain)categories.push(category);
    const strings=await this.catalog.records('strings',new Set([...specimens.flatMap(item=>[item.name,...item.tooltip]),...categories.map(category=>category.name)]));
    const textures=await this.catalog.records('textures',new Set(specimens.flatMap(item=>item.icon?[item.icon]:[])));
    return {definitions:index.definitions,dimensions:index.dimensions,rows,companions,lookups,total:matching.length,offset:search.offset,limit:search.limit,related:{items:specimens,fluids:[],categories,strings,textures,topics:[]}};
  }
}
