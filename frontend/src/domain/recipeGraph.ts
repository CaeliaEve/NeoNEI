export interface RecipeGraphNode {
  id: string;
  recipeIds: string[];
}

export interface RecipeGraph {
  docs: Map<string, RecipeGraphNode>;
  producedByIndex: Map<string, string[]>;
  usedInIndex: Map<string, string[]>;
}

type MaybeRecipe = {
  id?: unknown;
  recipeId?: unknown;
  uid?: unknown;
  outputs?: unknown;
  output?: unknown;
  inputs?: unknown;
  input?: unknown;
};

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const getRecipeId = (recipe: MaybeRecipe, idx: number): string => {
  const idCandidates = [recipe.id, recipe.recipeId, recipe.uid];
  for (const id of idCandidates) {
    if (typeof id === 'string' && id.trim().length > 0) {
      return id;
    }
  }
  return `recipe-${idx}`;
};

const extractItemIdsFromEntry = (entry: unknown): string[] => {
  if (!entry) return [];

  if (typeof entry === 'string') return [entry];

  if (Array.isArray(entry)) {
    return entry.flatMap(extractItemIdsFromEntry);
  }

  if (typeof entry === 'object') {
    const rec = entry as Record<string, unknown>;

    const direct = [rec.itemId, rec.id]
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (direct.length) return direct;

    if (rec.item && typeof rec.item === 'object') {
      const nested = (rec.item as Record<string, unknown>).itemId;
      if (typeof nested === 'string' && nested.length > 0) return [nested];
    }

    if (Array.isArray(rec.items)) {
      return rec.items.flatMap(extractItemIdsFromEntry);
    }

    if (Array.isArray(rec.variants)) {
      return rec.variants.flatMap(extractItemIdsFromEntry);
    }
  }

  return [];
};

const unique = (values: string[]): string[] => Array.from(new Set(values));

export const buildRecipeGraph = (recipes: unknown): RecipeGraph => {
  const list = asArray<MaybeRecipe>(recipes);
  const docs = new Map<string, RecipeGraphNode>();
  const producedByIndex = new Map<string, string[]>();
  const usedInIndex = new Map<string, string[]>();

  list.forEach((recipe, idx) => {
    const recipeId = getRecipeId(recipe, idx);
    docs.set(recipeId, { id: recipeId, recipeIds: [recipeId] });

    const outputs = unique([
      ...extractItemIdsFromEntry(recipe.outputs),
      ...extractItemIdsFromEntry(recipe.output),
    ]);

    const inputs = unique([
      ...extractItemIdsFromEntry(recipe.inputs),
      ...extractItemIdsFromEntry(recipe.input),
    ]);

    outputs.forEach((itemId) => {
      const prev = producedByIndex.get(itemId) ?? [];
      if (!prev.includes(recipeId)) {
        producedByIndex.set(itemId, [...prev, recipeId]);
      }
    });

    inputs.forEach((itemId) => {
      const prev = usedInIndex.get(itemId) ?? [];
      if (!prev.includes(recipeId)) {
        usedInIndex.set(itemId, [...prev, recipeId]);
      }
    });
  });

  return { docs, producedByIndex, usedInIndex };
};
