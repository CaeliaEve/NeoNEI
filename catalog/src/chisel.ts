import type {Recipe} from '@elysium/contracts';

type Chisel = Extract<NonNullable<Recipe['process']>, {kind:'chisel'}>;

/** Validate the native allocation without treating metadata32767 as an implicit wildcard. */
export function validateChiselRecipe(recipe:Recipe):void {
  const p=recipe.process;if(p?.kind!=='chisel')return;
  const fail=()=>{throw new Error('Invalid Chisel lookup partitions, pickup or tool law');};
  const source=recipe.inputs[0],tool=recipe.inputs[1],output=recipe.outputs[0],returned=recipe.outputs[1];
  if(recipe.source.owner!=='chisel'||recipe.source.handler!=='team.chisel.compat.nei.RecipeHandlerChisel'
    ||p.sourceSlot!==0||p.toolSlot!==1||p.damagePoints!==1||p.targetCount<=0
    ||p.selection!=='nativeLookupExactPartitionsThenWildcard'||p.sourceNbt!=='ignored'
    ||p.canChisel!=='nativeItemChiselAlways'||p.onChisel!=='configuredAllowChiselDamage'
    ||p.damagePolicy!=='vanillaCreativeUnbreakingUnbreakable'||p.targetTag!=='chiselTarget'
    ||p.sources.length===0||p.sources.length>65536||p.tools.length===0||p.tools.length>65536
    ||recipe.inputs.length!==2||recipe.outputs.length!==2||recipe.duration!=null||recipe.energy!=null||recipe.grid!=null
    ||source?.kind!=='item'||source.slot!==0||tool?.kind!=='item'||tool.slot!==1
    ||output?.kind!=='item'||output.slot!==0||output.role!=='result'||output.amount!=null||output.change!=null
    ||output.chance.numerator!=='1'||output.chance.denominator!=='1'
    ||returned?.kind!=='item'||returned.slot!==1||returned.role!=='return'
    ||returned.change?.action.kind!=='chiselTool'||returned.change.input!==1
    ||returned.change.action.source!==0||returned.change.action.mode!==p.mode)fail();
  const partitions=new Set<string>();
  for(const entry of p.sources){
    const key=entry.item+'/'+entry.nativeWildcard;
    if(partitions.has(key)||!Number.isInteger(entry.nativeId)||entry.nativeId<0||entry.nativeId>32767
      ||entry.targets.length>1||entry.targets.some(t=>t.item!==p.target||t.count!==p.targetCount))fail();
    partitions.add(key);
  }
  const admitted=p.sources.filter(s=>s.targets.length>0);
  if(source!.choices.length!==admitted.length||tool!.choices.length!==p.tools.length)fail();
  source!.choices.forEach((choice,index)=>{
    const observed=admitted[index]!;
    if(choice.id!==observed.item||choice.amount!=='1'||choice.returns.length!==0
      ||choice.consume.kind!==(p.mode==='single'?'consume':'stack')
      ||choice.rule.kind!=='chiselSource'||choice.rule.meta!==observed.nativeWildcard||!choice.rule.nbt)fail();
  });
  tool!.choices.forEach((choice,index)=>{
    const policy=p.tools[index]!;
    if(choice.id!==policy.item||choice.amount!=='1'||choice.consume.kind!=='keep'||choice.returns.length!==0
      ||choice.rule.kind!=='chiselTool'||choice.rule.source!==0||policy.owner!=='team.chisel.item.chisel.ItemChisel'
      ||policy.maxDamage<0||(!policy.damageEnabled&&policy.maxDamage!==0)
      ||policy.damageEnabled!==p.tools[0]!.damageEnabled)fail();
  });
  const quantity=output!.quantity;
  if(quantity?.kind!=='potential'||quantity.stat!=='chisel:selection'
    ||quantity.condition!=='compatibleToolAndNativeTarget'||quantity.parameters!=null
    ||quantity.nominal!==String(p.mode==='single'?p.targetCount:1)||quantity.sample!==quantity.nominal)fail();
}

export function chiselNote(p:Chisel,locale:'zh-CN'|'en-US'='zh-CN'):string {
  if(locale==='en-US')return (p.mode==='single'
    ? `Single pickup consumes one source item and copies the native target count (${p.targetCount}) and NBT. Remaining source NBT stays in chiselTarget.`
    : 'Whole-stack pickup converts the entire offered source stack to the selected item and metadata, using that stack count and dropping the target NBT.')
    +' Source NBT is ignored for matching. Ore-ID and group encounter order resolve native lookup before block metadata; explicit partitions override the default metadata partition. Literal metadata32767 alone does not mean wildcard. Each successful pickup attempts one tool wear event when damage is enabled; creative mode, Unbreaking, Unbreakable and durability determine the actual returned tool. No machine duration or energy cost is implied.';
  return (p.mode==='single'
    ? `一次取用消耗一件输入，复制原生目标数量 ${p.targetCount} 和完整 NBT；余下输入的标签保存在 chiselTarget。`
    : '整叠取用转换当前输入的整个堆叠，输出使用该堆叠数量与目标物品/元数据，丢弃目标 NBT。')
    +'匹配忽略输入 NBT；先按原生矿辞编号与分组遍历顺序查找，再按方块元数据回退。明确列出的元数据分支覆盖默认分支，字面值 32767 本身不代表通配。启用损耗时每次成功取用尝试一次工具损耗，创造模式、耐久附魔、Unbreakable 与剩余耐久决定工具能否归还。不表示机器耗时或耗电。';
}
