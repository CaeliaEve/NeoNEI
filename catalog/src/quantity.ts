import type { Output, Recipe } from '@elysium/contracts';
import { ensure } from './store.ts';

function integer(value: string | null | undefined): bigint {
  ensure(typeof value === 'string' && /^[1-9][0-9]*$/.test(value), '产出数量不是正整数');
  const result = BigInt(value);
  ensure(result <= 9223372036854775807n, '产出数量超出范围');
  return result;
}

/** Preserve draw correlation in the records; return exact bounds without sampling. */
export function quantityBounds(recipe: Recipe, output: Output): readonly [bigint, bigint] {
  const rule = output.quantity;
  if (!rule) { const value = integer(output.amount); return [value, value]; }
  ensure(output.amount == null && output.change == null && output.kind === 'fluid'
    && output.chance.numerator === '1' && output.chance.denominator === '1', '关联产量含冲突的固定字段');
  ensure(rule.after.length <= 128, '关联产量链过长');
  const draws = new Set<number>();
  let closing: readonly number[] | undefined;
  for (const candidate of recipe.outputs) {
    const quantity = candidate.quantity;
    if (!quantity || quantity.input !== rule.input) continue;
    ensure(candidate.kind === 'fluid', '关联产量要求流体产出');
    if (quantity.kind === 'draw') { ensure(!draws.has(candidate.slot), '关联产量重复抽取槽'); draws.add(candidate.slot); }
    else { ensure(!closing, '关联产量组包含多个余量'); closing = quantity.after; }
  }
  ensure(closing && closing.length === draws.size && new Set(closing).size === draws.size
    && closing.every(slot => draws.has(slot)), '回收余量必须包含同组的全部随机产出');
  const source = recipe.inputs.find(row => row.kind === 'fluid' && row.slot === rule.input);
  ensure(source && source.choices.length === 1 && source.choices[0]!.consume.kind === 'consume'
    && source.choices[0]!.returns.length === 0, '关联产量缺少确定的流体输入');
  let low = integer(source.choices[0]!.amount), high = low;
  const used = new Set<number>();
  for (const [index, slot] of rule.after.entries()) {
    ensure(slot !== output.slot && !used.has(slot), '关联产量含循环或重复引用'); used.add(slot);
    const prior = recipe.outputs.find(row => row.kind === 'fluid' && row.slot === slot), draw = prior?.quantity;
    ensure(prior && draw?.kind === 'draw' && draw.input === rule.input && draw.after.length === index
      && draw.after.every((value, at) => value === rule.after[at]), '关联产量的顺序或输入不一致');
    ensure(prior.amount == null && prior.change == null && prior.chance.numerator === '1'
      && prior.chance.denominator === '1', '前序随机产量含冲突字段');
    const limit = integer(draw.limit);
    ensure(low > 1n, '随机产量可能耗尽输入');
    low = low > limit ? low - limit : 1n; high -= 1n;
  }
  if (rule.kind === 'remainder') return [low, high];
  const limit = integer(rule.limit);
  ensure(low > 1n, '随机产量可能耗尽输入');
  return [1n, limit < high - 1n ? limit : high - 1n];
}
