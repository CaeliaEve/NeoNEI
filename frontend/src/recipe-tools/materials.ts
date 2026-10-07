import type { Choice, Input, Output, Recipe } from '@elysium/contracts';
import { recipeChoiceIndex, recipeSampleIndex } from '../catalog/selection.ts';

export type Selection = Record<string, number>;
export interface MaterialRow { kind: 'item' | 'fluid'; id: string; amount: string | null; note: string }
export interface Materials {
  inputs: MaterialRow[]; outputs: MaterialRow[]; returns: MaterialRow[]; tools: MaterialRow[]; uncertain: MaterialRow[];
}

function decimal(value: string): { units: bigint; scale: number } {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('数量不是有效的十进制数');
  const [whole, fraction = ''] = value.split('.');
  return { units: BigInt(whole + fraction), scale: fraction.length };
}
function render(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const value = scale ? (digits.slice(0, -scale) + '.' + digits.slice(-scale)).replace(/\.?0+$/, '') : digits;
  return (negative ? '-' : '') + value;
}
function add(left: string, right: string): string {
  const a = decimal(left), b = decimal(right), scale = Math.max(a.scale, b.scale);
  return render(a.units * 10n ** BigInt(scale - a.scale) + b.units * 10n ** BigInt(scale - b.scale), scale);
}
export function parseBatches(value: string): bigint {
  if (!/^\d+$/.test(value.trim()) || BigInt(value.trim()) <= 0n) throw new Error('执行批次必须是正整数');
  return BigInt(value.trim());
}
export function multiplyQuantity(value: string, batches: bigint): string {
  const { units, scale } = decimal(value);
  return render(units * batches, scale);
}
export function formatQuantity(value: string): string {
  const [whole, fraction] = value.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
}

function sum(rows: MaterialRow[], row: MaterialRow): void {
  const existing = rows.find(candidate => candidate.kind === row.kind && candidate.id === row.id && candidate.note === row.note);
  if (existing && existing.amount !== null && row.amount !== null) existing.amount = add(existing.amount, row.amount);
  else rows.push(row);
}
function specialInput(input: Input, choice: Choice, batches: bigint): string {
  const n = formatQuantity(choice.amount), unit = input.kind === 'fluid' ? 'mB' : '件';
  switch (choice.consume.kind) {
    case 'staged': return `存量门槛 ${n} ${unit}；按原生阶段尝试取料，容器与进度影响实际消耗。`;
    case 'upto': return `每批至少一件，最多消耗 ${n} ${unit}；${batches} 批上限 ${formatQuantity(multiplyQuantity(choice.amount, batches))} ${unit}。`;
    case 'allocated': return `每批需求 ${n} ${unit}；按原生顺序分配库存，实际扣料取决于槽位和存量。`;
    case 'stack': return `整叠处理；${n} ${unit} 是示例数量，不能据此确定批次用量。`;
    case 'buffer': return `最低存量门槛 ${n} ${unit}；启动时耗尽内部存量。`;
    case 'pedestals': return `样本为 ${n} 座、每座一件；实际座数随输入屏障变化。`;
    default: return '按原生消耗规则处理，见配方详情。';
  }
}
function outputNote(output: Output): string {
  const notes: string[] = [];
  if (output.role === 'return') notes.push('归还');
  if (output.change) notes.push('动态产物；所选候选仅对应一个原生样本，实际数据依输入变化');
  const q = output.quantity;
  if (q) {
    const descriptions = {
      squeezer: '原生压榨参数；实际取料、空间与残余物抽取影响产出',
      soul: '共享灵魂完成条件与输出空间影响产出',
      grinding: '共享抽取与研磨珠状态影响产量，可能重复产出',
      sharedRoll: '各产物共享一次抽取，输出空间影响实际数量',
      harmony: '共享成功／失败次数与稳定场、过量流体影响产量',
      draw: '关联随机抽取，与其他产物共享输入流体量',
      remainder: '输入流体减去关联产物后的回收余量',
      branch: '互斥工况分支，须满足分支条件',
      potential: '潜在产量，须满足原生条件与输出空间',
    };
    notes.push(descriptions[q.kind]);
    if ('nominal' in q) notes.push('原生基数 ' + formatQuantity(q.nominal));
    if ('condition' in q && q.condition) notes.push(q.condition);
  }
  if (BigInt(output.chance.numerator) !== BigInt(output.chance.denominator)) {
    notes.push(`标注概率 ${output.chance.numerator}/${output.chance.denominator}，不保证每批取得`);
  }
  if (output.amount != null) notes.push('每次标注' + (output.change ? '样本' : '数量') + ' ' + formatQuantity(output.amount) + (output.kind === 'fluid' ? ' mB' : ' 件'));
  return notes.join('；') || '未提供固定数量，见原生配方详情。';
}

