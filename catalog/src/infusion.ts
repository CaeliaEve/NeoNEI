import type {Item,Nbt,Recipe} from '@elysium/contracts';
import {nativeNbtEqual,nativeNbtInt} from './native-nbt.ts';
import {validateDisguiseInfusionRecipe} from './infusion-disguise.ts';
import {enhancedIngredientMatch,enhancedComponentsMatch,validateEnhancedIngredients} from './infusion-ingredient.ts';
import {validateNativeInfusionMergeRecipe} from './infusion-merge.ts';
import {randomInfusionCostRanges,randomInfusionCostNote} from './infusion-cost.ts';
import {ariHandlers,isAriSource} from './magic-source.ts';

type Process=Extract<NonNullable<Recipe['process']>,{kind:'nativeInfusion'}>;
type RunicProcess=Extract<NonNullable<Recipe['process']>,{kind:'nativeRunic'}>;
type Effect=Process['effect'];
type Familiar=Extract<Effect,{kind:'familiar'}>;
type Pattern=Process['pattern'];
type State=Pattern['states'][number];
type Requirement=Pattern['components'][number];
type Template=Process['declaredInput'];
type Stack=Pick<Item,'id'|'registry'|'meta'|'nbt'|'stackLimit'>;
function invalid():never {throw new Error('Invalid native infusion rule or specimen');}
const canonical=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function root(tag:Nbt|null|undefined):Record<string,Nbt>{if(tag==null)return {};if(tag.type!=='compound')invalid();return tag.value;}
function compound(tag:Nbt|undefined):Record<string,Nbt>|undefined{return tag?.type==='compound'?tag.value:undefined;}
function entries(tag:Nbt|null|undefined):Record<string,Nbt>[]{
  const list=root(tag)['tb.upgrades'];if(list?.type!=='list'||list.element!=='compound')return [];
  if(list.value.length>4096)invalid();return list.value.map(v=>compound(v)??invalid());
}
function wandNames(tag:Nbt|null|undefined):string[]{
  const list=root(tag).Augmentations;
  if(list?.type!=='list'||list.element!=='string')return [];
  if(list.value.length>4096)invalid();return list.value.map(value=>value.type==='string'?value.value:invalid());
}
function registered(effect:Effect,id:number):number|null{
  if(effect.kind!=='revolver'||id<0)invalid();return effect.registered[id]??null;
}
export function nativeInfusionLevel(effect:Effect,tag:Nbt|null|undefined):number{
  if(effect.kind!=='revolver')return 0;
  for(const e of entries(tag))if(registered(effect,nativeNbtInt(e.id))===effect.target)return nativeNbtInt(e.level);
  return 0;
}
export function nativeInfusionAdmitted(effect:Effect,item:Pick<Item,'registry'|'nbt'>,state?:State):boolean{
  const tags=root(item.nbt);
  if(effect.kind==='declared')return true;
  if(effect.kind==='golem')return !Object.hasOwn(compound(compound(tags[effect.namespace])?.upgrades)??{},effect.key);
  if(effect.kind==='oldFamiliar')return effect.items.includes(item.registry)&&(effect.previous==null||(nativeNbtInt(tags[effect.previous])<<24>>24)!==0);
  if(effect.kind==='familiar')return familiarAdmitted(effect,item,state??invalid());
  if(effect.kind==='wand'){const names=wandNames(item.nbt);return effect.definitionWand&&!names.includes(effect.name)&&effect.prerequisites.every(name=>names.includes(name));}
  for(const entry of entries(item.nbt)){
    const index=registered(effect,nativeNbtInt(entry.id));
    if(index!=null&&(effect.upgrades[index]??invalid()).conflicts.includes(effect.target))return false;
  }
  return ((nativeInfusionLevel(effect,item.nbt)+1)|0)<=(effect.upgrades[effect.target]??invalid()).maxLevel;
}
/** Copies the central state. It preserves malformed native detached-list/compound behavior. */
export function nativeInfusionResult(effect:Effect,tag:Nbt|null|undefined,state?:State):Nbt{
  const tags=structuredClone(root(tag));
  if(effect.kind==='declared')invalid();
  if(effect.kind==='familiar'){
    const found=familiarFirst(familiarPairs(effect,tag,state??invalid(),true),effect.target),next=found==null?1:(found+1)|0;
    if(next>0){const augments=compound(tags.augments)??{};augments[(effect.augments[effect.target]??invalid()).name]={type:'int',value:String(next)};tags.augments={type:'compound',value:augments};}
    return {type:'compound',value:tags};
  }
  if(effect.kind==='wand'){
    tags.Augmentations={type:'list',element:'string',value:[...wandNames(tag),effect.name].map(value=>({type:'string' as const,value}))};
    return {type:'compound',value:tags};
  }
  if(effect.kind==='golem'){
    const mod=compound(tags[effect.namespace])??{};
    const upgrades=compound(mod.upgrades);
    if(upgrades)upgrades[effect.key]={type:'byte',value:'1'};
    else if(!Object.hasOwn(mod,'upgrades'))mod.upgrades={type:'compound',value:{[effect.key]:{type:'byte',value:'1'}}};
    tags[effect.namespace]={type:'compound',value:mod};
  }else if(effect.kind==='oldFamiliar')tags[effect.key]={type:'byte',value:'1'};
  else{
    const next=(nativeInfusionLevel(effect,tag)+1)|0,id=(effect.upgrades[effect.target]??invalid()).id;
    if(!Object.hasOwn(tags,'tb.upgrades'))tags['tb.upgrades']={type:'list',element:'end',value:[]};
    const list=tags['tb.upgrades']!;
    if(list.type==='list'&&(list.element==='compound'||list.element==='end'&&list.value.length===0)){
      let found=false;
      for(const row of list.value){const e=compound(row)??invalid();if(nativeNbtInt(e.id)===id){e.level={type:'int',value:String(next)};found=true;break;}}
      if(!found){list.element='compound';list.value.push({type:'compound',value:{id:{type:'int',value:String(id)},level:{type:'int',value:String(next)}}});}
    }
  }
  return {type:'compound',value:tags};
}
function familiarPairs(f:Familiar,tag:Nbt|null|undefined,state:State,copied:boolean):Array<[number|null,number]>{
  const augments=compound(root(tag).augments)??{};
  return (copied?state.copiedAugmentKeys:state.augmentKeys).map(key=>{
    const lowered=state.lowercaseKeys[key];if(lowered==null)invalid();
    return [f.names[lowered]??null,nativeNbtInt(augments[key])];
  });
}
function familiarFirst(pairs:readonly [number|null,number][],target:number):number|null{
  for(const [id,level]of pairs){if(id==null)invalid();if(id===target)return level;}return null;
}
function familiarAdmitted(f:Familiar,item:Pick<Item,'registry'|'nbt'>,state:State):boolean{
  if(!f.items.includes(item.registry))return false;
  const pairs=familiarPairs(f,item.nbt,state,false),level=familiarFirst(pairs,f.target)??0,next=(level+1)|0;
  if(f.requiredPreviousLevel>level||next<=0)return false;
  const target=f.augments[f.target]??invalid();if(pairs.some(([id])=>target.conflicts.includes(id)))return false;
  if(target.requiresPrevious){let last:number|null=null;for(const [id,level]of pairs){if(id==null)invalid();if(id===f.target)last=level;}
    if(last==null?next!==1:last!==((next-1)|0))return false;}
  for(const c of target.conditions){
    if(c.kind==='skip'||c.required==null)continue;const any=c.kind==='any';let matched=!any;
    for(const id of c.required)if(id!=null){const found=familiarFirst(pairs,id)!=null;if(any&&found){matched=true;break;}if(!any&&!found){matched=false;break;}}
    if(!matched)return false;
  }
  return true;
}
export function nativeInfusionCosts(p:Process,item:Pick<Item,'nbt'>):{aspects:Map<string,number>|null;instability:number}{
  const effect=p.effect,level=nativeInfusionLevel(effect,item.nbt),revolver=effect.kind==='revolver';
  const aspects=new Map(p.baseAspects.map(a=>{const n=Number(a.amount);return [a.aspect,revolver&&level>0?(level>=32?0:n<<level):n];}));
  const instability=revolver?(p.baseInstability+Math.imul((effect.upgrades[effect.target]??invalid()).instability,level))|0:p.baseInstability;
  return {aspects:p.randomAspects!=null?null:aspects,instability};
}
function legacyMatch(p:Pattern,requirement:Requirement,offered:Stack,amount:number,_items:ReadonlyMap<string,Item>,states:ReadonlyMap<string,State>,cycle=false):boolean{
  const template=requirement.template,s=states.get(offered.id)??invalid();
  const tagStrings=cycle?s.tagStrings:requirement.copies===1?s.copiedTagStrings:s.pedestalTagStrings;
  const required=cycle?requirement.cycleTagStrings:requirement.tagStrings;
  if(template.nbt!=null&&(offered.nbt==null||Object.entries(required).some(([k,v])=>tagStrings[k]!==v)))return false;
  if(!cycle&&p.startup==='itemAndTags')return offered.registry===template.registry;
  const wildcard=template.metadata===32767,rewrite=wildcard&&!cycle,meta=rewrite?32767:offered.meta,ores=rewrite?s.wildcardOres:s.ores;
  const fuzzy=p.mode==='Default'?ores.length>0&&requirement.defaultOres.includes(ores[0]!)
    :p.mode==='Strict'?ores.length===requirement.ores.length&&ores.every(s=>requirement.ores.includes(s))
    :p.mode==='Relaxed'?ores.some(s=>requirement.ores.includes(s))
    :offered.registry===template.registry&&meta===template.metadata&&nativeNbtEqual(offered.nbt,template.nbt);
  return fuzzy||offered.registry===template.registry&&(meta===template.metadata||wildcard)&&amount<=offered.stackLimit;
}
/** Research, native registration priority and live altar conditions are separate execution gates. */
export function nativeInfusionMatch(p:Process,central:Item,outer:readonly Item[],items:ReadonlyMap<string,Item>):boolean{
  const states=new Map(p.pattern.states.map(s=>[s.id,s]));
  if(!nativeInfusionAdmitted(p.effect,central,states.get(central.id)))return false;
  if(p.pattern.central&&!legacyMatch(p.pattern,p.pattern.central,central,1,items,states))return false;
  const enhanced=p.pattern.startup==='enhanced';
  if(enhanced){
    const [predicate,...components]=p.pattern.predicates??invalid();
    if(!predicate||!enhancedIngredientMatch(predicate,central)||!enhancedComponentsMatch(components,outer))return false;
  }
  for(const cycle of [false,true]){
    if(enhanced&&!cycle)continue;
    const remaining=[...outer];
    for(const required of p.pattern.components){const at=remaining.findIndex(item=>legacyMatch(p.pattern,required,item,1,items,states,cycle));if(at<0)return false;remaining.splice(at,1);}
    if(!cycle&&!p.pattern.allowExtra&&remaining.length>0)return false;
  }
  return true;
}
function int(value:number):boolean{return Number.isInteger(value)&&value>=-2147483648&&value<=2147483647;}
function ascending(values:readonly string[]):boolean{return values.every((v,i)=>i===0||values[i-1]!<v);}
function replacementMatch(target:Template,offered:Template,strict:boolean):boolean{
  return target.registry===offered.registry&&(!strict&&target.metadata===32767||target.metadata===offered.metadata);
}
export function nativeInfusionPedestal(p:Process,item:Pick<Item,'registry'|'meta'>):{kind:'nativeContainer'}|{kind:'keep'}|{kind:'replace';output:Process['pedestals'][number]['output']}{
  if(!p.replacementsActive)return {kind:'nativeContainer'};
  const offered:Template={registry:item.registry,metadata:item.meta,nbt:null};
  const rule=p.pedestals.find(r=>r.input!=null&&replacementMatch(r.input,offered,r.strict));
  if(!rule)return {kind:'nativeContainer'};
  return rule.output!=null&&replacementMatch(offered,rule.output.item,rule.strict)?{kind:'keep'}:{kind:'replace',output:rule.output};
}
function validatePedestal(p:Process,c:Recipe['inputs'][number]['choices'][number],item:Item,items:ReadonlyMap<string,Item>):void{
  const result=nativeInfusionPedestal(p,item);
  if(result.kind==='keep'){if(c.consume.kind!=='keep'||c.returns.length)invalid();return;}
  if(c.consume.kind!==(p.pattern.startup==='enhanced'?'allocated':'stack'))invalid();
  if(result.kind==='nativeContainer'){
    if(c.returns.length>1||c.returns.some(r=>r.kind!=='item'||BigInt(r.amount)>BigInt(p.pedestalLimit)))invalid();return;
  }
  if(result.output==null){if(c.returns.length)invalid();return;}
  const out=result.output,returned=c.returns[0]??invalid(),actual=items.get(returned.id)??invalid();
  if(out.amount<=0||c.returns.length!==1||returned.kind!=='item'||returned.amount!==String(Math.min(out.amount,p.pedestalLimit))
    ||actual.registry!==out.item.registry||actual.meta!==out.item.metadata||canonical(actual.nbt)!==canonical(out.item.nbt))invalid();
}
function validatePattern(pattern:Pattern,items?:ReadonlyMap<string,Item>):Map<string,State>{
  if(!['Default','Strict','Relaxed','None'].includes(pattern.mode)||pattern.states.length>65536||!ascending(pattern.states.map(s=>s.id)))invalid();
  const states=new Map(pattern.states.map(s=>[s.id,s]));
  for(const s of pattern.states){
    if(s.ores.length>65536||s.wildcardOres.length>65536||new Set(s.ores).size!==s.ores.length
      ||new Set(s.wildcardOres).size!==s.wildcardOres.length||[s.tagStrings,s.copiedTagStrings,s.pedestalTagStrings].some(strings=>Object.keys(strings).length>4096||Object.values(strings).some(s=>s.length>1048576))
      ||s.augmentKeys.length>4096||new Set(s.augmentKeys).size!==s.augmentKeys.length||new Set(s.copiedAugmentKeys).size!==s.copiedAugmentKeys.length
      ||Object.keys(s.lowercaseKeys).length>4096||Object.values(s.lowercaseKeys).some(s=>s.length>65535))invalid();
    if(items){
      const item=items.get(s.id)??invalid();
      if(canonical([...s.ores].sort())!==canonical([...item.tags].sort())||[s.tagStrings,s.copiedTagStrings,s.pedestalTagStrings].some(strings=>canonical(Object.keys(strings).sort())!==canonical(Object.keys(root(item.nbt)).sort())))invalid();
      const keys=Object.keys(compound(root(item.nbt).augments)??{}).sort();
      if(canonical([...s.augmentKeys].sort())!==canonical(keys)||canonical([...s.copiedAugmentKeys].sort())!==canonical(keys)||canonical(Object.keys(s.lowercaseKeys).sort())!==canonical(keys))invalid();
    }
  }
  if(pattern.central&&pattern.central.copies!==1||pattern.components.some(req=>req.copies!==2))invalid();
  for(const req of [...(pattern.central?[pattern.central]:[]),...pattern.components])if(req.defaultOres.length>65536||!ascending(req.defaultOres)
    ||req.ores.length>65536||new Set(req.ores).size!==req.ores.length
    ||[req.tagStrings,req.cycleTagStrings].some(strings=>Object.keys(strings).length>4096||Object.values(strings).some(s=>s.length>1048576)||canonical(Object.keys(strings).sort())!==canonical(Object.keys(root(req.template.nbt)).sort()))
    ||!req.template.registry||!int(req.template.metadata))invalid();
  return states;
}
function validateNativeRunicRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;if(p?.kind!=='nativeRunic')return;
  if(p.nativeRecipe!=='thaumcraft.common.lib.crafting.InfusionRunicAugmentRecipe'||!isAriSource(r.source,ariHandlers.infusion)
    ||r.grid!=null||r.duration!=null||r.energy!=null||!int(p.charge)||!int(p.pedestalLimit)||p.pedestalLimit<=0
    ||p.pattern.startup!=='legacy'||p.pattern.predicates!=null||p.pattern.central!=null||p.pattern.allowExtra||p.pattern.components.length!==2
    ||r.inputs.length!==3||r.outputs.length!==1)invalid();
  const states=validatePattern(p.pattern,items),diamond=p.pattern.components[0]!.template,resource=p.pattern.components[1]!.template;
  if(diamond.registry!=='minecraft:diamond'||diamond.metadata!==0||diamond.nbt!=null||resource.metadata!==14||resource.nbt!=null)invalid();
  const vis=Math.min(2147483647,Math.trunc(32*2**p.charge)),instability=5+Math.trunc(p.charge/2),magic=r.magic;
  const expected=vis>0?[Math.trunc(vis/2),Math.trunc(vis/2),vis].sort((a,b)=>a-b):[];
  if(magic?.kind!=='infusion'||magic.central!==0||magic.instability!==instability||magic.payment!=null||magic.creative||magic.research.length>1
    ||new Set(magic.aspects.map(a=>a.aspect)).size!==magic.aspects.length
    ||canonical(magic.aspects.map(a=>Number(a.amount)).sort((a,b)=>a-b))!==canonical(expected))invalid();
  for(const [slot,input]of r.inputs.entries()){
    if(input.kind!=='item'||input.slot!==slot||!input.choices.length||slot===0&&input.choices.length!==1)invalid();
    for(const c of input.choices){
      if(!states.has(c.id)||c.amount!==(slot===2?String(1+Math.max(0,p.charge)):'1')
        ||c.consume.kind!==(slot===2?'pedestals':'stack'))invalid();
      if(slot===0){if(c.rule.kind!=='wildcard'||!c.rule.meta||!c.rule.nbt||c.returns.length)invalid();}
      else{
        if(c.rule.kind!=='exact'||c.returns.length>1||c.returns.some(r=>r.kind!=='item'||BigInt(r.amount)<=0n||BigInt(r.amount)>BigInt(p.pedestalLimit)))invalid();
        if(items){const item=items.get(c.id)??invalid(),req=p.pattern.components[slot-1]!;
          if(!legacyMatch(p.pattern,req,item,1,items,states)||!legacyMatch(p.pattern,req,item,1,items,states,true))invalid();}
      }
    }
  }
  const output=r.outputs[0]!,change=output.change;
  if(output.kind!=='item'||output.slot!==0||output.role!=='result'||output.quantity!=null||output.amount!=='1'
    ||output.chance.numerator!=='1'||output.chance.denominator!=='1'||change?.action.kind!=='runic'||change.input!==0||change.bindings!=null
    ||change.samples.length!==1||change.samples[0]!.id!==output.id||change.samples[0]!.amount!=='1')invalid();
  if(items){
    const center=items.get(r.inputs[0]!.choices[0]!.id)??invalid(),result=items.get(output.id)??invalid();
    const tags=structuredClone(root(center.nbt));tags['RS.HARDEN']={type:'byte',value:String(((nativeNbtInt(tags['RS.HARDEN'])<<24>>24)+1)<<24>>24)};
    if(result.registry!==center.registry||result.meta!==center.meta||canonical(result.nbt)!==canonical({type:'compound',value:tags}))invalid();
  }
}
export function nativeRunicNote(p:RunicProcess,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ?`Displayed final charge ${p.charge}, costs and instability belong to the supplied equipment specimen. Other metadata, NBT and internal upgrades may change them. Actual charge is the admitted native provider plus its hardening byte, with signed-int addition. Each component preserves separate ${p.pattern.mode} startup and cycle comparisons. One diamond and ${1+Math.max(0,p.charge)} resource pedestals are shown for this sample; resources occupy distinct pedestals, with one item per pedestal. Startup greedily rejects extra materials, and used slots are replaced whole. Containers return per used pedestal, capped at the observed limit ${p.pedestalLimit}. The result increments the hardening byte with signed-byte overflow and preserves other state. Research, recipe priority, live altar state and obtainable NBT remain conditions.`
    :`展示的最终屏障 ${p.charge}、费用和不稳定性属于当前装备样本，其他元数据、NBT 和内部升级可能改变它们。实际屏障为已准入原生提供者的值加硬化 byte，保留有符号整数溢出。材料分别保留 ${p.pattern.mode} 模式的启动与后续取料比较。当前样本需要一个钻石基座、${1+Math.max(0,p.charge)} 个资源基座；资源分放在不同基座，每座一件。启动按原生顺序匹配并拒绝多余材料，实际用到的槽整体替换；容器逐座返还，受观测到的上限 ${p.pedestalLimit} 限制。结果递增硬化 byte，保留 byte 溢出及其他状态。仍需满足研究、配方优先级、祭坛状态和 NBT 可获取性条件。`;
}
export function validateNativeInfusionRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  validateNativeInfusionMergeRecipe(r,items);
  validateDisguiseInfusionRecipe(r,items);
  validateNativeRunicRecipe(r,items);
  const p=r.process;
  if(p?.kind!=='nativeInfusion'){
    if(r.outputs.some(o=>o.change?.action.kind==='nativeInfusion'))invalid();return;
  }
  if(!isAriSource(r.source,ariHandlers.infusion)||r.grid!=null||r.duration!=null||r.energy!=null
    ||r.inputs.length===0||p.pattern.startup!=='enhanced'&&r.inputs.length!==p.pattern.components.length+1||r.inputs.length>4096||p.pattern.components.length>4095||r.outputs.length!==1||!int(p.baseInstability)
    ||!['Default','Strict','Relaxed','None'].includes(p.pattern.mode)||!['legacy','itemAndTags','enhanced'].includes(p.pattern.startup)||p.pattern.states.length>65536||!ascending(p.pattern.states.map(s=>s.id)))invalid();
  const effect=p.effect;
  if(p.randomAspects!=null){
    randomInfusionCostRanges(p.randomAspects);
    if(p.nativeRecipe!=='thaumcraft.api.crafting.InfusionRecipe'||effect.kind!=='declared'
      ||p.baseAspects.length!==0||r.magic?.aspects.length!==0)invalid();
  }
  const gtnh='com.gtnewhorizon.gtnhlib.api.thaumcraft.EnhancedInfusionRecipe';
  const tc4='net.glease.tc4tweak.api.infusionrecipe.EnhancedInfusionRecipe',enhanced=p.pattern.startup==='enhanced';
  const owner=effect.kind==='declared'?(p.nativeRecipe===gtnh?gtnh:p.nativeRecipe===tc4?tc4:'thaumcraft.api.crafting.InfusionRecipe'):effect.kind==='golem'?'makeo.gadomancy.common.crafting.InfusionUpgradeRecipe'
    :effect.kind==='oldFamiliar'?'makeo.gadomancy.common.crafting.Familiar_Old_AugmentInfusion':effect.kind==='familiar'?'makeo.gadomancy.common.crafting.EtherealFamiliarUpgradeRecipe'
    :effect.kind==='wand'?'jcm2606.thaumicmachina.core.crafting.infusion.RecipeInfusionWandAugmentation':'tb.utils.RevolverInfusionRecipe';
  if(p.nativeRecipe!==owner)invalid();
  if(p.pattern.startup!==(p.nativeRecipe===tc4?'enhanced':effect.kind==='wand'?'itemAndTags':'legacy'))invalid();
  if(enhanced){
    const predicates=p.pattern.predicates??invalid();
    validateEnhancedIngredients(predicates);
  }else if(p.pattern.predicates!=null)invalid();
  if(effect.kind==='wand'){
    const rules:Record<string,string[]>={'Taint Capping':['Tainted Core'],'Tainted Core':[],'Charge Buffer':[],'Contact Discharge':[],'Vis Channel':[]};
    if(!effect.definitionWand||!Object.hasOwn(rules,effect.name)||canonical(effect.prerequisites)!==canonical(rules[effect.name]))invalid();
  }
  if(!int(p.pedestalLimit)||p.pedestalLimit<=0||p.pedestals.length>4096||p.nativeRecipe!==gtnh&&(p.pedestals.length>0||p.replacementsActive))invalid();
  for(const rule of p.pedestals){
    for(const template of [rule.input,rule.output?.item])if(template!=null){if(!template.registry||!int(template.metadata))invalid();root(template.nbt);}
    if(rule.output!=null&&!int(rule.output.amount))invalid();
  }
  const centralPredicate=!enhanced&&(effect.kind==='declared'||effect.kind==='golem');
  if(centralPredicate?canonical(p.pattern.central?.template)!==canonical(p.declaredInput):p.pattern.central!=null)invalid();
  if(!p.declaredInput.registry||!int(p.declaredInput.metadata))invalid();root(p.declaredInput.nbt);
  if(p.pattern.allowExtra!==(enhanced||effect.kind==='familiar'))invalid();
  if(effect.kind==='golem'&&(effect.namespace!=='gadomancy'||effect.key!=='runicShield'))invalid();
  if(effect.kind==='oldFamiliar'){
    const previous:Record<string,string|null>={AttackUpgrade1:null,AttackUpgrade2:'AttackUpgrade1',AttackUpgrade3:'AttackUpgrade2',CdUpgrade1:null,RangeUpgrade1:null};
    if(!Object.hasOwn(previous,effect.key)||previous[effect.key]!==effect.previous||!effect.items.length||effect.items.length>65536||!ascending(effect.items))invalid();
  }
  if(effect.kind==='revolver'){
    if(!effect.upgrades.length||effect.upgrades.length>4096||effect.registered.length>4096||!Number.isInteger(effect.target)||effect.target<0||effect.target>=effect.upgrades.length
      ||effect.registered.some(i=>i!=null&&(!Number.isInteger(i)||i<0||i>=effect.upgrades.length))
      ||effect.upgrades.some(u=>!int(u.id)||!int(u.maxLevel)||!int(u.instability)||u.conflicts.length>4096||u.conflicts.some(i=>!Number.isInteger(i)||i<0||i>=effect.upgrades.length)))invalid();
  }
  if(effect.kind==='familiar'){
    if(!effect.augments.length||effect.augments.length>4096||!Number.isInteger(effect.target)||effect.target<0||effect.target>=effect.augments.length
      ||Object.keys(effect.names).length>4096||!effect.items.length||effect.items.length>65536||!ascending(effect.items)||!int(effect.requiredPreviousLevel)||!effect.locale||effect.locale.length>256)invalid();
    const link=(v:number|null)=>v==null||Number.isInteger(v)&&v>=0&&v<effect.augments.length;
    for(const [key,v]of Object.entries(effect.names))if(key.length>65535||!link(v))invalid();
    for(const a of effect.augments){if(a.name.length>65535||a.conflicts.length>4096||a.conflicts.some(v=>!link(v))||a.conditions.length>4096)invalid();
      for(const c of a.conditions)if(c.kind!=='skip'&&c.required!=null&&(c.required.length>4096||c.required.some(v=>!link(v))))invalid();}
  }
  const states=validatePattern(p.pattern,items);
  const magic=r.magic;
  if(magic?.kind!=='infusion'||magic.central!==0||magic.payment!=null||magic.creative||magic.research.length>1||effect.kind==='revolver'&&magic.research.length!==1
    ||p.baseAspects.length>4096||new Set(p.baseAspects.map(a=>a.aspect)).size!==p.baseAspects.length
    ||p.baseAspects.some(a=>String(Number(a.amount))!==a.amount||!int(Number(a.amount))))invalid();
  for(const [slot,input]of r.inputs.entries())if(input.kind!=='item'||input.slot!==slot||!input.choices.length
    ||input.choices.some(c=>c.amount!=='1'||c.rule.kind!=='exact'||(c.consume.kind!==(enhanced&&slot>0?'allocated':'stack')&&!(slot>0&&p.replacementsActive&&p.pedestals.length&&c.consume.kind==='keep'))||slot===0&&c.returns.length>0||!states.has(c.id)))invalid();
  const out=r.outputs[0]??invalid();
  if(out.kind!=='item'||out.slot!==0||out.role!=='result'||out.quantity!=null||out.chance.numerator!=='1'||out.chance.denominator!=='1')invalid();
  if(effect.kind==='declared'){if(out.change?.action.kind==='nativeInfusion')invalid();}
  else if(out.change?.action.kind!=='nativeInfusion'||out.change.input!==0||out.change.bindings!=null||out.change.samples.length!==r.inputs[0]!.choices.length
    ||out.amount!=='1'||out.id!==out.change.samples[0]?.id||out.change.samples.some(s=>s.amount!=='1'))invalid();
  if(!items)return;
  const declared=p.declaredInput;if((effect.kind==='oldFamiliar'||effect.kind==='familiar')&&!effect.items.includes(declared.registry))invalid();
  for(const [slot,input]of r.inputs.entries())for(const c of input.choices){
    const item=items.get(c.id)??invalid();
    if(enhanced){
      const predicates=p.pattern.predicates??invalid();
      if(slot===0?!enhancedIngredientMatch(predicates[0]??invalid(),item)
        :!predicates.slice(1).some(rule=>enhancedIngredientMatch(rule,item))&&!p.pattern.components.some(required=>legacyMatch(p.pattern,required,item,1,items,states,true)))invalid();
    }
    if(slot===0){
      if(!nativeInfusionAdmitted(effect,item,states.get(item.id))||p.pattern.central&&!legacyMatch(p.pattern,p.pattern.central,item,1,items,states))invalid();
      const cost=nativeInfusionCosts(p,item);
      if(magic.instability!==cost.instability)invalid();
      if(cost.aspects!=null&&(magic.aspects.length!==cost.aspects.size||magic.aspects.some(a=>String(cost.aspects!.get(a.aspect))!==a.amount)))invalid();
    }else{
      if(!enhanced){const required=p.pattern.components[slot-1]??invalid();if(!legacyMatch(p.pattern,required,item,1,items,states)||!legacyMatch(p.pattern,required,item,1,items,states,true))invalid();}
      validatePedestal(p,c,item,items);
    }
  }
  const first=r.inputs.map(i=>items.get(i.choices[0]!.id)??invalid());
  if(!nativeInfusionMatch(p,first[0]!,first.slice(1),items))invalid();
  if(effect.kind!=='declared')for(const [i,c]of r.inputs[0]!.choices.entries()){
    const input=items.get(c.id)??invalid(),sample=out.change!.samples[i]??invalid(),result=items.get(sample.id)??invalid();
    if(result.registry!==input.registry||result.meta!==input.meta||canonical(result.nbt)!==canonical(nativeInfusionResult(effect,input.nbt,states.get(input.id))))invalid();
  }
}
export function nativeInfusionNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  const en=locale==='en-US',effect=p.effect;
  if(p.randomAspects!=null)return randomInfusionCostNote(p.randomAspects,locale)+(en
    ?' Matching and containers follow the retained native infusion rules; research, registration priority and live altar conditions still apply.'
    :' 匹配与容器按保留的原生注魔规则执行；仍需满足研究、注册优先级及实际祭坛条件。');
  if(p.pattern.startup==='enhanced')return en
    ?`Enhanced infusion has separate startup predicates and stored cycle templates, whose counts may differ. Startup checks ore membership, exclusive ore groups, item/metadata and exact NBT predicates, OR branches and the source-bound deferred rule. Wildcard metadata does not bypass an exact NBT check. Startup greedily removes the first match and permits leftover items. The altar later allocates its stored templates independently using ${p.pattern.mode} comparison. Both phases must succeed; an item accepted at startup need not be consumed. Displayed groups are physical stock specimens; separate cycle stock is included when needed. Used pedestal slots are replaced as a whole and unused inventory remains. Choices are one-item specimens, not guaranteed batch quantities. Displayed container returns apply only if that specimen's pedestal is used, capped at the observed inventory limit ${p.pedestalLimit}. Research, registration priority and live altar state remain conditions.`
    :`增强注魔分别保存启动谓词和后续取料模板，两者数量可以不同。启动规则保留矿辞成员、独占矿辞、物品／元数据及完整 NBT 比较、OR 分支与来源绑定的延迟规则；通配元数据不会跳过完整 NBT 检查。启动按定义顺序取首个匹配，允许剩余材料；祭坛随后独立使用 ${p.pattern.mode} 比较分配已保存的取料模板。两个阶段都须满足，启动接受的物品不一定会被消耗。各组展示实际库存样本，需要时另列后续取料库存；用到的基座槽整体替换，未用库存保留。候选为单件样本，不保证批次用量；显示的容器仅在该样本所在基座被使用时返还，并受观测到的库存上限 ${p.pedestalLimit} 限制。仍需满足研究、注册优先级和祭坛运行状态。`;
  if(effect.kind==='wand')return en
    ?`Machina startup compares component item identity and required NBT, ignoring metadata and stack size. Pedestal consumption separately uses the altar's ${p.pattern.mode} ore comparison; both phases must succeed. The shipped matcher checks the definition's wand class, without imposing that class on the offered center. All named prerequisites must exist and the target name must be absent. Output appends the name to Augmentations, replacing a malformed non-string list. Choices complete prerequisite tags as one-item specimens. Research, registry priority and altar execution remain conditions.`
    :`Machina 启动阶段只比较材料物品身份与所需 NBT，不检查元数据和堆叠数量；后续基座取料另用祭坛的 ${p.pattern.mode} 矿辞比较，两个阶段都须满足。原生匹配检查定义中的法杖类型，没有把该类型限制施加给实际中心。要求全部前置增强名称存在、目标名称不存在；结果向 Augmentations 追加名称，并替换畸形的非字符串列表。候选以补足前置标签的单件样本展示；仍需满足研究、注册优先级和祭坛执行条件。`;
  const common=en?`Native ${p.pattern.mode} ore comparison, with asymmetric crafting-tag checks and offered-first wildcard substitution. Components greedily select the first matching pedestal in declaration order; ${p.pattern.allowExtra?'extra components are allowed by matching':'extra components reject the recipe'}. Used pedestal slots are replaced as a whole. Choices show one-item specimens; the observed base-pedestal inventory limit is ${p.pedestalLimit}. Ordinary containers use the direct native getter and the pedestal limit. Research, recipe priority and live altar state still apply. `
    :`使用原生 ${p.pattern.mode} 矿辞比较、非对称合成标签检查，以及输入在前的通配元数据替换。周边材料按定义顺序选择首个匹配基座，${p.pattern.allowExtra?'匹配允许多余材料':'多余材料会使匹配失败'}；使用的基座槽整体替换。候选显示单件样本，观测到的原生基座库存上限为 ${p.pedestalLimit}；普通容器通过直接原生 getter 取得，再受基座上限限制。仍需满足研究、注册优先级与祭坛运行状态。`;
  if(p.nativeRecipe==='com.gtnewhorizon.gtnhlib.api.thaumcraft.EnhancedInfusionRecipe')return common+(p.replacementsActive
    ?(en?'GTNHLib takes the first matching replacement before ordinary containers. If the offered item matches the declared output by native item/metadata comparison, the offered stack and all its tags remain. Otherwise the declared stack is placed with its count capped to the pedestal limit, or null clears the slot without a container. Retention compares the offered stack as the wildcard target. These rules describe this registration; a live altar’s persisted state from an earlier craft is external.':'GTNHLib 先取首个匹配的替换条目，优先于普通容器；原生物品／元数据比较认定输入和声明产物相同时，原物及其全部标签保留。否则放入声明产物并按基座上限裁剪数量；null 直接清空，不返还普通容器。保留比较以原输入为通配目标。这里描述本条注册；祭坛从先前任务持久化的状态属于外部执行条件。')
    :(en?'The registered replacement table is retained as data, but the loaded altar class has no merged GTNH replacement support; ordinary native containers apply.':'保留注册的替换表数据，但当前加载的祭坛类未合入 GTNH 替换支持，因此按普通原生容器处理。'));
  if(effect.kind==='familiar')return common+(en?'Any registered ethereal-familiar item is accepted independently of the definition’s aspect/metadata specimen. The first native-ordered target alias supplies the current level; requires-previous checks the last alias. Conflict and Any/All conditions use registered object identity. Unknown aliases retain their ordered null-dereference behavior. The output reads the copied NBT order, increments that level and writes the canonical target name; a nonpositive wrapped level leaves the copied state unchanged. Generated specimens complete the target’s declared prerequisites without claiming every such state is obtainable.':'接受原生虚空使魔类注册物品，不以定义样本的要素／元数据限制中心。按原生顺序遇到的首个目标别名提供当前等级，要求前级时检查最后一个别名；冲突与 Any/All 条件使用注册对象身份。未知别名保留按顺序发生的空引用错误。产物按复制后的 NBT 顺序读取等级、加一并写入目标规范名；溢出为非正等级时保留复制状态。生成样本补足定义中的前置条件，不宣称每种状态都可获得。');
  if(effect.kind==='golem')return common+(en?'Golem upgrade requires the runicShield tag to be absent, regardless of its value. Output copies the center and writes byte 1 under gadomancy/upgrades. A present noncompound upgrades tag leaves the native write detached; unrelated data is retained.':'魔像要求不存在 runicShield 标签，已有零值也不接受；产物复制中心并在 gadomancy/upgrades 下写入 byte 1。若 upgrades 已是非复合标签，原生写入发生在游离对象中；保留该行为和其他数据。');
  if(effect.kind==='oldFamiliar')return common+(en?`Any registered old-familiar item is accepted; metadata and unrelated tags do not restrict it. ${effect.previous?`Native boolean ${effect.previous} must be true. `:''}The result copies its state and sets ${effect.key} to byte 1. Reapplying an already present upgrade is not rejected.`:`接受原生旧使魔类的注册物品，不限制其元数据和其他标签。${effect.previous?`原生布尔标签 ${effect.previous} 必须为真。`:''}产物复制状态并把 ${effect.key} 设为 byte 1；不会拒绝重复写入已有升级。`);
  if(effect.kind==='revolver')return common+(en?'Native matching does not check the central item type. Existing registered upgrade objects impose conflicts; the first target-object entry supplies its level. Numeric ids and object identity are distinct, and negative ids retain a native array-access error. The next level uses signed int wrapping. Costs double once per positive level, becoming zero after 32 doublings; instability also wraps. Output updates the first literal target id or appends it; malformed pre-existing list tags preserve detached-write behavior.':'原生匹配没有检查中心物品类型。现有注册升级对象决定冲突，首个目标对象条目提供等级；数字 ID 与对象身份分别保留，负 ID 保留原生数组访问错误。下一等级按有符号整数溢出计算。费用按每个正等级翻倍，32 次后归零；不稳定性也保留溢出。结果更新首个字面目标 ID 或追加条目，已有畸形列表保留游离写入行为。');
  return common+(en?'The registered fixed/tag result and configured NBT inheritance remain separate from these input predicates.':'注册的固定／标签产物及配置中的 NBT 继承与输入匹配规则分别记录。');
}
