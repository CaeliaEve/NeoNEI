import { canonical, type GeneticReferenceRow, type Item, type Nbt } from '@elysium/contracts';
import { Fault, hash, type Catalog } from './store.ts';
import type { Related } from './query.ts';

type Row<K extends GeneticReferenceRow['data']['kind']> = Omit<GeneticReferenceRow,'data'> & { data: Extract<GeneticReferenceRow['data'],{kind:K}> };
export type FireworkDefinition = Row<'fireworkDefinition'>;
export type FireworkExample = Row<'fireworkExample'>;
export interface FireworkPage { definition:FireworkDefinition|null; examples:FireworkExample[]; total:number; offset:number; limit:number; related:Related }
export interface FireworkSearch { offset:number;limit:number }
export type FireworkOutcome = {status:'unmatched'|'malformedExplosion'} | {status:'output';registry:string;meta:number;nbt:Nbt;amount:'1'|'3'};
function invalid(message:string):never { throw new Fault('invalid_reference',message); }
const compound = (value:Record<string,Nbt>):Nbt => ({type:'compound',value});
const byte = (value:number):Nbt => ({type:'byte',value:String(value)});
const colors = (value:number[]):Nbt => ({type:'int_array',value:value.map(String)});
export function fireworkMaterials(def:FireworkDefinition['data']):string[] {
  return [def.gunpowder,def.paper,def.star,def.rocket,...def.dyes.map(row=>row.item),...def.shapes.flatMap(row=>row.item?[row.item]:[]),...def.effects.map(row=>row.item)];
}
export function fireworkExampleItems(row:FireworkExample):string[] {
  return [...row.data.inputs.filter((id):id is string=>id!==null),...(row.data.output?[row.data.output.item]:[])];
}
/** Counts occupied cells, preserves NBT types and native grid scan order. No dynamic image is fabricated. */
export function evaluateFirework(def:FireworkDefinition['data'],cells:readonly (string|null)[],items:ReadonlyMap<string,Item>):FireworkOutcome {
  if(cells.length!==9)invalid('Firework input must retain its nine logical crafting cells');
  let powder=0,paper=0,shapes=0,other=0,shape=0,trail=false,flicker=false;
  const dyes:number[]=[],stars:Item[]=[];
  for(const id of cells){
    if(id===null)continue;
    const item=items.get(id);if(!item)invalid('Firework input fact absent');
    switch(item.registry){
      case 'minecraft:gunpowder':powder++;break;
      case 'minecraft:paper':paper++;break;
      case 'minecraft:firework_charge':stars.push(item);break;
      case 'minecraft:dye':{
        const dye=def.dyes.find(row=>row.meta===item.meta);if(!dye)invalid('Unsafe native dye metadata');
        dyes.push(dye.rgb);other++;break;
      }
      case 'minecraft:diamond':trail=true;other++;break;
      case 'minecraft:glowstone_dust':flicker=true;other++;break;
      case 'minecraft:fire_charge':case 'minecraft:gold_nugget':case 'minecraft:skull':case 'minecraft:feather':{
        const native=def.shapes.find(row=>row.item&&items.get(row.item)?.registry===item.registry);
        if(!native)invalid('Native firework shape absent');shape=native.type;shapes++;other++;break;
      }
      default:return {status:'unmatched'};
    }
  }
  if(powder>3||paper>1)return {status:'unmatched'};
  if(powder>=1&&paper===1&&other===0){
    const fixed=def.flightPolicy==='alwaysWithPowder';
    let nbt=compound({});
    if(fixed||stars.length){
      const explosions=stars.flatMap(item=>{
        if(item.nbt?.type!=='compound')return [];
        const explosion=item.nbt.value.Explosion;return explosion?.type==='compound'?[structuredClone(explosion)]:[];
      });
      const fields:Record<string,Nbt>={Flight:byte(powder)};
      if(!fixed||explosions.length)fields.Explosions={type:'list',element:explosions.length?'compound':'end',value:explosions};
      nbt=compound({Fireworks:compound(fields)});
    }
    return {status:'output',registry:'minecraft:fireworks',meta:0,nbt,amount:fixed?'3':'1'};
  }
  if(powder===1&&paper===0&&!stars.length&&dyes.length&&shapes<=1){
    const explosion:Record<string,Nbt>={Type:byte(shape),Colors:colors(dyes)};
    if(trail)explosion.Trail=byte(1);if(flicker)explosion.Flicker=byte(1);
    return {status:'output',registry:'minecraft:firework_charge',meta:0,nbt:compound({Explosion:compound(explosion)}),amount:'1'};
  }
  if(powder===0&&paper===0&&stars.length===1&&dyes.length&&dyes.length===other){
    const star=stars[0]!;if(star.nbt?.type!=='compound')return {status:'unmatched'};
    const nbt=structuredClone(star.nbt),explosion=nbt.value.Explosion;
    if(explosion){if(explosion.type!=='compound')return {status:'malformedExplosion'};explosion.value.FadeColors=colors(dyes);}
    return {status:'output',registry:star.registry,meta:star.meta,nbt,amount:'1'};
  }
  return {status:'unmatched'};
}
/** Raw invalid probe states are evaluated privately; they never become display Item facts. */
export function evaluateFireworkExample(def:FireworkDefinition['data'],example:FireworkExample['data'],items:ReadonlyMap<string,Item>):FireworkOutcome {
  if(!example.failure)return evaluateFirework(def,example.inputs,items);
  const states=example.failure.inputs;
  if(states.length!==1)invalid('Malformed firework probe requires one raw state cell');
  const state=states[0]!,raw=state.template,base=items.get(def.star);
  if(!Number.isInteger(state.slot)||state.slot<0||state.slot>=9||example.inputs[state.slot]!==null||!base
    ||raw.registry!=='minecraft:firework_charge'||raw.meta!==0||raw.amount!=='1'||raw.nbt?.type!=='compound'
    ||!raw.nbt.value.Explosion||raw.nbt.value.Explosion.type==='compound')invalid('Unverified raw firework state');
  const item:Item={...base,id:'!native-firework-failure',nbt:raw.nbt},local=new Map(items),cells=example.inputs.slice();
  local.set(item.id,item);cells[state.slot]=item.id;
  return evaluateFirework(def,cells,local);
}
export function validateFireworkDefinition(def:FireworkDefinition['data'],items:ReadonlyMap<string,Item>):void {
  const nativeRule=def.recipeClass==='net.minecraft.item.crafting.RecipeFireworks'&&def.flightPolicy==='onlyWithChargeCell'&&def.outputAmount==='1'
    ||def.recipeClass==='ganymedes01.etfuturum.recipes.crafting.RecipeFixedFireworks'&&def.flightPolicy==='alwaysWithPowder'&&def.outputAmount==='3';
  if(!def.ready||def.consuming||def.source.handler!=='codechicken.nei.recipe.FireworkRecipeHandler'||!def.source.owner||!def.source.key
    ||!nativeRule||def.gridWidth!==3||def.gridHeight!==3
    ||def.unitsPerCell!==1||def.colorOrder!=='gridScan'
    ||def.fadePolicy!=='copyTaggedStarModifyExistingCompound'||def.examples<1||def.examples>256)invalid('Invalid native firework rule policy');
  const material=(id:string,registry:string,meta=0)=>{
    const item=items.get(id);if(!item||item.registry!==registry||item.meta!==meta||item.nbt!==null)invalid('Native firework material identity changed');
  };
  for(const [id,registry] of [[def.gunpowder,'minecraft:gunpowder'],[def.paper,'minecraft:paper'],[def.star,'minecraft:firework_charge'],[def.rocket,'minecraft:fireworks']] as const)material(id,registry);
  if(def.dyes.length!==16||def.shapes.length!==5||def.effects.length!==2)invalid('Incomplete native firework palette');
  for(const [i,dye] of def.dyes.entries()){
    if(dye.meta!==i||!Number.isInteger(dye.rgb)||dye.rgb<0||dye.rgb>0xffffff)invalid('Invalid native firework color');
    material(dye.item,'minecraft:dye',i);
  }
  const registries=[null,'minecraft:fire_charge','minecraft:gold_nugget','minecraft:skull','minecraft:feather'];
  for(const [i,shape] of def.shapes.entries()){
    if(shape.type!==i||i===0&&shape.item!==null||i!==0&&!shape.item)invalid('Invalid native firework shape');
    if(shape.item)material(shape.item,registries[i]!);
  }
  for(const [i,effect] of def.effects.entries()){
    material(effect.item,i===0?'minecraft:diamond':'minecraft:glowstone_dust');
    if(effect.nbtKey!==(i===0?'Trail':'Flicker'))invalid('Native firework effect key differs');
  }
}
export function validateFireworkExample(def:FireworkDefinition['data'],row:FireworkExample,items:ReadonlyMap<string,Item>):void {
  const example=row.data,result=evaluateFireworkExample(def,example,items);
  if(!example.label||example.label.length>128)invalid('Invalid native firework example label');
  if(example.failure){
    if(result.status!=='malformedExplosion'||example.output!==null||example.failure.code!=='malformedExplosion'
      ||example.failure.exception!=='net.minecraft.util.ReportedException'||example.failure.cause!=='java.lang.ClassCastException')invalid('Native firework failure classification differs');
  }else if(!example.output){if(result.status!=='unmatched')invalid('Native firework matching classification differs');}
  else{
    const item=items.get(example.output.item);
    if(result.status!=='output'||example.output.amount!==result.amount||!item||item.registry!==result.registry||item.meta!==result.meta
      ||canonical(item.nbt)!==canonical(result.nbt))invalid('Native firework callback output contradicts rule');
  }
}

