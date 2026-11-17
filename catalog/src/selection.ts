import type { Input, Item, Output, Recipe } from '@elysium/contracts';
import { gtCraftingOrder, gtCraftingSampleIndex, gtCraftingWitness } from './gt-crafting.ts';
import { ic2AdvancedGrid, ic2AdvancedOrder, ic2AdvancedSampleIndex, ic2AdvancedWitness } from './ic2-advanced.ts';

export type Selection = Record<string, number>;
type ItemTags = ReadonlyMap<string, Partial<Pick<Item, 'nbt' | 'registry' | 'meta'>>>;
const key = (input: Input) => 'input' + input.kind + input.slot;
export const correlatedRecipeOutput = (recipe: Recipe) => recipe.outputs.find(output => output.change?.bindings
  && !((recipe.process?.kind==='gendustryTemplate'||recipe.process?.kind==='gendustryGenetics')
    &&output.change.samples.length===0));
const correlated = (recipe: Recipe) => correlatedRecipeOutput(recipe)?.change;

export function recipeChoiceIndex(recipe: Recipe, selected: Selection, input: Input): number {
  const value = selected[key(input)];
  if (value !== undefined) return value;
  const bindings = correlated(recipe)?.bindings;
  return bindings ? (bindings[0]?.[recipe.inputs.indexOf(input)] ?? -1) : 0;
}

export function selectRecipeSample(recipe: Recipe, selected: Selection, index: number): void {
  const change = correlated(recipe);
  const tuple = change?.bindings?.[index];
  if (!tuple || tuple.length !== recipe.inputs.length) throw new Error('配方缺少所选输入组合');
  recipe.inputs.forEach((input, column) => { selected[key(input)] = tuple[column] ?? -1; });
}

export function selectRecipeChoice(recipe: Recipe, selected: Selection, input: Input, index: number): void {
  const column = recipe.inputs.indexOf(input);
  if (column < 0 || !Number.isInteger(index) || index < 0 || !input.choices[index]) throw new Error('配方输入缺少所选候选');
  const bindings = correlated(recipe)?.bindings;
  if (!bindings) { selected[key(input)] = index; return; }
  let best = -1, score = -1;
  bindings.forEach((tuple, candidate) => {
    if (tuple[column] !== index) return;
    const matches = tuple.reduce<number>((total, choice, other) => total + Number(other !== column
      && (choice ?? -1) === recipeChoiceIndex(recipe, selected, recipe.inputs[other]!)), 0);
    if (matches > score) { best = candidate; score = matches; }
  });
  if (best < 0) throw new Error('所选候选缺少完整输入组合');
  selectRecipeSample(recipe, selected, best);
}

/** Logical cells in actual offered row-major order. Translation leaves this order unchanged. */
export function recipeGridCells(recipe: Recipe, mirrored = false): (number | null)[] {
  if(recipe.process?.kind==='xuMicroblock'){
    const cells=[...recipe.process.layout];
    return mirrored?[...cells.slice(0,3).reverse(),...cells.slice(3,6).reverse(),...cells.slice(6,9).reverse()]:cells;
  }
  if(recipe.process?.kind==='fmpMicroblock'){
    if(mirrored)throw new Error('FMP 所示为原生分支摆放样本，不能直接镜像');
    return [...recipe.process.layout];
  }
  if(recipe.process?.kind==='ic2Advanced')return ic2AdvancedGrid(recipe,mirrored);
  if (recipe.process?.kind === 'bannerPattern' && !recipe.grid) {
    if (mirrored) throw new Error('原生旗帜图案不能镜像');
    return [...recipe.process.layout]; // A native matching witness, not a fixed crafting predicate.
  }
  const grid = recipe.grid;
  if (!grid || mirrored && !grid.mirror) throw new Error('配方缺少允许的原生合成网格');
  const cells = [...grid.cells];
  if (mirrored) for (let row = 0; row < grid.height; row++) {
    const start = row * grid.width;
    cells.splice(start, grid.width, ...cells.slice(start, start + grid.width).reverse());
  }
  return cells;
}

function tagged(items: ItemTags, id: string): boolean {
  const item = items.get(id);
  if (!item) throw new Error('原生 NBT 结果缺少输入物品');
  return item.nbt != null; // An empty compound is tagged too.
}

