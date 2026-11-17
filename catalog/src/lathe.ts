import {canonical,type GeneticReferenceRow,type Item,type Nbt} from '@elysium/contracts';
import {Fault,hash,type Catalog} from './store.ts';
import type {Related} from './query.ts';
type Row<K extends GeneticReferenceRow['data']['kind']>=Omit<GeneticReferenceRow,'data'>&{data:Extract<GeneticReferenceRow['data'],{kind:K}>};
export type LatheDefinition=Row<'latheDefinition'>;
export type LatheSample=Row<'latheSample'>;
export type LatheWorkpiece=Row<'latheWorkpiece'>;
export type LatheState=Row<'latheState'>;
export type LatheTool=Row<'latheTool'>;
export type LatheToolState=Row<'latheToolState'>;
export interface LatheSearch {workpiece:string;state:string;tool:string;toolState:string;offset:number;limit:number;toolOffset:number;toolLimit:number}
export interface LathePage {
  definition:LatheDefinition|null;workpieces:LatheWorkpiece[];tools:LatheTool[];total:number;toolTotal:number;
  offset:number;limit:number;toolOffset:number;toolLimit:number;workpiece:LatheWorkpiece|null;state:LatheState|null;
  tool:LatheTool|null;toolState:LatheToolState|null;afterStates:LatheState[];afterTools:LatheToolState[];samples:LatheSample[];related:Related;
}
interface Index {definition:LatheDefinition|null;workpieces:LatheWorkpiece[];tools:LatheTool[];states:Map<string,LatheState>;toolStates:Map<string,LatheToolState>;samples:LatheSample[]}
function invalid(message:string):never{throw new Fault('invalid_reference',message);}
const key=(owner:string,item:string)=>owner+'/'+item;
function integer(value:string){if(!/^[1-9][0-9]*$/.test(value)||value.length>10||BigInt(value)>2147483647n)invalid('Invalid native lathe quantity');}
const isInt=(value:number)=>Number.isInteger(value)&&value>=-2147483648&&value<=2147483647;
export function latheRollTickets(bits:string):number{
  if(!/^[0-9a-f]{8}$/.test(bits))invalid('Non-canonical native Float threshold');
  const view=new DataView(new ArrayBuffer(4));view.setUint32(0,parseInt(bits,16));const chance=view.getFloat32(0);
  return Number.isNaN(chance)||chance<=0?0:chance>=1?16777216:Math.ceil(chance*16777216);
}
export function latheStateItems(row:LatheState):string[]{return [row.data.item,...row.data.transitions.flatMap(edge=>[edge.after,edge.preflightOutput.item,edge.byproduct.item])];}
export function latheToolItems(row:LatheToolState):string[]{return [row.data.item,...(row.data.after?[row.data.after]:[])];}
function javaInt(value:number){return Number.isNaN(value)?0:Math.trunc(Math.max(-2147483648,Math.min(2147483647,value)));}
function nbtInteger(nbt:Nbt):number{
  if(nbt.type==='byte'||nbt.type==='short'||nbt.type==='int')return Number(nbt.value);
  if(nbt.type==='long')return Number(BigInt.asIntN(32,BigInt(nbt.value)));
  if(nbt.type==='float'){const view=new DataView(new ArrayBuffer(4));view.setUint32(0,parseInt(nbt.value,16));return javaInt(view.getFloat32(0));}
  if(nbt.type==='double'){const view=new DataView(new ArrayBuffer(8));view.setBigUint64(0,BigInt('0x'+nbt.value));return javaInt(view.getFloat64(0));}
  return 0;
}
function defaultLanes(nbt:Nbt|null|undefined,width:number):number[]{
  if(nbt?.type!=='compound'||nbt.value.state?.type!=='compound')invalid('Native blank state NBT missing');
  const values=nbt.value.state.value;return Array.from({length:5},(_,i)=>values['l'+i]?nbtInteger(values['l'+i]!):width);
}
function numericState(lanes:number[]){return lanes.reduce((value,lane)=>value*16+lane,0);}
function shape(width:number,lanes:number[]){if(!isInt(width)||width<1||width>64||!lanes.length||lanes.length>16||lanes.some(radius=>!isInt(radius)||radius<1||radius>width))invalid('Invalid native lathe geometry');}
export function validateLatheDefinition(def:LatheDefinition['data']):void{
  if(!def.ready||def.consuming||def.source.handler!=='ic2.neiIntegration.core.recipehandler.LatheRecipeHandler'||!def.source.owner||!def.source.key
    ||def.apiClass!=='ic2.api.item.ILatheItem'||def.toolApiClass!=='ic2.api.item.ILatheItem$ILatheTool'||def.machineClass!=='ic2.core.block.machine.tileentity.TileEntityLathe'
    ||def.energyPerCut!==1000||def.bufferCapacity!==10000||def.toolWear!==1||def.minimumRadius!==1||def.hardnessGate!=='strictlyGreater'
    ||def.outputSpaceCheck!=='beforeStateChange'||def.byproduct!=='afterStateChange'||def.bufferLeakDivisor!==100||def.bufferLeakBiasBits!=='3f000000'
    ||def.bufferLeakCast!=='truncateToInt'||def.bufferLeakPhase!=='beforeIntake'||def.intakeSide!=='opposite'||def.intakeSource!=='firstNonzeroAdvertisedSource'
    ||!def.intakeDirections.length||def.intakeDirections.length>7||def.intakeDirections.some(value=>!['down','up','north','south','west','east','unknown'].includes(value)))invalid('Invalid native lathe machine policy');
  for(const value of Object.values(def.counts))if(!Number.isSafeInteger(value)||value<0||value>262144)invalid('Native lathe counts exceed budget');
}
export function validateLatheState(row:LatheState,work:LatheWorkpiece,items:ReadonlyMap<string,Item>,targets?:ReadonlyMap<string,LatheState>):void{
  const state=row.data,initial=items.get(work.data.workpiece),item=items.get(state.item);shape(state.width,state.lanes);
  if(!initial||!item||state.workpiece!==work.data.workpiece||state.width!==work.data.width||state.lanes.length!==work.data.initial.length||item.registry!==initial.registry)invalid('Native lathe state owner/geometry differs');
  const standard=work.data.callbackClass==='ic2.core.item.resources.ItemLatheDefault';
  if(standard&&(state.lanes.length!==5||state.width===3&&state.hardness!==0||state.width===5&&state.hardness!==2||![3,5].includes(state.width)
    ||item.meta!==numericState(state.lanes)||canonical(defaultLanes(item.nbt,state.width))!==canonical(state.lanes)))invalid('Native blank geometry contradicts item metadata/NBT');
  const lanes=new Set<number>();
  for(const edge of state.transitions){
    if(!Number.isSafeInteger(edge.lane)||edge.lane<0||edge.lane>=state.lanes.length||state.lanes[edge.lane]!<=1||lanes.has(edge.lane))invalid('Repeated/illegal lathe cutting lane');lanes.add(edge.lane);
    const after=items.get(edge.after);if(!after||after.registry!==item.registry)invalid('Native lathe target fact absent');
    const expected=state.lanes.slice();expected[edge.lane]!--;
    if(targets){const next=targets.get(edge.after);if(!next||next.data.workpiece!==state.workpiece||canonical(next.data.lanes)!==canonical(expected))invalid('Native lathe target is not a single-lane cut');}
    for(const output of [edge.preflightOutput,edge.byproduct]){if(!items.has(output.item))invalid('Native lathe byproduct fact absent');integer(output.amount);}
    if(edge.roll.comparison!=='lessThan'||edge.roll.samples!==16777216||edge.roll.tickets!==latheRollTickets(edge.roll.thresholdBits))invalid('Native nextFloat threshold differs from tickets');
    if(standard){
      const nbt=structuredClone(item.nbt);if(nbt?.type!=='compound'||nbt.value.state?.type!=='compound')invalid('Native blank state NBT missing');
      nbt.value.state.value['l'+edge.lane]={type:'int',value:String(expected[edge.lane])};
      if(after.meta!==numericState(expected)||canonical(after.nbt)!==canonical(nbt))invalid('Native cut changed unrelated workpiece NBT');
      if(edge.preflightOutput.item!==edge.byproduct.item||edge.preflightOutput.amount!==edge.byproduct.amount||edge.roll.thresholdBits!==(state.width===3?'3dcccccd':'3f000000'))invalid('Native default byproduct/probability differs');
      if(state.width===3){const drop=items.get(edge.byproduct.item)!;if(drop.registry!=='minecraft:stick'||drop.meta!==0||drop.nbt!==null||edge.byproduct.amount!=='1')invalid('Native WOOD byproduct differs');}
    }
  }
  if(lanes.size!==state.lanes.filter(radius=>radius>1).length)invalid('Native state omitted a cutting lane');
}
export function validateLatheToolState(row:LatheToolState,tool:LatheTool,items:ReadonlyMap<string,Item>,targets?:ReadonlyMap<string,LatheToolState>):void{
  const state=row.data,item=items.get(state.item),initial=items.get(tool.data.tool);
  if(!item||!initial||state.tool!==tool.data.tool||item.registry!==initial.registry||!isInt(state.damage)||state.damage<0||state.damage===2147483647||state.maximum!==tool.data.maximum)invalid('Invalid native lathe tool state');
  if(tool.data.callbackClass==='ic2.core.item.tool.ItemLathingTool'&&(state.damage!==item.meta||state.hardness!==3))invalid('Native lathing tool metadata/hardness differs');
  if(state.damage+1>=state.maximum){if(state.after!==null)invalid('Exhausted native tool survived');}
  else{if(!state.after||!items.has(state.after))invalid('Native usable tool was removed');
    if(targets){const next=targets.get(state.after);if(!next||next.data.tool!==state.tool||next.data.damage!==state.damage+1)invalid('Native tool wear differs');}
    const after=items.get(state.after)!;if(tool.data.callbackClass==='ic2.core.item.tool.ItemLathingTool'&&(after.meta!==state.damage+1||canonical(after.nbt)!==canonical(item.nbt)))invalid('Native tool wear changed unrelated NBT');}
}
function validateSample(sample:LatheSample,workpieces:ReadonlyMap<string,LatheWorkpiece>,tools:ReadonlyMap<string,LatheTool>,items:ReadonlyMap<string,Item>){
  const data=sample.data,item=items.get(data.item);integer(data.amount);if(!item||!Number.isSafeInteger(data.panelOrder)||data.panelOrder<0||data.panelOrder>=1_000_000)invalid('Native lathe sample absent');
  if(data.role==='tool'){const tool=tools.get(data.item);if(!tool)invalid('Native tool sample declaration absent');
    if(tool.data.callbackClass==='ic2.core.item.tool.ItemLathingTool'&&(item.meta!==data.rawMeta||canonical(item.nbt)!==canonical(data.rawNbt)))invalid('Native tool changed raw panel state');
  }else{const work=workpieces.get(data.item);if(!work)invalid('Native workpiece sample declaration absent');
    if(work.data.callbackClass==='ic2.core.item.resources.ItemLatheDefault'){
      const root:Record<string,Nbt>=data.rawNbt?.type==='compound'?structuredClone(data.rawNbt.value):{};
      if(data.rawNbt&&data.rawNbt.type!=='compound')invalid('Raw native item NBT is not compound');
      if(!root.state){const values:Record<string,Nbt>={};for(let lane=0;lane<5;lane++){const value=data.rawMeta===0?work.data.width:data.rawMeta===-1?1:Math.max(1,Math.min(work.data.width,(data.rawMeta>>(4*(4-lane)))&15));values['l'+lane]={type:'int',value:String(value)};}root.state={type:'compound',value:values};}
      const nbt:Nbt={type:'compound',value:root},lanes=defaultLanes(nbt,work.data.width);
      if(item.meta!==numericState(lanes)||canonical(item.nbt)!==canonical(nbt))invalid('Native workpiece normalization contradicts raw panel state');
    }
  }
}

