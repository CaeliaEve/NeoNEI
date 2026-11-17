import type {Item,Nbt,Recipe} from '@elysium/contracts';
import {nativeNbtInt} from './native-nbt.ts';
import {ariHandlers,isAriSource} from './magic-source.ts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'arcaneSpecial'}>;
type Sticky=Extract<NonNullable<Recipe['process']>,{kind:'stickyJar'}>;
type Stack=Pick<Item,'registry'|'meta'|'nbt'|'tags'>;
const definitions={primalCharm:['dev.rndmorris.salisarcana.common.recipes.RecipeForgivingPrimalCharm',ariHandlers.shaped,['gold','result','shard'],'BASICARTIFACE'],
  photoDeveloping:['witchinggadgets.common.util.recipe.PhotoDevelopingRecipe',ariHandlers.shapeless,['paper','plate','result'],'SCANCAMERA'],
  nodeAttunement:['shukaro.nodalmechanics.recipe.RecipeAttune',ariHandlers.shaped,['matrix','phial'],'NODECATALYZATION']} as const;
function invalid():never {throw new Error('Invalid native inventory-dependent arcane process');}
function tags(item:Stack):Record<string,Nbt>{if(item.nbt==null)return {};if(item.nbt.type!=='compound')invalid();return item.nbt.value;}
function aspects(p:Process,item:Stack):Map<string|null,number>|null{
  const list=tags(item).Aspects,result=new Map<string|null,number>();if(list?.type!=='list'||list.element!=='compound')return result;
  if(list.value.length>4096)invalid();
  for(const row of list.value){if(row.type!=='compound')invalid();const key=row.value.key;if(key==null)continue;
    // An arbitrary compound's native stringification cannot be recovered from canonical JSON.
    if(key.type!=='string')return null;const name=Object.hasOwn(p.aspects,key.value)?key.value:null;
    result.set(name,((result.get(name)??0)+nativeNbtInt(row.value.amount))|0);
  }return result;
}
function combined(p:Process,offered:readonly (Stack|null)[]):Map<string|null,number>|null{
  const values=new Map<string|null,number>();for(const item of offered.slice(1))if(item){const parsed=aspects(p,item);if(parsed==null)return null;
    for(const [name,amount]of parsed)values.set(name,((values.get(name)??0)+Math.trunc(amount/4))|0);}
  const matrix=offered[0];if(!matrix)return null;const initial=aspects(p,matrix);if(initial==null)return null;
  for(const [name,amount]of initial)values.set(name,((values.get(name)??0)+amount)|0);return values;
}
/** Inventory rules only; research, payment, native recipe priority and cached callbacks are external. */
export function arcaneSpecialMatch(p:Process|Sticky,items:ReadonlyMap<string,Item>,offered:readonly (Stack|null)[]):boolean|null{
  if(offered.length!==9)invalid();
  if(p.kind==='stickyJar'){
    const occupied=offered.flatMap((s,i)=>s?[i]:[]);if(occupied.length!==2)return false;
    const at=occupied[0]!,jar=offered[at]!,slime=offered[at+3];
    return occupied[1]===at+3&&slime?.registry==='minecraft:slime_ball'&&p.jars.some(s=>s.registry===jar.registry&&(s.metadata===32767||s.metadata===jar.meta))
      &&(nativeNbtInt(tags(jar).isStickyJar)<<24>>24)===0;
  }
  const role=(name:string)=>items.get(p.roles[name]??'')??invalid();
  if(p.operation==='primalCharm'){
    const shard=role('shard'),gold=role('gold'),found=new Set<number>();
    for(const slot of [0,1,2,6,7,8]){const s=offered[slot];if(!s||s.registry!==shard.registry||s.meta<0||s.meta>5)return false;found.add(s.meta);}
    return found.size===6&&[3,5].every(slot=>offered[slot]?.registry===gold.registry)&&offered[4]?.registry===shard.registry&&offered[4]?.meta===6;
  }
  if(p.operation==='photoDeveloping'){
    const plate=role('plate'),paper=role('paper');let plates=0,papers=0,inks=0;
    for(const s of offered)if(s){if(s.registry===plate.registry&&s.meta===9){if(s.nbt==null||++plates>1)return false;}
      else if(s.registry===paper.registry)papers++;else if(s.tags.some(t=>p.inkNames.includes(t)))inks++;else return false;}
    return plates===1&&papers===p.count&&inks===papers;
  }
  const matrix=role('matrix'),phial=role('phial');let matrices=0,phials=0,known=false;
  for(const s of offered)if(s){if(s.registry===matrix.registry&&s.meta===matrix.meta){if(++matrices>1)return false;}
    else if(s.registry===phial.registry&&s.meta===phial.meta){if(s.nbt==null)return false;const values=aspects(p,s);if(values==null)return null;if(values.size===0)return false;known=true;phials++;}
    else return false;}
  return matrices===1&&phials===p.count&&known;
}
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function validateArcaneSpecialRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;
  if(p?.kind==='stickyJar'){validateStickyRecipe(p,r,items);return;}
  if(p?.kind!=='arcaneSpecial')return;const d=definitions[p.operation]??invalid();
  if(p.nativeRecipe!==d[0]||!isAriSource(r.source,d[1])||canonical(Object.keys(p.roles).sort())!==canonical(d[2])||Object.keys(p.aspects).length>4096
    ||r.duration!=null||r.energy!=null||Object.keys(r.properties).length||!Number.isInteger(p.count))invalid();
  const cost=r.magic;if(cost?.kind!=='arcane'||cost.central!=null||cost.instability!=null||cost.payment!=null||cost.research.length!==1||cost.research[0]?.key!==d[3])invalid();
  const primal=p.operation==='primalCharm',photo=p.operation==='photoDeveloping';
  if(primal?p.count!==1||r.inputs.length!==9||r.grid?.width!==3||r.grid?.height!==3||r.grid?.mirror||r.grid.cells.some((v,i)=>v!==i)
    :p.count<1||p.count>(photo?4:8)||r.inputs.length!==1+p.count*(photo?2:1)||r.grid!=null)invalid();
  if(photo?p.inkNames.length===0||p.inkNames.length>4096||p.inkNames.some(s=>s.toLowerCase()!=='dyeblack'):p.inkNames.length!==0)invalid();
  for(const [slot,input]of r.inputs.entries()){
    if(input.kind!=='item'||input.slot!==slot||!input.choices.length||input.choices.some(c=>c.amount!=='1'))invalid();
    if(!primal&&slot<=(photo?p.count:8)&&input.choices.length!==1)invalid();
    if(primal){if([3,4,5].includes(slot)?input.choices.length!==1:input.choices.length!==6)invalid();}
  }
  const out=r.outputs[0];if(r.outputs.length!==1||out?.kind!=='item'||out.slot!==0||out.role!=='result'||out.change!=null||out.quantity!=null||out.chance.numerator!=='1'||out.chance.denominator!=='1')invalid();
  const expected=new Map<string,string>();for(const tag of photo?['aer','aqua','ordo']:['aer','aqua','ignis','ordo','perditio','terra']){
    const id=p.aspects[tag]??invalid();expected.set(id,String(primal?25:photo?5*p.count:2));}
  if(cost.aspects.length!==expected.size||cost.aspects.some(a=>expected.get(a.aspect)!==a.amount))invalid();
  if(!items)return;
  const role=(name:string)=>items.get(p.roles[name]??'')??invalid(),first=r.inputs.map(i=>items.get(i.choices[0]!.id)??invalid());
  for(const [slot,input]of r.inputs.entries())for(const c of input.choices){
    const s=items.get(c.id)??invalid();
    if(primal){const gold=slot===3||slot===5;if(s.registry!==role(gold?'gold':'shard').registry||c.rule.kind!=='wildcard'||!c.rule.nbt||c.rule.meta!==gold
      ||!gold&&(slot===4?s.meta!==6:s.meta<0||s.meta>5))invalid();}
    else if(photo){if(slot===0?s.registry!==role('plate').registry||s.meta!==9||s.nbt==null:slot<=p.count?s.registry!==role('paper').registry
      :c.rule.kind!=='ore'||c.rule.exclusive||!p.inkNames.includes(c.rule.name))invalid();}
    else{const base=role(slot===0?'matrix':'phial');if(s.registry!==base.registry||s.meta!==base.meta||c.rule.kind!=='wildcard'||c.rule.meta||!c.rule.nbt)invalid();}
  }
  const offered:(Stack|null)[]=[...first];while(offered.length<9)offered.push(null);if(arcaneSpecialMatch(p,items,offered)!==true)invalid();
  let base:Item,nbt:Nbt|null|undefined,amount:string;
  if(primal){base=role('result');nbt=base.nbt;amount='1';}
  else if(photo){base=role('result');if(base.registry!==role('plate').registry||base.meta!==10||role('plate').meta!==9)invalid();nbt=first[0]!.nbt;amount=String(p.count);}
  else{base=first[0]!;if(role('phial').meta!==1||role('matrix').registry===role('phial').registry)invalid();const values=combined(p,offered)??invalid();
    const value:Nbt[]=Array.from(values).flatMap(([key,amount]):Nbt[]=>key==null?[]:[{type:'compound',value:{key:{type:'string',value:key},amount:{type:'int',value:String(amount)}}}]);
    nbt={type:'compound',value:{...tags(base),Aspects:{type:'list',element:value.length?'compound':'end',value}}};amount='1';}
  const result=items.get(out.id)??invalid();if(result.registry!==base.registry||result.meta!==base.meta||canonical(result.nbt)!==canonical(nbt)||out.amount!==amount)invalid();
}
function validateStickyRecipe(p:Sticky,r:Recipe,items?:ReadonlyMap<string,Item>):void{
  if(p.nativeRecipe!=='makeo.gadomancy.common.crafting.RecipeStickyJar'||!isAriSource(r.source,ariHandlers.shaped)||!p.jars.length||p.jars.length>4096
    ||p.jars.some(s=>!s.registry||s.registry.length>512||!Number.isInteger(s.metadata)||s.metadata<0)
    ||r.inputs.length!==2||r.outputs.length!==1||r.duration!=null||r.energy!=null||Object.keys(r.properties).length
    ||r.grid?.width!==1||r.grid?.height!==2||r.grid.mirror||canonical(r.grid.cells)!=='[0,1]')invalid();
  const cost=r.magic;if(cost?.kind!=='arcane'||cost.central!=null||cost.instability!=null||cost.payment!=null||cost.research.length!==1||cost.aspects.length!==2||cost.aspects.some(a=>a.amount!=='10'))invalid();
  for(const [slot,input]of r.inputs.entries()){
    if(input.kind!=='item'||input.slot!==slot||!input.choices.length)invalid();for(const c of input.choices){
      if(c.amount!=='1'||c.consume.kind!=='consume'||c.returns.length||c.rule.kind!=='wildcard'||!c.rule.nbt)invalid();
      if(items){const item=items.get(c.id)??invalid();if(slot===1?item.registry!=='minecraft:slime_ball'||!c.rule.meta
        :!p.jars.some(s=>s.registry===item.registry&&(c.rule.kind==='wildcard'&&c.rule.meta?s.metadata===32767:s.metadata===item.meta))||(nativeNbtInt(tags(item).isStickyJar)<<24>>24)!==0)invalid();}
    }
  }
  const out=r.outputs[0]!,change=out.change??invalid(),action=change.action;
  if(out.kind!=='item'||out.slot!==0||out.role!=='result'||out.quantity!=null||out.amount!=='1'||out.chance.numerator!=='1'||out.chance.denominator!=='1'
    ||change.input!==0||change.bindings!=null||change.samples.length!==r.inputs[0]!.choices.length||action.kind!=='patch'
    ||canonical(action.set)!==canonical({isStickyJar:{type:'byte',value:'1'}})||Object.keys(action.limits).length)invalid();
  if(items)for(const [i,c]of r.inputs[0]!.choices.entries()){
    const item=items.get(c.id)??invalid(),sample=change.samples[i]??invalid(),result=items.get(sample.id)??invalid();
    if(sample.amount!=='1'||result.registry!==item.registry||result.meta!==item.meta||canonical(result.nbt)!==canonical({type:'compound',value:{...tags(item),isStickyJar:{type:'byte',value:'1'}}}))invalid();
  }
  if(out.id!==change.samples[0]?.id)invalid();
}
export function arcaneSpecialNote(p:Process|Sticky,locale:'zh-CN'|'en-US'='zh-CN'):string{
  const en=locale==='en-US';
  if(p.kind==='stickyJar')return en?'One registered nonsticky jar, with one slime ball immediately below it. This vertical pair can translate within the 3×3 workbench; every other cell is empty. Jar metadata follows its native registration, including wildcard 32767. Only native getBoolean(isStickyJar) must be false; a present false/nonnumeric tag is not rejected as absent. Result copies the jar and other NBT, sets isStickyJar to byte 1 and count to one. Costs 10 WATER and 10 EARTH before payment rules. GUI-only cycling entries are not executable recipes.':'一个原生注册且尚未黏着的罐子，其正下方放一个黏液球；这对上下格可在 3×3 工作台平移，其余格为空。罐子按注册元数据匹配，包括 32767 通配；只要求原生 getBoolean(isStickyJar) 为假，已存在的假值／非数字标签也不会被当成必须缺失而拒绝。结果复制罐子和其他 NBT，将 isStickyJar 设为 byte 1、数量设为一。支付规则前费用为水、地各 10；仅供 GUI 轮播的条目不作为可执行配方。';
  const rule=p.operation==='primalCharm'?(en?'Six distinct primal shard metadata values 0–5 occupy outer cells 0,1,2,6,7,8 in any order; gold ingots are in 3 and 5, balanced shard 6 in 4. NBT/count do not affect matching. Cost: 25 of each primal.':'外圈 0、1、2、6、7、8 格任意排列元数据 0–5 的六种各不相同碎片；3、5 格放金锭，4 格放元数据 6 平衡碎片。NBT／数量不影响匹配，每种原始要素费用为 25。')
    :p.operation==='photoDeveloping'?(en?`Exactly one tagged photo plate (metadata 9), ${p.count} paper cells and the same number of black-dye cells. Every other cell is empty. Paper is tested before dye membership. Output metadata 10 copies the plate NBT and has one photo per paper cell; each of AIR, WATER and ORDER costs 5 per paper cell.`:`恰好一格带 NBT 的元数据 9 感光板、${p.count} 格纸和同样格数的黑色染料，其余格为空；先判断纸，再判断染料矿辞。产物元数据 10，复制感光板 NBT，数量为纸的格数；风、水、秩序各按每格纸 5 点计费。`)
    :(en?`One matrix and ${p.count} tagged essence phials, with no other items. Each phial must parse at least one aspect entry. Duplicate entries add with signed int wrapping before each phial amount is divided by 4, truncating toward zero; zero and unknown/null aspect entries retain native behavior. Contributions then add the matrix's existing aspects. A successful match caches a matrix copy with its offered count and unrelated tags retained; the Aspects list is rewritten. getCraftingResult returns that last successful cache. Cost: 2 of every primal.`:`一格矩阵与 ${p.count} 格带 NBT 的源质瓶，不含其他物品。每瓶必须读到至少一条要素；重复条目先按原生有符号整数溢出相加，再将每瓶数量除以 4 向零取整；保留零量和未知／空要素的原生行为。随后加入矩阵已有要素。匹配成功缓存矩阵副本，保留矩阵实际堆叠数量与其他标签，仅重写 Aspects 列表；getCraftingResult 返回上次成功缓存。每种原始要素费用为 2。`);
  return rule+(en?' Displayed inputs/results are valid specimens. Research, workbench priority and Vis payment remain execution conditions; there is no fixed processing duration.':'展示输入和产物是有效样本；研究、工作台优先级与 Vis 支付仍是执行条件，没有固定加工耗时。');
}
