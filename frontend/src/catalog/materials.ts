import {nativeRitualNote} from '../../../catalog/src/native-ritual.ts';
import {salisReplacementNote} from '../../../catalog/src/salis-wand.ts';
import {matterManipulatorNote} from '../../../catalog/src/matter-manipulator.ts';
import {nativeInfusionNote,nativeRunicNote} from '../../../catalog/src/infusion.ts';
import {disguiseInfusionNote} from '../../../catalog/src/infusion-disguise.ts';
import {witcherySpinningNote} from '../../../catalog/src/witchery-spinning.ts';
import {witchingSpinningNote} from '../../../catalog/src/witching-spinning.ts';
import {nativeOvenNote} from '../../../catalog/src/native-oven.ts';
import {arcaneSpecialNote} from '../../../catalog/src/arcane-special.ts';
import {imbuingNote} from '../../../catalog/src/imbuing.ts';
import {bloodOrbNote} from '../../../catalog/src/blood-orb.ts';
import {inventoryProcessNote} from '../../../catalog/src/inventory-process.ts';
import type { Choice, Input, Output, Recipe } from '@elysium/contracts';
import { gtToolNote } from '../catalog/gt-tool.ts';
import { nativeContainerNote } from '../catalog/native-container.ts';
import { aeEnderDustNote } from '../catalog/ae-ender-dust.ts';
import { nativeStateInputNote, nativeStateOutputNote } from '../catalog/native-state-rules.ts';
import {aeCraftingNote} from '../../../catalog/src/ae-crafting.ts';
import {wirelessTerminalNote} from '../../../catalog/src/wireless-terminal.ts';
import {projectRedNote} from '../../../catalog/src/projectred.ts';
import {botaniaWorldNote} from '../../../catalog/src/botania-world.ts';
import {bloodCalcinatorNote} from '../../../catalog/src/blood-calcinator.ts';
import {nativeBrewingNote} from '../../../catalog/src/native-brewing.ts';
import {inscriberNote} from '../../../catalog/src/inscriber.ts';
import {botaniaInputNote,botaniaNote} from '../../../catalog/src/botania.ts';
import {nativePoolNote} from '../../../catalog/src/botania-pool.ts';
import {gendustryTemplateNote} from '../../../catalog/src/gendustry-template.ts';
import {gendustryGeneticsInputNote,gendustryGeneticsOutputNote} from '../../../catalog/src/gendustry-genetics.ts';
import {gendustryFluidNote} from '../../../catalog/src/gendustry-fluid.ts';
import { recipeChoiceIndex, recipeSampleIndex } from '../../../catalog/src/selection.ts';
import { validateZeroFluid, validateZeroFluidRecipe, zeroFluidNote } from '../../../catalog/src/zero-fluid.ts';
import {addMaterialQuantities,parseBatches as exactBatches,multiplyQuantity} from '../../../catalog/src/material-quantity.ts';
export {multiplyQuantity} from '../../../catalog/src/material-quantity.ts';

export type Selection = Record<string, number>;
export interface MaterialLocale {
  language:'zh-CN'|'en-US';
  t:(value:string,...args:(string|number|bigint)[])=>string;
}
export interface MaterialRow { kind: 'item' | 'fluid'; id: string; amount: string | null; note: string }
export interface Materials {
  inputs: MaterialRow[]; outputs: MaterialRow[]; returns: MaterialRow[]; tools: MaterialRow[]; uncertain: MaterialRow[];
}

export function parseBatches(value: string, locale:MaterialLocale): bigint {
  try{return exactBatches(value);}
  catch{throw new Error(locale.t("执行批次必须是正整数"));}
}
export function formatQuantity(value: string): string {
  const [whole, fraction] = value.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
}

