import type {Recipe} from '@elysium/contracts';
type Process=Extract<NonNullable<Recipe['process']>,{kind:'molecularTransformer'}>;

/** Native operation cost, never an invented processing duration or EU/t rate. */
export function molecularTransformerNote(process:Process,locale:'zh-CN'|'en-US'='zh-CN'):string{
  return locale==='en-US'
    ? `Total energy per operation: ${process.energyPerOperation} EU; this is not EU/t and does not define a fixed duration. The first item and literal-metadata match claims the input; 32767 is literal and NBT is ignored. Too few inputs or a blocked output does not select a later duplicate. At work start, ${process.inputAmount==='0'?'one input must be present but none is consumed':process.inputAmount+' inputs are consumed'}, without crafting containers. The result prototype contains ${process.outputAmount} items. An empty output copies its NBT; a matching existing output keeps its own NBT when counts merge. Completion depends on supplied energy and output space. The shown prototype is not a guarantee of the merged stack’s final tags.`
    : `每次加工总能量 ${process.energyPerOperation} EU；这不是 EU/t，也不表示固定耗时。按物品和原始元数据选择第一条匹配配方，32767 按字面匹配，忽略 NBT；数量不足或输出槽受阻时不尝试后面的重复配方。开始工作时${process.inputAmount==='0'?'要求存在一个输入但不扣料':'扣除 '+process.inputAmount+' 个输入'}，不执行合成容器返还。原生产物模板为 ${process.outputAmount} 个；输出槽为空时复制模板 NBT，合并到相同物品与元数据的已有堆叠时保留已有 NBT。实际完成取决于供能和输出空间，所示模板不保证合并后堆叠的最终标签。`;
}
