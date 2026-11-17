import {canonical,type Item,type Nbt,type Recipe,type Text} from '@elysium/contracts';
import {validateNativePoolRecipe} from './botania-pool.ts';
import {validateNativeFloatingRecipe,nativeFloatingNote} from './native-floating.ts';

type NativeProcess=NonNullable<Recipe['process']>;
type Pool=Extract<NativeProcess,{kind:'botaniaPool'}>;
type Runic=Extract<NativeProcess,{kind:'botaniaRunic'}>;
type Flower=Extract<NativeProcess,{kind:'floatingFlowers'}>;
type NativeFlower=Extract<NativeProcess,{kind:'nativeFloatingFlowers'}>;
export type BotaniaItem=Pick<Item,'registry'|'meta'> & Partial<Pick<Item,'id'|'nbt'>>;
type Offered=BotaniaItem|null;
type PoolSelection=NonNullable<Pool['selection']>;
type PoolPredicate=PoolSelection['current'][number];
export interface BotaniaNameContext {readonly locale:string;readonly defaultName:string}
export interface BotaniaHeadResult {registry:'minecraft:skull';meta:3;amount:'1';nbt:Nbt|null}
const poolClass='vazkii.botania.api.recipe.RecipeManaInfusion',miniClass='vazkii.botania.api.recipe.RecipeMiniFlower';
const runicClass='vazkii.botania.api.recipe.RecipeRuneAltar',headClass='vazkii.botania.common.crafting.recipe.HeadRecipe';
const defaultNote='botania:headDefaultName',defaultSource='net.minecraft.util.StatCollector#translateToLocal(item.nameTag.name)';
const handlers={pool:'vazkii.botania.client.integration.nei.recipe.RecipeHandlerManaPool',runic:'vazkii.botania.client.integration.nei.recipe.RecipeHandlerRunicAltar',floating:'vazkii.botania.client.integration.nei.recipe.RecipeHandlerFloatingFlowers'};
function invalid():never{throw new Error('Invalid native Botania matching, world condition or settlement law');}
const registry=(s:string)=>s.length>0&&s.length<=512;
const integer=(n:number)=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647;
const root=(item:BotaniaItem):Readonly<Record<string,Nbt>>=>{if(item.nbt==null)return {};if(item.nbt.type!=='compound')invalid();return item.nbt.value;};

/** Native observation only. A different locale's label is never used as a translation. */
export function botaniaNameContext(recipe:Recipe,texts:ReadonlyMap<string,Text>,locale:string):BotaniaNameContext|undefined{
  const p=recipe.process;if(p?.kind!=='botaniaRunic'||!p.head&&!p.earlierHeads?.length)return undefined;
  const notes=(recipe.notes??[]).filter(note=>note.key===defaultNote),note=notes[0];
  if(p.nameTagDefault!==defaultNote||notes.length!==1||!note||note.source!==defaultSource)invalid();
  const text=texts.get(note.text);
  if(!text||text.locale.replace('-','_')!==locale.replace('-','_'))return undefined;
  if(!text.text.length||text.text.length>16384)invalid();
  return {locale:text.locale,defaultName:text.text};
}

