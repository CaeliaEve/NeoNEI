import {canonical,type GeneticReferenceRow,type NativeDiagramComponent,type Nbt} from '@elysium/contracts';
import {Catalog,Fault,hash} from './store.ts';
import type {Related} from './query.ts';
import {validateDiagramComponent} from './diagrams.ts';
type Row<K extends GeneticReferenceRow['data']['kind']>=Omit<GeneticReferenceRow,'data'>&{data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type EnderDefinition=Row<'enderStorageDefinition'>;
export type EnderState=Row<'enderStorageState'>;
export interface EnderSearch {type:''|'item'|'liquid';owner:''|'global'|'personal';query:string;frequency:string;item:string;state:string;offset:number;limit:number;slotOffset:number;slotLimit:number}
export interface EnderSlotPage {state:string;offset:number;limit:number;total:number;slots:Extract<EnderState['data']['contents'],{kind:'item'}>['slots']}
export interface EnderPage {definitions:EnderDefinition[];states:EnderState[];slots:EnderSlotPage[];total:number;offset:number;limit:number;related:Related}
const prefix='neicustomdiagram.diagramgroup.enderstorage.';
function invalid():never{throw new Fault('invalid_reference','EnderStorage snapshot contents, context or original tag differs');}
function amount(value:string):number{const number=Number(value);if(!/^(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(number)||number>2147483647)invalid();return number;}
function compound(tag:Nbt|null|undefined):Record<string,Nbt>{if(!tag||tag.type!=='compound')invalid();return tag.value;}
function nativeInt(tag:Nbt|undefined):number{
  if(!tag)invalid();if(['byte','short','int','long'].includes(tag.type)&&typeof tag.value==='string')return Number(BigInt.asIntN(32,BigInt(tag.value)));
  if(tag.type==='float'||tag.type==='double'){const bytes=new ArrayBuffer(8),view=new DataView(bytes);let number:number;
    if(tag.type==='float'){view.setUint32(0,parseInt(tag.value,16));number=view.getFloat32(0);}else{view.setBigUint64(0,BigInt('0x'+tag.value));number=view.getFloat64(0);}
    const truncated=Number.isNaN(number)?0:Math.min(2147483647,Math.max(-2147483648,Math.trunc(number)));
    return number<truncated?(truncated-1)|0:truncated;
  }invalid();
}
export function validateEnderDefinition(def:EnderDefinition['data']):void{
  const c=def.counts;
  if(def.group!==prefix+(def.storageType==='item'?'chestoverview':'tankoverview')||def.source.key!==def.group||def.source.handler!=='com.github.dcysteine.neicustomdiagram.api.diagram.CustomDiagramGroup'||def.source.owner!=='neicustomdiagram'||!def.ready||def.consuming||!def.ignoreNbt
    ||def.scope!=='integratedServerGlobalAndCurrentPersonal'||def.consistency!=='ownedAtServerTick'||def.absentFrequency!=='unallocatedNativeEmpty'||!def.personalOwner||new TextEncoder().encode(def.personalOwner).length>65536||canonical(def.sizes)!==canonical([9,27,54])||def.configuredSize>=3||def.tankCapacity<1||def.tankCapacity>2147483647||! /^(0|[1-9][0-9]*)$/.test(def.capturedTick)||BigInt(def.capturedTick)>9223372036854775807n
    ||c.states>8192||c.loaded+c.persisted!==c.states||def.queryRules.length!==(def.storageType==='item'?2:1)||def.actions.length!==2)invalid();
  for(const[index,rule]of def.queryRules.entries())if(!rule.registry||rule.role!==(index===0?'block':'pouch')||rule.highMetadata!==(index===0?(def.storageType==='item'?0:1):null))invalid();
  for(const[index,action]of def.actions.entries()){const owner=index===0?'global':'personal';if(action.owner!==owner||action.requiresNewSnapshot||action.key!==def.group+'-'+owner)invalid();}
  validateDiagramComponent(def.personalLockItem);if(def.personalLockItem.kind!=='item'||def.personalLockItem.meta!==0)invalid();
}
export function visitEnderState(state:EnderState['data'],visit:(component:NativeDiagramComponent)=>void):void{if(state.contents.kind==='item')for(const slot of state.contents.slots){if(slot)visit(slot.component);}else if(state.contents.fluid)visit(state.contents.fluid);}
export async function validateEnderComponent(component:NativeDiagramComponent):Promise<Exclude<NativeDiagramComponent,{kind:'itemFact'}>>{if(component.kind==='itemFact')invalid();validateDiagramComponent(component);if(component.fact!==null){const identity=component.kind==='item'?{kind:'item',registry:component.registry,meta:component.meta,nbt:component.nbt}:{kind:'fluid',registry:component.registry,nbt:component.nbt};if(component.fact!==component.kind+'_'+await hash(canonical(identity)))invalid();}return component;}
export async function validateEnderState(row:EnderState,definition:EnderDefinition):Promise<void>{
  const state=row.data,def=definition.data,c=state.contents;
  if(row.domain!==definition.domain||row.order!==1+state.state||state.state>=def.counts.states||state.group!==def.group||state.consuming||canonical(state.source)!==canonical(def.source)||state.owner!=='global'&&state.owner!==def.personalOwner||state.frequency>4095)invalid();
  const f=state.frequency,colours=def.storageType==='item'?[f>>8&15,f>>4&15,f&15]:[f&15,f>>4&15,f>>8&15];if(canonical(state.colours)!==canonical(colours))invalid();
  if(c.kind==='item'){
    if(def.storageType!=='item'||c.sizeIndex>=3||c.slots.length!==def.sizes[c.sizeIndex]||c.nonEmpty!==c.slots.some(slot=>slot!==null))invalid();
    for(const slot of c.slots)if(slot){if(slot.component.kind!=='item')invalid();amount(slot.amount);await validateEnderComponent(slot.component);}
  }else{if(def.storageType!=='liquid'||c.capacity!==def.tankCapacity||amount(c.amount)>c.capacity||c.nonEmpty!==(amount(c.amount)!==0)||!c.fluid&&amount(c.amount)!==0||c.fluid&&c.fluid.kind!=='fluid')invalid();if(c.fluid)await validateEnderComponent(c.fluid);}
  if(state.raw===null){if(state.layer!=='loadedServer')invalid();return;}
  if(state.layer!=='persistedServer')invalid();const raw=compound(state.raw);
  if(c.kind==='item'){
    if(raw.size?.type!=='byte'||nativeInt(raw.size)!==c.sizeIndex||raw.Items?.type!=='list'||raw.Items.value.length&&raw.Items.element!=='compound')invalid();
    const seen=new Set<number>();for(const value of raw.Items.value){const entry=compound(value);if(entry.Slot?.type!=='short')invalid();const index=nativeInt(entry.Slot),slot=c.slots[index];if(!slot||seen.has(index))invalid();seen.add(index);
      if(entry.Quantity===undefined&&entry.Count?.type!=='byte'||nativeInt(entry.Quantity??entry.Count)!==amount(slot.amount))invalid();
      if(entry.Damage!==undefined&&entry.Damage.type!=='short')invalid();const meta=entry.Damage?Math.max(0,nativeInt(entry.Damage)):0;
      if(slot.component.kind!=='item'||slot.component.meta!==meta||canonical(slot.component.nbt)!==canonical(entry.tag?.type==='compound'?entry.tag:null))invalid();
    }if(c.slots.filter(slot=>slot!==null).length!==seen.size)invalid();
  }else{const tank=compound(raw.tank),fluid=c.fluid;if(!fluid||fluid.kind!=='fluid')invalid();
    if(Object.keys(tank).length===0){if(fluid.registry!=='water'||fluid.nbt!==null||amount(c.amount)!==0)invalid();}
    else if(tank.FluidName?.type!=='string'||fluid.registry!==tank.FluidName.value||nativeInt(tank.Amount)!==amount(c.amount)||canonical(fluid.nbt)!==canonical(tank.Tag?.type==='compound'?tank.Tag:null))invalid();
  }
}
export class EnderQuery {
  private readonly catalog:Pick<Catalog,'scan'|'records'>;
  private definitions?:Promise<EnderDefinition[]>;
  private current?:{id:string;rows:Promise<EnderState[]>};
  constructor(catalog:Pick<Catalog,'scan'|'records'>){this.catalog=catalog;}
  private async loadDefinitions():Promise<EnderDefinition[]>{const rows:EnderDefinition[]=[],seen=new Set<string>();for await(const row of this.catalog.scan('references'))if(row.data.kind==='enderStorageDefinition'){const def=row as EnderDefinition;validateEnderDefinition(def.data);if(def.order!==0||seen.has(def.data.group)||rows.length>=2)invalid();seen.add(def.data.group);rows.push(def);}return rows.sort((a,b)=>a.data.storageType.localeCompare(b.data.storageType));}
  private async load(def:EnderDefinition):Promise<EnderState[]>{const rows:GeneticReferenceRow[]=[];let bytes=0;for await(const row of this.catalog.scan('references'))if(row.domain===def.domain){bytes+=JSON.stringify(row).length*2;if(bytes>64*1024*1024)invalid();rows.push(row);}rows.sort((a,b)=>a.order-b.order);
    if(rows.length!==1+def.data.counts.states||rows.some((row,i)=>row.order!==i)||canonical(rows[0])!==canonical(def)||def.domain!=='reference_'+await hash(canonical({kind:'enderStorageSnapshot',records:rows.map(row=>row.data)})))invalid();
    const states=rows.slice(1) as EnderState[];let loaded=0,persisted=0,prior=-1;
    for(const row of states){if(row.data.kind!=='enderStorageState')invalid();await validateEnderState(row,def);const rank=(row.data.owner==='global'?0:4096)+row.data.frequency;if(rank<=prior)invalid();prior=rank;if(row.data.layer==='loadedServer')loaded++;else persisted++;}
    if(loaded!==def.data.counts.loaded||persisted!==def.data.counts.persisted)invalid();await validateEnderComponent(def.data.personalLockItem);return states;
  }
  async page(search:EnderSearch):Promise<EnderPage>{
    if(!['','item','liquid'].includes(search.type)||!['','global','personal'].includes(search.owner)||search.query.length>256||search.frequency&&!/^(0|[1-9][0-9]{0,3})$/.test(search.frequency)||search.frequency&&Number(search.frequency)>4095||search.item&&!/^item_[a-f0-9]{64}$/.test(search.item)||search.state&&!/^refrow_[a-f0-9]{64}$/.test(search.state)||[search.offset,search.slotOffset].some(n=>!Number.isSafeInteger(n)||n<0)||[search.limit,search.slotLimit].some(n=>!Number.isSafeInteger(n)||n<1||n>32))throw new Fault('invalid_query','Invalid EnderStorage snapshot query',400);
    this.definitions??=this.loadDefinitions().catch(error=>{this.definitions=undefined;throw error;});const definitions=await this.definitions,def=definitions.find(def=>!search.type||def.data.storageType===search.type);
    let all:EnderState[]=[];if(def){if(this.current?.id!==def.domain)this.current={id:def.domain,rows:this.load(def).catch(error=>{if(this.current?.id===def.domain)this.current=undefined;throw error;})};all=await this.current.rows;}
    let device=true;const queryItem=search.item?(await this.catalog.records('items',[search.item]))[0]:undefined;
    if(search.item)device=!!queryItem&&!!def?.data.queryRules.some(rule=>rule.registry===queryItem.registry&&(rule.highMetadata===null||queryItem.meta>>12===rule.highMetadata));
    const query=search.query.trim().toLocaleLowerCase();const filtered=all.filter(row=>device&&(!search.owner||row.data.owner===(search.owner==='global'?'global':def!.data.personalOwner))&&(!search.frequency||row.data.frequency===Number(search.frequency))&&(!search.state||row.id===search.state)&&(!query||JSON.stringify(row.data).toLocaleLowerCase().includes(query)));
    const states=filtered.slice(search.offset,search.offset+search.limit),slots:EnderSlotPage[]=[],wantedItems=new Set<string>(),wantedFluids=new Set<string>();
    const visit=(component:NativeDiagramComponent)=>{if(component.fact)(component.kind==='item'?wantedItems:wantedFluids).add(component.fact);};if(def)visit(def.data.personalLockItem);if(queryItem)wantedItems.add(queryItem.id);
    for(const row of states){const c=row.data.contents;if(c.kind==='item'){const visible=c.slots.slice(search.slotOffset,search.slotOffset+search.slotLimit);for(const slot of visible)if(slot)visit(slot.component);slots.push({state:row.id,offset:search.slotOffset,limit:search.slotLimit,total:c.slots.length,slots:visible});}else if(c.fluid)visit(c.fluid);}
    const items=await this.catalog.records('items',wantedItems),fluids=await this.catalog.records('fluids',wantedFluids);if(items.length!==wantedItems.size||fluids.length!==wantedFluids.size)invalid();
    const categories:Related['categories']=[],domains=new Set(definitions.map(def=>def.domain));for await(const row of this.catalog.scan('categories'))if(row.reference&&domains.has(row.reference))categories.push(row);if(categories.length!==definitions.length||definitions.some(def=>!categories.some(category=>category.reference===def.domain&&canonical(category.source)===canonical(def.data.source))))invalid();
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(item=>[item.name,...item.tooltip]),...fluids.map(fluid=>fluid.name),...categories.map(category=>category.name)]));
    const textures=await this.catalog.records('textures',new Set([...items,...fluids].flatMap(record=>record.icon?[record.icon]:[])));
    const result:EnderPage={definitions,states,slots,total:filtered.length,offset:search.offset,limit:search.limit,related:{items,fluids,categories,strings,textures,topics:[]}};if(JSON.stringify(result).length*2>16*1024*1024)throw new Fault('reference_limit','Storage snapshot page exceeds its byte budget');return result;
  }
}
