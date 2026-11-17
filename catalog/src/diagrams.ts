import {canonical,type Item,type GeneticReferenceRow,type NativeDiagramComponent,type NativeDiagramDisplay,type NativeDiagramLabel,type NativeDiagramAnnotation,type NativeDiagramTooltipElement,type NativeDiagramSelection} from '@elysium/contracts';
import {Catalog,Fault,hash} from './store.ts';
import type {Related} from './query.ts';

type Row<K extends GeneticReferenceRow['data']['kind']>=Omit<GeneticReferenceRow,'data'>&{data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type DiagramDefinition=Row<'neiDiagramDefinition'>;
export type DiagramEntry=Row<'neiDiagram'>;
export type DiagramBinding=Row<'neiDiagramBinding'>;
export type DiagramLookup=Row<'neiDiagramLookup'>;
export type DiagramAction=Row<'neiDiagramAction'>;
export interface DiagramSearch {group:string;query:string;item:string;direction:''|'crafting'|'usage';diagram:string;action?:string;selection?:'all'|'native';shift?:boolean;ctrl?:boolean;offset:number;limit:number;cellOffset:number;cellLimit:number;choiceOffset:number;choiceLimit:number;annotationOffset:number;annotationLimit:number}
export interface DiagramCellPage {diagram:string;cell:number;group:string;index:number;total:number;offset:number;limit:number;alternatives:NativeDiagramDisplay[]}
export type DiagramAnnotationPage={diagram:string;index:number;kind:'label';label:NativeDiagramLabel}|{diagram:string;index:number;kind:'annotation';annotation:NativeDiagramAnnotation};
export interface DiagramPage {definitions:DiagramDefinition[];diagrams:DiagramEntry[];matches:DiagramBinding[];lookups:DiagramLookup[];actions:DiagramAction[];cells:DiagramCellPage[];annotations:DiagramAnnotationPage[];total:number;offset:number;limit:number;related:Related}
const kinds=new Set(['neiDiagramDefinition','neiDiagram','neiDiagramBinding','neiDiagramLookup','neiDiagramAction']);
const prefix='neicustomdiagram.diagramgroup.gregtech.';
const visibilities=new Set(['ALWAYS_SHOWN','ALWAYS_HIDDEN','SHOW_ON_SHIFT','HIDE_ON_SHIFT','SHOW_ON_CTRL','HIDE_ON_CTRL','DISABLED']);
function invalid():never {throw new Fault('invalid_reference','Native diagram content or binding closure is incomplete');}
export function validateDiagramDefinition(def:DiagramDefinition['data']):void {
  const family=def.group.slice(prefix.length),custom=['materialparts','materialtools'].includes(family),c=def.counts;
  if(!def.group.startsWith(prefix)||!['circuits','lenses','materialparts','oreprocessing','materialtools'].includes(family)||!def.ready||def.consuming||def.source.key!==def.group||!def.source.owner
    ||!['com.github.dcysteine.neicustomdiagram.api.diagram.DiagramGroup','com.github.dcysteine.neicustomdiagram.api.diagram.CustomDiagramGroup'].includes(def.source.handler)
    ||custom!==(def.matcher==='nativeMaterial')||def.queryScope!=='readyItemListRegistryFluidsAndDiagramComponents'||c.actions!==1
    ||Object.values(c).some(n=>!Number.isSafeInteger(n)||n<0||n>262144))invalid();
  const p=def.selection,raw=p.configuredVisibility;
  const visibility=raw===null?p.defaultVisibility:raw==='true'?'ALWAYS_SHOWN':raw==='false'?'DISABLED':visibilities.has(raw)?raw:'ALWAYS_SHOWN';
  if(!visibilities.has(p.defaultVisibility)||p.visibility!==visibility||typeof p.showEmptyDiagrams!=='boolean'||raw!==null&&(typeof raw!=='string'||raw.length>65536)
    ||p.empty.kind!=='never'&&(p.empty.kind!=='slotInsertionsBelow'||!Number.isSafeInteger(p.empty.minimum)||p.empty.minimum<0||p.empty.minimum>262144))invalid();
}
/** Apply declarative native rules only on explicit request; full content remains available. */
export function nativeDiagramSelected(row:DiagramEntry['data'],policy:NativeDiagramSelection,query:{item?:string;action?:string;shift?:boolean;ctrl?:boolean}):boolean {
  if(!policy.showEmptyDiagrams&&policy.empty.kind==='slotInsertionsBelow'&&row.nativeSlotInsertions<policy.empty.minimum)return false;
  if(!query.item||query.action)return true; // Explicit group/overview actions bypass native key visibility.
  switch(policy.visibility){
    case 'ALWAYS_SHOWN':return true;
    case 'ALWAYS_HIDDEN':case 'DISABLED':return false;
    case 'SHOW_ON_SHIFT':return query.shift===true;
    case 'HIDE_ON_SHIFT':return query.shift!==true;
    case 'SHOW_ON_CTRL':return query.ctrl===true;
    case 'HIDE_ON_CTRL':return query.ctrl!==true;
  }
}
export function validateDiagramComponent(value:NativeDiagramComponent):void {
  if(value.kind==='itemFact'){if(!/^item_[a-f0-9]{64}$/.test(value.fact))invalid();return;}
  if(!value.registry||value.kind==='item'&&(!Number.isInteger(value.meta)||value.meta<0||value.meta>2147483647||value.meta===32767&&value.fact!==null||value.meta!==32767&&!value.fact)||value.kind==='fluid'&&!value.fact)invalid();
}
type LiteralComponent=Exclude<NativeDiagramComponent,{kind:'itemFact'}>;
export function expandDiagramComponent(value:NativeDiagramComponent,items:ReadonlyMap<string,Item>):LiteralComponent {
  validateDiagramComponent(value);
  if(value.kind!=='itemFact')return value;
  const item=items.get(value.fact);if(!item||item.id!==value.fact||item.meta===32767)invalid();
  return{kind:'item',registry:item.registry,meta:item.meta,nbt:item.nbt??null,fact:item.id};
}
function componentKey(component:LiteralComponent):string {
  return component.fact?canonical([component.kind,component.fact]):canonical(component);
}
async function checkedComponent(value:NativeDiagramComponent,items:ReadonlyMap<string,Item>):Promise<LiteralComponent> {
  const component=expandDiagramComponent(value,items);
  const identity=component.kind==='item'?{kind:'item',registry:component.registry,meta:component.meta,nbt:component.nbt}:{kind:'fluid',registry:component.registry,nbt:component.nbt};
  if(component.fact!==null&&component.fact!==component.kind+'_'+await hash(canonical(identity)))invalid();
  return component;
}
export async function normalizeDiagramLookup(lookup:DiagramLookup['data'],ignoreNbt:boolean,items:ReadonlyMap<string,Item>=new Map()):Promise<LiteralComponent> {
  const component=await checkedComponent(lookup.original,items);
  if(component.kind==='item'&&lookup.damage==='notApplicable'||component.kind==='fluid'&&lookup.damage!=='notApplicable')invalid();
  const nbt=ignoreNbt?null:component.nbt;
  if(component.kind==='item') {
    const meta=lookup.damage==='zeroForDamageableItem'?0:component.meta;
    return{kind:'item',registry:component.registry,meta,nbt,fact:meta===32767?null:'item_'+await hash(canonical({kind:'item',registry:component.registry,meta,nbt}))};
  }
  return{kind:'fluid',registry:component.registry,nbt,fact:'fluid_'+await hash(canonical({kind:'fluid',registry:component.registry,nbt}))};
}
export function visitDiagramDisplay(display:NativeDiagramDisplay,visit:(component:NativeDiagramComponent)=>void,depth=0):void {
  if(depth>16||display.amount!==null&&(!/^[1-9][0-9]{0,9}$/.test(display.amount)||Number(display.amount)>2147483647))invalid();
  visit(display.component);visitDiagramTooltip(display.tooltip,visit,depth+1);
}
export function visitDiagramTooltip(lines:NativeDiagramTooltipElement[][],visit:(component:NativeDiagramComponent)=>void,depth=0):void {
  if(depth>16)invalid();
  for(const line of lines)for(const element of line) {
    if(element.kind==='description')visit(element.component);
    else if(element.kind==='display')visitDiagramDisplay(element.display,visit,depth+1);
  }
}
export function visitDiagramLabel(label:NativeDiagramLabel,visit:(component:NativeDiagramComponent)=>void):void {if(label.kind==='component')visit(label.component);}
export function validateDiagramEntry(row:DiagramEntry,def:DiagramDefinition['data'],actions:DiagramAction[]):void {
  const d=row.data,c=d.content;
  if(d.group!==def.group||d.consuming||canonical(d.source)!==canonical(def.source)||d.diagram>=def.counts.diagrams||row.order!==1+d.diagram||!Number.isSafeInteger(d.nativeSlotInsertions)||d.nativeSlotInsertions<0||d.nativeSlotInsertions>262144)invalid();
  const expected:Array<[string,number]>=[],groups=new Set<string>();
  for(const group of c.groups) {
    if(!group.key||groups.has(group.key)||!Number.isSafeInteger(group.columns)||!Number.isSafeInteger(group.rows)||group.columns<1||group.rows<1||group.columns*group.rows>262144||expected.length+group.columns*group.rows>262144)invalid();
    groups.add(group.key);for(let i=0;i<group.columns*group.rows;i++)expected.push([group.key,i]);
  }
  if(expected.length!==c.cells.length||c.cells.some((cell,i)=>cell.group!==expected[i]![0]||cell.index!==expected[i]![1]))invalid();
  const component=validateDiagramComponent;
  for(const cell of c.cells){for(const display of cell.alternatives)visitDiagramDisplay(display,component);visitDiagramTooltip(cell.tooltip,component);}
  for(const label of c.labels)visitDiagramLabel(label,component);
  for(const annotation of c.annotations){visitDiagramLabel(annotation.label,component);visitDiagramTooltip(annotation.tooltip,component);if(annotation.action&&(!actions.some(a=>a.data.key===annotation.action!.group)||annotation.action.craftingOpens!=='usage'||annotation.action.usageOpens!=='crafting'))invalid();}
  if(c.relations.some(relation=>!groups.has(relation.from)||!groups.has(relation.to)))invalid();
}
interface Domain {definition:DiagramDefinition;diagrams:DiagramEntry[];bindings:DiagramBinding[];lookups:Map<string,DiagramLookup>;actions:DiagramAction[]}
export class DiagramQuery {
  private readonly catalog:Pick<Catalog,'scan'|'records'>;
  private definitions?:Promise<DiagramDefinition[]>;
  private current?:{id:string;value:Promise<Domain>};
  constructor(catalog:Pick<Catalog,'scan'|'records'>){this.catalog=catalog;}
  private async loadDefinitions():Promise<DiagramDefinition[]> {
    const definitions:DiagramDefinition[]=[],seen=new Set<string>();
    for await(const row of this.catalog.scan('references'))if(row.data.kind==='neiDiagramDefinition'){
      const def=row as DiagramDefinition;validateDiagramDefinition(def.data);if(seen.has(def.data.group)||definitions.length>=5)invalid();seen.add(def.data.group);definitions.push(def);
    }
    return definitions.sort((a,b)=>a.data.group.localeCompare(b.data.group));
  }
  private async load(definition:DiagramDefinition):Promise<Domain> {
    const rows:GeneticReferenceRow[]=[];let bytes=0;
    for await(const row of this.catalog.scan('references'))if(row.domain===definition.domain){bytes+=JSON.stringify(row).length*2;if(bytes>64*1024*1024||!kinds.has(row.data.kind))invalid();rows.push(row);}
    rows.sort((a,b)=>a.order-b.order);const c=definition.data.counts;
    if(rows.length!==1+c.diagrams+c.bindings+c.lookups+c.actions||rows.some((row,i)=>row.order!==i)||canonical(rows[0])!==canonical(definition)
      ||definition.domain!=='reference_'+await hash(canonical({kind:'neiDiagrams',records:rows.map(row=>row.data)})))invalid();
    const lookupStart=1+c.diagrams+c.bindings,actionStart=lookupStart+c.lookups;
    const diagrams=rows.slice(1,1+c.diagrams) as DiagramEntry[],bindings=rows.slice(1+c.diagrams,lookupStart) as DiagramBinding[],lookupRows=rows.slice(lookupStart,actionStart) as DiagramLookup[],actions=rows.slice(actionStart) as DiagramAction[];
    if(diagrams.some(row=>row.data.kind!=='neiDiagram')||bindings.some(row=>row.data.kind!=='neiDiagramBinding')||lookupRows.some(row=>row.data.kind!=='neiDiagramLookup')||actions.some(row=>row.data.kind!=='neiDiagramAction'))invalid();
    for(const action of actions)if(action.data.key!==definition.data.group||action.data.action!==0||action.data.consuming||action.data.group!==definition.data.group||canonical(action.data.source)!==canonical(definition.data.source)
      ||new Set(action.data.diagrams).size!==action.data.diagrams.length||action.data.diagrams.some(i=>i>=c.diagrams)||definition.data.source.handler.endsWith('.DiagramGroup')&&canonical(action.data.diagrams)!==canonical(diagrams.map(d=>d.data.diagram)))invalid();
    for(const row of diagrams)validateDiagramEntry(row,definition.data,actions);
    const wanted=new Set<string>();
    for(const row of bindings)if(row.data.component.kind==='itemFact')wanted.add(row.data.component.fact);
    for(const row of lookupRows)if(row.data.original.kind==='itemFact')wanted.add(row.data.original.fact);
    const items=new Map((await this.catalog.records('items',wanted)).map(item=>[item.id,item]));
    if(items.size!==wanted.size)invalid();
    const seen=new Set<string>(),destinations=new Set(actions.flatMap(row=>row.data.diagrams));
    const byComponent=new Map<string,number[]>();
    let edgeCount=0;
    for(const [index,row] of bindings.entries()){
      const b=row.data,component=await checkedComponent(b.component,items),identity=componentKey(component),key=canonical([b.query,identity]);
      edgeCount+=b.diagrams.length;
      if(b.binding!==index||!b.diagrams.length||edgeCount>262144||new Set(b.diagrams).size!==b.diagrams.length||b.diagrams.some(i=>i>=c.diagrams)||seen.has(key)||b.consuming||b.group!==definition.data.group||canonical(b.source)!==canonical(definition.data.source))invalid();
      seen.add(key);for(const target of b.diagrams)destinations.add(target);
      const indices=byComponent.get(identity)??[];indices.push(index);byComponent.set(identity,indices);
    }
    const lookups=new Map<string,DiagramLookup>(),originals=new Set<string>(),policies=new Map<string,DiagramLookup['data']['damage']>(),covered=new Set<number>();
    for(let start=0;start<lookupRows.length;start+=16) {
      const normalized=await Promise.all(lookupRows.slice(start,start+16).map(row=>normalizeDiagramLookup(row.data,definition.data.ignoreNbt,items)));
      for(const [local,row] of lookupRows.slice(start,start+16).entries()) {const q=row.data,original=expandDiagramComponent(q.original,items),key=componentKey(original);
        const expected=byComponent.get(componentKey(normalized[local]!));
        if(q.lookup!==start+local||q.consuming||q.group!==definition.data.group||canonical(q.source)!==canonical(definition.data.source)||originals.has(key)||!q.bindings.length||!expected||canonical(expected)!==canonical(q.bindings))invalid();
        originals.add(key);for(const index of q.bindings)covered.add(index);
        if(original.kind==='item'){const prior=policies.get(original.registry);if(prior&&prior!==q.damage)invalid();policies.set(original.registry,q.damage);}
        if(original.fact){if(lookups.has(original.fact))invalid();lookups.set(original.fact,row);}
      }
    }
    if(destinations.size!==c.diagrams||covered.size!==c.bindings)invalid();return{definition,diagrams,bindings,lookups,actions};
  }
  async page(search:DiagramSearch):Promise<DiagramPage> {
    if(search.group&&!['circuits','lenses','materialparts','oreprocessing','materialtools'].some(f=>search.group===prefix+f)||search.query.length>256||search.item&&!/^(item|fluid)_[a-f0-9]{64}$/.test(search.item)||search.diagram&&!/^refrow_[a-f0-9]{64}$/.test(search.diagram)||!['','crafting','usage'].includes(search.direction)
      ||search.selection!==undefined&&!['all','native'].includes(search.selection)||search.shift!==undefined&&typeof search.shift!=='boolean'||search.ctrl!==undefined&&typeof search.ctrl!=='boolean'
      ||[search.offset,search.cellOffset,search.choiceOffset,search.annotationOffset].some(n=>!Number.isSafeInteger(n)||n<0)||[search.limit,search.cellLimit,search.choiceLimit,search.annotationLimit].some(n=>!Number.isSafeInteger(n)||n<1||n>32))throw new Fault('invalid_query','Invalid native diagram query',400);
    this.definitions??=this.loadDefinitions().catch(error=>{this.definitions=undefined;throw error;});const definitions=await this.definitions;
    const selected=definitions.find(def=>!search.group||def.data.group===search.group);
    let domain:Domain|undefined;
    if(selected){if(this.current?.id!==selected.domain)this.current={id:selected.domain,value:this.load(selected).catch(error=>{if(this.current?.id===selected.domain)this.current=undefined;throw error;})};domain=await this.current.value;}
    const lookup=search.item?domain?.lookups.get(search.item):undefined;
    const query=search.query.trim().toLocaleLowerCase();const matches=(search.item?lookup?.data.bindings.map(index=>domain!.bindings[index]!)??[]:domain?.bindings??[]).filter(row=>!search.direction||row.data.query===search.direction);
    const matching=new Set(matches.flatMap(row=>row.data.diagrams));
    const nativeAction=search.action?domain?.actions.find(action=>action.data.key===search.action):undefined;
    if(search.action&&!nativeAction)throw new Fault('invalid_query','Unknown native diagram action',400);
    const candidates=domain?.diagrams.filter(row=>(search.selection!=='native'||nativeDiagramSelected(row.data,domain!.definition.data.selection,search))&&(!search.diagram||row.id===search.diagram)&&(!nativeAction||nativeAction.data.diagrams.includes(row.data.diagram))&&(!search.item||matching.has(row.data.diagram))&&(!query||JSON.stringify(row.data.content).toLocaleLowerCase().includes(query)))??[];
    const diagrams=candidates.slice(search.offset,search.offset+search.limit),cells:DiagramCellPage[]=[],annotations:DiagramAnnotationPage[]=[];
    const selectedMatches=search.item?matches.filter(binding=>diagrams.some(row=>binding.data.diagrams.includes(row.data.diagram))):[];
    const wantedItems=new Set<string>(),wantedFluids=new Set<string>();
    const visit=(component:NativeDiagramComponent)=>{if(component.fact)(component.kind==='fluid'?wantedFluids:wantedItems).add(component.fact);};
    if(lookup)visit(lookup.data.original);
    for(const row of selectedMatches)visit(row.data.component);
    for(const row of diagrams){const c=row.data.content;
      for(const [local,cell] of c.cells.slice(search.cellOffset,search.cellOffset+search.cellLimit).entries()){
        const alternatives=cell.alternatives.slice(search.choiceOffset,search.choiceOffset+search.choiceLimit);
        for(const d of alternatives)visitDiagramDisplay(d,visit);visitDiagramTooltip(cell.tooltip,visit);
        cells.push({diagram:row.id,cell:search.cellOffset+local,group:cell.group,index:cell.index,total:cell.alternatives.length,offset:search.choiceOffset,limit:search.choiceLimit,alternatives});
      }
      const info:DiagramAnnotationPage[]=[...c.labels.map((label,index)=>({diagram:row.id,index,kind:'label' as const,label})),...c.annotations.map((annotation,index)=>({diagram:row.id,index,kind:'annotation' as const,annotation}))];
      for(const entry of info.slice(search.annotationOffset,search.annotationOffset+search.annotationLimit)){if(entry.kind==='label')visitDiagramLabel(entry.label,visit);else{visitDiagramLabel(entry.annotation.label,visit);visitDiagramTooltip(entry.annotation.tooltip,visit);}annotations.push(entry);}
    }
    const items=await this.catalog.records('items',wantedItems),fluids=await this.catalog.records('fluids',wantedFluids);
    if(items.length!==wantedItems.size||fluids.length!==wantedFluids.size)invalid();
    const categories:Related['categories']=[];const domains=new Set(definitions.map(def=>def.domain));for await(const category of this.catalog.scan('categories'))if(category.reference&&domains.has(category.reference))categories.push(category);
    if(categories.length!==definitions.length||definitions.some(def=>!categories.some(category=>category.reference===def.domain&&canonical(category.source)===canonical(def.data.source))))invalid();
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(i=>[i.name,...i.tooltip]),...fluids.map(f=>f.name),...categories.map(c=>c.name)]));
    const textures=await this.catalog.records('textures',new Set([...items,...fluids].flatMap(row=>row.icon?[row.icon]:[])));
    const result:DiagramPage={definitions,diagrams,matches:selectedMatches,lookups:lookup?[lookup]:[],actions:domain?.actions??[],cells,annotations,total:candidates.length,offset:search.offset,limit:search.limit,related:{items,fluids,categories,strings,textures,topics:[]}};
    if(JSON.stringify(result).length*2>16*1024*1024)throw new Fault('reference_limit','Native diagram page exceeds its byte budget');return result;
  }
}
