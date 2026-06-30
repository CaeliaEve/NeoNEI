import { resolveAccelerationCompilerAuthority } from './acceleration-runtime-compiler-authority.service';
import { getIndexedRecipesService } from './recipes-indexed.service';
import { getRuntimeRecipePackService } from './runtime-recipe-pack.service';
import { badRequest, notFound } from '../utils/http';

function normalizeRequiredRecipeParam(value: string | undefined, name: string): string {
  const normalized = `${value ?? ''}`.trim();
  if (!normalized) throw badRequest(`${name} is required`);
  return normalized;
}

export function isExternalRuntimeRecipeAuthority(): boolean {
  return resolveAccelerationCompilerAuthority() === 'external-runtime';
}

export async function getCurrentRecipeItemProducedBy(itemIdParam: string | undefined): Promise<unknown> {
  const itemId = normalizeRequiredRecipeParam(itemIdParam, 'itemId');
  if (isExternalRuntimeRecipeAuthority()) {
    const payload = getRuntimeRecipePackService().getItemProducedBy(itemId);
    if (!payload) throw notFound('Recipe item not found in runtime recipe pack');
    return payload;
  }

  const service = getIndexedRecipesService();
  const summary = await service.getItemRecipeSummary(itemId);
  const recipes = await service.getCraftingRecipesForItem(itemId);
  return {
    itemId,
    summary,
    recipes,
  };
}

export async function getCurrentRecipeItemUsedIn(itemIdParam: string | undefined): Promise<unknown> {
  const itemId = normalizeRequiredRecipeParam(itemIdParam, 'itemId');
  if (isExternalRuntimeRecipeAuthority()) {
    const payload = getRuntimeRecipePackService().getItemUsedIn(itemId);
    if (!payload) throw notFound('Recipe item not found in runtime recipe pack');
    return payload;
  }

  const service = getIndexedRecipesService();
  const summary = await service.getItemRecipeSummary(itemId);
  const usages = await service.getUsageRecipesForItem(itemId);
  return {
    itemId,
    summary,
    usages,
  };
}

export async function getCurrentRecipePage(recipePageIdParam: string | undefined): Promise<unknown> {
  const recipePageId = normalizeRequiredRecipeParam(recipePageIdParam, 'recipePageId');
  if (isExternalRuntimeRecipeAuthority()) {
    const page = getRuntimeRecipePackService().getRecipePage(recipePageId);
    if (!page) {
      throw notFound('Recipe page not found in runtime recipe pack');
    }
    return page;
  }

  const service = getIndexedRecipesService();
  const page = await service.getRecipePageById(recipePageId);
  if (!page) {
    throw notFound('Recipe page not found');
  }
  return page;
}
