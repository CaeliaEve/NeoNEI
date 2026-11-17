import type {Item,Output,Recipe} from '@elysium/contracts';
import {nativeNbtEqual} from './native-nbt.ts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'witcheryNativeOven'}>;
type Stack=Pick<Item,'registry'|'meta'|'nbt'>;
function invalid():never {throw new Error('Invalid actual WitcheryExtras oven rules');}
const roles=['jar','exhale','hint','breath','whiff','reek','odour','foul'] as const;
const integer=(v:number,min=-2147483648)=>Number.isInteger(v)&&v>=min&&v<=2147483647;
const registry=(v:string)=>v.length<=4096&&v.indexOf(':')>0&&!v.endsWith(':');
function selector(s:Process['definitions'][number]['input'],item:Stack):boolean{
  return s!=null&&s.registry===item.registry&&(s.metadata===32767||item.meta===32767||s.metadata===item.meta)&&nativeNbtEqual(s.nbt,item.nbt);
}
/** The actual Mixin selects literal stacks; its separate ore helper is not consulted. */
export function nativeOvenSelect(p:Process,item:Stack,jars:number):number|null{
  if(!integer(jars))invalid();const index=p.definitions.findIndex(d=>d.jars<=jars&&selector(d.input,item));return index<0?null:index;
}
export function nativeOvenSmelt(p:Process,item:Stack):Process['furnace'][number]['output']|null{
  return p.furnace.find(d=>d.metadata===32767||d.metadata===item.meta)?.output??null;
}
type Prototype=Process['furnace'][number]['output'];
const sameItem=(a:Prototype,b:Prototype)=>a.registry===b.registry&&a.metadata===b.metadata;
/** Runtime limits are supplied by the observed inventory/item state, never guessed as 64. */
export function nativeOvenMainTransition(p:Process,input:Stack,jars:number,current:Prototype|null,inventoryLimit:number,gateStackLimit:number):
  {status:'blocked'|'completed'|'native_error';selected:number|null;output:Prototype|null;inputDebit:number}{
  const selected=nativeOvenSelect(p,input,jars),blocked=()=>({status:'blocked' as const,selected,output:current,inputDebit:0});
  if(!integer(inventoryLimit)||!integer(gateStackLimit))invalid();if(selected==null)return blocked();
  if(current){const gate=p.definitions[selected]!.gate;if(!gate)return {status:'native_error',selected,output:current,inputDebit:0};
    const count=(current.count+gate.count)|0;if(!sameItem(current,gate)||count>inventoryLimit||count>gateStackLimit)return blocked();}
  const native=nativeOvenSmelt(p,input);if(!native)return {status:'native_error',selected,output:current,inputDebit:0};
  const output=current==null?structuredClone(native):sameItem(current,native)?{...current,count:(current.count+native.count)|0}:current;
  return {status:'completed',selected,output,inputDebit:1};
}
/** Contributions follow native direction-query order, including an absent funnel's zero. */
export function nativeOvenByproductTransition(p:Process,roll:number,contributions:readonly number[],jarPresent:boolean,product:Prototype|null,current:Prototype|null,currentStackLimit:number):{output:Prototype|null;jarDebit:number}{
  const filtered=p.filteredDouble?0.8:0.3;
  if(!Number.isFinite(roll)||roll<0||roll>=1||contributions.length!==3||contributions.some(v=>v!==0&&v!==0.25&&v!==filtered)||!integer(currentStackLimit))invalid();
  let extra=0;for(const value of contributions)extra+=value;
  if(!jarPresent||roll>Math.min(1,0.3+extra)||product==null)return {output:current,jarDebit:0};
  if(current==null)return {output:structuredClone(product),jarDebit:1};
  const count=(current.count+product.count)|0;
  return sameItem(current,product)&&count<currentStackLimit?{output:{...current,count},jarDebit:1}:{output:current,jarDebit:0};
}
export function nativeOvenCookTicks(attached:number):number{if(!Number.isInteger(attached)||attached<0||attached>3)invalid();return 180-20*attached;}
function genomeProduct(nbt:Item['nbt']):Process['byproduct']{
  const root=nbt?.type==='compound'?nbt.value:{};if(!Object.hasOwn(root,'Genome'))return 'foul';
  const genome=root.Genome;if(genome?.type!=='compound')return 'none';const chromosomes=genome.value.Chromosomes;
  if(chromosomes?.type!=='list'||chromosomes.element!=='compound')return 'none';const first=chromosomes.value[0];
  if(first?.type!=='compound')return 'none';const uid=first.value.UID0;
  return uid?.type==='string'?uid.value==='forestry.treeOak'?'exhale':uid.value==='forestry.treeSpruce'?'hint':uid.value==='forestry.treeBirch'?'breath':'none':'none';
}
function product(p:Process,item:Stack):Process['byproduct']{
  if(item.registry==='minecraft:sapling'&&item.meta!==3)return item.meta===0?'exhale':item.meta===1?'hint':item.meta===2?'breath':'none';
  if(item.registry===p.witcherySapling)return item.meta===0?'whiff':item.meta===1?'reek':item.meta===2?'odour':'none';
  return p.inputName==='tile.bop.saplings'&&item.meta===6?'hint':genomeProduct(item.nbt);
}
function potential(o:Output,slot:number,stat:string,condition:string,count:number):void{
  if(o.kind!=='item'||o.slot!==slot||o.role!=='result'||o.amount!=null||o.change!=null||o.chance.numerator!=='1'||o.chance.denominator!=='1'
    ||o.quantity?.kind!=='potential'||o.quantity.nominal!==String(count)||o.quantity.stat!==stat||o.quantity.condition!==condition||o.quantity.sample!=null||o.quantity.parameters!=null)invalid();
}
export function validateNativeOvenRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;if(p?.kind!=='witcheryNativeOven')return;
  if(p.version!=='1.3.8'||r.source.owner!=='WitcheryExtras'||r.source.handler!=='alkalus.main.nei.NEI_Handler_Oven'
    ||r.duration!=null||r.energy!=null||r.grid!=null||r.magic!=null||Object.keys(r.properties).length
    ||p.definitions.length>4096||p.furnace.length>65536||!integer(p.selected,0)||!integer(p.jarStock,0)
    ||!registry(p.witcherySapling)||p.inputName!=null&&p.inputName.length>65536)invalid();
  const d=p.definitions[p.selected]??invalid();
  for(const row of p.definitions){if(!integer(row.jars)||row.input&&(!registry(row.input.registry)||!integer(row.input.metadata,0)||row.input.nbt!=null&&row.input.nbt.type!=='compound'))invalid();if(row.gate&&(!registry(row.gate.registry)||!integer(row.gate.metadata,0)||!integer(row.gate.count)||row.gate.nbt!=null&&row.gate.nbt.type!=='compound'))invalid();}
  for(const row of p.furnace)if(!integer(row.metadata,0)||!registry(row.output.registry)||!integer(row.output.metadata,0)||!integer(row.output.count)||row.output.nbt!=null&&row.output.nbt.type!=='compound')invalid();
  if(Object.keys(p.roles).length!==roles.length||roles.some(key=>!p.roles[key]?.startsWith('item_')))invalid();
  if(r.inputs.length!==(p.jarMode==='absent'?1:2))invalid();const input=r.inputs[0]??invalid(),c=input.choices[0]??invalid();
  if(input.kind!=='item'||input.slot!==0||input.choices.length!==1||c.amount!=='1'||c.rule.kind!=='exact'||c.consume.kind!=='consume'||c.returns.length)invalid();
  if(p.jarMode==='absent'){if(p.jarStock!==0||d.jars>0||p.byproduct!=='none'||p.byproductItem!=null)invalid();}
  else{if(p.jarStock!==Math.max(1,d.jars))invalid();const jar=r.inputs[1]??invalid(),c=jar.choices[0]??invalid();
    if(jar.kind!=='item'||jar.slot!==1||jar.choices.length!==1||c.id!==p.roles.jar||c.amount!==String(p.jarStock)||c.consume.kind!=='allocated'||c.rule.kind!=='wildcard'||c.rule.meta||!c.rule.nbt||c.returns.length)invalid();}
  const o=r.outputs[0]??invalid();if(o.quantity?.kind!=='potential'||!/^\d+$/.test(o.quantity.nominal)||BigInt(o.quantity.nominal)<=0n||BigInt(o.quantity.nominal)>2147483647n)invalid();
  potential(o,0,'witchery:ovenMain','nativeOutputInventory',Number(o.quantity.nominal));
  if(p.byproduct==='none'){if(r.outputs.length!==1||p.byproductItem!=null)invalid();}
  else{if(p.jarMode!=='conditional'||p.byproductItem!==p.roles[p.byproduct]||r.outputs.length!==2||r.outputs[1]!.id!==p.byproductItem)invalid();potential(r.outputs[1]!,1,'witchery:ovenByproduct','nativeJarRollAndOutputAccepts',1);}
  if(items){const item=items.get(c.id)??invalid();if(nativeOvenSelect(p,item,p.jarStock)!==p.selected)invalid();
    const main=nativeOvenSmelt(p,item)??invalid(),fact=items.get(o.id)??invalid();
    if(main.count<=0||main.count!==Number(o.quantity.nominal)||fact.registry!==main.registry||fact.meta!==main.metadata||!nativeNbtEqual(fact.nbt,main.nbt))invalid();
    if(p.jarMode==='conditional'&&p.byproduct!==product(p,item))invalid();for(const key of roles)if(!items.has(p.roles[key]!))invalid();
  }
}
export function nativeOvenNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ?`The oven selects the first literal item/NBT match with sufficient jar stock; metadata 32767 on either side is a wildcard. Ore-dictionary membership alone does not satisfy its literal input requirement. The registered result gates an occupied output slot; actual smelting uses the native furnace table. Displayed exact inputs and empty-slot outputs are specimens. Main merging compares item/metadata and retains existing NBT. A slot that passes the registered gate but cannot merge the actual furnace result still consumes the input. A present jar slot enables one shared byproduct roll: min(1, 0.3 + 0.25 × normal funnels + ${p.filteredDouble?'0.8':'0.3'} × filtered funnels), with roll ≤ chance. One jar is removed only when the byproduct is placed; merging must remain strictly below the stack limit. Work requires fuel and 180 − 20 × attached funnels cook ticks, for up to three funnels; this does not promise fixed elapsed time.`
    :`烤炉依注册顺序选择首条物品、完全相同 NBT 及罐子库存满足的配方；两侧任一元数据 32767 均为通配，仅符合矿辞不能替代指定原料。登记产物用于检查已有输出槽的容量，实际主产物来自原生熔炉配方。所示精确输入与空产物槽结果是样本；合并主产物时按物品和元数据比较并保留已有 NBT。已有槽虽通过登记产物检查，却不能合并实际熔炉产物时，原料仍会消耗。罐槽存在时进行一次共享副产物抽取，概率为 min(1, 0.3 + 0.25 × 普通烟囱 + ${p.filteredDouble?'0.8':'0.3'} × 过滤烟囱)，原生比较为随机值 ≤ 概率；只有成功放入才扣一罐，合并后数量必须严格小于堆叠上限。需要燃料及 180 − 20 × 相邻烟囱次烹饪计数，烟囱至多三个，不保证固定墙钟时间。`;
}
