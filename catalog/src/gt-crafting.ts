import { canonical, type Item, type Recipe } from '@elysium/contracts';
import { nativeNbtEqual } from './native-nbt.ts';
import { nativeItemMetadata } from './native-item-metadata.ts';

type Items = ReadonlyMap<string, Partial<Pick<Item, 'registry' | 'meta' | 'nbt'>>>;
type NativeProcess = Extract<NonNullable<Recipe['process']>, { kind: 'gtCrafting' }>;
const indexes = new WeakMap<Recipe, { items: Items; keys: Map<string, number> }>();

function process(recipe: Recipe): NativeProcess {
  const value = recipe.process;
  if (value?.kind !== 'gtCrafting' || value.version !== '5.09.51.482' || value.scope !== 'exportedCandidates') {
    throw new Error('GT result is missing its pinned native observation process');
  }
  return value;
}

function item(items: Items, id: string) {
  const result = items.get(id);
  if (!result || typeof result.registry !== 'string' || !Number.isInteger(result.meta)) throw new Error('GT result is missing a concrete item');
  return result;
}

function permutation(order: readonly number[], count: number): void {
  if (order.length !== count || new Set(order).size !== count || order.some(slot => !Number.isInteger(slot) || slot < 0 || slot >= count)) {
    throw new Error('Invalid GT offered input order');
  }
}

export function gtCraftingOrder(recipe: Recipe, mirrored = false, offered?: readonly number[]): number[] {
  process(recipe);
  if (!recipe.grid) {
    const order = offered ? [...offered] : recipe.inputs.map((_, slot) => slot);
    permutation(order, recipe.inputs.length); return order;
  }
  const grid = recipe.grid;
  if (mirrored && !grid.mirror) throw new Error('GT recipe does not allow mirroring');
  const order: number[] = [];
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
    const slot = grid.cells[y * grid.width + (mirrored ? grid.width - x - 1 : x)];
    if (slot != null) order.push(slot);
  }
  permutation(order, recipe.inputs.length); return order;
}

/** Undefined means the selected candidates/order do not match the native recipe.
 * A matching state without an observation is corrupt/incomplete and throws.
 */
function stateKey(recipe: Recipe, choices: readonly number[], order: readonly number[], items: Items): string | undefined {
  const native = process(recipe);
  permutation(order, recipe.inputs.length);
  if (recipe.grid && ![false, ...(recipe.grid.mirror ? [true] : [])].some(mirror =>
    gtCraftingOrder(recipe, mirror).every((slot, cell) => slot === order[cell]))) return undefined;
  if (choices.length !== recipe.inputs.length) throw new Error('GT selection is missing input choices');
  const offered = recipe.inputs.map((input, slot) => {
    const index = choices[slot];
    const candidate = index == null || !Number.isInteger(index) ? undefined : input.choices[index];
    if (!candidate) throw new Error('GT selection is missing a concrete candidate');
    return item(items, candidate.id);
  });
  const base = item(items, native.base.id);
  let first = true, inherited: string | null = null, overwritten: string | null = null;
  let firstTags: Item['nbt'] = null, transfer = 0, remaining = (1 << offered.length) - 1;
  for (const slot of order) {
    const candidate = offered[slot]!;
    if (native.rules.keepingNbt) {
      if (!first && !nativeNbtEqual(firstTags, candidate.nbt)) return undefined;
      if (first) { firstTags = candidate.nbt; inherited = candidate.nbt == null ? null : canonical(candidate.nbt); }
    }
    if (!recipe.grid) {
      const requirement = recipe.inputs.findIndex((input, required) => Boolean(remaining & (1 << required)) && input.choices.some(choice => {
        if ((choice.rule.kind !== 'wildcard' && choice.rule.kind !== 'nativeItemMetadata') || !choice.rule.nbt) throw new Error('GT input lost native metadata/NBT matching');
        const template = item(items, choice.id);
        if(choice.rule.kind==='nativeItemMetadata')return choice.rule.callback==='botaniaManaMirror'&&candidate.registry==='Botania:manaMirror'
          &&template.registry===candidate.registry&&nativeItemMetadata(candidate)===choice.rule.value;
        return template.registry === candidate.registry && (choice.rule.meta || nativeItemMetadata(template) === nativeItemMetadata(candidate));
      }));
      if (requirement < 0) return undefined;
      remaining &= ~(1 << requirement);
    }
    if (!native.rules.keepingNbt && native.rules.overwriteNbt && overwritten == null && candidate.nbt != null
      && candidate.registry === base.registry && (nativeItemMetadata(candidate) === nativeItemMetadata(base) || nativeItemMetadata(candidate) === 32767 || nativeItemMetadata(base) === 32767)) {
      overwritten = canonical(candidate.nbt);
    }
    const amount = native.transfers[slot]?.[choices[slot]!];
    if (amount == null || !Number.isInteger(amount) || amount < -2147483648 || amount > 2147483647) throw new Error('GT selection is missing its native transfer observation');
    transfer = (transfer + amount) | 0; // The installed callback uses Java signed-int addition.
    first = false;
  }
  return JSON.stringify([transfer, inherited, overwritten]);
}

