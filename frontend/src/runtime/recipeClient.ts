import type { PublicRuntimeManifest, RecipeBootstrapPayload, RecipeUiPayload } from './types';
import { getDistDataRecipeBootstrap, getDistDataRecipeUiPayload } from '../services/distDataRuntime';

export type RecipeRelationTab = 'usedIn' | 'producedBy';
export type RecipeGroupKind = 'machine' | 'category';

export async function getRuntimeRecipeBootstrap(itemId: string): Promise<RecipeBootstrapPayload | null> {
  return getDistDataRecipeBootstrap(itemId);
}

export async function getRuntimeRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload | null> {
  return getDistDataRecipeUiPayload(recipeId);
}

export function resolveRuntimeRecipeBootstrapPath(
  basePath: string | null | undefined,
  itemId: string,
): string | null {
  const normalizedItemId = `${itemId ?? ''}`.trim();
  const normalizedBasePath = `${basePath ?? ''}`.trim();
  if (!normalizedItemId || !normalizedBasePath) {
    return null;
  }
  return `${normalizedBasePath.replace(/\/+$/g, '')}/${encodeURIComponent(normalizedItemId)}.json`;
}

export function toPublishedRecipeRelationSegment(tab: RecipeRelationTab): 'used-in' | 'produced-by' {
  return tab === 'usedIn' ? 'used-in' : 'produced-by';
}

function hasPublishedRecipeBootstrapItem(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
): boolean {
  const normalizedItemId = `${itemId ?? ''}`.trim();
  const publishedItems = Array.isArray(manifest?.publishBundle?.files.recipeBootstrapItems)
    ? manifest?.publishBundle?.files.recipeBootstrapItems
    : [];
  return Boolean(normalizedItemId) && publishedItems.includes(normalizedItemId);
}

export function canUsePublishedRecipeGroupIndex(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
): boolean {
  const indexBasePath = `${manifest?.publishBundle?.files.recipeGroupIndexBasePath ?? ''}`.trim();
  if (!indexBasePath || !hasPublishedRecipeBootstrapItem(manifest, itemId)) {
    return false;
  }

  const offset = Math.max(0, Math.floor(Number(options?.offset ?? 0) || 0));
  return offset === 0 && options?.includeRecipeIds === true;
}

export function canUsePublishedRecipeGroupWindow(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
): boolean {
  const windowBasePath = `${manifest?.publishBundle?.files.recipeGroupWindowBasePath ?? ''}`.trim();
  const limit = Math.max(0, Math.floor(Number(options?.limit ?? 0) || 0));
  return Boolean(windowBasePath && hasPublishedRecipeBootstrapItem(manifest, itemId) && options?.includeRecipeIds !== true && limit > 0);
}

export function resolvePublishedRecipeGroupIndexPath(params: {
  manifest: PublicRuntimeManifest | null | undefined;
  itemId: string;
  tab: RecipeRelationTab;
  kind: RecipeGroupKind;
  key: string;
}): string | null {
  const normalizedItemId = `${params.itemId ?? ''}`.trim();
  const normalizedKey = `${params.key ?? ''}`.trim();
  const basePath = `${params.manifest?.publishBundle?.files.recipeGroupIndexBasePath ?? ''}`.trim();
  if (!normalizedItemId || !normalizedKey || !basePath) {
    return null;
  }

  return `${basePath.replace(/\/+$/g, '')}/${params.kind}/${encodeURIComponent(normalizedItemId)}/${toPublishedRecipeRelationSegment(params.tab)}/${encodeURIComponent(normalizedKey)}.json`;
}

export function resolvePublishedRecipeGroupWindowPath(params: {
  manifest: PublicRuntimeManifest | null | undefined;
  itemId: string;
  tab: RecipeRelationTab;
  kind: RecipeGroupKind;
  key: string;
  offset?: number;
  limit?: number;
}): string | null {
  const normalizedItemId = `${params.itemId ?? ''}`.trim();
  const normalizedKey = `${params.key ?? ''}`.trim();
  const basePath = `${params.manifest?.publishBundle?.files.recipeGroupWindowBasePath ?? ''}`.trim();
  const offset = Math.max(0, Math.floor(Number(params.offset ?? 0) || 0));
  const limit = Math.max(0, Math.floor(Number(params.limit ?? 0) || 0));
  if (!normalizedItemId || !normalizedKey || !basePath || limit <= 0) {
    return null;
  }

  return `${basePath.replace(/\/+$/g, '')}/${params.kind}/${encodeURIComponent(normalizedItemId)}/${toPublishedRecipeRelationSegment(params.tab)}/${encodeURIComponent(normalizedKey)}/${offset}-${limit}.json`;
}

export function canUsePublishedRecipeSearchPack(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
): boolean {
  const normalizedItemId = `${itemId ?? ''}`.trim();
  if (!normalizedItemId) {
    return false;
  }

  const bundle = manifest?.publishBundle;
  const basePath = `${bundle?.files.recipeSearchBasePath ?? ''}`.trim();
  const publishedItems = Array.isArray(bundle?.files.recipeSearchItems)
    ? bundle?.files.recipeSearchItems
    : [];
  return Boolean(basePath) && publishedItems.includes(normalizedItemId);
}

export function resolvePublishedRecipeSearchPath(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
  tab: RecipeRelationTab,
): string | null {
  const normalizedItemId = `${itemId ?? ''}`.trim();
  const basePath = `${manifest?.publishBundle?.files.recipeSearchBasePath ?? ''}`.trim();
  if (!normalizedItemId || !basePath) {
    return null;
  }

  return `${basePath.replace(/\/+$/g, '')}/${encodeURIComponent(normalizedItemId)}/${toPublishedRecipeRelationSegment(tab)}.json`;
}
