import {canonical,type GeneticReferenceRow} from '@elysium/contracts';
import {Catalog,Fault,hash} from './store.ts';
import type {Related} from './query.ts';
type Row<K extends GeneticReferenceRow['data']['kind']>=Omit<GeneticReferenceRow,'data'>&{data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type InformationDefinition=Row<'neiInformationDefinition'>;
export type InformationEntry=Row<'neiInformationPage'>;
export interface InformationSearch {backend:''|'nei'|'extraUtilities';query:string;item:string;document:string;includeUnmatched:boolean;offset:number;limit:number;linkOffset:number;linkLimit:number}
export interface InformationLinks {row:string;offset:number;limit:number;total:number;items:InformationEntry['data']['items']}
export interface InformationPage {definitions:InformationDefinition[];rows:InformationEntry[];links:InformationLinks[];total:number;offset:number;limit:number;related:Related}
function invalid():never {throw new Fault('invalid_reference','Native information pages are incomplete');}
export function validateInformationDefinition(def:InformationDefinition['data']):void {
  const expected=def.backend==='nei'?['codechicken.nei.recipe.InformationHandler','neiEscapedNewlines']:def.backend==='extraUtilities'?['com.rwtema.extrautils.nei.InfoHandler','plainNativeText']:null;
  const c=def.counts;
  if(!expected||def.source.handler!==expected[0]||!def.source.owner||!def.source.key||def.linePolicy!==expected[1]||!def.ready||def.consuming||def.representation!=='unwrappedNativeText'
    ||Object.values(c).some(n=>!Number.isSafeInteger(n)||n<0||n>262144)||c.listed>c.pages
    ||(def.backend==='nei'?c.pages!==c.nativeEntries:c.nativeEntries!==c.scannedItems||c.pages>c.nativeEntries))invalid();
}
export function validateInformationEntry(row:InformationEntry,def:InformationDefinition['data']):void {
  const p=row.data;
  if(canonical(p.source)!==canonical(def.source)||p.consuming||p.page>=def.counts.pages||row.order!==1+p.page||p.nativeIndex>=def.counts.nativeEntries||p.listed!==(p.items.length>0)||p.precise===undefined||p.filterOwner===undefined)invalid();
  if(def.backend==='nei') {if(p.nativeIndex!==p.page||p.precise!==null||!p.filterOwner||p.filterOwner.length>1024||p.textSources.length!==1)invalid();}
  else {
    if(typeof p.precise!=='boolean'||p.filterOwner!==null||p.items.length!==1||p.items[0]!.amount!=='1'||!p.textSources.length||p.textSources.length>4096)invalid();
    const first=p.textSources[0]!.key;
    if(first.endsWith('.documentation')){if(p.textSources.length!==1)invalid();}
    else{if(!first.endsWith('.documentation.0'))invalid();const base=first.slice(0,-'.documentation.0'.length);if(p.textSources.some((text,i)=>text.key!==`${base}.documentation.${i}`||!text.translated))invalid();}
  }
  const lines=p.textSources.flatMap(text=>{
    if(!text.key||new TextEncoder().encode(text.key).length>65536||new TextEncoder().encode(text.text).length>65536||!text.translated&&text.text!==text.key)invalid();
    return(def.linePolicy==='neiEscapedNewlines'?text.text.replace(/\\n/g,'\n'):text.text).replace(/\r\n/g,'\n').split('\n');
  });
  if(canonical(lines)!==canonical(p.lines)||p.items.some(link=>!/^item_[a-f0-9]{64}$/.test(link.item)||! /^[1-9][0-9]{0,9}$/.test(link.amount)||Number(link.amount)>2147483647))invalid();
}
interface Domain {definition:InformationDefinition;rows:InformationEntry[]}
export class InformationQuery {
  private pending?:Promise<Domain[]>;
  private readonly catalog:Pick<Catalog,'scan'|'records'>;
  constructor(catalog:Pick<Catalog,'scan'|'records'>){this.catalog=catalog;}
  private async load():Promise<Domain[]> {
    const groups=new Map<string,GeneticReferenceRow[]>();let bytes=0;
    for await(const row of this.catalog.scan('references')){
      if(!['neiInformationDefinition','neiInformationPage'].includes(row.data.kind))continue;
      bytes+=JSON.stringify(row).length*2;if(bytes>64*1024*1024)throw new Fault('reference_limit','Native documentation index exceeds its budget');
      const rows=groups.get(row.domain)??[];rows.push(row);groups.set(row.domain,rows);
    }
    if(groups.size>2)invalid();const result:Domain[]=[],backends=new Set<string>();
    for(const rows of groups.values()){
      rows.sort((a,b)=>a.order-b.order);const first=rows[0];if(first?.data.kind!=='neiInformationDefinition')invalid();
      const definition=first as InformationDefinition;validateInformationDefinition(definition.data);
      if(backends.has(definition.data.backend)||rows.length!==definition.data.counts.pages+1||rows.some((row,i)=>row.order!==i))invalid();backends.add(definition.data.backend);
      const entries:InformationEntry[]=[],c=definition.data.counts;let links=0,listed=0,last=-1;
      for(const row of rows.slice(1)){if(row.data.kind!=='neiInformationPage')invalid();const entry=row as InformationEntry;validateInformationEntry(entry,definition.data);if(entry.data.nativeIndex<=last)invalid();last=entry.data.nativeIndex;links+=entry.data.items.length;listed+=Number(entry.data.listed);entries.push(entry);}
      if(links!==c.itemLinks||listed!==c.listed||definition.domain!=='reference_'+await hash(canonical({kind:'neiInformation',records:rows.map(row=>row.data)})))invalid();
      result.push({definition,rows:entries});
    }
    return result;
  }
  async page(search:InformationSearch):Promise<InformationPage>{
    if(!['','nei','extraUtilities'].includes(search.backend)||search.query.length>256||search.item&&!/^item_[a-f0-9]{64}$/.test(search.item)||search.document&&!/^refrow_[a-f0-9]{64}$/.test(search.document)||typeof search.includeUnmatched!=='boolean'
      ||!Number.isSafeInteger(search.offset)||search.offset<0||!Number.isSafeInteger(search.limit)||search.limit<1||search.limit>100
      ||!Number.isSafeInteger(search.linkOffset)||search.linkOffset<0||!Number.isSafeInteger(search.linkLimit)||search.linkLimit<1||search.linkLimit>100||!search.document&&search.linkOffset!==0)throw new Fault('invalid_query','Invalid documentation query',400);
    this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});
    const domains=(await this.pending).filter(d=>!search.backend||d.definition.data.backend===search.backend),query=search.query.trim().toLocaleLowerCase();
    const candidates=domains.flatMap(d=>d.rows.filter(row=>(!search.document||row.id===search.document)&&(search.includeUnmatched||row.data.listed)&&(!search.item||row.data.items.some(link=>link.item===search.item))
      &&(!query||row.data.textSources.some(text=>(text.key+' '+text.text).toLocaleLowerCase().includes(query)))));
    const rows=candidates.slice(search.offset,search.offset+search.limit);
    const links=rows.map(row=>({row:row.id,offset:search.linkOffset,limit:search.linkLimit,total:row.data.items.length,items:row.data.items.slice(search.linkOffset,search.linkOffset+search.linkLimit)}));
    const wanted=new Set(links.flatMap(page=>page.items.map(link=>link.item))),items=await this.catalog.records('items',wanted);
    if(items.length!==wanted.size)invalid();
    const domainsById=new Map(domains.map(d=>[d.definition.domain,d])),categories:Related['categories']=[];
    for await(const category of this.catalog.scan('categories'))if(domainsById.has(category.reference??''))categories.push(category);
    if(categories.length!==domains.length||domains.some(d=>!categories.some(category=>category.reference===d.definition.domain&&canonical(category.source)===canonical(d.definition.data.source))))invalid();
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(item=>[item.name,...item.tooltip]),...categories.map(row=>row.name)]));
    const textures=await this.catalog.records('textures',new Set(items.flatMap(item=>item.icon?[item.icon]:[])));
    const result:InformationPage={definitions:domains.map(d=>d.definition),rows,links,total:candidates.length,offset:search.offset,limit:search.limit,related:{items,categories,strings,textures,fluids:[],topics:[]}};
    if(JSON.stringify(result).length*2>16*1024*1024)throw new Fault('reference_limit','Documentation page exceeds its budget');return result;
  }
}
