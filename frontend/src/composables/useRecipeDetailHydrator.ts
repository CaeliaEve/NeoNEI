import { ref, type Ref } from 'vue';
import type { Recipe } from '../services/api';
import { extractVariantGroups } from './recipe-browser/helpers';

export function useRecipeDetailHydrator(args: {
  itemIdRef: Ref<string | undefined>;
  recipes: Ref<{ usedIn: Recipe[]; producedBy: Recipe[] }>;
  detailedRecipes: Ref<Map<string, Recipe>>;
  detailRequestsInFlight: Ref<Set<string>>;
  peekDetailedRecipe: (recipeId: string) => Recipe | undefined;
  touchDetailedRecipe: (recipeId: string) => void;
  shouldRefetchStale: (recipeId: string) => boolean;
  setDetailedRecipes: (recipes: Recipe[]) => void;
  markDetailRequestStarted: (recipeId: string) => void;
  markDetailRequestFinished: (recipeId: string) => void;
  getNow: () => number;
  logDetailHydration: (recipeIds: string[], durationMs: number, source: string) => void;
}) {
  const {
    itemIdRef,
    recipes,
    detailedRecipes,
    detailRequestsInFlight,
    peekDetailedRecipe,
    touchDetailedRecipe,
    shouldRefetchStale,
    setDetailedRecipes,
    markDetailRequestStarted,
    markDetailRequestFinished,
    getNow,
    logDetailHydration,
  } = args;

  const detailFailedRecipeIds = ref<Set<string>>(new Set<string>());
  let detailEpoch = 0;
  const inflightHydrationKeys = new Set<string>();
  let disposed = false;

  const hasBootstrapRichData = (recipe: Recipe | undefined): boolean => {
    if (!recipe) return false;
    const additionalData =
      recipe.additionalData && typeof recipe.additionalData === 'object'
        ? (recipe.additionalData as Record<string, unknown>)
        : null;
    return Boolean(
      recipe.machineInfo?.machineType ||
      recipe.recipeTypeData?.machineType ||
      additionalData?.rawIndexedInputs ||
      additionalData?.rawIndexedOutputs
    );
  };

  const findCurrentRecipe = (recipeId: string): Recipe | undefined => {
    for (const recipe of recipes.value.usedIn) {
      if (recipe.recipeId === recipeId) return recipe;
    }
    for (const recipe of recipes.value.producedBy) {
      if (recipe.recipeId === recipeId) return recipe;
    }
    return undefined;
  };

  const getInputMetrics = (recipe: Recipe | undefined) => {
    const rows = Array.isArray(recipe?.inputs) ? recipe!.inputs.length : 0;
    const cols = rows > 0
      ? Math.max(...recipe!.inputs.map((row) => (Array.isArray(row) ? row.length : 0)))
      : 0;
    const filledSlots = Array.isArray(recipe?.inputs)
      ? recipe!.inputs.reduce(
          (total, row) =>
            total +
            (Array.isArray(row)
              ? row.reduce((rowCount, cell) => rowCount + (cell ? 1 : 0), 0)
              : 0),
          0,
        )
      : 0;
    return { rows, cols, filledSlots };
  };

  const hasExplicitInputDimension = (recipe: Recipe | undefined) => {
    const dimension = recipe?.recipeTypeData?.itemInputDimension;
    return Boolean(dimension && Number(dimension.width) > 0 && Number(dimension.height) > 0);
  };

  const shouldPreserveIndexedLayout = (existing: Recipe | undefined, incoming: Recipe) => {
    if (!existing) return false;

    const existingMetrics = getInputMetrics(existing);
    const incomingMetrics = getInputMetrics(incoming);
    const existingGroups = extractVariantGroups(existing);
    const incomingGroups = extractVariantGroups(incoming);
    const existingHasDimension = hasExplicitInputDimension(existing);
    const incomingHasDimension = hasExplicitInputDimension(incoming);

    const collapsedToSingleRow =
      existingMetrics.rows > 1 &&
      incomingMetrics.rows === 1 &&
      incomingMetrics.filledSlots >= existingMetrics.filledSlots;

    const lostGridDimensions =
      existingHasDimension &&
      !incomingHasDimension &&
      existingMetrics.rows >= incomingMetrics.rows;

    const lostVariantGroups =
      existingGroups.length > 0 &&
      incomingGroups.length === 0;

    return collapsedToSingleRow || lostGridDimensions || lostVariantGroups;
  };

  const mergeVariantGroups = (existing: Recipe | undefined, incoming: Recipe): Recipe => {
    if (!existing) return incoming;
    const existingGroups = extractVariantGroups(existing);
    const incomingGroups = extractVariantGroups(incoming);
    if (incomingGroups.length > 0 || existingGroups.length === 0) {
      return incoming;
    }
    const additionalData = {
      ...((incoming.additionalData && typeof incoming.additionalData === 'object')
        ? (incoming.additionalData as Record<string, unknown>)
        : {}),
      variantGroups: existingGroups,
    };
    return {
      ...incoming,
      additionalData: additionalData as Recipe['additionalData'],
    };
  };

  const mergeDetailedRecipe = (existing: Recipe | undefined, incoming: Recipe): Recipe => {
    const merged = mergeVariantGroups(existing, incoming);
    const existingAdditionalData =
      existing?.additionalData && typeof existing.additionalData === 'object'
        ? (existing.additionalData as Record<string, unknown>)
        : null;
    const mergedAdditionalData =
      merged.additionalData && typeof merged.additionalData === 'object'
        ? ({ ...(merged.additionalData as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    if (existingAdditionalData) {
      for (const key of [
        'rawIndexedInputs',
        'rawIndexedOutputs',
        'aspects',
        'variantGroups',
        'specialRecipeType',
        'research',
        'centralItemId',
        'centerInputSlotIndex',
        'instability',
        'componentSlotOrder',
      ]) {
        if (!(key in mergedAdditionalData) && key in existingAdditionalData) {
          mergedAdditionalData[key] = existingAdditionalData[key];
        }
      }
    }

    const mergedWithIndexedHints = {
      ...merged,
      machineInfo: merged.machineInfo ?? existing?.machineInfo,
      recipeTypeData:
        merged.recipeTypeData && typeof merged.recipeTypeData === 'object'
          ? ({
              ...((existing?.recipeTypeData && typeof existing.recipeTypeData === 'object')
                ? (existing.recipeTypeData as Record<string, unknown>)
                : {}),
              ...(merged.recipeTypeData as Record<string, unknown>),
            } as Recipe['recipeTypeData'])
          : existing?.recipeTypeData,
      additionalData: mergedAdditionalData as Recipe['additionalData'],
    };

    if (!shouldPreserveIndexedLayout(existing, mergedWithIndexedHints)) {
      return mergedWithIndexedHints;
    }

    const existingGroups = extractVariantGroups(existing);
    const additionalData = {
      ...mergedAdditionalData,
    };
    if (existingGroups.length > 0) {
      additionalData.variantGroups = existingGroups;
    }

    const recipeTypeData = {
      ...((merged.recipeTypeData && typeof merged.recipeTypeData === 'object')
        ? (merged.recipeTypeData as Record<string, unknown>)
        : {}),
    } as Recipe['recipeTypeData'];

    if (existing?.recipeTypeData?.itemInputDimension) {
      recipeTypeData.itemInputDimension = existing.recipeTypeData.itemInputDimension;
    }

    return {
      ...merged,
      inputs: existing?.inputs || merged.inputs,
      recipeTypeData,
      additionalData: additionalData as Recipe['additionalData'],
    };
  };

  const mergeDetailedRecipesIntoState = (incomingRecipes: Recipe[]) => {
    if (!incomingRecipes.length) return;
    const currentRecipeById = new Map<string, Recipe>([
      ...recipes.value.usedIn.map((recipe) => [recipe.recipeId, recipe] as const),
      ...recipes.value.producedBy.map((recipe) => [recipe.recipeId, recipe] as const),
    ]);
    const byId = new Map(
      incomingRecipes.map((recipe) => [recipe.recipeId, mergeDetailedRecipe(currentRecipeById.get(recipe.recipeId), recipe)] as const),
    );
    const mergeList = (list: Recipe[]) =>
      list.map((recipe) => byId.get(recipe.recipeId) || detailedRecipes.value.get(recipe.recipeId) || recipe);
    recipes.value = {
      usedIn: mergeList(recipes.value.usedIn),
      producedBy: mergeList(recipes.value.producedBy),
    };
  };

  const hydrateRecipeDetails = async (recipeIds: string[], source = 'unknown') => {
    const contextEpoch = detailEpoch;
    const contextItemId = itemIdRef.value;
    const unique = Array.from(new Set(recipeIds)).filter(Boolean);
    const missing = unique.filter((id) => {
      if (detailRequestsInFlight.value.has(id)) return false;
      const existing = peekDetailedRecipe(id) ?? findCurrentRecipe(id);
      if (!existing) return true;
      if (hasBootstrapRichData(existing)) {
        touchDetailedRecipe(id);
        return false;
      }
      if (shouldRefetchStale(id)) return true;
      touchDetailedRecipe(id);
      return false;
    });
    if (missing.length === 0) return;

    const hydrationKey = `${contextEpoch}|${contextItemId || ''}|${missing.slice().sort().join(',')}`;
    if (inflightHydrationKeys.has(hydrationKey)) {
      return;
    }
    inflightHydrationKeys.add(hydrationKey);
    const startedAt = getNow();

    for (const recipeId of missing) {
      markDetailRequestStarted(recipeId);
    }
    if (missing.length > 0) {
      const nextFailures = new Set(detailFailedRecipeIds.value);
      for (const recipeId of missing) {
        nextFailures.delete(recipeId);
      }
      detailFailedRecipeIds.value = nextFailures;
    }
    try {
      if (disposed || contextEpoch !== detailEpoch || contextItemId !== itemIdRef.value) {
        return;
      }
      const currentRecipes = missing
        .map((recipeId) => findCurrentRecipe(recipeId) ?? peekDetailedRecipe(recipeId))
        .filter((recipe): recipe is Recipe => Boolean(recipe));
      if (currentRecipes.length > 0) {
        setDetailedRecipes(currentRecipes);
        mergeDetailedRecipesIntoState(currentRecipes);
      }
    } finally {
      inflightHydrationKeys.delete(hydrationKey);
      if (disposed || contextEpoch !== detailEpoch || contextItemId !== itemIdRef.value) {
        return;
      }
      for (const recipeId of missing) {
        markDetailRequestFinished(recipeId);
      }
      logDetailHydration(missing, getNow() - startedAt, source);
    }
  };

  const resetDetailHydrationContext = () => {
    detailEpoch += 1;
    detailFailedRecipeIds.value = new Set<string>();
  };

  const disposeDetailHydration = () => {
    disposed = true;
    detailEpoch += 1;
  };

  return {
    detailFailedRecipeIds,
    hydrateRecipeDetails,
    resetDetailHydrationContext,
    disposeDetailHydration,
  };
}