function subtile(item:BotaniaItem,p:PoolSelection,items:ReadonlyMap<string,Item>):string|undefined{
  const tag=root(item).type;if(tag==null)return '';if(tag.type==='string')return tag.value;
  const identity=canonical(item.nbt??null).toString();
  for(const observation of p.coercions){
    const sample=items.get(observation.input)??invalid();
    if(sample.registry===item.registry&&sample.meta===item.meta&&canonical(sample.nbt).toString()===identity)return observation.value;
  }
  return undefined;
}
function poolAny(predicates:readonly PoolPredicate[],item:BotaniaItem,key:string|undefined):boolean|undefined{
  let unknown=false;
  for(const predicate of predicates){
    if(predicate.kind==='item'){if(predicate.registry===item.registry&&(predicate.metadata===32767||predicate.metadata===item.meta))return true;}
    else if(key==null)unknown=true;else if(predicate.key===key)return true;
  }
  return unknown?undefined:false;
}
function simplePool(rule:Recipe['inputs'][number]['choices'][number]['rule'],anchor:Item,item:BotaniaItem,items:ReadonlyMap<string,Item>):boolean{
  if(rule.kind==='wildcard')return rule.nbt&&anchor.registry===item.registry&&(rule.meta||anchor.meta===item.meta);
  if(rule.kind==='except')return simplePool(rule.base,anchor,item,items)&&!rule.exclude.some(filter=>simplePool(filter.rule,items.get(filter.id)??invalid(),item,items));
  return invalid();
}
/** Registry selection after native dissolve callbacks. Undefined means an unobserved NBT coercion. */
export function botaniaPoolSelect(recipe:Recipe,item:BotaniaItem,items:ReadonlyMap<string,Item>):boolean|undefined{
  const p=recipe.process;if(p?.kind!=='botaniaPool')return invalid();
  if(!p.selection)return recipe.inputs[0]!.choices.some(choice=>simplePool(choice.rule,items.get(choice.id)??invalid(),item,items));
  const key=subtile(item,p.selection,items),current=poolAny(p.selection.current,item,key),earlier=poolAny(p.selection.earlier,item,key);
  if(current===false||earlier===true)return false;
  return current==null||earlier==null?undefined:true;
}

function nameTag(item:BotaniaItem,context?:BotaniaNameContext):string|undefined{
  const display=root(item).display;
  const name=display?.type==='compound'?display.value.Name:undefined;
  // java.lang.String.trim removes code units <= U+0020, unlike JS Unicode trim().
  return name?.type==='string'?name.value:context?.defaultName.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g,'');
}
function headMatch(offered:readonly Offered[],context?:BotaniaNameContext):boolean|undefined{
  let unknown=false;
  for(const item of offered){if(item==null)break;if(item.registry!=='minecraft:name_tag')continue;
    if(!context){unknown=true;continue;}
    if(nameTag(item,context)===context.defaultName)return false;
  }
  return unknown?undefined:true;
}

function groups(groups:Runic['predicates'],budget:{remaining:number}):void{
  if(groups.length>16)invalid();
  for(const group of groups){
    budget.remaining-=group.length;
    if(budget.remaining<0||group.some(s=>!registry(s.registry)||!Number.isInteger(s.metadata)||s.metadata< -2147483648||s.metadata>2147483647))invalid();
  }
}
function matches(groups:Runic['predicates'],offered:readonly Offered[]):number[]|null{
  const remaining=groups.map((_,i)=>i),allocation:number[]=[];
  for(const item of offered){
    if(item==null)break;
    const at=remaining.findIndex(index=>groups[index]!.some(s=>s.registry===item.registry&&(s.metadata===32767||s.metadata===item.meta)));
    if(at<0)return null;allocation.push(remaining.splice(at,1)[0]!);
  }
  return remaining.length===0?allocation:null;
}
/** Stable packed inventory only: physical order is significant, including hidden earlier recipes. */
export function botaniaRunicSelect(p:Runic,offered:readonly Offered[],context?:BotaniaNameContext):number[]|null|undefined{
  if(offered.length!==16)invalid();
  const length=offered.findIndex(item=>item==null),end=length<0?16:length;
  if(offered.slice(end).some(item=>item!=null))return null;
  const allocation=matches(p.predicates,offered);if(allocation==null)return null;
  let unknown=false;const heads=new Set(p.earlierHeads??[]);
  for(const [index,prior]of p.earlier.entries())if(matches(prior,offered)!=null){
    const accepted=heads.has(index)?headMatch(offered,context):true;
    if(accepted===true)return null;if(accepted==null)unknown=true;
  }
  const accepted=p.head?headMatch(offered,context):true;
  if(accepted===false)return null;
  return accepted==null||unknown?undefined:allocation;
}

