import type {Item, Nbt, Recipe} from '@elysium/contracts';
import {nativeNbtEqual, nativeNbtInt} from './native-nbt.ts';
import {ariHandlers,isAriSource} from './magic-source.ts';

type Process = Extract<NonNullable<Recipe['process']>, {kind:'salisReplacement'}>;
type Rule = Recipe['inputs'][number]['choices'][number]['rule'];
type InventoryRecipe = Pick<Recipe, 'inputs'>;
function invalid():never {throw new Error('Invalid native Salis wand replacement');}
const int = (v:number) => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
const primal = ['aer','aqua','ignis','ordo','perditio','terra'];
const own = (o:object, key:string) => Object.hasOwn(o,key);
const tags = (item:Item):Readonly<Record<string,Nbt>> => item.nbt?.type === 'compound' ? item.nbt.value : {};

function primitive(rule:Rule, offered:Item, anchor:Item):boolean {
  if(rule.kind === 'ore') return offered.tags.includes(rule.name) && (!rule.exclusive || offered.tags.length === 1);
  if(offered.registry !== anchor.registry) return false;
  if(rule.kind === 'wildcard') return (rule.meta || offered.meta === anchor.meta) && (rule.nbt || nativeNbtEqual(offered.nbt,anchor.nbt));
  if(rule.kind === 'tags') {
    const actual = tags(offered), expected = tags(anchor);
    return (rule.meta || offered.meta === anchor.meta)
      && rule.keys.every(key => nativeNbtEqual(actual[key],expected[key]))
      && rule.present.every(key => own(actual,key)) && rule.absent.every(key => !own(actual,key));
  }
  return invalid();
}
function accepts(rule:Rule, offered:Item, anchor:Item, items:ReadonlyMap<string,Item>):boolean {
  if(rule.kind !== 'except') return primitive(rule,offered,anchor);
  if(rule.exclude.length === 0 || rule.exclude.length > 4096 || rule.base.kind === 'except') invalid();
  return primitive(rule.base,offered,anchor) && !rule.exclude.some(entry => {
    if(entry.rule.kind !== 'wildcard' || !entry.rule.nbt) invalid();
    return primitive(entry.rule,offered,items.get(entry.id) ?? invalid());
  });
}

// Broad ore/ignored-NBT specimens share one predicate. Avoid comparing every
// displayed screw permutation against every other displayed permutation.
function domain(r:InventoryRecipe, items:ReadonlyMap<string,Item>):Array<Array<{rule:Rule; anchor:Item}>> {
  return r.inputs.map(input => {
    const cases = new Map<string,{rule:Rule; anchor:Item}>();
    for(const choice of input.choices) {
      const anchor = items.get(choice.id) ?? invalid(), rule = choice.rule;
      const base = rule.kind === 'except' ? rule.base : rule;
      let state:unknown;
      if(base.kind === 'ore') state = null;
      else if(base.kind === 'wildcard') state = [anchor.registry,base.meta ? null : anchor.meta,base.nbt ? null : anchor.nbt];
      else if(base.kind === 'tags') state = [anchor.registry,base.meta ? null : anchor.meta,base.keys.map(key=>tags(anchor)[key] ?? null)];
      else invalid();
      cases.set(JSON.stringify([rule,state]),{rule,anchor});
    }
    return [...cases.values()];
  });
}

/** First nine physical cells; quantity never substitutes for another occupied cell.
 * The source reader partitions component, wand, conductor and screw domains before
 * publishing them. This only evaluates those finite identity predicates.
 */
export function salisInventoryMatch(r:InventoryRecipe, inventory:readonly (Item|null)[], items:ReadonlyMap<string,Item>):boolean {
  if(r.inputs.length < 1 || r.inputs.length > 9) return false;
  const groups = domain(r,items), remaining = r.inputs.map((_,i)=>i);
  for(const item of inventory.slice(0,9)) if(item != null) {
    const at = remaining.findIndex(slot=>groups[slot]!.some(c=>accepts(c.rule,item,c.anchor,items)));
    if(at < 0) return false;
    remaining.splice(at,1);
  }
  return remaining.length === 0;
}

