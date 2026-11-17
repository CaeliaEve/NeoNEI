import type {Recipe,Item,Fluid} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'binnieLumbermill'}>;

export function validateLumbermillRecipe(r:Recipe,entities?:{items:ReadonlyMap<string,Pick<Item,'registry'|'meta'|'nbt'>>;fluids:ReadonlyMap<string,Pick<Fluid,'registry'|'nbt'>>}):void{
  const p=r.process;if(p?.kind!=='binnieLumbermill')return;
  const fail=()=>{throw new Error('Invalid native Binnie lumbermill inventory or work law');};
  if(p.version!=='2.5.24'||p.workTicks!==30||p.startTicks!==1||p.queuedTicks!==30||p.rfPerWorkTick!==30||p.fluidGate!==5||p.fluidDrainLimit!==10
    ||p.nativeCount<1||p.nativeCount>65536||p.nativeIndex<0||p.nativeIndex>=p.nativeCount||p.firstOreName.length>65535
    ||p.inputPolicy!=='normalFirstOreLogWoodRuntimeItemAndLiteralMetadata'||p.tankPolicy!=='normalWaterAdmissionRuntimeVolumeOnlyPartialDrain'
    ||p.outputPolicy!=='emptyPrototypeMatchingMergeKeepsTagsBestEffortThenDebit'||p.workPolicy!=='cachedStateFloatProgressPauseResetAndReselectAtFinish'
    ||r.source.owner!=='ExtraTrees'||r.source.handler!=='binnie.extratrees.nei.NEIHandlerLumbermill'
    ||r.duration!=null||r.energy!=null||r.grid!=null||r.magic!=null||Object.keys(r.properties).length!==0
    ||r.inputs.length!==2||r.outputs.length!==3||r.notes?.length!==1||r.notes[0]!.key!=='binnie:lumbermill'
    ||r.notes[0]!.source!=='binnie.extratrees.machines.lumbermill.LumbermillComponentLogic')fail();
  for(const [index,i]of r.inputs.entries()){
    const c=i.choices[0];if(i.slot!==index||i.kind!==(index===0?'item':'fluid')||i.choices.length!==1||!c||c.consume.kind!=='allocated'||c.returns.length!==0||c.amount!==(index===0?'1':'5'))fail();
    if(index===0){if(c!.rule.kind!=='wildcard'||c!.rule.meta||!c!.rule.nbt)fail();}
    else if(c!.rule.kind!=='lumbermillTank')fail();
  }
  for(const [index,o]of r.outputs.entries()){
    const q=o.quantity;if(o.kind!=='item'||o.slot!==index||o.role!=='result'||o.change!=null||o.amount!=null||o.chance.numerator!=='1'||o.chance.denominator!=='1'
      ||q?.kind!=='potential'||q.stat!=='binnie:lumbermillOutputState'||q.condition!=='nativeLumbermillSlotAccepts'||q.nominal!==(index===0?'6':'1')||q.sample!=null||q.parameters!=null)fail();
  }
  if(entities){
    const bark=entities.items.get(r.outputs[1]!.id),dust=entities.items.get(r.outputs[2]!.id),water=entities.fluids.get(r.inputs[1]!.choices[0]!.id);
    if(!bark||!dust||bark.registry!==dust.registry||bark.meta!==2||dust.meta!==1||bark.nbt!=null||dust.nbt!=null||water?.registry!=='water'||water.nbt!=null)fail();
  }
}
export function lumbermillNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ? `Native map order selects the first item/literal-metadata match, ignoring count and NBT. Normal insertion checks the first ore name (${p.firstOreName}) for logWood; saved runtime inventory bypasses that check. Water is the normal tank-admission sample; runtime accepts any stored fluid with at least 5 mB and drains up to 10 mB per successful work tick. Each work tick needs 30 RF; fresh/queued uninterrupted cycles take 31/30 updates. Missing power or fluid pauses, blocked work resets progress, and completion reselects the current material. Outputs in slots 1 planks, 2 bark and 3 sawdust copy into empty slots or merge item/meta while retaining existing NBT; failed placement is skipped but one wood is still debited. A matching plank output also needs capacity before work. Displayed outputs are conditional inventory prototypes, not fixed final tags or guaranteed byproducts.`
    : `按原生 map 顺序选择首个同物品和字面元数据匹配，忽略数量与 NBT。正常插入检查首个矿辞名称（${p.firstOreName}）是否包含 logWood；已保存库存的运行时加工不重复此限制。水是正常储罐插入样本；运行时接受任意已存流体，只要求能取出至少 5 mB，每个成功工作 tick 最多排出 10 mB，允许部分排出。每步需 30 RF；无中断时首次 31 次更新、连续 30 次，缺能或缺液暂停，不能工作时重置，完成时重新查询当前材料。输出槽 1 木板、2 树皮、3 锯末分别尝试放入：空槽复制原型，同物品元数据合并时保留已有 NBT；放入失败跳过，仍扣一件木材。木板在工作前另需通过容量检查。所示为条件库存原型，不是固定最终标签或必得副产物。`;
}
