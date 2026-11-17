import type {Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'galacticraftRefinery'}>;
const handler='micdoodle8.mods.galacticraft.core.nei.RefineryRecipeHandler';
export function validateRefineryRecipe(r:Recipe):void{
  const p=r.process;if(r.source?.handler!==handler&&p?.kind!=='galacticraftRefinery')return;
  if(r.source?.handler!==handler||p?.kind!=='galacticraftRefinery')throw new Error('Refinery needs its native tank law');
  const i=r.inputs[0],c=i?.choices[0],o=r.outputs[0],q=o?.quantity,n=r.notes??[];
  const valid=p.nativeTile==='micdoodle8.mods.galacticraft.core.tile.TileEntityRefinery'&&p.version==='3.3.13-GTNH'
    &&p.scope==='fluidTankConversion'&&p.maxExtractGj===(p.hard?90:60)&&p.tankCapacity===24000
    &&p.countdownTicks===2&&p.freshStartupTicks===1&&p.transferAmount==='1'
    &&p.admission==='caseSensitiveOilPrefixCanonicalKeepsTagsAlternateDiscardsTags'
    &&p.work==='poweredEnabledCountdownResetOnBlocked'&&p.outputPolicy==='drainBeforeTryFillIgnoringRejectedFuel'
    &&p.containerPolicy==='tankOperationHasNoConsumedItemContainers'
    &&r.duration==null&&r.energy==null&&r.grid==null&&r.magic==null&&Object.keys(r.properties).length===0
    &&n.length===1&&n[0]?.key==='galacticraft:refinery'&&n[0].source===p.nativeTile+'.updateEntity'
    &&r.inputs.length===1&&i?.kind==='fluid'&&i.slot===0&&i.choices.length===1&&c?.id===p.input
    &&c.amount==='1'&&c.consume.kind==='consume'&&c.returns.length===0&&c.rule.kind==='wildcard'&&!c.rule.meta&&c.rule.nbt
    &&r.outputs.length===1&&o?.kind==='fluid'&&o.slot===0&&o.id===p.output&&o.role==='result'&&o.amount==null&&o.change==null
    &&o.chance.numerator==='1'&&o.chance.denominator==='1'&&q?.kind==='potential'&&q.stat==='galacticraft:refineryOutputState'
    &&q.nominal==='1'&&q.sample==='1'&&q.condition==='nativeRefineryTankAccepts'&&q.parameters==null;
  if(!valid)throw new Error('Invalid refinery normalization, countdown or drain-before-fill law');
}
export function refineryNote(p:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ? `Tank operation: first drain up to 1 mB of oil, then try to add 1 mB of ${p.legacyFuel?'fuelgc':'fuel'}. Incompatible output fluid or NBT may reject the fill after oil is consumed; fuel is conditional. Names must start with case-sensitive oil. Canonical oil keeps offered tags; other oil-prefixed fluids normalize without tags. Requires power, an enabled machine, positive oil and output volume. A fresh run takes one startup tick then two countdown ticks; queued runs take two ticks, and a blocked tick resets progress. Maximum extraction: ${p.maxExtractGj} gJ, not fixed energy consumption or wall-clock duration. Each tank holds 24000 mB. Item-container loading and unloading are separate machine I/O, not consumed ingredients of this tank operation.`
    : `油罐加工先扣最多 1 mB 原油，再尝试写入 1 mB ${p.legacyFuel?'fuelgc':'fuel'}。输出流体或 NBT 不兼容时可能扣油却无产出，因此燃料是条件结果。输入名称须以区分大小写的 oil 开头；原生原油保留输入标签，其他同前缀流体归一化且丢弃标签。还需供电、机器启用、油量和输出空间。首次为 1 个启动 tick 加 2 个倒计时 tick，连续加工为 2 tick；受阻时归零。最大提取 ${p.maxExtractGj} gJ，不等于固定耗电或墙钟耗时。两个罐各容纳 24000 mB。物品容器装卸属于独立机器 I/O，不是本条油罐加工的消耗材料。`;
}
