import type {Item,Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'nativeBrewing'}>;
const invalid=():never=>{throw new Error('Invalid native shared-ingredient brewing transformation');};
export function validateNativeBrewingRecipe(r:Recipe,items?:ReadonlyMap<string,Item>):void{
  const p=r.process;if(p?.kind!=='nativeBrewing'){if(r.source.handler==='codechicken.nei.recipe.BrewingRecipeHandler')invalid();return;}
  if(p.version!=='1.7.10'||r.source.handler!=='codechicken.nei.recipe.BrewingRecipeHandler'||p.ingredient!==0||p.potion!==1||p.workTicks!==400||p.maximumPotions!==3
    ||p.expression.length>16384||p.preserveNbt===p.lingering||r.inputs.length!==2||r.outputs.length!==1||r.grid!=null||r.magic!=null||r.duration!=null||r.energy!=null||Object.keys(r.properties).length)invalid();
  for(const [slot,input]of r.inputs.entries()){
    if(input.kind!=='item'||input.slot!==slot||input.choices.length!==1)invalid();const c=input.choices[0]!;
    if(c.amount!=='1'||c.consume.kind!=='consume'||c.rule.kind!=='wildcard'||c.rule.meta||!c.rule.nbt||slot===1&&c.returns.length)invalid();
    if(items){const item=items.get(c.id)??invalid();if(slot===1&&(item.registry!=='minecraft:potion'||item.meta!==p.inputMetadata)||p.lingering&&slot===0&&item.registry!=='etfuturum:dragon_breath')invalid();}
  }
  if(p.lingering&&(p.expression!==''||(p.inputMetadata&0x4000)===0||p.outputMetadata!==p.inputMetadata))invalid();
  if(p.resultRegistry!==(p.lingering?'etfuturum:lingering_potion':'minecraft:potion'))invalid();
  const output=r.outputs[0]!;if(output.kind!=='item'||output.slot!==0||output.change!=null||output.amount!=null||output.chance.numerator!=='1'||output.chance.denominator!=='1'
    ||output.quantity?.kind!=='potential'||output.quantity.stat!=='minecraft:brewingInventory'||output.quantity.nominal!=='1')invalid();
  if(items){const item=items.get(output.id)??invalid();if(item.registry!==p.resultRegistry||item.meta!==p.outputMetadata||item.nbt!=null)invalid();}
}
export function nativeBrewingNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ?`One shared ingredient processes up to ${p.maximumPotions} potion slots per cycle. This row shows a per-slot transformation, not one ingredient per bottle. The native counter is ${p.workTicks}; inventory changes and events can cancel completion. ${p.lingering?'Requires the fuelled new brewing stand. Native lingering creation retains the splash metadata bit and clears old NBT.':'Ordinary brewing changes metadata in place and retains the input potion NBT.'} The displayed item is the untagged prototype; actual tags and complete inventory state remain part of the native result.`
    :`一轮共同取用一份材料，处理最多 ${p.maximumPotions} 个药水槽。本行表示一个槽的变换，不是每瓶消耗一份材料。原生工作计数 ${p.workTicks}，库存变化及事件可取消完成。${p.lingering?'需要带燃料的新酿造台，原生滞留药水保留喷溅元数据位并清除原 NBT。':'普通酿造在原槽修改元数据，保留输入药水的 NBT。'}所示物品为无标签原型，实际标签与完整库存状态仍属于原生产出规则。`;
}
