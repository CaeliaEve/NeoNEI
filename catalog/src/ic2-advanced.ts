import type { Item, Recipe } from '@elysium/contracts';

type Items = ReadonlyMap<string, Partial<Pick<Item, 'registry' | 'meta' | 'nbt'>>>;
type Native = Extract<NonNullable<Recipe['process']>, { kind: 'ic2Advanced' }>;
const cache = new WeakMap<Recipe, { items: Items; samples: Map<string, number> }>();
const bytes = new DataView(new ArrayBuffer(8));
function bits(value: number): string { bytes.setFloat64(0, value); return bytes.getBigUint64(0).toString(16).padStart(16, '0'); }
function number(value: string): number { if (!/^[0-9a-f]{16}$/.test(value)) throw new Error('Invalid IC2 native double bits'); bytes.setBigUint64(0, BigInt('0x' + value)); return bytes.getFloat64(0); }
function process(recipe: Recipe): Native {
  const value = recipe.process;
  if (value?.kind !== 'ic2Advanced' || value.version !== '2.2.828-experimental' || value.scope !== 'exportedCountOneCandidates') throw new Error('IC2 Advanced is missing its pinned native process');
  const count=recipe.inputs.length,layout=value.layout,visibility=value.visibility;
  if(count<1||count>9||layout.inputCount!==count||value.charges.length!==count||recipe.source.owner!=='IC2'||recipe.source.handler!=='ic2.neiIntegration.core.recipehandler.'+(layout.shapeless?'AdvShapelessRecipeHandler':'AdvRecipeHandler'))throw new Error('IC2 native source/compact input count differs');
  const hiddenConfig=visibility.configValue?.toLowerCase()==='true';
  if(visibility.hidden?(visibility.hideSecretRecipes!==hiddenConfig||hiddenConfig):(visibility.hideSecretRecipes!=null||visibility.configValue!=null))throw new Error('IC2 visibility differs from native canShow');
  if(layout.shapeless){if(recipe.grid||layout.class!=='ic2.core.AdvShapelessRecipe'||layout.width!==0||layout.height!==0||layout.masks!=null||layout.mirroredMasks!=null||layout.mirroredOrder!=null)throw new Error('IC2 shapeless rule acquired shaped masks');}
  else {
    if(layout.class!=='ic2.core.AdvRecipe'||layout.width<1||layout.width>3||layout.height<1||layout.height>3||!layout.masks?.length||(layout.mirroredMasks!=null)!==(layout.mirroredOrder!=null))throw new Error('IC2 shaped native layout is missing');
    if(layout.mirroredOrder)permutation(layout.mirroredOrder,count);
    for(const masks of [layout.masks,layout.mirroredMasks??[]]){if(masks.length>9)throw new Error('IC2 mask count exceeds budget');for(const mask of masks)if(!Number.isInteger(mask)||mask<1||mask>511||mask.toString(2).replace(/0/g,'').length!==count)throw new Error('IC2 native occupancy mask differs');}
  }
  if(recipe.inputs.some((input,slot)=>input.slot!==slot||input.kind!=='item'||input.choices.length!==value.charges[slot]?.length||input.choices.some(choice=>choice.amount!=='1'||choice.rule.kind!=='wildcard'||!choice.rule.nbt)))throw new Error('IC2 native one-per-cell input predicate differs');
  return value;
}
function permutation(values: readonly number[], count: number): void {
  if (values.length !== count || new Set(values).size !== count || values.some(value => !Number.isInteger(value) || value < 0 || value >= count)) throw new Error('Invalid IC2 offered input order');
}
function positions(recipe: Recipe, mirrored: boolean): number[] {
  const native = process(recipe), layout = native.layout, count = recipe.inputs.length;
  const mask = (mirrored ? layout.mirroredMasks : layout.masks)?.[0];
  const order = mirrored ? layout.mirroredOrder : recipe.inputs.map((_, slot) => slot);
  if (mask == null || !order || mask < 1 || mask > 511) throw new Error('IC2 native occupancy mask is missing');
  permutation(order, count); const result = new Array<number>(count); let next = 0;
  for (let cell = 0; cell < 9; cell++) if (mask & (1 << (8 - cell))) result[order[next++]!] = cell;
  if (next !== count) throw new Error('IC2 occupancy mask lost a compact input');
  return result;
}
export function ic2AdvancedGrid(recipe: Recipe, mirrored = false): (number | null)[] {
  const cells: (number | null)[] = new Array(9).fill(null);
  positions(recipe, mirrored).forEach((cell, slot) => { cells[cell] = slot; }); return cells;
}
export function ic2AdvancedOrder(recipe: Recipe, mirrored = false, offered?: readonly number[]): number[] {
  const native = process(recipe), count = recipe.inputs.length;
  const placement=native.layout.shapeless?[]:positions(recipe,mirrored);
  const result = native.layout.shapeless ? [...(offered ?? recipe.inputs.map((_, slot) => slot))]
    : recipe.inputs.map((_, slot) => slot).sort((a, b) => placement[a]! - placement[b]!);
  permutation(result, count); return result;
}
function key(recipe: Recipe, choices: readonly number[], order: readonly number[], items: Items): string | undefined {
  const native = process(recipe), count = recipe.inputs.length;
  permutation(order, count); if (choices.length !== count) throw new Error('IC2 selection is missing input choices');
  if (!native.layout.shapeless && ![false, ...(native.layout.mirroredOrder ? [true] : [])].some(mirrored => ic2AdvancedOrder(recipe, mirrored).every((slot, index) => slot === order[index]))) return undefined;
  let remaining = (1 << count) - 1, total = 0;
  for (const slot of order) {
    const choice = recipe.inputs[slot]?.choices[choices[slot]!];
    if (!choice || choice.amount !== '1') throw new Error('IC2 selection lost its count-one candidate');
    const offered = items.get(choice.id); if (!offered || typeof offered.registry !== 'string' || !Number.isInteger(offered.meta)) throw new Error('IC2 concrete candidate item missing');
    if (native.layout.shapeless) {
      const required = recipe.inputs.findIndex((input, index) => Boolean(remaining & (1 << index)) && input.choices.some(template => {
        if (template.rule.kind !== 'wildcard' || !template.rule.nbt) throw new Error('IC2 native metadata/NBT predicate missing');
        const item = items.get(template.id); if (!item) throw new Error('IC2 requirement item missing');
        return item.registry === offered.registry && (template.rule.meta || item.meta === offered.meta);
      }));
      if (required < 0) return undefined; remaining &= ~(1 << required);
    }
    const charge = native.charges[slot]?.[choices[slot]!]; if (charge == null) throw new Error('IC2 native charge observation missing');
    total += number(charge);
  }
  return bits(total);
}
export function ic2AdvancedWitness(recipe: Recipe, index: number): { choices: number[]; order: number[]; mirrored: boolean } {
  const native = process(recipe), witness = native.states[index], count = recipe.inputs.length;
  if (!witness || witness.positions.length !== count || witness.choices.length !== count || new Set(witness.positions).size !== count || witness.positions.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= 9)) throw new Error('IC2 native witness positions missing');
  if(!native.layout.shapeless){
    const matches=[false,...(native.layout.mirroredOrder?[true]:[])].some(mirrored=>{
      const order=mirrored?native.layout.mirroredOrder!:recipe.inputs.map((_,slot)=>slot);
      return (mirrored?native.layout.mirroredMasks!:native.layout.masks!).some(mask=>{const placement=new Array<number>(count);let next=0;for(let cell=0;cell<9;cell++)if(mask&(1<<(8-cell)))placement[order[next++]!]=cell;return placement.every((cell,slot)=>cell===witness.positions[slot]);});
    });if(!matches)throw new Error('IC2 witness is outside native occupancy masks');
  }
  const order = recipe.inputs.map((_, slot) => slot).sort((a, b) => witness.positions[a]! - witness.positions[b]!);
  let mirrored = false;
  if (!native.layout.shapeless && !ic2AdvancedOrder(recipe).every((slot, at) => slot === order[at])) {
    if (!native.layout.mirroredOrder || !ic2AdvancedOrder(recipe, true).every((slot, at) => slot === order[at])) throw new Error('IC2 witness lost its native grid order'); mirrored = true;
  }
  return { choices: [...witness.choices], order, mirrored };
}
export function ic2AdvancedSampleIndex(recipe: Recipe, choices: readonly number[], order: readonly number[], items: Items): number | undefined {
  const native = process(recipe); let index = cache.get(recipe);
  if (!index || index.items !== items) {
    if (!native.states.length || native.states.length > 65536 || recipe.outputs[0]?.change?.samples.length !== native.states.length) throw new Error('IC2 native result observations missing or over budget');
    const samples = new Map<string, number>();
    native.states.forEach((_, at) => { const witness = ic2AdvancedWitness(recipe, at), state = key(recipe, witness.choices, witness.order, items); if (state == null || samples.has(state)) throw new Error('IC2 native witness is unmatched or duplicates a state'); samples.set(state, at); });
    index = { items, samples }; cache.set(recipe, index);
  }
  const state = key(recipe, choices, order, items); if (state == null) return undefined;
  const sample = index.samples.get(state); if (sample == null) throw new Error('IC2 matching result is missing its native observation'); return sample;
}
export function ic2AdvancedNote(locale: 'zh_CN' | 'en_US' = 'zh_CN'): string {
  return locale === 'en_US'
    ? 'Each occupied cell consumes one item. Matching uses item and exact or wildcard metadata, ignoring NBT and declared ingredient counts. Shapeless inputs greedily match the first remaining requirement in row-major order. Native double charge is summed in that same order and added to the original output charge without clearing it. Results are observations for exported count-one candidates; other offered stack counts, custom NBT or charge may change the result. Container returns and tool wear follow each input rule.'
    : '每个占用格消耗一件；按物品与精确或通配元数据匹配，忽略 NBT 和声明的材料数量。无序配方按格子顺序贪心匹配首个剩余要求。电量按同一顺序用双精度累加，再加入产物原有电量，不先清空。所示产物是当前导出候选、每格一件时的原生样本；实际投入的堆叠数量、自定义标签或电量可能改变结果。容器返还与工具损耗见各输入规则。';
}
