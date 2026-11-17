import type {Fluid,Item,Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'witcheryNativeRitual'}>;
type Key=Process['trigger'];
type Offered=Pick<Item,'registry'|'meta'>;
const invalid=():never=>{throw new Error('Invalid native Witchery ritual dispatch');};
const int=(v:number,min=-2147483648)=>Number.isInteger(v)&&v>=min&&v<=2147483647;
const same=(a:Key,b:Key)=>a.registry===b.registry&&a.metadata===b.metadata;
const registry=(v:string)=>v.length<=4096&&v.indexOf(':')>0&&!v.endsWith(':');
const key=(v:Key)=>registry(v.registry)&&int(v.metadata);
function hash(name:string):number{let h=0;for(let i=0;i<name.length;i++)h=(Math.imul(h,31)+name.charCodeAt(i))|0;return(h+629)|0;}
/** Native Hashtable first match, using cached stored hash and the actual query-name observation. */
export function nativeRitualDispatch(p:Process,item:Offered):Process['dispatch'][number]|null{
  const name=p.names[item.registry];if(name==null)return null;
  if(p.capacity<=0)return null;const query=hash(name),bucket=(query&2147483647)%p.capacity;
  return p.dispatch.find(d=>d.bucket===bucket&&d.hash===query&&d.registry===item.registry&&(d.metadata===32767||item.meta===32767||d.metadata===item.meta))??null;
}
/** The original recipe matcher compares action metadata literally and removes one need per action. */
export function nativeRitualSelect(p:Process,actions:readonly Key[]):number|null{
  const selected=p.patterns.findIndex(pattern=>{
    const needed=[...pattern];for(const action of actions){const at=needed.findIndex(k=>same(k,action));if(at>=0)needed.splice(at,1);}return needed.length===0;
  });return selected<0?null:selected;
}
export function nativeRitualSelectItems(p:Process,items:readonly Offered[]):number|null{
  const actions:Key[]=[];for(const item of items){const d=nativeRitualDispatch(p,item);if(!d)return null;actions.push(d.action);}return nativeRitualSelect(p,actions);
}
/** Action-list cost only, before independent world/altar rules; native signed-int wrapping. */
export function nativeRitualActionPower(p:Process,items:readonly Offered[]):number|null{
  let total=0;for(const item of items){const d=nativeRitualDispatch(p,item);if(!d)return null;total=(total+d.power)|0;}return total;
}
export function validateNativeRitualRecipe(r:Recipe,items?:ReadonlyMap<string,Item>,fluids?:ReadonlyMap<string,Fluid>):void{
  const p=r.process;if(p?.kind!=='witcheryNativeRitual')return;
  if(p.version!=='0.24.1'||p.scope!=='postAdmissionActions'||p.waterMillibuckets!==3000
    ||r.source.owner!=='WitcheryExtras'||r.source.handler!=='alkalus.main.nei.NEI_Handler_Cauldron'
    ||r.duration!=null||r.energy!=null||r.grid!=null||r.magic!=null||Object.keys(r.properties).length
    ||!int(p.actionIndex,0)||p.actionIndex>=4096||!int(p.selected,0)||!int(p.triggerTarget,0)||p.triggerTarget>=65536
    ||!int(p.triggerPower)||!key(p.trigger)||!int(p.capacity,1)||p.capacity>262144||p.patterns.length>4096||p.dispatch.length>65536||Object.keys(p.names).length>65536)invalid();
  let total=0,bytes=0;
  for(const pattern of p.patterns){total+=pattern.length;if(pattern.length>255||total>262144||pattern.some(k=>!key(k)))invalid();}
  for(const [id,name]of Object.entries(p.names)){bytes+=name.length*2;if(!registry(id)||name.length>65536||bytes>8*1024*1024)invalid();}
  const targets=new Map<number,Process['dispatch'][number]>();
  for(const d of p.dispatch){
    if(!registry(d.registry)||!int(d.metadata)||!int(d.hash)||!int(d.bucket,0)||d.bucket>=p.capacity||!int(d.power)||!int(d.target,0)||d.target>=65536||!key(d.action)||!Object.hasOwn(p.names,d.registry))invalid();
    const prior=targets.get(d.target);if(prior&&(!same(prior.action,d.action)||prior.power!==d.power))invalid();targets.set(d.target,d);
  }
  const trigger=targets.get(p.triggerTarget)??invalid();if(!same(trigger.action,p.trigger)||trigger.power!==p.triggerPower)invalid();
  const pattern=p.patterns[p.selected]??invalid(),expected=[...pattern,p.trigger];
  if(nativeRitualSelect(p,expected)!==p.selected||r.inputs.length!==expected.length+1)invalid();
  for(const [slot,need]of expected.entries()){
    const input=r.inputs[slot]??invalid();if(input.kind!=='item'||input.slot!==slot||!input.choices.length)invalid();
    for(const c of input.choices){if(c.amount!=='1'||c.rule.kind!=='wildcard'||c.rule.meta||!c.rule.nbt||c.consume.kind!=='consume'||c.returns.length)invalid();
      if(items){const item=items.get(c.id)??invalid(),d=nativeRitualDispatch(p,item)??invalid();if(!same(d.action,need)||slot===pattern.length&&d.target!==p.triggerTarget)invalid();}}
  }
  const water=r.inputs.at(-1)??invalid(),c=water.choices[0]??invalid();
  if(water.kind!=='fluid'||water.slot!==0||water.choices.length!==1||c.amount!=='3000'||c.rule.kind!=='exact'||c.consume.kind!=='consume'||c.returns.length)invalid();
  if(fluids){const fluid=fluids.get(c.id)??invalid();if(fluid.registry!=='water'||fluid.nbt!=null)invalid();}
  const o=r.outputs[0]??invalid();if(r.outputs.length!==1||o.kind!=='item'||o.slot!==0||o.role!=='result'||o.amount!=null||o.change!=null
    ||o.chance.numerator!=='1'||o.chance.denominator!=='1'||o.quantity?.kind!=='potential'
    ||o.quantity.stat!=='witchery:ritualWorldItem'||o.quantity.condition!=='admittedActionListAndNativeWorld'
    ||o.quantity.sample!=null||o.quantity.parameters!=null||!/^\d+$/.test(o.quantity.nominal)
    ||BigInt(o.quantity.nominal)<1n||BigInt(o.quantity.nominal)>2147483647n||items&&!items.has(o.id))invalid();
}
export function nativeRitualNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ?`Native ritual ${p.selected+1}: physical items first resolve through the brew registry, preserving its wildcard dispatch and cached Java key hashes. Original requirements compare action item/metadata literally, including 32767, ignore NBT and counts, and keep duplicate needs. The first matching original definition wins; extra actions are allowed. The final specimen is the trigger. This describes an action list after native admission, not a complete brewing sequence: admission before the trigger, action nullification, a boiling full 3000 mB cauldron, altar access and world conditions remain required. Trigger cost ${p.triggerPower} is not total brew power. Completion conditionally spawns a world item; fixed batch consumption and yield are not guaranteed.`
    :`原生仪式第 ${p.selected+1} 项：物理材料先按酿造注册表转换为动作，保留通配分派与缓存的 Java 键哈希。原始需求再按动作的字面物品和元数据匹配（32767 也按字面比较），忽略 NBT 与堆叠数，重复需求需分别满足。首条满足的原始定义优先，允许额外动作；最后一项样本是触发材料。这里描述原生准入后的动作列表，不模拟完整酿造顺序；触发前准入、动作抵消、沸腾且满 3000 mB 的锅、祭坛与世界条件仍需满足。触发动作能量 ${p.triggerPower} 不是整个酿造总耗能。完成后有条件地在世界生成物品，不保证固定批次投入或产出。`;
}