function sum(rows: MaterialRow[], row: MaterialRow): void {
  const existing = rows.find(candidate => candidate.kind === row.kind && candidate.id === row.id && candidate.note === row.note);
  if (existing && existing.amount !== null && row.amount !== null) existing.amount = addMaterialQuantities(existing.amount, row.amount);
  else rows.push(row);
}
function specialInput(recipe: Recipe, input: Input, choice: Choice, batches: bigint, locale:MaterialLocale): string {
  const t=locale.t,language={value:locale.language};
  if(recipe.process?.kind==='salisReplacement')return salisReplacementNote(recipe.process,language.value);
  if(recipe.process?.kind==='matterManipulatorUpgrade')return matterManipulatorNote(recipe.process,language.value);
  if(recipe.process?.kind==='nativeInfusion')return nativeInfusionNote(recipe.process,language.value);
  if(recipe.process?.kind==='nativeRunic')return nativeRunicNote(recipe.process,language.value);
  if(recipe.process?.kind==='witcheryNativeRitual')return nativeRitualNote(recipe.process,language.value);
  if(recipe.process?.kind==='witcheryNativeOven')return nativeOvenNote(recipe.process,language.value);
  const nativeNote=nativeStateInputNote(recipe.process,input,choice,language.value);
  if(nativeNote!==null)return nativeNote;
  if(recipe.process?.kind==='binnieLumbermill')return input.kind==='fluid'
    ? t("水为正常插入样本；运行时检查任意已存流体的 5 mB 门槛，每个成功工作 tick 最多排出 10 mB，不是固定每批用水量。")
    : t("完成时重选当前木材并扣一件；正常插入与已保存库存的运行时限制不同，不返还合成容器。");
  if(recipe.process?.kind==='enderioEnchanter')return input.slot===0
    ? t("正常插入样本为书与笔；运行时书本槽只要求存在，领取时清空整槽，不是固定消耗一本。")
    : t("附魔等级取决于实际库存数量区间 {0}–{1}；领取时扣 {2} 件，保留余料，不返还容器。", recipe.process.offeredMinimum, recipe.process.offeredMaximum, recipe.process.itemsPerLevel*recipe.process.level);
  if(recipe.process?.kind==='witcheryDistillery')return input.slot===2
    ? t("原生罐子门槛与有符号调整量为 {0}；按运行时槽位匹配，不等于固定批次消耗。", recipe.process.jars)
    : t("每个占用的原料槽取用一件，两个原料槽可互换；前序匹配及输出空间可能阻断加工，不返回合成容器。");
  const n = formatQuantity(choice.amount), unit = input.kind === 'fluid' ? 'mB' : t("件");
  switch (choice.consume.kind) {
    case 'chance': return t("每次原生抽取以 {0}/{1} 概率消耗一件；不能按批次确定总用量。", choice.consume.chance.numerator, choice.consume.chance.denominator);
    case 'staged': return t("存量门槛 {0} {1}；按原生阶段尝试取料，容器与进度影响实际消耗。", n, unit);
    case 'upto': return t("每批至少一件，最多消耗 {0} {1}；{2} 批上限 {3} {4}。", n, unit, batches, formatQuantity(multiplyQuantity(choice.amount, batches)), unit);
    case 'allocated': return recipe.process?.kind === 'lootBagOpening'
      ? t("只有完整完成开袋才扣除一个袋子；某轮抽取为空会保留袋子及此前已掉落物品。")
      : recipe.process?.kind === 'witcheryOven'
      ? t("至少备 {0} 个罐子；每次只在实际放入副产物时消耗一个罐子，抽取失败或副产物槽不接受时保留。", n)
      : t("每批需求 {0} {1}；按原生顺序分配库存，实际扣料取决于槽位和存量。", n, unit);
    case 'stack': return t("整叠处理；{0} {1} 是示例数量，不能据此确定批次用量。", n, unit);
    case 'buffer':
      return t("最低存量门槛 {0} {1}；启动时耗尽内部存量。", n, unit);
    case 'pedestals': return t("样本为 {0} 座、每座一件；实际座数随输入屏障变化。", n);
    default: return t("按原生消耗规则处理，见配方详情。");
  }
}
function outputNote(recipe: Recipe, output: Output, locale:MaterialLocale): string {
  const t=locale.t,language={value:locale.language};
  if(output.change?.action.kind==='nativeInfusionMerge'&&output.change.action.tools)return t('所示产物已包含工具判断产生的标签与变体变化；前序判断不满足时，不会继续判断或继承。');
  if(recipe.process?.kind==='nativeRunic')return nativeRunicNote(recipe.process,language.value);
  if(recipe.process?.kind==='salisReplacement')return salisReplacementNote(recipe.process,language.value);
  if(recipe.process?.kind==='matterManipulatorUpgrade')return matterManipulatorNote(recipe.process,language.value);
  if(recipe.process?.kind==='nativeInfusion')return nativeInfusionNote(recipe.process,language.value);
  if(recipe.process?.kind==='disguiseInfusion')return disguiseInfusionNote(language.value);
  if(recipe.process?.kind==='witcheryNativeRitual')return nativeRitualNote(recipe.process,language.value);
  if(recipe.process?.kind==='witcheryNativeOven')return nativeOvenNote(recipe.process,language.value);
  const nativeNote=nativeStateOutputNote(recipe.process,output,language.value);
  if(nativeNote!==null)return nativeNote;
  if(recipe.process?.kind==='binnieLumbermill')return t("条件库存原型：空槽复制，同物品元数据合并保留已有 NBT；不兼容或满槽跳过放入，仍会扣木材。");
  if(recipe.process?.kind==='enderioEnchanter')return t("条件产物：需要指定材料数量区间、被占用的书本槽及经验领取条件；更大库存可能对应另一个附魔等级。");
  if(recipe.process?.kind==='witcheryDistillery')return t("条件库存结果：空槽复制原型，相同物品合并保留已有 NBT；不兼容槽会失去该项产物，原料与罐子仍会取用。");
  const notes: string[] = [];
  if (output.role === 'return') notes.push(t("归还"));
  if (output.change?.action.kind === 'bannerPattern') notes.push(t("保留原有图案、底色和其他数据；追加图案使用各染料共同的颜色，所示仅是一个输入样本"));
  if (output.change?.action.kind === 'calImprint') notes.push(t("保留机器原有配置及旧 Type 标签，将 id_imprint 写为压印的枚举 ID；已有有效压印的机器不能再次压印，旧 Type 的判断需要原生上下文"));
  if (output.change?.action.kind === 'fmpResult') notes.push(t("ForgeMultipart 原生程序化分支；空心、粘合、变薄、切分和填心按原生优先级匹配，锯子可能损耗"));
  else if (output.change) notes.push(t("动态产物；所选候选仅对应一个原生样本，实际数据依输入变化"));
  const q = output.quantity;
  if (q) {
    if (q.kind === 'spaceAcquisition') return recipe.process?.kind === 'spaceAcquisition' && recipe.process.operation === 'siphon'
      ? t("原生基数 {0}；实际产量随轨道、深度、电压超频和输出空间变化，挖矿管与电路不消耗。", formatQuantity(q.nominal))
      : t("原生基数 {0}；实际产量随模块、并行、批量和输出舱状态变化，需要连接有效太空电梯并满足能量门槛。", formatQuantity(q.nominal));
    const descriptions = {
      lootBag: t("同组物品一起抽出；实际数量随幸运附魔、随机抽取、玩家领取次数限制和拆叠变化"),
      harvest: t("共享原生抽取；花园可以重复抽到同一产物，陷阱每轮只抽一个候选"),
      bloodAltar: t("按整叠输入转换；原生基数是单件预览，实际产量随整叠数量和机器状态变化"),
      squeezer: t("原生压榨参数；实际取料、空间与残余物抽取影响产出"),
      soul: t("共享灵魂完成条件与输出空间影响产出"),
      grinding: t("共享抽取与研磨珠状态影响产量，可能重复产出"),
      sharedRoll: t("各产物共享一次抽取，输出空间影响实际数量"),
      harmony: t("共享成功／失败次数与稳定场、过量流体影响产量"),
      draw: t("关联随机抽取，与其他产物共享输入流体量"),
      remainder: t("输入流体减去关联产物后的回收余量"),
      branch: t("互斥工况分支，须满足分支条件"),
      potential: t("潜在产量，须满足原生条件与输出空间"),
    };
    notes.push(descriptions[q.kind]);
    if ('nominal' in q) notes.push(t("原生基数 ") + formatQuantity(q.nominal));
    if ('condition' in q && q.condition) {
      const conditionNotes: Record<string, string> = {
          nativeBatchCompletes: t("取决于已保存的衰变状态；本批未完成时保留输入，标签类型错误会报原生异常，不保证产出"),
          nativeEnergyAndOutputAccepts: t("需要总能量到位且输出槽可接收；合并时保留已有堆叠的 NBT，所示原生模板不是固定标签结果"),
          nativeCircuitOutputState: t("取决于机器输出槽与快速模式：合并保留已有 NBT，超过 64 的快速模式产物会以不带模板 NBT 的物品掉落"),
          nativeRefineryTankAccepts: t("原油先扣除，燃料槽的流体或 NBT 不兼容时可能写入失败；不能保证产出"),
        nativeInputState: t("基因、输入数据与机器进度共同决定实际结果"),
        compatibleToolAndNativeTarget: t("需使用兼容凿子并选择原生可转换目标；每次操作可能损耗工具"),
        nativeJarRollAndOutputAccepts: t("须抽取成功且副产物槽能接收；未放入副产物时不消耗罐子"),
        playerWorldCreationLifecycle: t("这是刚合成的待处理灵魂；归属和可用状态由玩家与世界回调决定，成功时降低玩家最大生命值"),
      };
      notes.push(conditionNotes[q.condition] ?? t("须满足配方所列的原生条件"));
    }
  }
  if (BigInt(output.chance.numerator) !== BigInt(output.chance.denominator)) {
    notes.push(t("标注概率 {0}/{1}，不保证每批取得", output.chance.numerator, output.chance.denominator));
  }
  if (output.amount != null) notes.push(t("每次标注") + (output.change ? t("样本") : t("数量")) + ' ' + formatQuantity(output.amount) + (output.kind === 'fluid' ? ' mB' : t(" 件")));
  return notes.join('；') || t("未提供固定数量，见原生配方详情。");
}

