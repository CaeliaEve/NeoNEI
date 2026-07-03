import type { PublicRuntimeManifest } from './types';

export type RecipeRelationTab = 'usedIn' | 'producedBy';
export type RecipeGroupKind = 'machine' | 'category';

export type RecipePublishedArtifactKey =
  | 'item-recipe-bundle'
  | 'recipe-bootstrap'
  | 'recipe-bootstrap-shard'
  | 'recipe-group-index'
  | 'recipe-group-window'
  | 'recipe-search-pack';

type PublishBundleFiles = NonNullable<NonNullable<PublicRuntimeManifest['publishBundle']>['files']>;
type PublishBasePathField =
  | 'itemRecipeBundleBasePath'
  | 'recipeBootstrapBasePath'
  | 'recipeBootstrapShardBasePath'
  | 'recipeGroupIndexBasePath'
  | 'recipeGroupWindowBasePath'
  | 'recipeSearchBasePath';
type PublishItemListField =
  | 'itemRecipeBundleItems'
  | 'recipeBootstrapItems'
  | 'recipeSearchItems';

type RecipePublishedArtifactDescriptor = Readonly<{
  key: RecipePublishedArtifactKey;
  basePathField: PublishBasePathField;
  itemListField: PublishItemListField;
  pathShape: 'item-json' | 'relation-group-json' | 'relation-group-window-json' | 'relation-search-json';
}>;

const RECIPE_PUBLISHED_ARTIFACT_DESCRIPTORS: readonly RecipePublishedArtifactDescriptor[] = validateArtifactDescriptors([
  {
    key: 'item-recipe-bundle',
    basePathField: 'itemRecipeBundleBasePath',
    itemListField: 'itemRecipeBundleItems',
    pathShape: 'item-json',
  },
  {
    key: 'recipe-bootstrap',
    basePathField: 'recipeBootstrapBasePath',
    itemListField: 'recipeBootstrapItems',
    pathShape: 'item-json',
  },
  {
    key: 'recipe-bootstrap-shard',
    basePathField: 'recipeBootstrapShardBasePath',
    itemListField: 'recipeBootstrapItems',
    pathShape: 'item-json',
  },
  {
    key: 'recipe-group-index',
    basePathField: 'recipeGroupIndexBasePath',
    itemListField: 'recipeBootstrapItems',
    pathShape: 'relation-group-json',
  },
  {
    key: 'recipe-group-window',
    basePathField: 'recipeGroupWindowBasePath',
    itemListField: 'recipeBootstrapItems',
    pathShape: 'relation-group-window-json',
  },
  {
    key: 'recipe-search-pack',
    basePathField: 'recipeSearchBasePath',
    itemListField: 'recipeSearchItems',
    pathShape: 'relation-search-json',
  },
]);

const ARTIFACT_DESCRIPTOR_BY_KEY = new Map(
  RECIPE_PUBLISHED_ARTIFACT_DESCRIPTORS.map((descriptor) => [descriptor.key, descriptor]),
);

