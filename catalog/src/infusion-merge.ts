import type {Item,Nbt,Recipe} from '@elysium/contracts';
import {nativeNbtInt,nativeNbtFloatBits} from './native-nbt.ts';

type Law=Extract<NonNullable<Recipe['outputs'][number]['change']>['action'],{kind:'nativeInfusionMerge'}>;
type Invocation=NonNullable<Law['queries']>[string];
type Query=Invocation['input'];
type Capacity=Extract<Query,{kind:'nanotool'}>['capacity'];
type Tags=Record<string,Nbt>;
type Fact=Pick<Item,'id'|'registry'|'meta'|'nbt'|'armor'|'tools'>;
type TagState={nbt:Nbt|null};
type State=TagState&{meta:number};
function invalid():never {throw new Error('Invalid native infusion tool-query effect or inheritance sample');}
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const compound=(tag:Nbt|undefined|null):Tags|undefined=>tag?.type==='compound'?tag.value:undefined;
const root=(state:TagState):Tags=>{if(state.nbt==null)state.nbt={type:'compound',value:{}};return compound(state.nbt)??invalid();};
function float(bits:string):number{if(!/^[0-9a-f]{8}$/.test(bits))invalid();const data=new DataView(new ArrayBuffer(4));data.setUint32(0,Number.parseInt(bits,16));return data.getFloat32(0);}
const constants:Record<string,string>={
 'micdoodle8.mods.galacticraft.core.items.ItemBattery':'466a6000',
 'micdoodle8.mods.galacticraft.core.items.ItemBatteryInfinite':'7f800000',
 'galaxyspace.core.item.ItemLeadBattery':'47435000',
};
function validateCapacity(rule:Capacity,depth=0,budget={nodes:0}):void{
 if(depth>16||++budget.nodes>1024)invalid();
 if(rule.kind==='constant'){if(constants[rule.owner]!==rule.bits)invalid();float(rule.bits);return;}
 if(rule.kind==='field'){if(rule.owner!=='de.katzenpapst.amunra.item.ItemBaseBattery')invalid();float(rule.bits);return;}
 if(rule.kind!=='amun')invalid();const battery=rule.battery;if(battery==null)return;
 if(!Number.isInteger(battery.offeredId)||battery.offeredId< -32768||battery.offeredId>32767||!Number.isInteger(battery.selectedId)||battery.selectedId<0||battery.selectedId>2147483647
  ||!battery.selectedRegistry||battery.selectedRegistry.length>256||battery.offeredRegistry!=null&&(!battery.offeredRegistry||battery.offeredRegistry.length>256)
  ||(battery.defaulted?battery.offeredRegistry!=null:battery.offeredId!==battery.selectedId||battery.offeredRegistry!==battery.selectedRegistry))invalid();
 validateCapacity(battery.capacity,depth+1,budget);
}
function validateQuery(query:Query):void{
 if(query.kind==='stable'||query.kind==='spell')return;
 if(query.kind==='darkSteel'){if(query.spoon.length>256)invalid();return;}
 if(query.kind!=='nanotool')invalid();validateCapacity(query.capacity);
 if(query.mode==null){if(query.nonempty!=null||query.fallback==null)invalid();}
 else if(!Number.isInteger(query.mode)||query.mode<0||query.mode>=7||query.nonempty==null||query.fallback!=null)invalid();
}
/** Returns raw float bits, so a nested cached value keeps hidden NaN payloads
 * instead of round-tripping them through an arithmetic JS Number. */