/** A direct bill for successful executions, never a recursive production plan or a probability estimate. */
export function calculateMaterials(recipe: Recipe, count: string, selected: Selection, locale:MaterialLocale): Materials {
  const t=locale.t,language={value:locale.language},gameLocale=locale.language==='en-US'?'en_US':'zh_CN';
  validateZeroFluidRecipe(recipe);
  const batches = parseBatches(count,locale);
  const result: Materials = { inputs: [], outputs: [], returns: [], tools: [], uncertain: [] };
  const conditionalRegisteredCraft = (recipe.process?.kind === 'extremeCrafting' || recipe.process?.kind === 'galaxyspace-assembly')
    && (recipe.process.earlier.length > 0 || recipe.process.repair.some(repair => repair.enabled));
  for (const input of recipe.inputs) {
    const index = recipeChoiceIndex(recipe, selected, input);
    if (index === -1 && recipe.outputs.some(output => output.change?.bindings)) continue;
    const choice = input.choices[index];
    if (!choice) throw new Error(t("配方输入缺少所选候选"));
    if(recipe.process?.kind==='nativeBotaniaPool'){
      result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note:nativePoolNote(null,language.value)});continue;
    }
    if(recipe.process?.kind==='gendustryTemplate'){
      const note=gendustryTemplateNote(language.value);
      result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note});
      for(const returned of choice.returns)result.uncertain.push({...returned,amount:null,note});
      continue;
    }
    if(recipe.process?.kind==='gendustryGenetics'){
      result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note:gendustryGeneticsInputNote(recipe.process,input,language.value)});
      continue;
    }
    if(recipe.process?.kind==='gendustryFluid'){
      result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note:gendustryFluidNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='botaniaWorld'){
      result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note:botaniaWorldNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='randomThingsImbuing'){
      result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note:imbuingNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='bloodAlchemy'||recipe.process?.kind==='logisticsSoldering'){
      result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note:inventoryProcessNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='bloodCalcinator'){
      result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note:bloodCalcinatorNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='nativeBrewing'){
      const note=nativeBrewingNote(recipe.process,language.value);result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note});for(const returned of choice.returns)result.uncertain.push({...returned,amount:null,note});continue;
    }
    if(recipe.process?.kind==='nativeInfusion'){
      const note=nativeInfusionNote(recipe.process,language.value);result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note});
      for(const returned of choice.returns)result.uncertain.push({...returned,amount:null,note});continue;
    }
    if(recipe.process?.kind==='matterManipulatorUpgrade'){
      const note=matterManipulatorNote(recipe.process,language.value);result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note});
      for(const returned of choice.returns)result.uncertain.push({...returned,amount:null,note});continue;
    }
    if(recipe.process?.kind==='salisReplacement'){
      const note=salisReplacementNote(recipe.process,language.value);result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note});
      for(const returned of choice.returns)result.uncertain.push({...returned,amount:null,note});continue;
    }
    if(recipe.process?.kind==='nativeRunic'){
      const note=nativeRunicNote(recipe.process,language.value);result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note});
      for(const returned of choice.returns)result.uncertain.push({...returned,amount:null,note});continue;
    }
    if(recipe.process?.kind==='disguiseInfusion'){
      const note=disguiseInfusionNote(language.value);result.uncertain.push({kind:input.kind,id:choice.id,amount:null,note});
      for(const returned of choice.returns)result.uncertain.push({...returned,amount:null,note});continue;
    }
    const ovenNotes = {
      foul: t("仅接受没有 Genome 树木基因标签的输入，允许其他标签。"),
      exhale: t("需要首个主树种基因为 Forestry 橡树的木材；图标仅表示物品种类。"),
      hint: t("需要首个主树种基因为 Forestry 云杉的木材；图标仅表示物品种类。"),
      breath: t("需要首个主树种基因为 Forestry 白桦的木材；图标仅表示物品种类。"),
      none: t("输入需含 Genome 标签，且未被识别为橡树、云杉或白桦；不产生副产物。"),
      whiff: '', reek: '', odour: '',
    };
    const row: MaterialRow = { kind: input.kind, id: choice.id, amount: null,
      note: choice.rule.kind === 'bannerInput' ? t("需要少于六层图案的旗帜；保留原有图案、底色和其他附加数据。")
        : choice.rule.kind === 'witcheryOvenNbt' ? ovenNotes[choice.rule.product]
        : choice.rule.kind === 'ae2EnderDust' ? aeEnderDustNote(choice.rule,gameLocale) : '' };
    const consumption = choice.consume;
    if (choice.rule.kind === 'nativeZeroFluid') {
      validateZeroFluid(recipe, input, choice);
      const target = choice.rule.policy === 'gregtechCost' ? result.uncertain : result.tools;
      sum(target, { ...row, amount: '0', note: zeroFluidNote(choice.rule.policy, language.value) });
    } else if (choice.rule.kind === 'ae2EnderDust' && choice.rule.metadata === 32767) {
      sum(result.uncertain, { ...row, amount: multiplyQuantity(choice.amount, batches) });
    } else if(recipe.process?.kind==='creativeCoreCrafting'){
      const rule=choice.rule;
      result.uncertain.push({...row,note:rule.kind==='creativeCore'?t("库存门槛 {0}，每次占用格扣一件；需要有效原生摆放和候选组合，不按默认样本保证批次用量。", recipe.process.predicates[rule.input]!.minimum):''});
    } else if (recipe.process?.kind === 'buildcraftIntegration') {
      row.note = t("输入组合样本；扩展材料按原生规则消耗，不是固定批次用量。");
      result.uncertain.push(row);
    } else if(recipe.process?.kind==='witcheryNativeRitual'){
      result.uncertain.push({...row,amount:null,note:nativeRitualNote(recipe.process,language.value)});
    } else if(recipe.process?.kind==='witcheryNativeOven'){
      result.uncertain.push({...row,amount:null,note:nativeOvenNote(recipe.process,language.value)});
    } else if (consumption.kind === 'nativeContainer') {
      const note=nativeContainerNote(consumption,gameLocale);
      if(consumption.callback!=='botaniaCosmetic')sum(result.tools,{...row,amount:choice.amount,note});
      else {
        sum(result.inputs,{...row,amount:multiplyQuantity(choice.amount,batches)});
        result.uncertain.push({...row,amount:null,note});
      }
    } else if (consumption.kind === 'consume') {
      sum(result.inputs, { ...row, amount: multiplyQuantity(choice.amount, batches) });
    } else if (consumption.kind === 'gtTool') {
      sum(result.tools, { ...row, amount: choice.amount, note: gtToolNote(consumption,gameLocale) });
    } else if (['keep', 'damage', 'wear', 'reserve'].includes(consumption.kind)) {
      const note = (recipe.process?.kind==='botaniaPool'||recipe.process?.kind==='botaniaRunic'||recipe.process?.kind==='floatingFlowers'||recipe.process?.kind==='nativeFloatingFlowers'?botaniaInputNote(recipe.process,input,choice,language.value):null) ?? nativeStateInputNote(recipe.process,input,choice,language.value) ?? (consumption.kind === 'keep' ? (recipe.process?.kind === 'chisel'
        ? t("需备兼容凿子；启用损耗时每次成功取用尝试一次损耗，附魔、创造模式与工具状态决定实际耐久，损坏后可能消失。")
        : t("保留；重复执行可复用，不乘批次。"))
        : consumption.kind === 'damage' ? t("输入槽 {0} 需备工具；本槽标注耐久损耗合计 {1}，不推算需要补充几件工具。", input.slot + 1, BigInt(consumption.points) * batches)
        : consumption.kind === 'wear' ? t("需备工具；完工时尝试损耗，附魔和工具状态决定实际耐久。")
        : t("可选研磨珠库存；旧珠耗尽后装载时才消耗一件，不按批次扣料。"));
      sum(result.tools, { ...row, amount: choice.amount, note });
    } else result.uncertain.push({ ...row, note: specialInput(recipe, input, choice, batches,locale) });
    for (const returned of choice.returns) {
      if (consumption.kind === 'consume' && recipe.process?.kind !== 'buildcraftIntegration' && recipe.process?.kind!=='creativeCoreCrafting' && !conditionalRegisteredCraft) {
        sum(result.returns, { ...returned, amount: multiplyQuantity(returned.amount, batches), note: '' });
      } else result.uncertain.push({ ...returned, amount: null, note: t("特殊消耗的归还项；标注 ") + formatQuantity(returned.amount) + t("，实际归还见原生消耗条件。") });
    }
  }
  for (const output of recipe.outputs) {
    if(recipe.process?.kind==='nativeBotaniaPool'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:nativePoolNote(null,language.value)});continue;
    }
    if(recipe.process?.kind==='witcheryNativeRitual'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:nativeRitualNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='witcheryNativeOven'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:nativeOvenNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='randomThingsImbuing'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:imbuingNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='bloodAlchemy'||recipe.process?.kind==='logisticsSoldering'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:inventoryProcessNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='gendustryFluid'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:gendustryFluidNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='gendustryGenetics'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:gendustryGeneticsOutputNote(language.value)});continue;
    }
    if(recipe.process?.kind==='gendustryTemplate'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:gendustryTemplateNote(language.value)});continue;
    }
    if(recipe.process?.kind==='botaniaPool'||recipe.process?.kind==='botaniaRunic'||recipe.process?.kind==='floatingFlowers'||recipe.process?.kind==='nativeFloatingFlowers'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:botaniaNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='inscriber'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:inscriberNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='witcherySpinning'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:witcherySpinningNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='witchingSpinning'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:witchingSpinningNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='arcaneSpecial'||recipe.process?.kind==='stickyJar'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:arcaneSpecialNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='matterManipulatorUpgrade'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:matterManipulatorNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='salisReplacement'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:salisReplacementNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='nativeRunic'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:nativeRunicNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='nativeInfusion'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:nativeInfusionNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='disguiseInfusion'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:disguiseInfusionNote(language.value)});continue;
    }
    if(recipe.process?.kind==='bloodOrbCrafting'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:bloodOrbNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='projectRedCrafting'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:projectRedNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='botaniaWorld'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:botaniaWorldNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='nativeBrewing'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:nativeBrewingNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='aeCrafting'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:aeCraftingNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='wirelessTerminalUpgrade'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:wirelessTerminalNote(recipe.process,language.value)});continue;
    }
    if(recipe.process?.kind==='creativeCoreCrafting'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:t("原生固定产物仅在库存门槛、候选与实际摆放匹配时取得；无序顺序及相等谓词移除可能改变是否匹配，不按默认样本保证产出。")});continue;
    }
    if(output.change?.action.kind==='xuResult'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:t("XU 原生条件产物：按实际网格的行顺序复制第一个带标签微方块的完整 NBT；没有时保留原型。镜像与实际标签可能改变结果，不按默认样本固定换算。")});
      continue;
    }
    if (conditionalRegisteredCraft) {
      result.uncertain.push({ kind: output.kind, id: output.id, amount: null,
        note: t("仅普通注册合成分支的产物；原生修理优先，随后按注册顺序选择首个匹配配方，未提供实际网格与库存数量，不能保证得到此产物。") });
      continue;
    }
    if(output.change?.action.kind==='ic2Advanced'){
      result.uncertain.push({kind:output.kind,id:output.id,amount:null,note:t("IC2 原生动态产物：逐格累加双精度电量并加入产物原有电量。匹配顺序、实际堆叠数量、自定义标签与电量可能改变结果，当前每格一件的候选样本不能当作任意库存的固定结果。")});
      continue;
    }
    if (output.change?.action.kind === 'gtCrafting') {
      result.uncertain.push({ kind: output.kind, id: output.id, amount: null,
        note: t("GT 原生动态产物：先归一化、复制或合并标签、清空并转移电量、依次添加附魔，再次归一化。结果取决于原生标签、实际摆放顺序、投入数量与电量；导出候选样本不代表任意库存结果。") });
      continue;
    }
    if (output.change?.action.kind === 'craftingNbt') {
      result.uncertain.push({ kind: output.kind, id: output.id, amount: null,
        note: t("每次产物数量 ") + output.amount + t(" 件；按实际摆放顺序，最后一个带标签的输入替换整个产物标签，镜像可能改变结果。这里不把原产物当成固定结果。") });
      continue;
    }
    const sample = output.change?.samples[recipeSampleIndex(recipe, selected, output)];
    if (output.change && !sample) throw new Error(t("所选输入缺少对应的产物示例"));
    const product = sample ? { ...output, ...sample } : output;
    if (output.change || output.quantity || output.amount == null || BigInt(output.chance.numerator) !== BigInt(output.chance.denominator)) {
      result.uncertain.push({ kind: product.kind, id: product.id, amount: null, note: outputNote(recipe, product,locale) });
    } else sum(output.role === 'return' ? result.returns : result.outputs, {
      kind: output.kind, id: output.id, amount: multiplyQuantity(output.amount, batches), note: '',
    });
  }
  if (recipe.process?.kind === 'railcraftBlast') {
    for (const id of new Set(recipe.process.fuel.allowed.map(fuel => fuel.item))) result.uncertain.push({
      kind: 'item', id, amount: null,
      note: t("独立可选燃料，需要时才从燃料槽补充；用量取决于空闲时间、燃烧预算及原生运行条件，不按配方批次数固定换算。"),
    });
  }
  return result;
}
