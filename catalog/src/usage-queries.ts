import {assertTable,canonical,type GeneticReferenceRow} from '@elysium/contracts';
import {Catalog,Fault,hash} from './store.ts';
import type {Related} from './query.ts';

type Row<K extends GeneticReferenceRow['data']['kind']>=Omit<GeneticReferenceRow,'data'>&{data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type UsageDefinition=Row<'usageDefinition'>;
export type UsageObservation=Row<'usageObservation'>;
export type UsageDocument=Row<'usageDocument'>;
export type UsageResource=Row<'usageResource'>;
export type UsageBackend=UsageDefinition['data']['backend'];
export interface UsageSearch {backend:UsageBackend;query:string;item:string;observation:string;document:string;offset:number;limit:number;entryOffset:number;entryLimit:number;documentOffset:number;documentLimit:number}
type Entry=Extract<UsageObservation['data']['result'],{kind:'cell'}>['entries'][number];
export interface UsageEntryPage {row:string;offset:number;limit:number;total:number;entries:Entry[]}
export interface UsagePage {definitions:UsageDefinition[];rows:UsageObservation[];entries:UsageEntryPage[];documents:UsageDocument[];resources:UsageResource[];directory:Array<{key:string;label:string}>;documentTotal:number;documentOffset:number;documentLimit:number;total:number;offset:number;limit:number;related:Related}
export const usageBackends=['aeItemCell','aeFluidCell','ocManual','ocCallbacks'] as const;
const sources={aeItemCell:['appliedenergistics2','appeng.integration.modules.NEIHelpers.NEICellViewHandler','rv3-beta-695-GTNH'],aeFluidCell:['ae2fc','com.glodblock.github.nei.NEICellViewHandler','1.4.120-gtnh'],ocManual:['OpenComputers','li.cil.oc.integration.nei.ManualUsageHandler','1.11.20-GTNH'],ocCallbacks:['OpenComputers','li.cil.oc.integration.nei.CallbackDocHandler','1.11.20-GTNH']} as const;
function invalid():never{throw new Fault('invalid_reference','Native usage observations or documentation are inconsistent');}
function integer(value:string,positive=false):bigint {if(!/^(0|-?[1-9][0-9]*)$/.test(value))invalid();const n=BigInt(value);if(n< -9223372036854775808n||n>9223372036854775807n||positive&&n<=0n)invalid();return n;}
export function validateUsageDefinition(def:UsageDefinition['data']):void {
  const expected=sources[def.backend],c=def.counts;
  if(!expected||def.source.owner!==expected[0]||def.source.handler!==expected[1]||def.source.key!==expected[1]||def.nativeVersion!==expected[2]||!['zh_CN','en_US'].includes(def.locale)||def.scope!=='catalogObservations'||!def.ready||def.consuming
    ||Object.values(c).some(n=>!Number.isSafeInteger(n)||n<0||n>262144)||c.scanned!==c.queries+c.duplicates||c.queries!==c.matched+c.unmatched)invalid();
}
export function validateUsageObservation(row:UsageObservation,def:UsageDefinition['data']):void {
  const p=row.data,r=p.result;if(p.nativeIndex>=def.counts.scanned||integer(p.input.amount,true)>2147483647n||!/^item_[a-f0-9]{64}$/.test(p.input.item))invalid();
  if(r.kind==='cellFault'){
    if(def.backend!=='aeItemCell'||r.channel!=='items'||r.inventory!=='appeng.me.storage.CellInventoryHandler'||r.fault!=='missingCellInventory'||r.nativeException!=='java.lang.NullPointerException'
      ||!['appeng.core.features.registries.entries.BasicCellHandler','appeng.core.features.registries.entries.CreativeCellHandler','appeng.core.features.registries.entries.VoidCellHandler','com.glodblock.github.crossmod.extracells.storage.ProxyItemCellHandler','com.glodblock.github.crossmod.extracells.storage.ProxyVoidCellHandler'].includes(r.provider))invalid();
  }else if(r.kind==='cell'){
    const fluid=def.backend==='aeFluidCell';if(!['aeItemCell','aeFluidCell'].includes(def.backend)||r.channel!==(fluid?'fluids':'items')||r.inventory!==(fluid?'com.glodblock.github.common.storage.FluidCellInventoryHandler':'appeng.me.storage.CellInventoryHandler')||!r.provider||r.entries.length>262144||integer(r.totalTypes)<0n)invalid();
    integer(r.totalBytes,true);integer(r.usedBytes);integer(r.usedTypes);let last=9223372036854775807n;const seen=new Set<string>();
    for(const entry of r.entries){const n=integer(entry.amount,true);if(n>last||seen.has(entry.id)||entry.kind!==(fluid?'fluid':'item')||!new RegExp('^'+entry.kind+'_[a-f0-9]{64}$').test(entry.id))invalid();seen.add(entry.id);last=n;}
  }else if(r.kind==='manual'){if(def.backend!=='ocManual'||!r.path||!/^usage_doc_[a-f0-9]{64}$/.test(r.document))invalid();}
  else if(def.backend!=='ocCallbacks'||!r.documents.length||new Set(r.documents).size!==r.documents.length)invalid();
}
export async function validateUsageResource(row:UsageResource):Promise<void>{
  const r=row.data;if(r.mime!=='image/png'||r.bytes>768*1024||r.width<1||r.height<1||r.width>4096||r.height>4096||r.base64.length>1024*1024)invalid();
  let raw:Uint8Array;try{raw=Uint8Array.from(atob(r.base64),char=>char.charCodeAt(0));}catch{invalid();}
  if(raw.length!==r.bytes||r.base64.length!==4*Math.ceil(raw.length/3)||await hash(raw)!==r.sha256||raw.length<24||canonical(Array.from(raw.slice(0,8)))!==canonical([137,80,78,71,13,10,26,10]))invalid();
  const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);if(view.getUint32(16)!==r.width||view.getUint32(20)!==r.height||r.key!=='usage_resource_'+await hash(canonical({location:r.location,sha256:r.sha256})))invalid();
}
export async function validateUsageDocument(row:UsageDocument,def:UsageDefinition['data'],directory:ReadonlySet<string>,resources:ReadonlySet<string>):Promise<void>{
  const c=row.data.content;
  if(c.kind==='manual'){
    if(def.backend!=='ocManual'||c.requestedLocale!==def.locale||c.lines.length>65536||c.redirects.length<1||c.redirects.length>64||c.resolvedPath!==c.redirects.at(-1)||row.data.key!=='usage_doc_'+await hash(canonical({backend:'ocManual',path:c.path}))
      ||c.fallbackAttempted&&(def.locale!=='zh_CN'||!c.path.includes('%LANGUAGE%'))||c.status==='missing'&&(c.provider!==null||c.lines.length||c.links.length||c.images.length)||c.status==='found'&&!c.provider)invalid();
    const locale=c.fallbackAttempted?'en_US':def.locale;if(c.redirects[0]!==c.path.replaceAll('%LANGUAGE%',locale))invalid();
    for(const link of c.links){if(link.kind==='document'){if(!directory.has('usage_doc_'+await hash(canonical({backend:'ocManual',path:link.target}))))invalid();}else if(!/^https?:\/\//.test(link.href)||link.target!==link.href||link.anchor)invalid();}
    for(const image of c.images)if(image.kind==='png'&&!resources.has(image.resource)||image.kind==='items'&&!image.items.length)invalid();
  }else{
    if(def.backend!=='ocCallbacks'||c.analysis!=='nativeStaticAnnotations'||!c.environment||!c.methods.length||new Set(c.methods.map(m=>m.name)).size!==c.methods.length||row.data.key!=='usage_doc_'+await hash(canonical({backend:'ocCallbacks',environment:c.environment})))invalid();
  }
}
interface Domain {definition:UsageDefinition;rows:UsageObservation[];documents:UsageDocument[];resources:UsageResource[]}
export class UsageQuery {
  private pending?:Promise<Domain[]>;
  private readonly catalog:Pick<Catalog,'scan'|'records'>;
  constructor(catalog:Pick<Catalog,'scan'|'records'>){this.catalog=catalog;}
  private async load():Promise<Domain[]>{
    const groups=new Map<string,GeneticReferenceRow[]>();let bytes=0;
    for await(const row of this.catalog.scan('references'))if(['usageDefinition','usageObservation','usageDocument','usageResource'].includes(row.data.kind)){
      bytes+=JSON.stringify(row).length*2;if(bytes>128*1024*1024)throw new Fault('reference_limit','Native usage index exceeds its budget');const group=groups.get(row.domain)??[];group.push(row);groups.set(row.domain,group);
    }
    if(groups.size>4)invalid();const result:Domain[]=[],seen=new Set<string>();
    for(const group of groups.values()){
      group.sort((a,b)=>a.order-b.order);const first=group[0];if(first?.data.kind!=='usageDefinition')invalid();const definition=first as UsageDefinition,def=definition.data,c=def.counts;
      validateUsageDefinition(def);assertTable({kind:'references',records:group});
      if(seen.has(def.backend)||group.length!==1+c.matched+c.documents+c.resources||group.some((row,i)=>row.order!==i)||definition.domain!=='reference_'+await hash(canonical({kind:'usageQueries',records:group.map(row=>row.data)})))invalid();seen.add(def.backend);
      const rows=group.slice(1,1+c.matched) as UsageObservation[],documents=group.slice(1+c.matched,1+c.matched+c.documents) as UsageDocument[],resources=group.slice(1+c.matched+c.documents) as UsageResource[];
      if(rows.some(row=>row.data.kind!=='usageObservation')||documents.some(row=>row.data.kind!=='usageDocument')||resources.some(row=>row.data.kind!=='usageResource'))invalid();
      const keys=new Set(documents.map(doc=>doc.data.key)),images=new Set(resources.map(row=>row.data.key));if(keys.size!==documents.length||images.size!==resources.length)invalid();
      let prior=-1;const inputs=new Set<string>();for(const row of rows){validateUsageObservation(row,def);const key=canonical(row.data.input);if(row.data.nativeIndex<=prior||inputs.has(key))invalid();prior=row.data.nativeIndex;inputs.add(key);const r=row.data.result;if(r.kind==='manual'&&!keys.has(r.document)||r.kind==='callbacks'&&r.documents.some(key=>!keys.has(key)))invalid();}
      for(const row of resources)await validateUsageResource(row);for(const row of documents)await validateUsageDocument(row,def,keys,images);
      result.push({definition,rows,documents,resources});
    }return result;
  }
  async page(search:UsageSearch):Promise<UsagePage>{
    if(!usageBackends.includes(search.backend)||search.query.length>256||search.item&&!/^item_[a-f0-9]{64}$/.test(search.item)||search.observation&&!/^refrow_[a-f0-9]{64}$/.test(search.observation)||search.document&&!/^usage_doc_[a-f0-9]{64}$/.test(search.document)
      ||[search.offset,search.entryOffset,search.documentOffset].some(n=>!Number.isSafeInteger(n)||n<0)||[search.limit,search.entryLimit,search.documentLimit].some(n=>!Number.isSafeInteger(n)||n<1||n>32))throw new Fault('invalid_query','Invalid native usage query',400);
    this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});const domains=(await this.pending).filter(d=>d.definition.data.backend===search.backend),domain=domains[0];
    const query=search.query.trim().toLowerCase(),allDocuments=domain?.documents??[];
    const all=(domain?.rows??[]).filter(row=>(!search.item||row.data.input.item===search.item)&&(!search.observation||row.id===search.observation));
    const filtered=all.filter(row=>!query||JSON.stringify(row.data).toLowerCase().includes(query)),rows=filtered.slice(search.offset,search.offset+search.limit);
    const linked=new Set(all.flatMap(row=>row.data.result.kind==='manual'?[row.data.result.document]:row.data.result.kind==='callbacks'?row.data.result.documents:[]));
    const candidates=allDocuments.filter(row=>(!search.document||row.data.key===search.document)&&(!(search.item||search.observation)||linked.has(row.data.key))&&(!query||JSON.stringify(row.data).toLowerCase().includes(query)));
    const documents=candidates.slice(search.documentOffset,search.documentOffset+search.documentLimit),resources=(domain?.resources??[]).filter(row=>documents.some(doc=>doc.data.content.kind==='manual'&&doc.data.content.images.some(image=>image.kind==='png'&&image.resource===row.data.key)));
    const entries=rows.map(row=>{const values=row.data.result.kind==='cell'?row.data.result.entries:[];return{row:row.id,offset:search.entryOffset,limit:search.entryLimit,total:values.length,entries:values.slice(search.entryOffset,search.entryOffset+search.entryLimit)};});
    const itemIds=new Set(rows.map(row=>row.data.input.item)),fluidIds=new Set<string>();for(const page of entries)for(const entry of page.entries)(entry.kind==='item'?itemIds:fluidIds).add(entry.id);
    for(const doc of documents)if(doc.data.content.kind==='manual')for(const image of doc.data.content.images)if(image.kind==='items')for(const item of image.items)itemIds.add(item);
    const items=await this.catalog.records('items',itemIds),fluids=await this.catalog.records('fluids',fluidIds);if(items.length!==itemIds.size||fluids.length!==fluidIds.size)invalid();
    const categories:Related['categories']=[];for await(const category of this.catalog.scan('categories'))if(domain&&category.reference===domain.definition.domain)categories.push(category);
    if(categories.length!==domains.length||domain&&canonical(categories[0]?.source)!==canonical(domain.definition.data.source))invalid();
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(item=>[item.name,...item.tooltip]),...fluids.map(fluid=>fluid.name),...categories.map(c=>c.name)])),textures=await this.catalog.records('textures',new Set([...items,...fluids].flatMap(item=>item.icon?[item.icon]:[])));
    const result:UsagePage={definitions:domains.map(d=>d.definition),rows,entries,documents,resources,directory:allDocuments.map(row=>({key:row.data.key,label:row.data.content.kind==='manual'?row.data.content.path:row.data.content.environment})),documentTotal:candidates.length,documentOffset:search.documentOffset,documentLimit:search.documentLimit,total:filtered.length,offset:search.offset,limit:search.limit,related:{items,fluids,categories,strings,textures,topics:[]}};
    if(JSON.stringify(result).length*2>16*1024*1024)throw new Fault('reference_limit','Native usage page exceeds its budget');return result;
  }
}