export function recipeSampleIndex(recipe: Recipe, selected: Selection, output: Output, items?: ItemTags, mirrored = false, offered?: readonly number[]): number {
  const change = output.change;
  if (!change) return 0;
  if(change.action.kind==='nativePoolResult')return -1;
  if(change.action.kind==='xuResult'){
    if(recipe.process?.kind!=='xuMicroblock')throw new Error('XU native result requires its physical witness states');
    const index=recipe.process.states.findIndex(state=>state.offeredMirrored===mirrored);
    if(index<0||!change.samples[index])throw new Error('XU native mirror state is missing');
    return index;
  }
  if(change.action.kind==='ic2Advanced'){
    if(!items)throw new Error('IC2 Advanced is missing its concrete item records');
    return ic2AdvancedSampleIndex(recipe,recipe.inputs.map(input=>recipeChoiceIndex(recipe,selected,input)),ic2AdvancedOrder(recipe,mirrored,offered),items)??-1;
  }
  if (change.action.kind === 'gtCrafting') {
    if (!items) throw new Error('GT result is missing its concrete item records');
    return gtCraftingSampleIndex(recipe, recipe.inputs.map(input => recipeChoiceIndex(recipe, selected, input)),
      gtCraftingOrder(recipe, mirrored, offered), items) ?? -1;
  }
  if (change.action.kind === 'craftingNbt') {
    if (!items || !(recipe.process?.kind === 'craftingNbt'
      || (recipe.process?.kind === 'rolling' || recipe.process?.kind === 'qed') && recipe.process.copyNbt === true)) throw new Error('原生 NBT 结果缺少物品与过程');
    const offsets = new Map<number, number>(); let offset = 1;
    for (const input of recipe.inputs) { offsets.set(input.slot, offset); offset += input.choices.length; }
    if (change.samples.length !== offset) throw new Error('原生 NBT 结果缺少候选投影');
    let result = 0;
    for (const slot of recipeGridCells(recipe, mirrored)) {
      if (slot == null) continue;
      const input = recipe.inputs.find(input => input.kind === 'item' && input.slot === slot);
      if (!input) throw new Error('原生网格缺少输入');
      const choice = recipeChoiceIndex(recipe, selected, input);
      const specimen = input.choices[choice];
      if (!specimen) throw new Error('原生 NBT 结果缺少所选候选');
      if (tagged(items, specimen.id)) result = offsets.get(slot)! + choice;
    }
    return result;
  }
  if (change.bindings) {
    const index = change.bindings.findIndex(tuple => tuple.every((choice, column) =>
      (choice ?? -1) === recipeChoiceIndex(recipe, selected, recipe.inputs[column]!)));
    if (index < 0) throw new Error('所选输入组合缺少对应的产物示例');
    return index;
  }
  const input = recipe.inputs.find(input => input.kind === 'item' && input.slot === change.input);
  if (!input) throw new Error('产物示例引用了不存在的输入');
  return recipeChoiceIndex(recipe, selected, input);
}

export function selectGtCraftingSample(recipe: Recipe, selected: Selection, index: number): { mirrored: boolean; order: number[] } {
  const witness = gtCraftingWitness(recipe, index);
  recipe.inputs.forEach((input, slot) => { selected[key(input)] = witness.choices[slot]!; });
  return { mirrored: witness.mirrored, order: witness.order };
}
export function selectIc2AdvancedSample(recipe: Recipe,selected: Selection,index:number):{mirrored:boolean;order:number[]}{
  const witness=ic2AdvancedWitness(recipe,index);
  recipe.inputs.forEach((input,slot)=>{selected[key(input)]=witness.choices[slot]!;});
  return {mirrored:witness.mirrored,order:witness.order};
}

/** Bind a displayed projection only if current catalog candidates can form that result.
 * Projections do not imply every combined grid is valid or every example is reachable.
 */
export function selectCraftingNbtSample(recipe: Recipe, selected: Selection, output: Output, index: number,
  items: ItemTags): boolean | undefined {
  const change = output.change;
  if (change?.action.kind !== 'craftingNbt' || !change.samples[index]) throw new Error('缺少原生 NBT 结果投影');
  const wanted = change.samples[index]!.id;
  for (const mirrored of recipe.grid?.mirror ? [false, true] : [false]) {
    const proposed = { ...selected }; let offset = 1;
    for (const input of recipe.inputs) {
      if (index >= offset && index < offset + input.choices.length) proposed[key(input)] = index - offset;
      offset += input.choices.length;
    }
    // After a projected input, any later tagged candidate must project the same result.
    let winner = index === 0;
    for (const slot of recipeGridCells(recipe, mirrored)) {
      if (slot == null) continue;
      const input = recipe.inputs.find(input => input.slot === slot)!;
      const start = 1 + recipe.inputs.slice(0, recipe.inputs.indexOf(input)).reduce((n, row) => n + row.choices.length, 0);
      if (index >= start && index < start + input.choices.length) { winner = true; continue; }
      if (!winner) continue;
      const current = recipeChoiceIndex(recipe, proposed, input);
      const allowed = (choice: number) => !tagged(items, input.choices[choice]!.id) || change.samples[start + choice]!.id === wanted;
      const next = allowed(current) ? current : input.choices.findIndex((_, choice) => allowed(choice));
      if (next < 0) { winner = false; break; }
      proposed[key(input)] = next;
    }
    if (winner && change.samples[recipeSampleIndex(recipe, proposed, output, items, mirrored)]?.id === wanted) {
      Object.assign(selected, proposed); return mirrored;
    }
  }
  return undefined;
}
