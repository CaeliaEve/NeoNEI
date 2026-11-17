import type {Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'circuitFabricator'}>;
const tile='micdoodle8.mods.galacticraft.core.tile.TileEntityCircuitFabricator';
const handlers=new Set(['micdoodle8.mods.galacticraft.core.nei.CircuitFabricatorRecipeHandler','de.katzenpapst.amunra.nei.recipehandler.ARCircuitFab']);

/** Shared online/offline boundary; item-dependent native facts are verified by the Compiler. */
export function validateCircuitRecipe(recipe:Recipe):void{
  const p=recipe.process,handler=recipe.source?.handler??'',notes=recipe.notes??[];
  if(!handlers.has(handler)&&p?.kind!=='circuitFabricator')return;
  if(!handlers.has(handler)||p?.kind!=='circuitFabricator')throw new Error('Circuit requires its native five-slot law');
  let valid=p.nativeRegistry==='micdoodle8.mods.galacticraft.api.recipe.CircuitFabricatorRecipes'&&p.nativeTile===tile
    &&p.version==='3.3.13-GTNH'&&p.slots.length===5&&p.processingTicks===300&&p.maxExtractGj===(p.hard?40:20)
    &&p.priority==='firstMapEncounter'&&p.matcher==='itemLiteralMetadataIgnoreCountAndTags'
    &&p.inputDebit==='onCompletionOneWithoutContainers'&&p.capacity==='emptyOrOriginalCountSignedIntWithinLimits'
    &&p.work==='consecutiveEligibleTicksResetOnBlocked'&&p.outputPolicy==='emptyCopiesPrototypeMergeKeepsExistingTags'
    &&p.overflow==='mergeAbove64SpawnsUntaggedUnitsIgnoringSpawnResult'&&p.directCall==='debitsEvenIfOutputRejected'
    &&Number.isInteger(p.nativeIndex)&&p.nativeIndex>=0&&p.nativeIndex<262144&&(!p.quick||p.basicItem!=null)
    &&[p.rawOutputAmount,p.outputAmount].every(n=>/^[1-9][0-9]{0,9}$/.test(n)&&BigInt(n)<=2147483647n)
    &&recipe.duration==null&&recipe.energy==null&&recipe.grid==null&&recipe.magic==null&&Object.keys(recipe.properties).length===0&&notes.length===2
    &&notes[0]?.key==='galacticraft:layout'&&notes[0].source===tile+'.updateInput'
    &&notes[1]?.key==='galacticraft:outputState'&&notes[1].source===tile+'.compressItems'
    &&recipe.inputs.length===p.slots.filter(id=>id!=null).length;
  p.slots.forEach((id,index)=>{
    const inputs=recipe.inputs.filter(input=>input.slot===index+1);
    if(id==null){valid&&=inputs.length===0;return;}
    const i=inputs[0],c=i?.choices[0];
    valid&&=inputs.length===1&&i?.kind==='item'&&i.choices.length===1&&c?.id===id&&c.amount==='1'
      &&c.consume.kind==='consume'&&c.returns.length===0&&c.rule.kind==='wildcard'&&!c.rule.meta&&c.rule.nbt;
  });
  const o=recipe.outputs[0],q=o?.quantity;
  valid&&=recipe.outputs.length===1&&o?.kind==='item'&&o.slot===6&&o.id===p.output&&o.role==='result'
    &&o.amount==null&&o.change==null&&o.chance.numerator==='1'&&o.chance.denominator==='1'
    &&q?.kind==='potential'&&q.stat==='galacticraft:circuitOutputState'&&q.condition==='nativeCircuitOutputState'
    &&q.nominal===p.outputAmount&&q.sample===q.nominal&&q.parameters==null;
  if(!valid)throw new Error('Invalid circuit native slots, counts or output-state law');
}

export function circuitNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ? `Needs 300 consecutive eligible work ticks; a blocked tick resets progress. Power extraction ceiling: ${p.maxExtractGj} gJ, not a guaranteed fixed consumption or wall-clock duration. Five native slots 1–5 match the first HashMap encounter by item and literal metadata (32767 included), ignoring count and NBT. Null slots must stay empty. On normal completion, consume one per occupied slot without container returns. Capacity uses the original ${p.rawOutputAmount} output count with signed-int addition; quick mode ${p.quick?'enabled':'disabled'} gives a ${p.outputAmount}-item prototype. An empty output copies that prototype without capping; a matching existing output keeps its NBT. Merged excess above 64 attempts untagged single-item world drops and ignores spawn failure, then retains 64. The result is conditional on output state. A direct compressItems call debits inputs even when rejected; normal ticking gates that call.`
    : `需要连续 300 个可加工 tick；受阻时进度归零。电量最大提取值 ${p.maxExtractGj} gJ，不代表固定耗电或墙钟耗时。原生 1～5 槽按物品和字面元数据（包括 32767）取 HashMap 第一条匹配，忽略数量与 NBT；空槽必须留空。正常完成时每个占用槽扣一件，不返还合成容器。容量先用原始产量 ${p.rawOutputAmount} 做有符号 int 相加检查，快速模式${p.quick?'开启':'关闭'}后的模板产量为 ${p.outputAmount}。输出槽为空时复制模板且不封顶；合并时保留已有 NBT，超过 64 的部分尝试以不带模板 NBT 的单件掉落，忽略掉落失败，槽内保留 64。产物取决于机器输出状态。直接调用 compressItems 即使被拒绝仍扣料；正常 tick 路径会先检查条件。`;
}