export function validateSalisWandRecipe(r:Recipe, items?:ReadonlyMap<string,Item>):void {
  const p = r.process;
  if(p?.kind !== 'salisReplacement') {
    if(r.outputs.some(o=>o.change?.action.kind === 'salisWand')) invalid();
    return;
  }
  const core = p.part === 'rod';
  if(p.nativeRecipe !== 'dev.rndmorris.salisarcana.common.recipes.ReplaceWand' + (core?'Core':'Caps') + 'Recipe'
    || !isAriSource(r.source,ariHandlers.shapeless)
    || r.grid != null || r.duration != null || r.energy != null || Object.keys(r.properties).length !== 0
    || !int(p.cost) || !int(p.chargeCapacity) || p.chargeCapacity < 0 || !int(p.resultCapacity) || p.resultCapacity < 0
    || p.selfPayment && p.staff || p.targetStaff && !core || core && p.enforceStaff && p.staff !== p.targetStaff
    || p.paymentCondition !== 'loadedSalisWorkbenchMixinAndNativePlayerPayment') invalid();
  const roles:string[] = ['center','part'];
  if(core && p.material) {
    if(!p.material.screw || p.material.screw.length > 4096 || p.material.screws !== (p.sceptre?2:4)
      || !p.material.conductor.registry || !int(p.material.conductor.metadata)) invalid();
    roles.push(...Array<string>(p.material.screws).fill('screw'),'conductor','conductor');
  } else if(!core) {
    if(p.material != null) invalid();
    roles.push(...Array<string>(p.sceptre?2:1).fill('part'));
  }
  if(JSON.stringify(roles) !== JSON.stringify(p.roles) || roles.length !== r.inputs.length || r.outputs.length !== 1) invalid();
  const magic = r.magic;
  if(magic?.kind !== 'arcane' || magic.central != null || magic.instability != null || magic.research.length < 1 || magic.research.length > 2
    || (magic.payment != null) !== p.selfPayment) invalid();
  if(p.cost < 0 ? magic.aspects.length !== 0 || !magic.creative : magic.aspects.length !== 6 || new Set(magic.aspects.map(a=>a.aspect)).size !== 6 || magic.aspects.some(a=>a.amount !== String(p.cost))) invalid();
  if(magic.payment && (magic.payment.input !== 0 || magic.payment.capacity !== p.resultCapacity || magic.payment.preserve !== p.preserve
    || Object.keys(magic.payment.charges).length !== 6 || new Set(Object.values(magic.payment.charges)).size !== 6
    || Object.values(magic.payment.charges).some(key=>!primal.includes(key)))) invalid();
  for(const [slot,input] of r.inputs.entries()) {
    if(input.kind !== 'item' || input.slot !== slot || !input.choices.length || input.choices.length > 65536) invalid();
    const prior = roles.slice(0,slot).indexOf(roles[slot]!);
    if(prior >= 0 && JSON.stringify(input.choices) !== JSON.stringify(r.inputs[prior]!.choices)) invalid();
    for(const c of input.choices) {
      if(c.amount !== '1' || !['consume','keep','damage','gtTool','nativeContainer'].includes(c.consume.kind)) invalid();
      const base = c.rule.kind === 'except' ? c.rule.base : c.rule;
      if(roles[slot] === 'center') {
        if(!(base.kind === 'wildcard' && !base.meta && base.nbt || base.kind === 'tags' && base.meta)) invalid();
      } else if(roles[slot] === 'screw') {
        if(c.rule.kind !== 'except' || base.kind !== 'ore' || base.exclusive || base.name !== p.material?.screw) invalid();
      } else if(c.rule.kind !== 'wildcard' || c.rule.meta || !c.rule.nbt) invalid();
    }
  }
  const output = r.outputs[0]!, change = output.change, action = change?.action;
  if(action?.kind !== 'salisWand' || !change || change.input !== 0 || change.bindings != null || action.metadata !== Math.max(p.cost,0)
    || output.kind !== 'item' || output.slot !== 0 || output.role !== 'result' || output.amount !== '1' || output.quantity != null
    || output.chance.numerator !== '1' || output.chance.denominator !== '1' || change.samples.length !== r.inputs[0]!.choices.length
    || output.id !== change.samples[0]?.id || change.samples.some(s=>s.amount !== '1')) invalid();
  const component = core?'rod':'cap';
  if(action.set[component]?.type !== 'string' || !action.set[component]!.value) invalid();
  const written = new Set<string>([component]);
  if(p.targetStaff) {
    if(p.staffAttributes?.type !== 'list' || p.staffAttributes.element !== 'compound' || p.staffAttributes.value.length !== 1
      || !nativeNbtEqual(p.staffAttributes,action.set.AttributeModifiers)) invalid();
    written.add('AttributeModifiers');
  } else if(p.staffAttributes != null) invalid();
  if(!p.preserve) {
    primal.forEach(key=>written.add(key));
    if(Object.keys(action.limits).length !== 0
      || primal.some(key=>action.set[key]?.type !== 'int' || action.set[key]!.value !== '0')) invalid();
  } else if(core
    ? Object.keys(action.limits).length !== 6 || primal.some(key=>action.limits[key] !== p.chargeCapacity)
    : Object.keys(action.limits).length !== 0) invalid();
  if(Object.keys(action.set).length !== written.size || Object.keys(action.set).some(key=>!written.has(key))) invalid();
  if(!items) return;
  const groups = domain(r,items);
  for(const [slot,input] of r.inputs.entries()) for(const c of input.choices) {
    const item = items.get(c.id) ?? invalid();
    if(!accepts(c.rule,item,item,items)) invalid();
    if(roles[slot] === 'conductor' && (item.registry !== p.material?.conductor.registry || item.meta !== p.material.conductor.metadata)) invalid();
    for(const [other,group] of groups.entries()) if(roles[other] !== roles[slot] && group.some(v=>accepts(v.rule,item,v.anchor,items))) invalid();
  }
  if(!salisInventoryMatch(r,r.inputs.map(i=>items.get(i.choices[0]!.id) ?? invalid()),items)) invalid();
  for(const [index,c] of r.inputs[0]!.choices.entries()) {
    const original = items.get(c.id) ?? invalid(), result = items.get(change.samples[index]!.id) ?? invalid();
    if(original.nbt != null && original.nbt.type !== 'compound') invalid();
    const values:Record<string,Nbt> = {...tags(original),...action.set};
    for(const [key,limit] of Object.entries(action.limits)) values[key] = {type:'int',value:String(Math.min(nativeNbtInt(values[key]),limit))};
    if(original.registry !== result.registry || result.meta !== action.metadata || !nativeNbtEqual({type:'compound',value:values},result.nbt)) invalid();
  }
}

