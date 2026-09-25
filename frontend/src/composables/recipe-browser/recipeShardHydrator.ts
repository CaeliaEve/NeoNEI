import type { Ref } from 'vue';
import { api, type Recipe } from '../../services/api';
import { convertIndexedRecipe } from '../../domain/recipeNormalization';
import { primeRecipePayloadMedia } from '../recipe-display/recipeMediaPrewarm';
import { reportRecipeShardHydrationFailure } from './recipeHydrationPolicyCatalog';

type RecipeCollection = {
  usedIn: Recipe[];
  producedBy: Recipe[];
};

type RecipeBootstrapShard = Awaited<ReturnType<typeof api.getRecipeBootstrapShard>>;

type CreateRecipeShardHydratorOptions = {
  itemIdRef: Ref<string | undefined>;
  recipes: Ref<RecipeCollection>;
  pendingProducedByRecipeIds: Ref<string[]>;
  pendingUsageRecipeIds: Ref<string[]>;
  applyMergedRecipes: (recipesById: Map<string, Recipe>) => void;
  rebuildIndexesAndGraphs: () => void;
  isDisposed: () => boolean;
  getLoadRequestSeq: () => number;
};

export function createRecipeShardHydrator({
  itemIdRef,
  recipes,
  pendingProducedByRecipeIds,
  pendingUsageRecipeIds,
  applyMergedRecipes,
  rebuildIndexesAndGraphs,
  isDisposed,
  getLoadRequestSeq,
}: CreateRecipeShardHydratorOptions) {
  let backgroundHydrationSeq = 0;

  const isStaleHydration = (hydrationSeq: number, requestSeq: number, itemId: string) => (
    isDisposed()
    || hydrationSeq !== backgroundHydrationSeq
    || requestSeq !== getLoadRequestSeq()
    || itemIdRef.value !== itemId
  );

  const cancelPendingHydration = () => {
    backgroundHydrationSeq += 1;
  };

  const hydrateRemainingRecipesInBackground = async (
    itemId: string,
    requestSeq: number,
    pendingRecipeIds: string[],
    preloadedShardPromise?: Promise<RecipeBootstrapShard | null>,
  ) => {
    if (pendingRecipeIds.length === 0) {
      rebuildIndexesAndGraphs();
      return;
    }

    const hydrationSeq = ++backgroundHydrationSeq;
    const mergedById = new Map<string, Recipe>();
    for (const recipe of [...recipes.value.producedBy, ...recipes.value.usedIn]) {
      mergedById.set(recipe.recipeId, recipe);
    }

    try {
      const shard = (await preloadedShardPromise) ?? await api.getRecipeBootstrapShard(itemId);
      if (isStaleHydration(hydrationSeq, requestSeq, itemId)) {
        return;
      }
      primeRecipePayloadMedia(shard);

      for (const indexedRecipe of [...shard.indexedCrafting, ...shard.indexedUsage]) {
        const normalizedRecipe = convertIndexedRecipe(indexedRecipe);
        mergedById.set(normalizedRecipe.recipeId, normalizedRecipe);
      }

      applyMergedRecipes(mergedById);
      pendingProducedByRecipeIds.value = [];
      pendingUsageRecipeIds.value = [];
    } catch (shardError) {
      reportRecipeShardHydrationFailure(shardError);
      if (!isStaleHydration(hydrationSeq, requestSeq, itemId)) {
        rebuildIndexesAndGraphs();
      }
    }
  };

  return {
    cancelPendingHydration,
    hydrateRemainingRecipesInBackground,
  };
}
