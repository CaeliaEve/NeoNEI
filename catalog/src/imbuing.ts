import type {Item,Recipe} from '@elysium/contracts';
import {nativeNbtEqual} from './native-nbt.ts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'randomThingsImbuing'}>;
type Predicate=Process['definitions'][number]['base'];
type Offered={item:Pick<Item,'registry'|'meta'|'nbt'|'tags'>;instance:string}|null;
const handler='lumien.randomthings.Handler.ModCompability.NEI.ImbuingStationRecipeHandler';
const invalid=():never=>{throw new Error('Invalid RandomThings native imbuing process');};
function accepts(s:Predicate,offered:Offered):boolean{
  if(!offered)return false;const item=offered.item;
  return s.registry===item.registry&&s.metadata===item.meta&&nativeNbtEqual(s.nbt,item.nbt)||s.ores.some(ore=>item.tags.includes(ore));
}
/** The caller supplies native key order, never a guessed stable identity hash from an entity ID. */
export function imbuingSelect(p:Process,offered:readonly Offered[],keyOrder:readonly number[]):number|null{
  if(offered.length!==4||keyOrder.length!==3||new Set(keyOrder).size!==3||keyOrder.some(i=>i<0||i>2))invalid();
  const keys:number[]=[],instances=new Set<string>();
  for(const cell of keyOrder){const key=offered[cell]?.instance??'@native-null-key';if(instances.has(key))continue;instances.add(key);keys.push(cell);}
  for(const [index,d]of p.definitions.entries()){
    if(!accepts(d.base,offered[3]!))continue;const marked=new Set<number>();let matched=true;
    for(const requirement of d.ingredients){const cell=keys.find(cell=>accepts(requirement,offered[cell]!));if(cell==null){matched=false;break;}marked.add(cell);}
    if(matched&&keys.every(cell=>offered[cell]==null||marked.has(cell)))return index;
  }return null;
}
/** All six possible orders expose uncertainty without pretending to know JVM identity hash order. */
export function imbuingOutcomes(p:Process,offered:readonly Offered[]):readonly (number|null)[]{
  const results=new Set<number|null>();for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]])results.add(imbuingSelect(p,offered,order));return [...results];
}
function predicate(s:Predicate):void{if(!s.registry||s.registry.length>512||s.metadata< -1||s.ores.length>4096||new Set(s.ores).size!==s.ores.length||s.ores.some(s=>!s||s.length>512))invalid();}
export function validateImbuingRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;if(p?.kind!=='randomThingsImbuing'){if(r.source.handler===handler)invalid();return;}
  if(p.version!=='2.6.6'||r.source.owner!=='RandomThings'||r.source.handler!==handler||!/^[0-9a-f]{8}$/.test(p.thresholdBits)||p.baseInput!==65535||p.baseSlot!==3||p.reagentSlots!==3||p.outputSlot!==4
    ||!p.definitions.length||p.definitions.length>4096||r.duration!=null||r.energy!=null||r.grid!=null||r.magic!=null||Object.keys(r.properties).length)invalid();
  let total=0;for(const d of p.definitions){predicate(d.base);total+=d.ingredients.length;if(total>262144||d.ingredients.length>65536||d.outputAlias>=p.definitions.length)invalid();for(const s of d.ingredients)predicate(s);}
  const d=p.definitions[p.selected]??invalid();if(r.inputs.length!==d.ingredients.length+1)invalid();
  for(const [index,input]of r.inputs.entries()){
    const base=index===d.ingredients.length,s=base?d.base:d.ingredients[index]!;
    if(input.kind!=='item'||input.slot!==(base?65535:index)||!input.choices.length)invalid();
    for(const c of input.choices){
      if(c.amount!=='1'||c.consume.kind!=='allocated'||c.returns.length||!(c.rule.kind==='exact'||c.rule.kind==='ore'&&!c.rule.exclusive&&s.ores.includes(c.rule.name)))invalid();
      if(items){const item=items.get(c.id)??invalid();if(c.rule.kind==='exact'?(item.registry!==s.registry||item.meta!==s.metadata||!nativeNbtEqual(item.nbt,s.nbt)):c.rule.kind==='ore'&&!item.tags.includes(c.rule.name))invalid();}
    }
  }
  if(p.result.amount.length>11||!/^(0|-?[1-9][0-9]*)$/.test(p.result.amount))invalid();const n=BigInt(p.result.amount);if(n< -2147483648n||n>2147483647n||items&&!items.has(p.result.id)||r.outputs.length!==(n>0n?1:0))invalid();
  if(n>0n){const o=r.outputs[0]!;if(o.kind!=='item'||o.role!=='result'||o.slot!==0||o.id!==p.result.id||o.amount!=null||o.change!=null||o.chance.numerator!=='1'||o.chance.denominator!=='1'
    ||o.quantity?.kind!=='potential'||o.quantity.stat!=='randomthings:imbuingState'||o.quantity.nominal!==(n>64n?'64':n.toString())||o.quantity.sample!=null||!o.quantity.condition||o.quantity.parameters!=null)invalid();}
}
export function imbuingNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  const buffer=new DataView(new ArrayBuffer(4));buffer.setUint32(0,Number.parseInt(p.thresholdBits,16));const threshold=buffer.getFloat32(0);
  return locale==='en-US'
    ?`Native imbuing threshold: ${threshold}. Slot 3 is the base. Requirements scan the first matching identity-HashMap key among slots 0..2 and may reuse a marked key; every non-null key must eventually be marked. Shared object aliases collapse to one key. Overlap depends on native identity-hash order and cannot be inferred from a stable item ID. Match full item/meta/NBT (ignoring count) or shared ores; the first recipe wins. Completion removes one from all four input slots without container return. A changed output reference updates/resets the cache only when the new output fits; the same reference skips capacity rechecks, and a blocked new result may retain the old cached output. Signed int progress compares against the native float threshold, including NaN/infinity. First insertion clamps to 64; existing output applies signed count mutation. This is a conditional result, not fixed per-requirement consumption.`
    :`原生注入阈值：${threshold}。槽 3 为中心物品；要求在槽 0..2 的对象身份 HashMap 中取首个匹配键，可重复使用已标记键，最后每个非空键都必须被标记。同一物品堆对象的别名会合为一键；重叠匹配依赖原生对象哈希顺序，不能用稳定物品 ID 推断。按完整物品／元数据／NBT（忽略数量）或共享矿辞匹配，首条配方优先。完成扣四个输入槽各一件，无容器返还。新输出引用只有能放入时才更新缓存并清进度；相同引用不复检容量，被阻挡的新配方可能继续旧缓存产物。signed int 进度比较原生 float 阈值，保留 NaN／无穷行为。首次插入限 64，已有输出按有符号数量变更。这里是条件产物，不按要求个数保证固定消耗。`;
}
