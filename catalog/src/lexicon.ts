import type {GeneticReferenceRow,ReferenceData} from '@elysium/contracts';
import {type Catalog,Fault} from './store.ts';
import type {Page,Related} from './query.ts';
export type LexiconRow=GeneticReferenceRow&{data:Extract<ReferenceData,{kind:'lexiconEntry'}>};
export type LexiconDefinition=GeneticReferenceRow&{data:Extract<ReferenceData,{kind:'lexiconDefinition'}>};
export interface LexiconSearch {query:string;item:string;offset:number;limit:number}
export interface LexiconPage extends Page<LexiconRow> {definitions:LexiconDefinition[];related:Related}

export class LexiconQuery {
  private readonly catalog:Pick<Catalog,'records'|'scan'>;
  private pending?:Promise<{definitions:LexiconDefinition[];entries:LexiconRow[]}>;
  constructor(catalog:Pick<Catalog,'records'|'scan'>) {this.catalog=catalog;}
  private index() {return this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});}
  private async load() {
    const definitions:LexiconDefinition[]=[],entries:LexiconRow[]=[];
    let bytes=0;
    for await(const row of this.catalog.scan('references')) {
      if(row.data.kind!=='lexiconDefinition'&&row.data.kind!=='lexiconEntry') continue;
      bytes+=JSON.stringify(row).length*2;
      if(bytes>64*1024*1024) throw new Fault('reference_limit','Lexicon index exceeds byte budget');
      if(row.data.kind==='lexiconDefinition') definitions.push(row as LexiconDefinition);
      else entries.push(row as LexiconRow);
      if(definitions.length>16||entries.length>16384) throw new Fault('reference_limit','Lexicon index exceeds record budget');
    }
    const counts=new Map<string,{entries:number;pages:number}>();
    for(const row of entries) {
      const count=counts.get(row.domain)??{entries:0,pages:0};count.entries++;count.pages+=row.data.items.length;
      counts.set(row.domain,count);
    }
    if(new Set(definitions.map(row=>row.domain)).size!==definitions.length||counts.size>definitions.length
      ||definitions.some(row=>row.data.consuming||row.data.entries!==(counts.get(row.domain)?.entries??0)||row.data.pages!==(counts.get(row.domain)?.pages??0)))
      throw new Fault('invalid_reference','Lexicon definition is consuming or incomplete');
    entries.sort((a,b)=>a.domain.localeCompare(b.domain)||a.order-b.order);
    return {definitions,entries};
  }
  async page(search:LexiconSearch):Promise<LexiconPage> {
    if(!Number.isSafeInteger(search.offset)||search.offset<0||!Number.isSafeInteger(search.limit)||search.limit<1||search.limit>100
      ||search.query.length>256||search.item&&!/^item_[a-f0-9]{64}$/.test(search.item)) throw new Fault('invalid_query','Invalid lexicon query',400);
    const {definitions,entries}=await this.index();
    const query=search.query.trim().toLowerCase();
    const filtered=entries.filter(row=>(!search.item||row.data.items.some(item=>item.item===search.item))
      &&(!query||[row.data.entry,row.data.name.value,row.data.knowledge.name.value,row.data.tagline?.value??'',
        ...row.data.items.map(item=>item.quickInfo.value)].some(text=>text.toLowerCase().includes(query))));
    const rows=filtered.slice(search.offset,search.offset+search.limit);
    const items=await this.catalog.records('items',new Set(rows.flatMap(row=>row.data.items.map(item=>item.item))));
    const domains=new Set(definitions.map(row=>row.domain)),categories=[];
    for await(const category of this.catalog.scan('categories')) if(category.reference&&domains.has(category.reference)) categories.push(category);
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(item=>[item.name,...item.tooltip]),...categories.map(category=>category.name)]));
    const textures=await this.catalog.records('textures',new Set(items.flatMap(item=>item.icon?[item.icon]:[])));
    return {...search,rows,total:filtered.length,definitions,related:{items,categories,strings,textures,fluids:[],topics:[]}};
  }
}