/** One fresh player skull; null is rejected selection and undefined is an unavailable observation. */
export function botaniaRunicResult(p:Runic,offered:readonly Offered[],context?:BotaniaNameContext):BotaniaHeadResult|null|undefined{
  if(!p.head)return undefined;
  const selected=botaniaRunicSelect(p,offered,context);if(selected==null)return selected===null?null:undefined;
  let name=p.head.initialName;
  for(const item of offered){if(item==null)break;if(item.registry===p.head.nameTag){const observed=nameTag(item,context);if(observed==null)return undefined;name=observed;}}
  return {registry:'minecraft:skull',meta:3,amount:'1',nbt:name===''?null:{type:'compound',value:{SkullOwner:{type:'string',value:name}}}};
}

function fixed(r:Recipe):void{
  const out=r.outputs[0];
  if(r.outputs.length!==1||out?.kind!=='item'||out.slot!==0||out.role!=='result'||out.amount==null||!/^\d+$/.test(out.amount)||BigInt(out.amount)<=0n||BigInt(out.amount)>2147483647n||out.quantity!=null||out.change!=null||out.chance.numerator!=='1'||out.chance.denominator!=='1')invalid();
}
function poolRule(rule:Recipe['inputs'][number]['choices'][number]['rule'],nested=false):boolean{
  return rule.kind==='wildcard'?rule.nbt:!nested&&rule.kind==='except'&&rule.exclude.length>0&&rule.exclude.length<=4096&&poolRule(rule.base,true)&&rule.exclude.every(s=>poolRule(s.rule,true));
}
function poolItem(predicate:PoolPredicate,item:Item):boolean{
  return predicate.kind==='item'&&predicate.registry===item.registry&&(predicate.metadata===32767||predicate.metadata===item.meta);
}
function poolCovered(predicate:PoolPredicate,earlier:readonly PoolPredicate[]):boolean{
  return earlier.some(prior=>prior.kind==='item'&&predicate.kind==='item'
    ?prior.registry===predicate.registry&&(prior.metadata===32767||prior.metadata===predicate.metadata)
    :prior.kind==='subTileKey'&&predicate.kind==='subTileKey'&&prior.key===predicate.key);
}
function validatePoolSelection(r:Recipe,p:Pool,items?:ReadonlyMap<string,Item>):void{
  const s=p.selection;
  if(!s){if(p.nativeRecipe!==poolClass)invalid();return;}
  if(!s.current.length||s.current.length+s.earlier.length>65536)invalid();
  const keys=new Set<string>();
  for(const predicate of [...s.current,...s.earlier]){
    if(predicate.kind==='item'){if(!registry(predicate.registry)||!integer(predicate.metadata))invalid();}
    else{if(predicate.key.length>16384)invalid();keys.add(predicate.key);}
  }
  if(!keys.size||(p.nativeRecipe===miniClass?s.current.length!==1||s.current[0]?.kind!=='subTileKey':s.current.some(v=>v.kind!=='item'))
      ||!s.coercions.length||s.coercions.length>65536)invalid();
  const ids=new Set<string>(),observed=new Set<string>();let bytes=0;
  for(const observation of s.coercions){
    bytes+=new TextEncoder().encode(observation.value).byteLength;
    if(ids.has(observation.input)||observation.value.length>16384||bytes>1024*1024||!keys.has(observation.value))invalid();
    ids.add(observation.input);observed.add(observation.value);
    if(items){const tag=root(items.get(observation.input)??invalid()).type;
      if(tag==null?observation.value!=='':tag.type==='string'&&tag.value!==observation.value)invalid();}
  }
  if(keys.size!==observed.size||[...keys].some(key=>!observed.has(key)))invalid();
  const input=r.inputs[0]!;
  for(const choice of input.choices){
    if(choice.rule.kind!=='wildcard'||!choice.rule.nbt)invalid();
    if(p.nativeRecipe===miniClass){
      const selector=s.current[0];if(!selector||selector.kind!=='subTileKey')invalid();
      if(!choice.rule.meta||!s.coercions.some(o=>o.input===choice.id&&o.value===selector.key))invalid();
    }else if(items){const item=items.get(choice.id)??invalid();
      if(!s.current.some(predicate=>predicate.kind==='item'&&predicate.registry===item.registry
          &&(choice.rule.kind==='wildcard'&&choice.rule.meta?predicate.metadata===32767:predicate.metadata===item.meta)))invalid();}
  }
  if(items&&p.nativeRecipe===poolClass&&s.current.some(predicate=>!poolCovered(predicate,s.earlier)
      &&!input.choices.some(choice=>poolItem(predicate,items.get(choice.id)??invalid()))))invalid();
}
export function validateBotaniaRecipe(r:Recipe,items?:ReadonlyMap<string,Item>,texts?:ReadonlyMap<string,Text>,locale?:string):void{
  const p=r.process;
  validateNativePoolRecipe(r,items);
  if(p?.kind==='nativeBotaniaPool')return;
  if(p?.kind==='nativeFloatingFlowers'){validateNativeFloatingRecipe(r,items);return;}
  const expected=r.source.handler===handlers.pool?'botaniaPool':r.source.handler===handlers.runic?'botaniaRunic':r.source.handler===handlers.floating?'floatingFlowers':null;
  if(expected&&p?.kind!==expected)invalid();
  if(p?.kind!=='botaniaPool'&&p?.kind!=='botaniaRunic'&&p?.kind!=='floatingFlowers')return;
  if((p.kind!=='floatingFlowers'&&(expected!==p.kind||r.source.owner!=='Botania'))||r.duration!=null||r.energy!=null||r.magic!=null||r.grid!=null||Object.keys(r.properties).length!==0)invalid();
  if(p.kind==='botaniaPool'){
    if(p.version!=='1.12.28-GTNH'||![poolClass,miniClass].includes(p.nativeRecipe)||!integer(p.mana)||!['none','alchemy','conjuration'].includes(p.catalyst)||p.matching!=='firstEligibleNativeRegistryEntry'||p.settlement!=='serverDroppedItemUnitAndSignedManaUpdate'||r.inputs.length!==1)invalid();
    const input=r.inputs[0]!;
    if(input.kind!=='item'||input.slot!==0||input.choices.length===0||input.choices.some(c=>c.amount!=='1'||c.consume.kind!=='consume'||c.returns.length!==0||!poolRule(c.rule)))invalid();
    fixed(r);validatePoolSelection(r,p,items);return;
  }
  if(p.kind==='botaniaRunic'){
    if(p.version!=='1.12.28-GTNH'||![runicClass,headClass].includes(p.nativeRecipe)||!integer(p.mana)||p.mana<=0||p.cooldown!==60||p.scope!=='stablePackedInputsWithoutCachedOverride'||p.matching!=='physicalFirstRemainingPredicate'||p.settlement!=='clearAltarRefundRunesAndConsumeDroppedLivingrock'||!registry(p.rune)||!registry(p.livingrock)||p.earlier.length>4096||Boolean(p.head)!==(p.nativeRecipe===headClass))invalid();
    const heads=p.earlierHeads??[],names=Boolean(p.head)||heads.length>0;
    if(heads.length>p.earlier.length||heads.some((index,i)=>!Number.isInteger(index)||index<0||index>=p.earlier.length||i>0&&heads[i-1]!>=index))invalid();
    if(names){
      const notes=(r.notes??[]).filter(note=>note.key===defaultNote);
      if(p.nameTagDefault!==defaultNote||notes.length!==1||notes[0]?.source!==defaultSource)invalid();
      if(texts){if(locale==null||botaniaNameContext(r,texts,locale)==null)invalid();}
    }else if(p.nameTagDefault!=null)invalid();
    const budget={remaining:65536};groups(p.predicates,budget);for(const prior of p.earlier)groups(prior,budget);
    if(p.predicates.some(group=>group.length===0)||r.inputs.length!==p.predicates.length+1)invalid();
    for(const [index,input]of r.inputs.entries()){
      const stone=index===p.predicates.length;
      if(input.kind!=='item'||input.slot!==(stone?16:index)||input.choices.length===0||stone&&input.choices.length!==1)invalid();
      for(const c of input.choices){
        if(c.amount!=='1'||c.returns.length!==0||c.rule.kind!=='wildcard'||!c.rule.nbt||!['consume','keep'].includes(c.consume.kind)||stone&&(c.consume.kind!=='consume'||!c.rule.meta))invalid();
        if(items){
          const item=items.get(c.id)??invalid();
          if(stone?item.registry!==p.livingrock:!p.predicates[index]!.some(s=>s.registry===item.registry&&(c.rule.kind==='wildcard'&&c.rule.meta?s.metadata===32767:s.metadata===item.meta)))invalid();
          if(!stone&&c.consume.kind!==(item.registry===p.rune?'keep':'consume'))invalid();
        }
      }
      if(items&&!stone&&p.predicates[index]!.some(s=>!input.choices.some(c=>{const item=items.get(c.id)??invalid();return s.registry===item.registry&&(s.metadata===32767||s.metadata===item.meta);})))invalid();
    }
    fixed(r);
    if(p.head){
      const head=p.head;
      if(!head.initialName.length||head.initialName.length>16384||head.sampleName.length>16384||head.nameTag!=='minecraft:name_tag'||head.defaultNameKey!=='item.nameTag.name'
          ||head.matching!=='packedNameTagsEachRejectLocalizedDefault'||head.output!=='freshPlayerSkullFromLastNameTagOrInitialName'||head.visibility!=='craftingNbtOutputQueryOnly'||r.outputs[0]!.amount!=='1')invalid();
      if(items){
        const output=items.get(r.outputs[0]!.id)??invalid(),tags=root(output);
        if(output.registry!=='minecraft:skull'||output.meta!==3
            ||(head.sampleName===''?output.nbt!=null:Object.keys(tags).length!==1||tags.SkullOwner?.type!=='string'||tags.SkullOwner.value!==head.sampleName))invalid();
        let named=false;
        for(const input of r.inputs.slice(0,p.predicates.length))for(const choice of input.choices){
          const item=items.get(choice.id)??invalid();if(item.registry!==head.nameTag)continue;named=true;
          const display=root(item).display,name=display?.type==='compound'?display.value.Name:undefined;
          if(name?.type!=='string'||name.value!==head.sampleName)invalid();
        }
        if(!named&&head.sampleName!==head.initialName)invalid();
      }
      if(texts&&locale!=null&&p.predicates.some(group=>group.some(s=>s.registry===head.nameTag))
          &&head.sampleName===(botaniaNameContext(r,texts,locale)??invalid()).defaultName)invalid();
    }
    return;
  }
  const count=r.inputs.length,start=count-p.special.length;
  if(count<2||count>9||p.special.length<1||p.special.length>=count||p.special.some((s,i)=>s!==start+i)||r.outputs.length!==1)invalid();
  const registries:string[]=[];
  for(const [slot,input]of r.inputs.entries()){
    const c=input.choices[0]??invalid();
    if(input.kind!=='item'||input.slot!==slot||input.choices.length!==1||c.amount!=='1'||c.consume.kind!=='consume'||c.returns.length!==0)invalid();
    if(slot===count-1?c.rule.kind!=='string_tag'||c.rule.key!=='type':c.rule.kind!=='wildcard'||!c.rule.meta||!c.rule.nbt)invalid();
    if(items)registries.push((items.get(c.id)??invalid()).registry);
  }
  const out=r.outputs[0]??invalid(),change=out.change??invalid(),action=change.action;
  if(out.kind!=='item'||out.slot!==0||out.role!=='result'||out.amount!=='1'||out.quantity!=null||out.chance.numerator!=='1'||out.chance.denominator!=='1'||change.input!==count-1||change.bindings!=null)invalid();
  if(action.kind!=='floatingFlower')return invalid();
  if(items){
    const base=items.get(action.base)??invalid();
    if(base.meta!==0||registries.includes(base.registry)||registries[0]===registries[start]||registries.some((s,i)=>s!==registries[i<start?0:start]))invalid();
  }
}

