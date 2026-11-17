import type {Item,Match,Recipe} from '@elysium/contracts';

type Process=Extract<NonNullable<Recipe['process']>,{kind:'enderioEnchanter'}>;
type Entity=Pick<Item,'registry'|'meta'|'nbt'>;
function fail():never{throw new Error('Invalid native EnderIO enchanter level, pickup or slot law');}
function count(raw:string):bigint|null{
  if(raw.length>11||!/^(0|-?[1-9][0-9]*)$/.test(raw))return null;
  const n=BigInt(raw);return n>=-2147483648n&&n<=2147483647n?n:null;
}
export function enchanterAccepts(p:Process,raw:string):boolean{
  const n=count(raw);return n!=null&&n>=BigInt(p.offeredMinimum)&&n<=BigInt(p.offeredMaximum);
}
function primitive(rule:Match):boolean{
  return rule.kind==='wildcard'&&rule.nbt===true||rule.kind==='nativeMetadataKey'&&rule.code>0&&rule.code<=65535;
}
function material(rule:Match,example:Entity,offered:Entity,items:ReadonlyMap<string,Entity>):boolean{
  if(rule.kind==='except')return material(rule.base,example,offered,items)
    &&!rule.exclude.some(prior=>material(prior.rule,items.get(prior.id)??fail(),offered,items));
  if(example.registry!==offered.registry)return false;
  if(rule.kind==='wildcard')return rule.meta||example.meta===offered.meta;
  if(rule.kind==='nativeMetadataKey')return ((offered.meta+1)&65535)===rule.code;
  return fail();
}
export function validateEnchanterRecipe(r:Recipe,items?:ReadonlyMap<string,Entity>):void{
  const p=r.process;if(p?.kind!=='enderioEnchanter')return;
  const minimum=BigInt(p.itemsPerLevel)*BigInt(p.level);
  const upper=p.level===p.maxLevel?2147483647n:BigInt(p.itemsPerLevel)*(BigInt(p.level)+1n)-1n;
  const maximum=upper<2147483647n?upper:2147483647n;
  const cost=(p.baseCost+Math.imul(Math.imul(p.costPerLevel,p.level),p.level))|0;
  if(p.version!=='2.9.28'||p.level<1||p.level>p.maxLevel||p.maxLevel>32767||p.itemsPerLevel<1||p.itemsPerLevel>2147483647
    ||p.costPerLevel<0||p.enchantment<0||minimum>2147483647n||p.offeredMinimum!==String(minimum)||p.offeredMaximum!==String(maximum)||p.cost!==cost
    ||p.bookPolicy!=='runtimePresenceClearWholeSlot'||p.materialPolicy!=='nativeCountDeterminesLevelDebitDivisorTimesLevelNoContainers'
    ||p.pickupPolicy!=='creativeBypassXpElseSignedLevelDebit'
    ||r.source.owner!=='EnderIO'||r.source.handler!=='crazypants.enderio.nei.EnchanterRecipeHandler'
    ||r.duration!=null||r.energy!=null||r.grid!=null||r.magic!=null||Object.keys(r.properties).length!==0
    ||r.inputs.length!==2||r.outputs.length!==1||r.notes?.length!==1||r.notes[0]!.key!=='enderio:enchanter'
    ||r.notes[0]!.source!=='crazypants.enderio.machine.enchanter.ContainerEnchanter$3.onPickupFromSlot')fail();
  for(const [index,input]of r.inputs.entries()){
    if(input.kind!=='item'||input.slot!==index||input.choices.length===0)fail();
    for(const c of input.choices){
      if(c.consume.kind!=='allocated'||c.returns.length!==0||c.amount!==(index===0?'1':p.offeredMinimum))fail();
      if(index===0){if(input.choices.length!==1||c.rule.kind!=='enchanterBook')fail();
        if(items){const book=items.get(c.id)??fail();if(book.registry!=='minecraft:writable_book'||book.meta!==0||book.nbt!=null)fail();}
      }else{
        const rule=c.rule;
        if(rule.kind==='except'){if(!primitive(rule.base)||rule.exclude.length===0||rule.exclude.some(v=>!primitive(v.rule)))fail();}
        else if(!primitive(rule))fail();
        if(items){const example=items.get(c.id)??fail();if(!material(rule,example,example,items))fail();}
      }
    }
  }
  const o=r.outputs[0]!,q=o.quantity;
  if(o.kind!=='item'||o.slot!==0||o.role!=='result'||o.amount!=null||o.change!=null||o.chance.numerator!=='1'||o.chance.denominator!=='1'
    ||q?.kind!=='potential'||q.stat!=='enderio:enchanterPickup'||q.condition!=='nativeEnchanterLevelAndPickup'||q.nominal!=='1'||q.sample!=null||q.parameters!=null)fail();
  if(items){
    const book=items.get(o.id)??fail();if(book.registry!=='minecraft:enchanted_book'||book.meta!==0||book.nbt?.type!=='compound')fail();
    const root=book.nbt.value;
    const list=root.StoredEnchantments;if(Object.keys(root).length!==1||list?.type!=='list'||list.element!=='compound'||list.value.length!==1)fail();
    const record=list.value[0];if(record?.type!=='compound'||Object.keys(record.value).length!==2)fail();
    const id=record.value.id,level=record.value.lvl;
    if(id?.type!=='short'||id.value!==String((p.enchantment<<16)>>16)||level?.type!=='short'||level.value!==String(p.level))fail();
  }
}
export function enchanterNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ? `Level ${p.level} requires an actual stored material count in ${p.offeredMinimum}–${p.offeredMaximum}. The first matching recipe wins before quantity checks. The saved divisor is ${p.itemsPerLevel}; pickup debits ${p.itemsPerLevel*p.level} materials, retaining the remainder without containers. Normal insertion accepts writable books; runtime requires an occupied book slot and pickup clears the whole book slot. Signed XP cost is ${p.cost}; creative mode bypasses its check and payment. The output is conditional on the count interval, occupied book slot and pickup eligibility. The inventory setter copies before its caller-side clamp; a GUI limit of 64 is not a runtime matching bound.`
    : `附魔等级 ${p.level} 对应实际材料库存数量区间 ${p.offeredMinimum}–${p.offeredMaximum}。先取首个匹配配方，再检查数量；注册时保存的除数为 ${p.itemsPerLevel}，领取时扣 ${p.itemsPerLevel*p.level} 件材料，保留余料，不返还容器。正常插入接收书与笔；运行时只要求书本槽被占用，领取时清空整槽。经验费用按原生有符号整数计算，为 ${p.cost} 级；创造模式免经验检查和支付。产物取决于数量区间、书本槽存在和领取条件。库存设置先复制后限制调用方数量，不能用 GUI 的 64 件上限排除原生运行时状态。`;
}
