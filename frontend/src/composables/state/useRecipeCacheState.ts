import { ref } from 'vue';
import type { Recipe } from '../../services/api';
import type { RecipeIndexes } from '../../utils/recipeIndexing';

const DETAIL_LRU_LIMIT = 900;
const DETAIL_STALE_MS = 45_000;

const createEmptyIndexes = (): RecipeIndexes => ({
  byInput: new Map<string, Recipe[]>(),
  byOutput: new Map<string, Recipe[]>(),
  byType: new Map<string, Recipe[]>(),
});

export const useRecipeCacheState = () => {
  const lastItemId = ref<string | null>(null);
  const producedByIndexes = ref<RecipeIndexes>(createEmptyIndexes());
  const usedInIndexes = ref<RecipeIndexes>(createEmptyIndexes());
  const detailedRecipes = ref<Map<string, Recipe>>(new Map<string, Recipe>());
  const detailUpdatedAt = ref<Map<string, number>>(new Map<string, number>());
  const detailRequestsInFlight = ref<Set<string>>(new Set<string>());

  const resetRecipeCache = () => {
    producedByIndexes.value = createEmptyIndexes();
    usedInIndexes.value = createEmptyIndexes();
    detailedRecipes.value = new Map<string, Recipe>();
    detailUpdatedAt.value = new Map<string, number>();
    detailRequestsInFlight.value = new Set<string>();
  };

  const setIndexes = (kind: 'usedIn' | 'producedBy', indexes: RecipeIndexes) => {
    if (kind === 'usedIn') {
      usedInIndexes.value = indexes;
      return;
    }
    producedByIndexes.value = indexes;
  };

  const markDetailRequestStarted = (recipeId: string) => {
    if (!recipeId) return;
    const next = new Set(detailRequestsInFlight.value);
    next.add(recipeId);
    detailRequestsInFlight.value = next;
  };

  const markDetailRequestFinished = (recipeId: string) => {
    if (!recipeId) return;
    const next = new Set(detailRequestsInFlight.value);
    next.delete(recipeId);
    detailRequestsInFlight.value = next;
  };

  const touchRecipe = (recipeId: string, timestamp = Date.now()) => {
    if (!recipeId) return;
    const nextTouch = new Map(detailUpdatedAt.value);
    nextTouch.set(recipeId, timestamp);
    detailUpdatedAt.value = nextTouch;
  };

  const enforceLRULimit = () => {
    if (detailedRecipes.value.size <= DETAIL_LRU_LIMIT) return;
    const sorted = Array.from(detailUpdatedAt.value.entries()).sort((a, b) => a[1] - b[1]);
    const nextRecipes = new Map(detailedRecipes.value);
    const nextTouch = new Map(detailUpdatedAt.value);
    while (nextRecipes.size > DETAIL_LRU_LIMIT && sorted.length > 0) {
      const oldest = sorted.shift();
      if (!oldest) break;
      const [recipeId] = oldest;
      nextRecipes.delete(recipeId);
      nextTouch.delete(recipeId);
    }
    detailedRecipes.value = nextRecipes;
    detailUpdatedAt.value = nextTouch;
  };

  const peekDetailedRecipe = (recipeId: string): Recipe | undefined => {
    return detailedRecipes.value.get(recipeId);
  };

  const touchDetailedRecipe = (recipeId: string, timestamp = Date.now()) => {
    touchRecipe(recipeId, timestamp);
  };

  const getDetailedRecipe = (recipeId: string): Recipe | undefined => {
    const recipe = detailedRecipes.value.get(recipeId);
    if (!recipe) return undefined;
    touchDetailedRecipe(recipeId);
    return recipe;
  };

  const shouldRefetchStale = (recipeId: string): boolean => {
    const updatedAt = detailUpdatedAt.value.get(recipeId);
    if (!updatedAt) return true;
    return Date.now() - updatedAt >= DETAIL_STALE_MS;
  };

  const setDetailedRecipes = (recipes: Recipe[]) => {
    if (!recipes.length) return;
    const now = Date.now();
    const nextRecipes = new Map(detailedRecipes.value);
    const nextTouch = new Map(detailUpdatedAt.value);
    for (const recipe of recipes) {
      nextRecipes.set(recipe.recipeId, recipe);
      nextTouch.set(recipe.recipeId, now);
    }
    detailedRecipes.value = nextRecipes;
    detailUpdatedAt.value = nextTouch;
    enforceLRULimit();
  };

  return {
    lastItemId,
    producedByIndexes,
    usedInIndexes,
    detailedRecipes,
    detailRequestsInFlight,
    resetRecipeCache,
    setIndexes,
    setDetailedRecipes,
    peekDetailedRecipe,
    touchDetailedRecipe,
    getDetailedRecipe,
    shouldRefetchStale,
    markDetailRequestStarted,
    markDetailRequestFinished,
  };
};