/** UI-authored explanations for pinned native laws; no native text is relabeled as a translation. */
function baseBotaniaNote(p:Pool|Runic|Flower|NativeFlower,locale:'zh-CN'|'en-US'):string{
  if(p.kind==='nativeFloatingFlowers')return nativeFloatingNote(p,locale);
  if(p.kind==='botaniaPool'){
    if(locale==='en-US')return `${p.mana<0?'Signed native mana parameter':'Mana cost'}: ${p.mana}. Block below the pool: ${p.catalyst==='none'?'neither catalyst':p.catalyst+' catalyst'}. The first eligible native entry wins, even if it lacks mana. Requires current mana at least the signed parameter, initialized catalyst state and a live dropped item outside ages 101–129. The server consumes one item, returns no container, copies the result and sets its age to 105. The pool adds the negated parameter with signed 32-bit integer wrapping, then clamps to zero and its native capacity. A negative value does not promise a fixed refill; no fixed duration is implied.`;
    return `${p.mana<0?'原生有符号魔力参数':'魔力需求'}：${p.mana}。池下方：${p.catalyst==='none'?'两种催化器均无':p.catalyst==='alchemy'?'炼金催化器':'炼造催化器'}。按原生顺序选择首条匹配，魔力不足也不改选后续配方。需要当前魔力不低于该有符号参数、已初始化的催化状态、存活的掉落物，且物品年龄不在 101–129。服务端取用一件，不返还容器，复制产物并将其年龄设为 105。池加入该参数的负值，保留原生32位有符号整数溢出，再限制到零和原生池容量之间。负值不保证固定回充量，也不代表固定加工耗时。`;
  }
  if(p.kind==='botaniaRunic'){
    if(locale==='en-US')return `Mana required: ${p.mana}; post-craft cooldown: ${p.cooldown} ticks. Stable inputs occupy the first altar slots, one per slot; all other slots are empty and no cached recipe overrides selection. Physical order chooses the first matching remaining requirement. Earlier native entries, including hidden skull outputs, take priority. Completion requires a positive initialized mana target, enough mana, a wand trigger and a live livingrock item inside the altar bounds. On the server every altar slot is cleared; runes retain their actual NBT as dropped refunds for a noncreative player or no player, and one dropped livingrock is consumed. Other materials and containers are not returned. Creative players do not receive rune refunds. Mana collection and wand timing are not a fixed duration.`;
    return `魔力需求：${p.mana}；制作后冷却 ${p.cooldown} tick。材料稳定放在祭坛前几个槽位，每槽一件，其余槽为空，且无缓存配方覆盖。按实际槽位顺序选择首个匹配的剩余需求；较早的原生配方优先，包括隐藏的头颅产物配方。完成需要已初始化的正魔力目标、足够魔力、法杖触发，以及祭坛范围内存活的活石掉落物。服务端清空全部祭坛槽；非创造玩家或无玩家触发时，符文保留实际 NBT 作为掉落物返还，并消耗一件活石掉落物。其他材料和容器不返还，创造玩家不返还符文。收集魔力和法杖触发没有固定耗时。`;
  }
  if(locale==='en-US')return `This branch uses ${p.special.length} special flowers among the occupied cells. Use a 2×2 or 3×3 crafting grid containing both flower types; other cells are empty. The last special flower in physical row order supplies an absent or String type tag. Other metadata and tags are ignored. The result has fresh NBT containing only that type, metadata zero and count one; one item is consumed per occupied cell without containers. A non-String type on the last flower remains unsupported because native NBT stringification can depend on compound storage order. Global workbench priority and crafting event callbacks are not simulated. Display stacks are examples.`;
  return `本分支含 ${p.special.length} 朵特殊花。在能容纳材料的 2×2 或 3×3 合成区同时放入两类花，其余格为空。按实际格子逐行读取，最后一朵特殊花提供缺失或字符串类型的 type 标签；其他元数据和标签不参与。产物使用仅含该类型的全新 NBT，元数据为零、数量为一，每个占用格消耗一件，不返还容器。最后一朵花的非字符串 type 仍未支持，因为原生 NBT 字符串化可能依赖复合标签存储顺序。不模拟工作台全局配方优先级和合成事件回调，展示物品只是样本。`;
}