export class LatheQuery{
  private readonly catalog:Pick<Catalog,'scan'|'records'>;private pending?:Promise<Index>;
  constructor(catalog:Pick<Catalog,'scan'|'records'>){this.catalog=catalog;}
  private async load():Promise<Index>{
    let definition:LatheDefinition|null=null,bytes=0;
    const rows:GeneticReferenceRow[]=[],workpieces:LatheWorkpiece[]=[],tools:LatheTool[]=[],samples:LatheSample[]=[],states=new Map<string,LatheState>(),toolStates=new Map<string,LatheToolState>();
    for await(const row of this.catalog.scan('references')){
      if(!row.data.kind.startsWith('lathe'))continue;bytes+=JSON.stringify(row).length*2;
      if(bytes>64*1024*1024||rows.length>=1_000_000)throw new Fault('reference_limit','Native lathe index exceeds byte/row budget');rows.push(row);
      const data=row.data;
      if(data.kind==='latheDefinition'){if(definition)invalid('Ambiguous native lathe definition');definition={...row,data};}
      else if(data.kind==='latheWorkpiece')workpieces.push({...row,data});else if(data.kind==='latheTool')tools.push({...row,data});
      else if(data.kind==='latheSample')samples.push({...row,data});
      else if(data.kind==='latheState'){const id=key(data.workpiece,data.item);if(states.has(id))invalid('Duplicate native lathe state');states.set(id,{...row,data});}
      else if(data.kind==='latheToolState'){const id=key(data.tool,data.item);if(toolStates.has(id))invalid('Duplicate native lathe tool state');toolStates.set(id,{...row,data});}
      else invalid('Unknown native lathe leaf');
    }
    if(!definition){if(rows.length)invalid('Native lathe definition missing');return {definition,workpieces,tools,samples,states,toolStates};}
    rows.sort((a,b)=>a.order-b.order);workpieces.sort((a,b)=>a.order-b.order);tools.sort((a,b)=>a.order-b.order);samples.sort((a,b)=>a.data.panelOrder-b.data.panelOrder);
    validateLatheDefinition(definition.data);
    if(rows.some((row,i)=>row.order!==i||row.domain!==definition!.domain)||rows[0]!.id!==definition.id)invalid('Incomplete native lathe declaration order');
    if(definition.domain!=='reference_'+await hash(canonical({kind:'latheRules',records:rows.map(row=>row.data)})))invalid('Native lathe graph content identity differs');
    const actual={samples:samples.length,workpieces:workpieces.length,tools:tools.length,states:states.size,toolStates:toolStates.size,transitions:[...states.values()].reduce((total,row)=>total+row.data.transitions.length,0)};
    if(canonical(actual)!==canonical(definition.data.counts))invalid('Incomplete native lathe state graph');
    const wanted=new Set([...workpieces.map(row=>row.data.workpiece),...tools.map(row=>row.data.tool),...samples.map(row=>row.data.item),...[...states.values()].flatMap(latheStateItems),...[...toolStates.values()].flatMap(latheToolItems)]);
    const facts=await this.catalog.records('items',wanted);const items=new Map(facts.map(row=>[row.id,row]));
    if(items.size!==wanted.size)invalid('Native lathe item closure missing');bytes+=JSON.stringify(facts).length*2;if(bytes>64*1024*1024)throw new Fault('reference_limit','Native lathe validation exceeds byte budget');
    const roots=new Map(workpieces.map(row=>[row.data.workpiece,row])),toolRoots=new Map(tools.map(row=>[row.data.tool,row]));
    if(roots.size!==workpieces.length||toolRoots.size!==tools.length)invalid('Duplicate native lathe root');
    let previous=-1;const sampledWork=new Set<string>(),sampledTools=new Set<string>();
    for(const sample of samples){if(sample.data.panelOrder<=previous)invalid('Duplicate native panel order');previous=sample.data.panelOrder;validateSample(sample,roots,toolRoots,items);(sample.data.role==='workpiece'?sampledWork:sampledTools).add(sample.data.item);}
    if(sampledWork.size!==roots.size||sampledTools.size!==toolRoots.size)invalid('Native lathe root lacks panel provenance');
    for(const work of workpieces){shape(work.data.width,work.data.initial);if(!work.data.callbackClass||work.data.callbackClass.length>1024)invalid('Native workpiece callback absent');}
    for(const tool of tools){if(!tool.data.callbackClass||tool.data.callbackClass.length>1024||!isInt(tool.data.damage)||tool.data.damage<0||!isInt(tool.data.maximum)||tool.data.maximum<1||tool.data.maximum>65536)invalid('Native tool callback/bounds absent');}
    const grouped=new Map<string,number>(),groupedTools=new Map<string,number>();
    for(const state of states.values()){
      const work=roots.get(state.data.workpiece);if(!work)invalid('Native state owner absent');const targets=new Map(state.data.transitions.map(edge=>[edge.after,states.get(key(state.data.workpiece,edge.after))!]));
      validateLatheState(state,work,items,targets);grouped.set(state.data.workpiece,(grouped.get(state.data.workpiece)??0)+1);
    }
    for(const work of workpieces){const initial=states.get(key(work.data.workpiece,work.data.workpiece));if(!initial||canonical(initial.data.lanes)!==canonical(work.data.initial)||initial.data.hardness!==work.data.hardness)invalid('Native initial workpiece state differs');
      const seen=new Set<string>(),pending=[work.data.workpiece];for(let cursor=0;cursor<pending.length;cursor++){const id=pending[cursor]!;if(seen.has(id))continue;seen.add(id);if(seen.size>32768)throw new Fault('reference_limit','Native workpiece state budget exceeded');for(const edge of states.get(key(work.data.workpiece,id))!.data.transitions)pending.push(edge.after);}
      if(seen.size!==grouped.get(work.data.workpiece))invalid('Native graph has orphan workpiece states');
    }
    for(const state of toolStates.values()){const tool=toolRoots.get(state.data.tool);if(!tool)invalid('Native tool state owner absent');const targets=new Map(state.data.after?[[state.data.after,toolStates.get(key(state.data.tool,state.data.after))!]]:[]);validateLatheToolState(state,tool,items,targets);groupedTools.set(state.data.tool,(groupedTools.get(state.data.tool)??0)+1);}
    for(const tool of tools){let next:string|null=tool.data.tool;const seen=new Set<string>();const initial=toolStates.get(key(tool.data.tool,tool.data.tool));if(!initial||initial.data.damage!==tool.data.damage)invalid('Native initial tool state differs');
      while(next){if(seen.has(next)||seen.size>=262144)invalid('Native tool graph cycle/budget');seen.add(next);next=toolStates.get(key(tool.data.tool,next))!.data.after??null;}
      if(seen.size!==groupedTools.get(tool.data.tool))invalid('Native graph has orphan tool states');
    }
    return {definition,workpieces,tools,samples,states,toolStates};
  }
  async page(search:LatheSearch):Promise<LathePage>{
    for(const value of [search.offset,search.toolOffset])if(!Number.isSafeInteger(value)||value<0)throw new Fault('invalid_query','Invalid native lathe offset',400);
    for(const value of [search.limit,search.toolLimit])if(!Number.isSafeInteger(value)||value<1||value>100)throw new Fault('invalid_query','Invalid native lathe limit',400);
    for(const value of [search.workpiece,search.state,search.tool,search.toolState])if(value.length>256)throw new Fault('invalid_query','Invalid native lathe selector',400);
    this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});const index=await this.pending;
    const workpiece=search.workpiece?index.workpieces.find(row=>row.data.workpiece===search.workpiece):index.workpieces[0]??null;
    const tool=search.tool==='none'?null:search.tool?index.tools.find(row=>row.data.tool===search.tool):index.tools[0]??null;
    if(search.workpiece&&!workpiece||search.tool&&search.tool!=='none'&&!tool)throw new Fault('invalid_query','Unknown native lathe root',400);
    const state=workpiece?index.states.get(key(workpiece.data.workpiece,search.state||workpiece.data.workpiece))??null:null;
    const toolState=tool?index.toolStates.get(key(tool.data.tool,search.toolState||tool.data.tool))??null:null;
    if(workpiece&&!state||tool&&!toolState||search.state&&!workpiece||search.toolState&&!tool)throw new Fault('invalid_query','Unknown or cross-owner native lathe state',400);
    const workpieces=index.workpieces.slice(search.offset,search.offset+search.limit),tools=index.tools.slice(search.toolOffset,search.toolOffset+search.toolLimit);
    const afterStates=state?state.data.transitions.map(edge=>index.states.get(key(state.data.workpiece,edge.after))!):[];
    const afterTools=toolState?.data.after?[index.toolStates.get(key(toolState.data.tool,toolState.data.after))!]:[];
    const samples=index.samples.filter(row=>row.data.item===workpiece?.data.workpiece||row.data.item===tool?.data.tool).slice(0,24);
    const ids=new Set([...workpieces.map(row=>row.data.workpiece),...tools.map(row=>row.data.tool),...(workpiece?[workpiece.data.workpiece]:[]),...(tool?[tool.data.tool]:[]),...(state?latheStateItems(state):[]),...(toolState?latheToolItems(toolState):[]),...afterStates.flatMap(latheStateItems),...afterTools.flatMap(latheToolItems)]);
    const items=await this.catalog.records('items',ids),categories=[];
    if(index.definition)for await(const row of this.catalog.scan('categories'))if(row.reference===index.definition.domain)categories.push(row);
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(item=>[item.name,...item.tooltip]),...categories.map(row=>row.name)]));
    const textures=await this.catalog.records('textures',new Set(items.flatMap(item=>item.icon?[item.icon]:[])));
    const result={definition:index.definition,workpieces,tools,total:index.workpieces.length,toolTotal:index.tools.length,offset:search.offset,limit:search.limit,toolOffset:search.toolOffset,toolLimit:search.toolLimit,
      workpiece:workpiece??null,state,tool:tool??null,toolState,afterStates,afterTools,samples,related:{items,strings,textures,categories,fluids:[],topics:[]}};
    if(JSON.stringify(result).length*2>16*1024*1024)throw new Fault('reference_limit','Native lathe page exceeds byte budget');return result;
  }
}