export function gtCraftingWitness(recipe: Recipe, index: number): { choices: number[]; order: number[]; mirrored: boolean } {
  const native = process(recipe), witness = native.states[index];
  if (!witness || witness.positions.length !== recipe.inputs.length || witness.choices.length !== recipe.inputs.length
    || new Set(witness.positions).size !== recipe.inputs.length || witness.positions.some(cell => !Number.isInteger(cell) || cell < 0 || cell > 8)) {
    throw new Error('GT result is missing its offered inventory witness');
  }
  const order = recipe.inputs.map((_, slot) => slot).sort((a, b) => witness.positions[a]! - witness.positions[b]!);
  let mirrored = false;
  if (recipe.grid) {
    const matches = (mirror: boolean) => gtCraftingOrder(recipe, mirror).every((slot, cell) => slot === order[cell]);
    if (!matches(false)) {
      if (!recipe.grid.mirror || !matches(true)) throw new Error('GT witness changed its logical grid order');
      mirrored = true;
    }
  }
  return { choices: [...witness.choices], order, mirrored };
}

export function gtCraftingSampleIndex(recipe: Recipe, choices: readonly number[], order: readonly number[], items: Items): number | undefined {
  const native = process(recipe);
  let index = indexes.get(recipe);
  if (!index || index.items !== items) {
    if (native.states.length > 65536 || recipe.outputs[0]?.change?.samples.length !== native.states.length) throw new Error('GT result observations are missing or over budget');
    const keys = new Map<string, number>();
    native.states.forEach((_, sample) => {
      const witness = gtCraftingWitness(recipe, sample);
      const key = stateKey(recipe, witness.choices, witness.order, items);
      if (key == null || keys.has(key)) throw new Error('GT result observations repeat or mismatch native states');
      keys.set(key, sample);
    });
    index = { items, keys }; indexes.set(recipe, index);
  }
  const key = stateKey(recipe, choices, order, items);
  if (key == null) return undefined;
  const sample = index.keys.get(key);
  if (sample == null) throw new Error('GT matching result is missing its native observation');
  return sample;
}

export function gtCraftingNote(recipe: Recipe, locale: 'zh_CN' | 'en_US' = 'zh_CN'): string {
  const native = process(recipe);
  if (locale === 'en_US') return [
    'Each occupied cell processes one item; returns and tool wear follow the per-input rules. Results shown here are native observations for the selected exported candidates.',
    native.rules.keepingNbt ? 'All inputs must have equal native tags; the FIRST tagged cell supplies the result compound.' : '',
    native.rules.overwriteNbt ? 'The first tagged matching result item supplies root tags; existing result keys win.' : '',
    'The native result is normalized and its charge cleared. Only a positive signed 32-bit input sum recharges it; overflow wraps. Ordered enchantments are applied before normalization again.',
    'Placement order, custom tags, offered stack counts and charge can change the result. Tool wear and container returns are described per input.',
  ].filter(Boolean).join(' ');
  return [
    '每个占用格按一件处理，返还与工具损耗见输入规则。所示产物是当前导出候选的原生结果样本。',
    native.rules.keepingNbt ? '全部输入必须具有原生相等的标签；第一个带标签的格子提供产物的整个标签。' : '',
    native.rules.overwriteNbt ? '第一个带标签且匹配产物物品的输入提供根标签，产物原有键优先。' : '',
    '原生产物先归一化并清空原电量；输入电量按有符号32位累加并保留溢出回绕，仅正和用于重新充电。随后依次添加附魔，最后再次归一化。',
    '摆放顺序、自定义标签、投入堆叠数量与电量可能改变结果；工具损耗与容器返还见各输入说明。',
  ].filter(Boolean).join('');
}