/** Shared online/offline bounded query. The complete rule stays separate from paged native examples. */
export class FireworkQuery {
  private pending?:Promise<{definition:FireworkDefinition|null;examples:FireworkExample[]}>;
  private readonly catalog:Pick<Catalog,'scan'|'records'>;
  constructor(catalog:Pick<Catalog,'scan'|'records'>){this.catalog=catalog;}
  private async load(){
    let definition:FireworkDefinition|null=null,bytes=0;const examples:FireworkExample[]=[];
    for await(const row of this.catalog.scan('references')){
      if(row.data.kind==='fireworkDefinition'){if(definition)invalid('Ambiguous native firework definition');definition={...row,data:row.data};}
      else if(row.data.kind==='fireworkExample')examples.push({...row,data:row.data});
      else continue;
      bytes+=JSON.stringify(row).length*2;
      if(bytes>32*1024*1024||examples.length>256)throw new Fault('reference_limit','Native firework reference budget exceeded');
    }
    if(!definition){if(examples.length)invalid('Native firework definition missing');return {definition,examples};}
    examples.sort((a,b)=>a.order-b.order);
    if(definition.order!==0||definition.data.examples!==examples.length||examples.some((row,i)=>row.order!==i+1||row.domain!==definition!.domain))invalid('Incomplete native firework example catalogue');
    if(definition.domain!=='reference_'+await hash(canonical({kind:'fireworkRules',records:[definition.data,...examples.map(row=>row.data)]})))invalid('Native firework rule identity differs');
    const facts=await this.catalog.records('items',new Set([...fireworkMaterials(definition.data),...examples.flatMap(fireworkExampleItems)]));
    const items=new Map(facts.map(item=>[item.id,item]));validateFireworkDefinition(definition.data,items);
    const labels=new Set<string>();
    for(const row of examples){if(labels.has(row.data.label))invalid('Duplicate native firework example label');labels.add(row.data.label);validateFireworkExample(definition.data,row,items);}
    return {definition,examples};
  }
  async page(search:FireworkSearch):Promise<FireworkPage>{
    if(!Number.isSafeInteger(search.offset)||search.offset<0||!Number.isSafeInteger(search.limit)||search.limit<1||search.limit>100)throw new Fault('invalid_query','Invalid native firework paging',400);
    this.pending??=this.load().catch(error=>{this.pending=undefined;throw error;});const index=await this.pending;
    const examples=index.examples.slice(search.offset,search.offset+search.limit),categories=[];
    const items=await this.catalog.records('items',new Set([...(index.definition?fireworkMaterials(index.definition.data):[]),...examples.flatMap(fireworkExampleItems)]));
    if(index.definition)for await(const row of this.catalog.scan('categories'))if(row.reference===index.definition.domain)categories.push(row);
    const strings=await this.catalog.records('strings',new Set([...items.flatMap(item=>[item.name,...item.tooltip]),...categories.map(row=>row.name)]));
    const textures=await this.catalog.records('textures',new Set(items.flatMap(item=>item.icon?[item.icon]:[])));
    const page={definition:index.definition,examples,total:index.examples.length,...search,related:{items,strings,textures,categories,fluids:[],topics:[]}};
    if(JSON.stringify(page).length*2>16*1024*1024)throw new Fault('reference_limit','Native firework response exceeds byte budget');
    return page;
  }
}