function capacity(rule:Capacity,state:TagState,depth=0,budget={nodes:0}):string{
 if(depth>16||++budget.nodes>1024)invalid();
 if(rule.kind==='constant'||rule.kind==='field')return rule.bits;
 const tags=root(state);
 if(Object.hasOwn(tags,'maxEnergy')){if(rule.battery!=null)invalid();return nativeNbtFloatBits(tags.maxEnergy);}
 const binding=rule.battery??invalid(),stored=compound(tags.batteryStack);
 const id=nativeNbtInt(stored?.id)<<16>>16;
 if(id!==binding.offeredId)invalid();
 const attached=!binding.defaulted&&stored?.tag?.type==='compound';
 const child:TagState={nbt:attached?structuredClone(stored!.tag!):null};
 const value=capacity(binding.capacity,child,depth+1,budget);
 if(attached)stored!.tag=child.nbt??invalid();
 tags.maxEnergy={type:'float',value};return value;
}
function query(rule:Query,state:State):boolean{
 if(rule.kind==='stable')return rule.eligible;
 if(rule.kind==='spell'){
  const stats=compound(root(state).BloodMagicTool);
  return ['harvestLvlpickaxe','harvestLvlaxe','harvestLvlshovel'].some(key=>stats!=null&&Object.hasOwn(stats,key)&&nativeNbtInt(stats[key])> -1);
 }
 if(rule.kind==='darkSteel'){
  if(state.nbt!=null&&state.nbt.type!=='compound')invalid();const tag=compound(state.nbt)?.['enderio.darksteel.upgrade.'+rule.spoon];
  if(tag!=null&&tag.type!=='compound')invalid();return true;
 }
 const source=root(state).electricity;
 const energy=source?.type==='float'||source?.type==='double'?float(nativeNbtFloatBits(source)):0;
 const maximum=float(capacity(rule.capacity,state));
 const damage=Math.fround(100-Math.fround(Math.fround(energy/maximum)*100));
 state.meta=Number.isNaN(damage)?0:Math.max(0,Math.min(2147483647,Math.trunc(damage)));
 if(energy>0){const mode=nativeNbtInt(root(state).toolMode);if(mode<0||mode>=7||rule.mode!==mode||rule.nonempty==null||rule.fallback!=null)invalid();return rule.nonempty;}
 if(rule.mode!=null||rule.nonempty!=null||rule.fallback==null)invalid();return rule.fallback;
}
function merge(source:Tags,dest:Tags,keys:Set<string>|null,depth=0,budget={nodes:0}):void{
 if(depth>48)invalid();for(const [key,value]of Object.entries(source)){
  if(++budget.nodes>65536)invalid();if(keys&&!keys.has(key))continue;const target=Object.hasOwn(dest,key)?dest[key]:undefined;
  if(target==null)Object.defineProperty(dest,key,{value:structuredClone(value),writable:true,enumerable:true,configurable:true});
  else if(value.type==='compound'&&target.type==='compound')merge(value.value,target.value,null,depth+1,budget);
  else if(value.type==='list'&&target.type==='list'&&value.element===target.element){budget.nodes+=value.value.length;if(budget.nodes>65536)invalid();target.value.push(...structuredClone(value.value));}
 }
}
export function nativeInfusionMergeResult(law:Law,input:Fact,amount:string,base:Fact):{registry:string;meta:number;nbt:Nbt|null;amount:string}{
 const source:State={meta:input.meta,nbt:structuredClone(input.nbt??null)},dest:State={meta:base.meta,nbt:structuredClone(base.nbt??null)};
 const result=(count=law.base.amount)=>({registry:base.registry,...dest,amount:count});
 if(law.tools){
  const invocation=law.queries?.[input.id]??invalid();validateQuery(invocation.input);
  const eligible=query(invocation.input,source);if(eligible!==(input.armor||Object.keys(input.tools).length>0))invalid();
  if(!eligible){if(invocation.output!=null)invalid();return result();}
  const output=invocation.output??invalid();validateQuery(output);const accepted=query(output,dest);
  if(accepted!==(base.armor||Object.keys(base.tools).length>0))invalid();if(!accepted)return result();
 }
 if(source.nbt!=null&&source.nbt.type!=='compound')invalid();const from=compound(source.nbt);
 if(!from||Object.keys(from).length===0)return result();
 if(dest.nbt==null){if(law.keys!=null)invalid();dest.meta=source.meta;dest.nbt=source.nbt;return result(amount);}
 merge(from,compound(dest.nbt)??invalid(),law.keys==null?null:new Set(law.keys));return result();
}
export function validateNativeInfusionMergeRecipe(recipe:Recipe,items?:ReadonlyMap<string,Item>):void{
 for(const output of recipe.outputs){const change=output.change;if(change?.action.kind!=='nativeInfusionMerge')continue;const law=change.action;
  const input=recipe.inputs.find(row=>row.kind==='item'&&row.slot===change.input)??invalid();
  if(recipe.magic?.kind!=='infusion'||output.kind!=='item'||change.bindings!=null||!input.choices.length||input.choices.length>65536||change.samples.length!==input.choices.length
   ||!/^[1-9][0-9]*$/.test(law.base.amount)||BigInt(law.base.amount)>2147483647n||law.keys!=null&&(!law.keys.length||law.keys.length>4096||law.keys.some((key,i)=>key.length>65535||i>0&&law.keys![i-1]!>=key)))invalid();
  const ids=new Set(input.choices.map(choice=>choice.id));
  if(law.tools){if(law.queries==null||Object.keys(law.queries).length!==ids.size||Object.keys(law.queries).some(id=>!ids.has(id)))invalid();
   for(const invocation of Object.values(law.queries)){validateQuery(invocation.input);if(invocation.output!=null)validateQuery(invocation.output);}
  }else if(law.queries!=null)invalid();
  const first=change.samples[0]??invalid();if(output.id!==first.id||output.amount!==first.amount)invalid();
  if(!items)continue;const base=items.get(law.base.id)??invalid();
  for(const [index,choice]of input.choices.entries()){
   if(!/^[1-9][0-9]*$/.test(choice.amount)||BigInt(choice.amount)>2147483647n)invalid();
   const result=nativeInfusionMergeResult(law,items.get(choice.id)??invalid(),choice.amount,base),sample=change.samples[index]??invalid(),actual=items.get(sample.id)??invalid();
   if(actual.registry!==result.registry||actual.meta!==result.meta||sample.amount!==result.amount||canonical(actual.nbt??null)!==canonical(result.nbt))invalid();
  }
 }
}