export function salisReplacementNote(p:Process, locale:'zh-CN'|'en-US'='zh-CN'):string {
  const en = locale === 'en-US', metadata = Math.max(p.cost,0);
  const inventory = en
    ? 'Only the first nine inventory cells participate. Components are classified before wands; conductors take priority over screw ore membership. Counts mean occupied cells, regardless of stack size; extra cells reject the match. Each used cell takes one item with its audited native container or tool rule. '
    : '只检查库存前九格；先识别组件，再识别法杖，导体优先于螺丝矿辞。数量按占用格数计算，堆叠数量不能代替格数，多余材料使匹配失败。使用的每格取用一件，另按已审查的原生容器或工具规则处理。';
  const change = en
    ? 'The result copies the input and changes its ' + (p.part === 'rod'?'rod':'caps') + '. '
      + (p.preserve?(p.part === 'rod'?'Stored charge is first clamped to ' + p.chargeCapacity + ' before metadata resets. ':'Cap replacement preserves charge without that first clamp. '):'The six primal charge tags are cleared. ')
      + 'Metadata then resets to max(signed crafting cost ' + p.cost + ', 0) = ' + metadata + '. Metadata-indexed bracelets can consequently resolve different effective components. '
    : '产物复制原物并更换' + (p.part === 'rod'?'杖芯':'杖端') + '。'
      + (p.preserve?(p.part === 'rod'?'储能先按元数据重设前的容量 ' + p.chargeCapacity + ' 裁剪。':'更换杖端保留储能，不进行第一次容量裁剪。'):'清空六项基础要素储能。')
      + '随后将元数据重设为 max(有符号合成费用 ' + p.cost + ', 0) = ' + metadata + '；按元数据索引组件的手环可能因此改变有效组件。';
  const payment = p.selfPayment ? (en
    ? 'Optional self-payment requires the loaded Salis workbench mixin, an empty supply slot and no prior normal result. The old components and native player discounts determine payment. '
      + (p.preserve?'After payment, remaining charge is clamped again to the result capacity ' + p.resultCapacity + '.':'After payment, the six charges are cleared.')
      + ' Configuration alone does not prove that the mixin executed. '
    : '可选自付款要求 Salis 工作台 Mixin 实际加载、供能槽为空且普通配方没有先产出结果；按旧部件与玩家原生折扣付款。'
      + (p.preserve?'付款后的余量再按结果容量 ' + p.resultCapacity + ' 裁剪。':'付款后清空六项储能。')
      + '仅配置开启不能证明 Mixin 已执行。') : (en
    ? 'The normal path needs a separate eligible supply wand. '
    : '普通路径需要独立且可用的供能法杖。');
  const attributes=p.targetStaff?(en?'A staff rod replaces the entire native AttributeModifiers list. ':'长杖杖芯会整体替换原生 AttributeModifiers 列表。'):'';
  return inventory + change + attributes + payment + (en
    ? 'Shown outputs are unpaid state specimens, conditional on research, native registration priority and live workbench/player state.'
    : '所示产物是尚未付款的状态样本；仍需满足研究、原生注册优先级以及工作台和玩家的实际条件。');
}
