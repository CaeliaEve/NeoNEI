import type {
  RecipeBootstrapCategoryGroupPayload,
  RecipeBootstrapMachineGroupPayload,
  RecipeBootstrapPayload,
  RecipeUiPayload,
} from './types';
import {
  getDistDataRecipeBootstrap,
  getDistDataRecipeBootstrapCategoryGroup,
  getDistDataRecipeBootstrapProducedByGroup,
  getDistDataRecipeBootstrapUsedInGroup,
  getDistDataRecipeUiPayload,
} from '../services/distDataRuntime';

export async function getRuntimeRecipeBootstrap(itemId: string): Promise<RecipeBootstrapPayload | null> {
  return getDistDataRecipeBootstrap(itemId);
}

export async function getRuntimeRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload | null> {
  return getDistDataRecipeUiPayload(recipeId);
}

export async function getRuntimeRecipeBootstrapProducedByGroup(
  itemId: string,
  machineType: string,
  voltageTier?: string | null,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
): Promise<RecipeBootstrapMachineGroupPayload | null> {
  return getDistDataRecipeBootstrapProducedByGroup(itemId, machineType, voltageTier, options);
}

export async function getRuntimeRecipeBootstrapUsedInGroup(
  itemId: string,
  machineType: string,
  voltageTier?: string | null,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
): Promise<RecipeBootstrapMachineGroupPayload | null> {
  return getDistDataRecipeBootstrapUsedInGroup(itemId, machineType, voltageTier, options);
}

export async function getRuntimeRecipeBootstrapCategoryGroup(
  itemId: string,
  tab: 'usedIn' | 'producedBy',
  categoryKey: string,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
): Promise<RecipeBootstrapCategoryGroupPayload | null> {
  return getDistDataRecipeBootstrapCategoryGroup(itemId, tab, categoryKey, options);
}
