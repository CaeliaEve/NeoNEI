import type { Ref } from 'vue';
import type { Recipe } from '../../services/api';
import type { MachineCategory } from './helpers';

type RecipeTab = 'usedIn' | 'producedBy';
type RecipeLists = {
  producedBy: Recipe[];
  usedIn: Recipe[];
};

export function getRecipeCategoryLookupKey(
  tab: RecipeTab,
  category: MachineCategory | null | undefined,
): string | null {
  if (!category) return null;
  return `${tab}:${category.categoryKey}:${category.machineKey}`;
}

export function getCategoryRecipesPerPage(category: MachineCategory | null | undefined): number {
  const runtimeCategory = category as (MachineCategory & { recipesPerPage?: number }) | null | undefined;
  return Math.max(1, runtimeCategory?.recipesPerPage ?? 1);
}

export function getStoredCategoryOrderedRecipeIds(
  categoryRecipeIdsByKey: Ref<Record<string, string[]>>,
  tab: RecipeTab,
  category: MachineCategory | null | undefined,
  defaultRecipeIds: string[],
): string[] {
  const key = getRecipeCategoryLookupKey(tab, category);
  if (!key) return defaultRecipeIds;
  const stored = categoryRecipeIdsByKey.value[key];
  return Array.isArray(stored) && stored.length > 0 ? stored : defaultRecipeIds;
}

export function setStoredCategoryOrderedRecipeIds(
  categoryRecipeIdsByKey: Ref<Record<string, string[]>>,
  tab: RecipeTab,
  category: MachineCategory | null | undefined,
  recipeIds: string[],
): void {
  const key = getRecipeCategoryLookupKey(tab, category);
  if (!key) return;
  categoryRecipeIdsByKey.value = {
    ...categoryRecipeIdsByKey.value,
    [key]: recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean),
  };
}

export function getLoadedRecipeIdSet(recipes: RecipeLists, tab: RecipeTab): Set<string> {
  return new Set(
    (tab === 'usedIn' ? recipes.usedIn : recipes.producedBy).map((recipe) => recipe.recipeId),
  );
}

export function getLoadedRecipeMap(recipes: Recipe[], filter?: (recipe: Recipe) => boolean): Map<string, Recipe> {
  const recipeMap = new Map<string, Recipe>();
  for (const recipe of recipes) {
    if (filter && !filter(recipe)) continue;
    recipeMap.set(recipe.recipeId, recipe);
  }
  return recipeMap;
}