export function botaniaNote(p:Pool|Runic|Flower|NativeFlower,locale:'zh-CN'|'en-US'='zh-CN'):string{
  const base=baseBotaniaNote(p,locale);
  if(p.kind==='botaniaPool'&&p.selection)return base+(locale==='en-US'
    ?' Miniature-flower entries compare the native type-tag value independently of item identity and metadata. Their priority remains combined with ordinary item predicates; non-string NBT uses bound native observations.'
    :' 迷你花分支按原生读取的 type 标签值判断，物品种类与元数据不参与该分支；其与普通物品谓词共同保留原生优先级，非字符串 NBT 使用已绑定的原生观察。');
  if(p.kind==='botaniaRunic'&&p.head)return base+(locale==='en-US'
    ?' Every name tag is checked against the source-observed default name in the current locale. The last tag in physical order supplies the name of one fresh player skull; no other input tags are copied. With no name tag, the bound recipe name is retained. This named result is visible through its specific NBT output query.'
    :' 每个命名牌均与已观察的当前语言原生默认名称比较；实际顺序中的最后一个命名牌决定一个全新玩家头颅的名称，不复制其他输入标签。没有命名牌时保留绑定的配方名称；命名产物通过对应 NBT 产物查询展示。');
  if(p.kind==='botaniaRunic'&&p.earlierHeads?.length)return base+(locale==='en-US'
    ?' Earlier named-head entries keep their name-tag conditions: a default-name tag can reject an otherwise matching earlier recipe. The comparison uses the native observation for the current locale.'
    :' 较早命名头颅分支仍保留命名牌条件；默认名称的命名牌可使原本材料匹配的较早分支拒绝匹配，名称比较使用当前语言的原生观察。');
  return base;
}

export function botaniaInputNote(p:Pool|Runic|Flower|NativeFlower,input:Recipe['inputs'][number],choice:Recipe['inputs'][number]['choices'][number],locale:'zh-CN'|'en-US'='zh-CN'):string{
  if(p.kind==='botaniaRunic'){
    if(input.slot===16)return locale==='en-US'?'Consumes one live dropped livingrock item inside the altar bounds, outside its inventory.':'完成时消耗祭坛范围内一件存活的活石掉落物，不占祭坛槽。';
    if(choice.consume.kind==='keep')return locale==='en-US'?'The altar slot is cleared; a noncreative player or no player receives the rune as a dropped item with its actual NBT. Creative players receive no refund.':'祭坛槽会清空；非创造玩家或无玩家触发时，符文保留实际 NBT 以掉落物返还。创造玩家不返还。';
  }
  return locale==='en-US'?'One item is consumed on a valid native execution; no crafting container is returned.':'满足原生执行条件后取用一件，不返还合成容器。';
}
