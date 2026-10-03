import type { Input, Output, Recipe } from '@elysium/contracts';

type Selection = Record<string, number>;
const key = (input: Input) => 'input' + input.kind + input.slot;
const correlated = (recipe: Recipe) => recipe.outputs.find(output => output.change?.bindings)?.change;

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

export function recipeSampleIndex(recipe: Recipe, selected: Selection, output: Output): number {
  const change = output.change;
  if (!change) return 0;
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
