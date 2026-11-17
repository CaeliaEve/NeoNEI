import type {Item,Nbt,Recipe} from '@elysium/contracts';
import {nativeNbtEqual} from './native-nbt.ts';
import {ariHandlers,isAriSource} from './magic-source.ts';

type Process=Extract<NonNullable<Recipe['process']>,{kind:'disguiseInfusion'}>;
type State=Process['states'][number];
type Comparison=Process['components'][number];
function invalid():never {throw new Error('Invalid native disguise infusion');}
const canonical=(v:unknown):string=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function root(tag:Nbt|null|undefined):Record<string,Nbt>{if(tag==null)return {};if(tag.type!=='compound')invalid();return tag.value;}
function child(tag:Nbt|undefined):Record<string,Nbt>|undefined{return tag?.type==='compound'?tag.value:undefined;}
function disguised(item:Item):boolean{return Object.hasOwn(child(root(item.nbt).gadomancy)??{},'disguise');}
function state(p:Process,id:string):State{
  let low=0,high=p.states.length;while(low<high){const middle=(low+high)>>>1,s=p.states[middle]!;
    if(s.id===id)return s;if(s.id<id)low=middle+1;else high=middle;}
  return invalid();
}
function equal(mode:Process['mode'],a:Comparison,at:Record<string,string>,b:Comparison,bt:Record<string,string>):boolean{
  if(b.item.nbt!=null&&(a.item.nbt==null||Object.entries(bt).some(([k,v])=>at[k]!==v)))return false;
  const fuzzy=mode==='Default'?a.ores.length>0&&b.defaultOres.includes(a.ores[0]!)
    :mode==='Strict'?a.ores.length===b.ores.length&&a.ores.every(v=>b.ores.includes(v))
    :mode==='Relaxed'?a.ores.some(v=>b.ores.includes(v))
    :a.item.registry===b.item.registry&&a.item.metadata===b.item.metadata&&nativeNbtEqual(a.item.nbt,b.item.nbt);
  return fuzzy||a.item.registry===b.item.registry&&(a.item.metadata===b.item.metadata||b.item.metadata===32767)&&a.amount<=a.limit;
}
/** Preserve native startup and cycle priority separately; return the residual disguise index. */
export function disguiseInfusionSelect(p:Process,center:Item,outer:readonly Item[]):number|null{
  if(outer.length!==p.components.length+1||disguised(center)||state(p,center.id).armorPosition===0)return null;
  const remaining=outer.map((_,i)=>i),selected:number[]=[];
  for(const required of p.components){const at=remaining.findIndex(i=>{const s=state(p,outer[i]!.id);return equal(p.mode,required,required.tags,s.comparison,s.onceTags);});
    if(at<0)return null;selected.push(remaining.splice(at,1)[0]!);}
  const residual=remaining[0]??invalid(),item=outer[residual]!,s=state(p,item.id);
  if(disguised(item))return null;
  if(s.potion&&s.invisible==null)invalid();
  if(!(s.potion&&s.invisible)&&s.armorPosition!==state(p,center.id).armorPosition)return null;
  selected.unshift(residual);const available=outer.map((_,i)=>i);
  for(const index of selected){const required=state(p,outer[index]!.id),at=available.findIndex(i=>{const offered=state(p,outer[i]!.id);return equal(p.mode,offered.comparison,offered.comparison.tags,required.comparison,required.twiceTags);});
    if(at<0)return null;available.splice(at,1);}
  return residual;
}
export function disguiseInfusionResult(p:Process,center:Item,disguise:Item):Nbt{
  const result=structuredClone(root(center.nbt)),data=child(result.gadomancy)??{},s=state(p,disguise.id);
  data.disguise=s.potion?{type:'byte',value:'1'}:structuredClone(s.serialized);
  result.gadomancy={type:'compound',value:data};return {type:'compound',value:result};
}
const int=(v:number)=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647;
const ascending=(v:readonly string[])=>v.every((x,i)=>i===0||v[i-1]!<x);
function comparison(c:Comparison):void{
  if(!c.item.registry||!int(c.item.metadata)||!int(c.amount)||!int(c.limit)||c.limit<=0||c.ores.length>65536||new Set(c.ores).size!==c.ores.length
    ||c.defaultOres.length>65536||!ascending(c.defaultOres)||canonical(Object.keys(c.tags).sort())!==canonical(Object.keys(root(c.item.nbt)).sort())
    ||Object.values(c.tags).some(v=>v.length>1048576))invalid();
}
export function validateDisguiseInfusionRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;if(p?.kind!=='disguiseInfusion'){if(r.outputs.some(o=>o.change?.action.kind==='disguiseInfusion'))invalid();return;}
  if(p.nativeRecipe!=='makeo.gadomancy.common.crafting.InfusionDisguiseArmor'||!isAriSource(r.source,ariHandlers.infusion)
    ||p.components.length!==4||!int(p.pedestalLimit)||p.pedestalLimit<=0||r.inputs.length!==6||r.outputs.length!==1||r.grid!=null||r.duration!=null||r.energy!=null
    ||!['Default','Strict','Relaxed','None'].includes(p.mode)||p.states.length>65536||!ascending(p.states.map(s=>s.id)))invalid();
  p.components.forEach(comparison);
  for(const s of p.states){comparison(s.comparison);if(s.comparison.amount!==1||!int(s.armorPosition)||s.armorPosition<0||s.armorPosition>4||!s.potion&&s.invisible!=null)invalid();
    for(const tags of [s.onceTags,s.twiceTags])if(canonical(Object.keys(tags).sort())!==canonical(Object.keys(s.comparison.tags).sort())||Object.values(tags).some(v=>v.length>1048576))invalid();
  }
  const magic=r.magic;if(magic?.kind!=='infusion'||magic.central!==0||magic.instability!==-20||magic.payment!=null||magic.creative
    ||magic.research.length!==1||magic.research[0]?.key!=='GADOMANCY.ARMORDISGUISE')invalid();
  const observed=new Set(p.states.map(s=>s.id));
  for(const [slot,input]of r.inputs.entries()){
    if(input.kind!=='item'||input.slot!==slot||!input.choices.length)invalid();
    for(const c of input.choices)if(c.amount!=='1'||c.rule.kind!=='exact'||c.consume.kind!=='stack'||!observed.has(c.id)||slot===0&&c.returns.length
      ||c.returns.some(v=>v.kind!=='item'||!/^\d+$/.test(v.amount)||BigInt(v.amount)<1n||BigInt(v.amount)>BigInt(p.pedestalLimit)))invalid();
  }
  const out=r.outputs[0]??invalid(),change=out.change;
  if(out.kind!=='item'||out.slot!==0||out.role!=='result'||out.quantity!=null||out.amount!=='1'||out.chance.numerator!=='1'||out.chance.denominator!=='1'
    ||change?.action.kind!=='disguiseInfusion'||change.input!==0||!change.samples.length||change.samples.length>65536||out.id!==change.samples[0]?.id
    ||change.bindings?.length!==change.samples.length)invalid();
  const seen=new Set<string>(),covered=new Set<string>();
  for(const tuple of change.bindings!){const key=canonical(tuple);if(tuple.length!==6||seen.has(key))invalid();seen.add(key);
    tuple.forEach((index,slot)=>{if(index==null||!Number.isInteger(index)||index<0||!r.inputs[slot]?.choices[index])invalid();covered.add(slot+':'+index);});}
  r.inputs.forEach((i,slot)=>i.choices.forEach((_,index)=>{if(!covered.has(slot+':'+index))invalid();}));
  if(!items)return;
  const nativeIds=new Map<string,string>();
  for(const s of p.states){const item=items.get(s.id)??invalid(),serialized=root(s.serialized),template=s.comparison.item;
    if(template.registry!==item.registry||template.metadata!==item.meta||canonical(template.nbt)!==canonical(item.nbt)||s.comparison.limit!==item.stackLimit
      ||canonical([...s.comparison.ores].sort())!==canonical([...item.tags].sort())||s.potion!==(item.registry==='minecraft:potion')
      ||serialized.id?.type!=='short'||serialized.Count?.type!=='byte'||serialized.Count.value!=='1'||serialized.Damage?.type!=='short'||serialized.Damage.value!==String(item.meta<<16>>16)
      ||canonical(serialized.tag??null)!==canonical(item.nbt)||Object.keys(serialized).length!==(item.nbt==null?3:4))invalid();
    if(['minecraft:pumpkin','minecraft:skull'].includes(item.registry)?s.armorPosition!==4:!item.armor&&s.armorPosition!==0)invalid();
    const previous=nativeIds.get(item.registry);if(previous!=null&&previous!==serialized.id.value)invalid();nativeIds.set(item.registry,serialized.id.value);
  }
  for(const [index,tuple]of change.bindings!.entries()){
    const offered=tuple.map((choice,slot)=>items.get(r.inputs[slot]!.choices[choice??-1]?.id??'')??invalid()),residual=disguiseInfusionSelect(p,offered[0]!,offered.slice(1));
    if(residual==null)invalid();const sample=change.samples[index]??invalid(),result=items.get(sample.id)??invalid();
    if(sample.amount!=='1'||result.registry!==offered[0]!.registry||result.meta!==offered[0]!.meta
      ||canonical(result.nbt)!==canonical(disguiseInfusionResult(p,offered[0]!,offered[residual+1]!)))invalid();
  }
}
export function disguiseInfusionNote(locale:'zh-CN'|'en-US'='zh-CN'):string{return locale==='en-US'
  ?'Center and disguise must have no existing disguise tag. The four fixed materials take their first native match; the remaining item is an invisibility potion or armor of the same native position, including pumpkin and skull headgear. Used pedestals are replaced as whole slots. The altar reads components and output before clearing the matching cache through getAspects. Output copies the center and stores byte true for a potion, or the native numeric item serialization for armor. Choices are correlated one-item specimens; research, recipe priority and live altar conditions still apply.'
  :'中心和伪装物品都不能已有 disguise 标签。四件固定材料各取首个原生匹配，剩余物必须是隐身药水或原生部位相同的护甲，南瓜和头颅也属于头部装备。使用的基座槽整体替换。祭坛先读取材料与产物，再由 getAspects 清除匹配缓存。产物复制中心；药水写入布尔真，护甲保存包含原生数字物品 ID 的序列化数据。候选是关联的单件样本，仍受研究、注册优先级和祭坛条件约束。';}
