import type { GeneticReferenceRow, ReferenceData } from '@elysium/contracts';
import { type Catalog, Fault } from './store.ts';
import type { Page, Related } from './query.ts';

export type MobDefinitionRow = GeneticReferenceRow & {data:Extract<ReferenceData,{kind:'mobDefinition'}>};
export type MobDropRow = GeneticReferenceRow & {data:Extract<ReferenceData,{kind:'mobDrop'}>};
export type MobDropsDefinition = GeneticReferenceRow & {data:Extract<ReferenceData,{kind:'mobDropsDefinition'}>};
export interface MobSummary {id:string;domain:string;entity:string;name:string;mod:string;visible:boolean;drops:number|null}
export interface MobSearch {query:string;item:string;offset:number;limit:number}
export interface MobIndex extends Page<MobSummary> {definitions:MobDropsDefinition[];mobs:MobDefinitionRow[];related:Related}
export interface MobDropsPage extends Page<MobDropRow> {entity:string;visible:boolean;definition:MobDropsDefinition;mob:MobDefinitionRow|null;related:Related}

/** One bounded source index serves Express and the offline worker. Hidden pages never hydrate rule details. */
export class MobDropsQuery {
  private readonly catalog:Pick<Catalog,'records'|'scan'>;
  private pending?:Promise<{definitions:MobDropsDefinition[];mobs:MobDefinitionRow[];drops:Map<string,MobDropRow[]>}>;
  constructor(catalog:Pick<Catalog,'records'|'scan'>) {this.catalog=catalog;}
  private key(domain:string,entity:string) {return domain+'/'+entity;}
  private index() {return this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});}
  private async load() {
    const definitions:MobDropsDefinition[]=[],mobs:MobDefinitionRow[]=[],raw:MobDropRow[]=[];
    let bytes=0;
    for await(const row of this.catalog.scan('references')) {
      if(!['mobDropsDefinition','mobDefinition','mobDrop'].includes(row.data.kind)) continue;
      bytes+=JSON.stringify(row).length*2;
      if(bytes>64*1024*1024) throw new Fault('reference_limit','Mob index exceeds byte budget');
      if(row.data.kind==='mobDropsDefinition') definitions.push(row as MobDropsDefinition);
      else if(row.data.kind==='mobDefinition') mobs.push(row as MobDefinitionRow);
      else raw.push(row as MobDropRow);
      if(definitions.length>16||mobs.length>16384||raw.length>262144) throw new Fault('reference_limit','Mob index exceeds record budget');
    }
    const domains=new Map(definitions.map(row=>[row.domain,row]));
    const mobKeys=new Map(mobs.map(row=>[this.key(row.domain,row.data.entity),row]));
    const drops=new Map<string,MobDropRow[]>();
    for(const row of raw) {
      const key=this.key(row.domain,row.data.entity);
      if(!mobKeys.has(key)) throw new Fault('invalid_reference','Mob drop has no native definition');
      const list=drops.get(key)??[];list.push(row);drops.set(key,list);
    }
    for(const [key,mob] of mobKeys) {
      const list=drops.get(key)??[];list.sort((a,b)=>a.data.drop-b.data.drop);
      if(!domains.has(mob.domain)||list.length!==mob.data.drops||list.some((row,index)=>row.data.drop!==index))
        throw new Fault('invalid_reference','Mob drop catalogue is incomplete');
    }
    if(domains.size!==definitions.length||mobKeys.size!==mobs.length||definitions.some(row=>!row.data.ready||row.data.consuming
      ||row.data.mobs!==mobs.filter(mob=>mob.domain===row.domain).length||row.data.drops!==raw.filter(drop=>drop.domain===row.domain).length))
      throw new Fault('invalid_reference','Mob domain is unready, consuming or incomplete');
    mobs.sort((a,b)=>a.domain.localeCompare(b.domain)||a.order-b.order);
    return {definitions,mobs,drops};
  }
  private validPage(offset:number,limit:number) {
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)
      throw new Fault('invalid_query','Invalid mob page',400);
  }
  private async related(domains:Set<string>,ids:Set<string>):Promise<Related> {
    const items=await this.catalog.records('items',ids),categories=[];
    for await(const row of this.catalog.scan('categories')) if(row.reference&&domains.has(row.reference)) categories.push(row);
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(item=>[item.name,...item.tooltip]),...categories.map(row=>row.name)]));
    const textures=await this.catalog.records('textures',new Set(items.flatMap(item=>item.icon?[item.icon]:[])));
    return {items,categories,strings,textures,fluids:[],topics:[]};
  }
  async page(search:MobSearch):Promise<MobIndex> {
    this.validPage(search.offset,search.limit);
    if(search.query.length>256||search.item&&!/^item_[a-f0-9]{64}$/.test(search.item)) throw new Fault('invalid_query','Invalid mob search',400);
    const {definitions,mobs,drops}=await this.index(),query=search.query.trim().toLowerCase();
    const selected=mobs.filter(row=>(!query||[row.data.entity,row.data.name,row.data.mod].some(text=>text.toLowerCase().includes(query)))
      &&(!search.item||row.data.visible&&(row.data.representations.includes(search.item)
        ||(drops.get(this.key(row.domain,row.data.entity))??[]).some(drop=>drop.data.item===search.item))));
    const page=selected.slice(search.offset,search.offset+search.limit),visible=page.filter(row=>row.data.visible);
    const rows=page.map(row=>({id:row.id,domain:row.domain,entity:row.data.entity,name:row.data.name,mod:row.data.mod,
      visible:row.data.visible,drops:row.data.visible?row.data.drops:null}));
    const related=await this.related(new Set(definitions.map(row=>row.domain)),new Set(visible.flatMap(row=>row.data.representations)));
    return {rows,total:selected.length,offset:search.offset,limit:search.limit,definitions,mobs:visible,related};
  }
  async drops(entity:string,offset:number,limit:number):Promise<MobDropsPage> {
    this.validPage(offset,limit);
    if(!entity||entity.length>256) throw new Fault('invalid_query','Invalid mob identity',400);
    const index=await this.index(),matches=index.mobs.filter(row=>row.data.entity===entity);
    if(matches.length!==1) throw new Fault(matches.length?'ambiguous_reference':'not_found','Mob identity is absent or ambiguous',404);
    const mob=matches[0]!,definition=index.definitions.find(row=>row.domain===mob.domain)!;
    const visible=mob.data.visible,all=visible?index.drops.get(this.key(mob.domain,entity))??[]:[];
    const rows=all.slice(offset,offset+limit);
    const related=await this.related(new Set([mob.domain]),new Set(rows.map(row=>row.data.item)));
    return {entity,visible,definition,mob:visible?mob:null,rows,total:all.length,offset,limit,related};
  }
}