function validateArtifactDescriptors(
  descriptors: readonly RecipePublishedArtifactDescriptor[],
): readonly RecipePublishedArtifactDescriptor[] {
  const seen = new Set<string>();
  for (const descriptor of descriptors) {
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate recipe published artifact descriptor: ${descriptor.key}`);
    }
    if (!descriptor.basePathField || !descriptor.itemListField || !descriptor.pathShape) {
      throw new Error(`Recipe published artifact descriptor is incomplete: ${descriptor.key}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function artifactDescriptor(key: RecipePublishedArtifactKey): RecipePublishedArtifactDescriptor {
  const descriptor = ARTIFACT_DESCRIPTOR_BY_KEY.get(key);
  if (!descriptor) {
    throw new Error(`Unknown recipe published artifact descriptor: ${key}`);
  }
  return descriptor;
}

function normalizeItemId(itemId: string): string {
  return `${itemId ?? ''}`.trim();
}

function normalizeGroupKey(key: string): string {
  return `${key ?? ''}`.trim();
}

function normalizeBasePath(files: PublishBundleFiles | null, field: PublishBasePathField): string {
  return `${files?.[field] ?? ''}`.trim();
}

function publishedItemSet(files: PublishBundleFiles | null, field: PublishItemListField): readonly string[] {
  const values = files?.[field];
  return Array.isArray(values) ? values : [];
}

function publishBundleFiles(manifest: PublicRuntimeManifest | null | undefined): PublishBundleFiles | null {
  return manifest?.publishBundle?.files ?? null;
}

function hasPublishedArtifactItem(
  manifest: PublicRuntimeManifest | null | undefined,
  key: RecipePublishedArtifactKey,
  itemId: string,
): boolean {
  const normalizedItemId = normalizeItemId(itemId);
  if (!normalizedItemId) {
    return false;
  }
  const descriptor = artifactDescriptor(key);
  const files = publishBundleFiles(manifest);
  const basePath = normalizeBasePath(files, descriptor.basePathField);
  return Boolean(basePath) && publishedItemSet(files, descriptor.itemListField).includes(normalizedItemId);
}

function resolvePublishedItemJsonPath(
  manifest: PublicRuntimeManifest | null | undefined,
  key: RecipePublishedArtifactKey,
  itemId: string,
): string | null {
  const normalizedItemId = normalizeItemId(itemId);
  if (!hasPublishedArtifactItem(manifest, key, normalizedItemId)) {
    return null;
  }
  const descriptor = artifactDescriptor(key);
  if (descriptor.pathShape !== 'item-json') {
    throw new Error(`Recipe artifact descriptor is not item-json shaped: ${key}`);
  }
  const basePath = normalizeBasePath(publishBundleFiles(manifest), descriptor.basePathField);
  return `${basePath.replace(/\/+$/g, '')}/${encodeURIComponent(normalizedItemId)}.json`;
}

export function toPublishedRecipeRelationSegment(tab: RecipeRelationTab): 'used-in' | 'produced-by' {
  return tab === 'usedIn' ? 'used-in' : 'produced-by';
}

export function resolvePublishedRecipeBootstrapPath(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
  kind: 'bootstrap' | 'shard',
): string | null {
  return resolvePublishedItemJsonPath(
    manifest,
    kind === 'bootstrap' ? 'recipe-bootstrap' : 'recipe-bootstrap-shard',
    itemId,
  );
}

export function resolvePublishedItemRecipeBundlePath(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
): string | null {
  return resolvePublishedItemJsonPath(manifest, 'item-recipe-bundle', itemId);
}

export function canUsePublishedRecipeGroupIndex(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
): boolean {
  const offset = Math.max(0, Math.floor(Number(options?.offset ?? 0) || 0));
  return hasPublishedArtifactItem(manifest, 'recipe-group-index', itemId)
    && offset === 0
    && options?.includeRecipeIds === true;
}

export function canUsePublishedRecipeGroupWindow(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
): boolean {
  const limit = Math.max(0, Math.floor(Number(options?.limit ?? 0) || 0));
  return hasPublishedArtifactItem(manifest, 'recipe-group-window', itemId)
    && options?.includeRecipeIds !== true
    && limit > 0;
}

export function resolvePublishedRecipeGroupIndexPath(params: {
  manifest: PublicRuntimeManifest | null | undefined;
  itemId: string;
  tab: RecipeRelationTab;
  kind: RecipeGroupKind;
  key: string;
}): string | null {
  const normalizedItemId = normalizeItemId(params.itemId);
  const normalizedKey = normalizeGroupKey(params.key);
  if (!normalizedItemId || !normalizedKey || !hasPublishedArtifactItem(params.manifest, 'recipe-group-index', normalizedItemId)) {
    return null;
  }
  const descriptor = artifactDescriptor('recipe-group-index');
  if (descriptor.pathShape !== 'relation-group-json') {
    throw new Error(`Recipe artifact descriptor is not relation-group-json shaped: ${descriptor.key}`);
  }
  const basePath = normalizeBasePath(publishBundleFiles(params.manifest), descriptor.basePathField);
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
  const normalizedItemId = normalizeItemId(params.itemId);
  const normalizedKey = normalizeGroupKey(params.key);
  const offset = Math.max(0, Math.floor(Number(params.offset ?? 0) || 0));
  const limit = Math.max(0, Math.floor(Number(params.limit ?? 0) || 0));
  if (
    !normalizedItemId
    || !normalizedKey
    || limit <= 0
    || !hasPublishedArtifactItem(params.manifest, 'recipe-group-window', normalizedItemId)
  ) {
    return null;
  }
  const descriptor = artifactDescriptor('recipe-group-window');
  if (descriptor.pathShape !== 'relation-group-window-json') {
    throw new Error(`Recipe artifact descriptor is not relation-group-window-json shaped: ${descriptor.key}`);
  }
  const basePath = normalizeBasePath(publishBundleFiles(params.manifest), descriptor.basePathField);
  return `${basePath.replace(/\/+$/g, '')}/${params.kind}/${encodeURIComponent(normalizedItemId)}/${toPublishedRecipeRelationSegment(params.tab)}/${encodeURIComponent(normalizedKey)}/${offset}-${limit}.json`;
}

export function canUsePublishedRecipeSearchPack(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
): boolean {
  return hasPublishedArtifactItem(manifest, 'recipe-search-pack', itemId);
}

export function resolvePublishedRecipeSearchPath(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
  tab: RecipeRelationTab,
): string | null {
  const normalizedItemId = normalizeItemId(itemId);
  if (!hasPublishedArtifactItem(manifest, 'recipe-search-pack', normalizedItemId)) {
    return null;
  }
  const descriptor = artifactDescriptor('recipe-search-pack');
  if (descriptor.pathShape !== 'relation-search-json') {
    throw new Error(`Recipe artifact descriptor is not relation-search-json shaped: ${descriptor.key}`);
  }
  const basePath = normalizeBasePath(publishBundleFiles(manifest), descriptor.basePathField);
  return `${basePath.replace(/\/+$/g, '')}/${encodeURIComponent(normalizedItemId)}/${toPublishedRecipeRelationSegment(tab)}.json`;
}

export const RECIPE_BOOTSTRAP_ARTIFACT_POLICY_CATALOG = Object.freeze({
  abi: 'neonei.recipe-bootstrap-artifact-policy.v1',
  authority: 'compiled-artifacts-fail-closed',
  descriptors: RECIPE_PUBLISHED_ARTIFACT_DESCRIPTORS,
});