/** A direct bill for successful executions, never a recursive production plan or a probability estimate. */
export function calculateMaterials(recipe: Recipe, count: string, selected: Selection = {}): Materials {
  const batches = parseBatches(count);
  const result: Materials = { inputs: [], outputs: [], returns: [], tools: [], uncertain: [] };
  for (const input of recipe.inputs) {
    const index = recipeChoiceIndex(recipe, selected, input);
    if (index === -1 && recipe.outputs.some(output => output.change?.bindings)) continue;
    const choice = input.choices[index];
    if (!choice) throw new Error('配方输入缺少所选候选');
    const row: MaterialRow = { kind: input.kind, id: choice.id, amount: null, note: '' };
    const consumption = choice.consume;
    if (recipe.process?.kind === 'buildcraftIntegration') {
      row.note = '输入组合样本；扩展材料按原生规则消耗，不是固定批次用量。';
      result.uncertain.push(row);
    } else if (consumption.kind === 'consume') {
      sum(result.inputs, { ...row, amount: multiplyQuantity(choice.amount, batches) });
    } else if (['keep', 'damage', 'wear', 'reserve'].includes(consumption.kind)) {
      const note = consumption.kind === 'keep' ? '保留；重复执行可复用，不乘批次。'
        : consumption.kind === 'damage' ? `输入槽 ${input.slot + 1} 需备工具；本槽标注耐久损耗合计 ${BigInt(consumption.points) * batches}，不推算需要补充几件工具。`
        : consumption.kind === 'wear' ? '需备工具；完工时尝试损耗，附魔和工具状态决定实际耐久。'
        : '可选研磨珠库存；旧珠耗尽后装载时才消耗一件，不按批次扣料。';
      const amount = recipe.process?.kind === 'vat' && input.kind === 'fluid' && consumption.kind === 'keep' ? '0' : choice.amount;
      sum(result.tools, { ...row, amount, note: amount === '0' ? '需有对应流体对象，可为零量；不消耗。' : note });
    } else result.uncertain.push({ ...row, note: specialInput(input, choice, batches) });
    for (const returned of choice.returns) {
      if (consumption.kind === 'consume' && recipe.process?.kind !== 'buildcraftIntegration') {
        sum(result.returns, { ...returned, amount: multiplyQuantity(returned.amount, batches), note: '' });
      } else result.uncertain.push({ ...returned, amount: null, note: '特殊消耗的归还项；标注 ' + formatQuantity(returned.amount) + '，实际归还见原生消耗条件。' });
    }
  }
  for (const output of recipe.outputs) {
    const sample = output.change?.samples[recipeSampleIndex(recipe, selected, output)];
    if (output.change && !sample) throw new Error('所选输入缺少对应的产物示例');
    const product = sample ? { ...output, ...sample } : output;
    if (output.change || output.quantity || output.amount == null || BigInt(output.chance.numerator) !== BigInt(output.chance.denominator)) {
      result.uncertain.push({ kind: product.kind, id: product.id, amount: null, note: outputNote(product) });
    } else sum(output.role === 'return' ? result.returns : result.outputs, {
      kind: output.kind, id: output.id, amount: multiplyQuantity(output.amount, batches), note: '',
    });
  }
  return result;
}
