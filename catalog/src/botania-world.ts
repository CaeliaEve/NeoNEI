import type {Item,Nbt,Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'botaniaWorld'}>;
type Selector=Process['predicates'][number][number];
type Offered=Pick<Item,'registry'|'meta'|'nbt'>|null;
function invalid():never {throw new Error('Invalid native Botania world, packed inventory or brew rule');}
const handlers={daisy:'PureDaisy',petal:'PetalApothecary',trade:'ElvenTrade',brewery:'Brewery'};
const text=(value:Nbt|undefined):string|null=>value?.type==='string'?value.value:null;
const compound=(value:Nbt|null|undefined)=>value?.type==='compound'?value.value:null;

function primary(item:NonNullable<Offered>,dominance:Process['speciesDominance']):string|null{
  const root=compound(item.nbt),genome=compound(root?.Genome),chromosomes=genome?.Chromosomes;
  if(chromosomes?.type!=='list'||chromosomes.element!=='compound')return null;
  let selected:string|null=null;
  for(const value of chromosomes.value){const row=compound(value);if(!row)continue;
    const slot=row.Slot;
    const ordinal=slot&&['byte','short','int','long'].includes(slot.type)?Number(BigInt.asIntN(8,BigInt(slot.value as string))):0;
    if(ordinal===0){const a=text(row.UID0),b=text(row.UID1);if(a==null||b==null||!Object.hasOwn(dominance,a)||!Object.hasOwn(dominance,b))return null;selected=dominance[a]||!dominance[b]?a:b;}
  }return selected;
}
function accepts(p:Process,s:Selector,item:Offered):boolean{
  return item!=null&&s.registry===item.registry&&(s.wildcard||s.metadata===item.meta)&&(s.species==null||primary(item,p.speciesDominance)===s.species);
}
function matches(p:Process,groups:Process['predicates'],offered:readonly Offered[]):number[]|null{
  const remaining=groups.map((_,i)=>i),selected:number[]=[];
  for(const item of offered){if(item==null){if(p.machine==='trade')continue;break;}if(!remaining.length&&p.machine==='trade')break;
    const at=remaining.findIndex(i=>groups[i]!.some(s=>accepts(p,s,item)));
    if(at<0){if(p.machine==='trade')continue;return null;}selected.push(remaining.splice(at,1)[0]!);
  }return remaining.length?null:selected;
}
/** Stable admitted inventory. World, seed, portal, mana and cached-state gates remain explicit. */
export function botaniaWorldSelect(p:Process,offered:readonly Offered[]):number[]|null{
  if(p.machine==='daisy'){
    const item=offered.find(i=>i!=null)??null;if(item==null)return null;
    if(p.priority.some(rule=>rule[0]?.some(s=>accepts(p,s,item))))return null;
    return p.predicates[0]?.some(s=>accepts(p,s,item))?[0]:null;
  }
  if(p.priority.some(rule=>matches(p,rule,offered)!=null))return null;
  return matches(p,p.predicates,offered);
}
export function validateBotaniaWorldRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process,names=Object.values(handlers).map(s=>'vazkii.botania.client.integration.nei.recipe.RecipeHandler'+s);
  if(p?.kind!=='botaniaWorld'){if(names.includes(r.source.handler))invalid();return;}
  if(p.version!=='1.12.28-GTNH'||r.source.owner!=='Botania'||r.source.handler!=='vazkii.botania.client.integration.nei.recipe.RecipeHandler'+handlers[p.machine]
    ||r.grid!=null||r.magic!=null||r.duration!=null||r.energy!=null||Object.keys(r.properties).length||p.priority.length>4096
    ||p.inputSlots.length!==p.predicates.length||Object.keys(p.speciesDominance).length>262144)invalid();
  let budget=262144;
  for(const groups of [p.predicates,...p.priority]){if(groups.length>4096)invalid();for(const group of groups){budget-=group.length;if(budget<0)invalid();for(const s of group){
    if(!(s.registry||p.machine==='daisy'&&s.block)||p.machine!=='daisy'&&s.block!=null||s.species!=null&&(p.machine!=='trade'||!s.wildcard))invalid();
  }}}
  let slot=0;
  for(const [index,group]of p.predicates.entries()){
    const actual=p.inputSlots[index];if(actual==null){if(p.machine!=='daisy'||!group.length||group.some(s=>s.registry!=null||s.block==null))invalid();continue;}
    const input=r.inputs[slot];if(actual!==slot||!group.length||input?.kind!=='item'||input.slot!==slot||!input.choices.length)invalid();
    for(const c of input.choices){if(c.amount!=='1'||c.consume.kind!=='consume'||c.returns.length||c.rule.kind!=='wildcard'||!c.rule.nbt)invalid();
      if(items&&!group.some(s=>accepts(p,s,items.get(c.id)??invalid())&&c.rule.kind==='wildcard'&&c.rule.meta===s.wildcard))invalid();}
    slot++;
  }
  if(p.machine==='petal'){const seed=r.inputs[slot++];if(p.seed==null||seed?.kind!=='item'||seed.slot!==16||seed.choices.length!==1||seed.choices[0]?.id!==p.seed||p.predicates.length>16)invalid();
    const c=seed.choices[0]!;if(c.amount!=='1'||c.consume.kind!=='consume'||c.returns.length||c.rule.kind!=='wildcard'||!c.rule.meta||!c.rule.nbt||items&&items.get(c.id)?.registry!=='minecraft:wheat_seeds')invalid();
  }else if(p.seed!=null)invalid();
  if(p.machine==='brewery'){const input=r.inputs[slot++];if(p.container!==6||p.mana==null||!p.brew||p.predicates.length>6||input?.kind!=='item'||input.slot!==6||input.choices.length!==1)invalid();
    const c=input.choices[0]!;if(c.amount!=='1'||c.consume.kind!=='consume'||c.returns.length||c.rule.kind!=='wildcard'||c.rule.meta||!c.rule.nbt)invalid();
  }else if(p.container!=null||p.mana!=null||p.brew!=null)invalid();
  if(slot!==r.inputs.length||(p.machine==='daisy'?p.predicates.length!==1||!p.worldResult?.registry||r.outputs.length>1:p.worldResult!=null||r.outputs.length!==1))invalid();
  const out=r.outputs[0];if(out&&(out.kind!=='item'||out.slot!==0||out.role!=='result'||out.amount==null||out.quantity!=null||out.change!=null||out.chance.numerator!=='1'||out.chance.denominator!=='1'))invalid();
}
export function botaniaWorldNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  const english=locale==='en-US';
  if(p.machine==='daisy')return english?`World block replacement: ${p.worldResult?.registry} / ${p.worldResult?.metadata}. Rotates through eight neighboring positions; 150 valid checks normally take 1200 ticks. Earlier registry matches take priority. Matching changes can retain the per-position counter; a mismatch resets it. This is a world transform, not an inventory yield.`:`替换世界方块：${p.worldResult?.registry} / ${p.worldResult?.metadata}。轮询八个相邻位置，150 次有效检查通常需要 1200 tick。较早原生配方优先；更换匹配配方可保留位置计数，失配重置计数。这是世界变换，非库存产量。`;
  if(p.machine==='petal')return english?'Requires water and stable packed inputs already admitted by native flower-component rules. Removes the first matching remaining predicate; an empty slot ends matching. A non-component seed with a matching native unlocalized key triggers completion; wheat seeds are an example. Clears ingredients and water, consumes one seed and returns no crafting containers. Earlier recipes have priority.':'需要有水，材料通过原生花朵组件准入且稳定紧密排列。每槽取首个匹配的剩余谓词，首个空格终止。原生名称符合种子规则且不是可加入组件的种子触发完成，小麦种子只是实例。完成清空材料和水、取用一粒种子，无合成容器返还，较早配方优先。';
  if(p.machine==='trade')return english?'Requires an open elven portal and world/event conditions. Dropped stacks are split into units; physical order takes the first matching remaining predicate and skips unrelated stock. Earlier recipes run first. Repeated settlement and its final failed removal can consume partial matches, so no guaranteed bulk conversion is shown. Bee branches compare active primary species with native dominance.':'需要已开启的精灵门及相应世界／事件条件。掉落物拆为单位，按实际顺序取首个匹配的剩余谓词，跳过无关物品；较早配方先执行。重复处理的最后一次失败也可能取用部分材料，不保证批量换算。蜜蜂分支按原生显隐性计算主物种。';
  return english?`Brew ${p.brew}; signed mana requirement ${p.mana}. A blank admitted container enters slot 0 first; ingredients occupy up to six packed slots. Last matching native recipe wins in a fresh scan; existing cached state and recovery can differ. At completion all slots are cleared and the native container result is spawned. No crafting return or fixed duration is implied; incense eligibility remains native.`:`酿造 ${p.brew}；有符号魔力需求 ${p.mana}。合法空容器先放槽 0，原料紧密放在其后最多六槽。新扫描取最后匹配项，已有缓存或恢复状态可影响选择。完成清空全部槽并生成原生容器结果，不返还合成容器、没有固定时长；熏香保留原生可注入条件。`;
}
