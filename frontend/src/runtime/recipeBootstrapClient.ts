import type {
  BrowserSearchPackResponse,
  Item,
  ItemSearchBasic,
  PublicRuntimeManifest,
  PublishedRecipeBootstrapSearchPack,
  RecipeBootstrapCategoryGroupPayload,
  RecipeBootstrapMachineGroupPayload,
  RecipeBootstrapPayload,
  RecipeBootstrapSearchPayload,
  SearchItemsFastOptions,
  indexedRecipe,
} from './types';
import {
  canUsePublishedRecipeGroupIndex,
  canUsePublishedRecipeGroupWindow,
  canUsePublishedRecipeSearchPack,
  resolvePublishedItemRecipeBundlePath,
  resolvePublishedRecipeBootstrapPath,
  resolvePublishedRecipeGroupIndexPath,
  resolvePublishedRecipeGroupWindowPath,
  resolvePublishedRecipeSearchPath,
} from './recipeBootstrapArtifactPolicyCatalog';
import {
  getRuntimeRecipeBootstrapCategoryGroup,
  getRuntimeRecipeBootstrapProducedByGroup,
  getRuntimeRecipeBootstrapUsedInGroup,
  getRuntimeRecipeBootstrap,
} from './recipeClient';
import {
  mergeBrowserSearchPackEntries,
  searchBrowserSearchPackEntries,
} from './browserSearchProjection';
import { setCacheWithLimit } from './cacheUtils';
import { markPerfEvent } from '../services/perfMarks';

type RecipeBootstrapClientOptions = {
  getManifest: () => Promise<PublicRuntimeManifest>;
  fetchPublishedJson: <T>(assetPath: string) => Promise<T>;
  getBrowserSearchPackShard: (shardId: string) => Promise<BrowserSearchPackResponse | null>;
  getBrowserSearchPack: () => Promise<BrowserSearchPackResponse>;
};

type RecipeBootstrapLoadSource =
  | 'dist-data-v3'
  | 'memory-cache'
  | 'in-flight'
  | 'item-recipe-bundle'
  | 'published-bootstrap';

const CACHE_LIMITS = {
  recipeBootstrap: 512,
  recipeBootstrapShard: 512,
  recipeBootstrapSearchPack: 96,
} as const;

function getNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function unwrapPublishedItemRecipeBundle(value: unknown): RecipeBootstrapPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as {
    bootstrap?: unknown;
    item?: unknown;
    producedBy?: unknown;
    usedIn?: unknown;
    firstPageRecipes?: {
      producedBy?: unknown;
      usedIn?: unknown;
    };
  };
  if (!record.bootstrap || typeof record.bootstrap !== 'object') {
    return null;
  }
  const bootstrap = record.bootstrap as RecipeBootstrapPayload;
  const producedByRecipeIds = Array.isArray(record.producedBy)
    ? record.producedBy.map((entry) => `${entry ?? ''}`.trim()).filter(Boolean)
    : bootstrap.recipeIndex?.producedByRecipes ?? [];
  const usedInRecipeIds = Array.isArray(record.usedIn)
    ? record.usedIn.map((entry) => `${entry ?? ''}`.trim()).filter(Boolean)
    : bootstrap.recipeIndex?.usedInRecipes ?? [];
  const bundledProducedBy = Array.isArray(record.firstPageRecipes?.producedBy)
    ? record.firstPageRecipes.producedBy as indexedRecipe[]
    : bootstrap.indexedCrafting ?? [];
  const bundledUsedIn = Array.isArray(record.firstPageRecipes?.usedIn)
    ? record.firstPageRecipes.usedIn as indexedRecipe[]
    : bootstrap.indexedUsage ?? [];
  return {
    ...bootstrap,
    item: (record.item && typeof record.item === 'object' ? record.item : bootstrap.item) as Item,
    recipeIndex: {
      producedByRecipes: producedByRecipeIds,
      usedInRecipes: usedInRecipeIds,
    },
    indexedCrafting: bundledProducedBy,
    indexedUsage: bundledUsedIn,
  };
}

function markRecipeBootstrapResolved(
  itemId: string,
  source: RecipeBootstrapLoadSource,
  startedAt: number,
  payload: RecipeBootstrapPayload | null | undefined,
): void {
  const recipeIndex = payload?.recipeIndex;
  const producedByCount = Array.isArray(recipeIndex?.producedByRecipes) ? recipeIndex.producedByRecipes.length : 0;
  const usedInCount = Array.isArray(recipeIndex?.usedInRecipes) ? recipeIndex.usedInRecipes.length : 0;
  markPerfEvent('recipe-bootstrap-resolved', {
    itemId,
    source,
    durationMs: Math.max(0, getNow() - startedAt),
    producedByCount,
    usedInCount,
    indexedCraftingCount: Array.isArray(payload?.indexedCrafting) ? payload.indexedCrafting.length : 0,
    indexedUsageCount: Array.isArray(payload?.indexedUsage) ? payload.indexedUsage.length : 0,
  });
}

function buildRecipeBootstrapSearchPackKey(itemId: string, tab: 'usedIn' | 'producedBy'): string {
  return `${`${itemId ?? ''}`.trim()}::${tab}`;
}

function searchPublishedRecipeBootstrapPack(
  pack: PublishedRecipeBootstrapSearchPack,
  query: string,
  itemMatches: ItemSearchBasic[],
): RecipeBootstrapSearchPayload {
  const normalizedQuery = query.trim();
  const lowerQuery = normalizedQuery.toLowerCase();
  const candidateItemIds = new Set<string>([
    ...itemMatches.map((item) => `${item.itemId ?? ''}`.trim()).filter(Boolean),
    ...(normalizedQuery.includes('~') ? [normalizedQuery] : []),
  ]);

  const recipeIds = pack.entries
    .filter((entry) => {
      if (lowerQuery.startsWith('type:')) {
        const typeQuery = lowerQuery.slice('type:'.length).trim();
        return !typeQuery || `${entry.machineType ?? ''}`.toLowerCase().includes(typeQuery);
      }

      if (lowerQuery && `${entry.searchText ?? ''}`.includes(lowerQuery)) {
        return true;
      }
      if (candidateItemIds.size <= 0) {
        return false;
      }
      return (entry.referencedItemIds ?? []).some((itemId) => candidateItemIds.has(`${itemId ?? ''}`.trim()));
    })
    .map((entry) => entry.recipeId);

  return {
    itemId: pack.itemId,
    tab: pack.tab,
    query: normalizedQuery,
    recipeIds,
    itemMatches: itemMatches.slice(0, 12),
  };
}

export function createRecipeBootstrapClient(options: RecipeBootstrapClientOptions) {
  const recipeBootstrapCache = new Map<string, RecipeBootstrapPayload>();
  const recipeBootstrapInFlight = new Map<string, Promise<RecipeBootstrapPayload>>();
  const recipeBootstrapShardCache = new Map<string, RecipeBootstrapPayload>();
  const recipeBootstrapShardInFlight = new Map<string, Promise<RecipeBootstrapPayload>>();
  const recipeBootstrapSearchPackCache = new Map<string, PublishedRecipeBootstrapSearchPack>();
  const recipeBootstrapSearchPackInFlight = new Map<string, Promise<PublishedRecipeBootstrapSearchPack | null>>();

  function clearCaches(): void {
    recipeBootstrapCache.clear();
    recipeBootstrapInFlight.clear();
    recipeBootstrapShardCache.clear();
    recipeBootstrapShardInFlight.clear();
    recipeBootstrapSearchPackCache.clear();
    recipeBootstrapSearchPackInFlight.clear();
  }

  async function searchPublishedItemMatches(
    query: string,
    limit: number,
    searchOptions?: SearchItemsFastOptions,
  ): Promise<ItemSearchBasic[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery.toLowerCase().startsWith('type:')) {
      return [];
    }

    const ensureNotAborted = () => {
      if (searchOptions?.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
    };

    ensureNotAborted();
    const hotShard = await options.getBrowserSearchPackShard('hot');
    ensureNotAborted();

    const hotMatches = searchBrowserSearchPackEntries(hotShard?.items ?? [], normalizedQuery, limit);
    if (hotMatches.length >= limit) {
      return hotMatches;
    }

    const tailShard = await options.getBrowserSearchPackShard('tail');
    ensureNotAborted();
    const mergedEntries = mergeBrowserSearchPackEntries(hotShard?.items ?? [], tailShard?.items ?? []);
    const mergedMatches = searchBrowserSearchPackEntries(mergedEntries, normalizedQuery, limit);
    if (mergedMatches.length > 0 || mergedEntries.length > 0) {
      return mergedMatches;
    }

    const fullPack = await options.getBrowserSearchPack().catch(() => null);
    ensureNotAborted();
    return searchBrowserSearchPackEntries(fullPack?.items ?? [], normalizedQuery, limit);
  }

  async function getPublishedRecipeBootstrapSearchPack(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
  ): Promise<PublishedRecipeBootstrapSearchPack | null> {
    const normalizedItemId = `${itemId ?? ''}`.trim();
    if (!normalizedItemId) {
      return null;
    }

    const cacheKey = buildRecipeBootstrapSearchPackKey(normalizedItemId, tab);
    const cached = recipeBootstrapSearchPackCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const existingRequest = recipeBootstrapSearchPackInFlight.get(cacheKey);
    if (existingRequest) {
      return existingRequest;
    }

    const request = (async () => {
      const manifest = await options.getManifest();
      if (!canUsePublishedRecipeSearchPack(manifest, normalizedItemId)) {
        return null;
      }

      const staticPath = resolvePublishedRecipeSearchPath(manifest, normalizedItemId, tab);
      if (!staticPath) {
        return null;
      }

      try {
        const published = await options.fetchPublishedJson<PublishedRecipeBootstrapSearchPack>(staticPath);
        setCacheWithLimit(recipeBootstrapSearchPackCache, cacheKey, published, CACHE_LIMITS.recipeBootstrapSearchPack);
        return published;
      } catch {
        return null;
      }
    })().finally(() => {
      recipeBootstrapSearchPackInFlight.delete(cacheKey);
    });

    recipeBootstrapSearchPackInFlight.set(cacheKey, request);
    return request;
  }

  async function getRecipeBootstrap(itemId: string): Promise<RecipeBootstrapPayload> {
    const startedAt = getNow();
    const cached = recipeBootstrapCache.get(itemId);
    if (cached) {
      markRecipeBootstrapResolved(itemId, 'memory-cache', startedAt, cached);
      return cached;
    }
    const existingRequest = recipeBootstrapInFlight.get(itemId);
    if (existingRequest) {
      const payload = await existingRequest;
      markRecipeBootstrapResolved(itemId, 'in-flight', startedAt, payload);
      return payload;
    }
    const request = (async () => {
      const distDataBootstrap = await getRuntimeRecipeBootstrap(itemId);
      if (distDataBootstrap) {
        setCacheWithLimit(recipeBootstrapCache, itemId, distDataBootstrap, CACHE_LIMITS.recipeBootstrap);
        setCacheWithLimit(recipeBootstrapShardCache, itemId, distDataBootstrap, CACHE_LIMITS.recipeBootstrapShard);
        markRecipeBootstrapResolved(itemId, 'dist-data-v3', startedAt, distDataBootstrap);
        return distDataBootstrap;
      }

      const manifest = await options.getManifest();
      const itemRecipeBundlePath = resolvePublishedItemRecipeBundlePath(manifest, itemId);
      if (itemRecipeBundlePath) {
        try {
          const publishedBundle = await options.fetchPublishedJson<unknown>(itemRecipeBundlePath);
          const bundledBootstrap = unwrapPublishedItemRecipeBundle(publishedBundle);
          if (bundledBootstrap) {
            setCacheWithLimit(recipeBootstrapCache, itemId, bundledBootstrap, CACHE_LIMITS.recipeBootstrap);
            markRecipeBootstrapResolved(itemId, 'item-recipe-bundle', startedAt, bundledBootstrap);
            return bundledBootstrap;
          }
        } catch {
          // Continue to the next compiled artifact source; control-plane bootstrap is not allowed here.
        }
      }

      const staticPath = resolvePublishedRecipeBootstrapPath(manifest, itemId, 'bootstrap');
      if (staticPath) {
        try {
          const published = await options.fetchPublishedJson<RecipeBootstrapPayload>(staticPath);
          setCacheWithLimit(recipeBootstrapCache, itemId, published, CACHE_LIMITS.recipeBootstrap);
          markRecipeBootstrapResolved(itemId, 'published-bootstrap', startedAt, published);
          return published;
        } catch {
          // Missing immutable artifacts are surfaced below instead of masked by lab.
        }
      }

      throw new Error(`Runtime recipe bootstrap unavailable for ${itemId}: compiled runtime artifacts are missing`);
    })().finally(() => {
      recipeBootstrapInFlight.delete(itemId);
    });
    recipeBootstrapInFlight.set(itemId, request);
    return request;
  }

  async function getRecipeBootstrapShard(itemId: string): Promise<RecipeBootstrapPayload> {
    const startedAt = getNow();
    const cached = recipeBootstrapShardCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = recipeBootstrapShardInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = (async () => {
      const distDataBootstrap = await getRuntimeRecipeBootstrap(itemId);
      if (distDataBootstrap) {
        setCacheWithLimit(recipeBootstrapCache, itemId, distDataBootstrap, CACHE_LIMITS.recipeBootstrap);
        setCacheWithLimit(recipeBootstrapShardCache, itemId, distDataBootstrap, CACHE_LIMITS.recipeBootstrapShard);
        markRecipeBootstrapResolved(itemId, 'dist-data-v3', startedAt, distDataBootstrap);
        return distDataBootstrap;
      }

      const manifest = await options.getManifest();
      const staticPath = resolvePublishedRecipeBootstrapPath(manifest, itemId, 'shard');
      if (staticPath) {
        try {
          const published = await options.fetchPublishedJson<RecipeBootstrapPayload>(staticPath);
          setCacheWithLimit(recipeBootstrapShardCache, itemId, published, CACHE_LIMITS.recipeBootstrapShard);
          return published;
        } catch {
          // Missing immutable artifacts are surfaced below instead of masked by lab.
        }
      }

      throw new Error(`Runtime recipe bootstrap shard unavailable for ${itemId}: compiled runtime artifacts are missing`);
    })().finally(() => {
      recipeBootstrapShardInFlight.delete(itemId);
    });
    recipeBootstrapShardInFlight.set(itemId, request);
    return request;
  }

  async function getRecipeBootstrapProducedByGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    groupOptions?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
  ): Promise<RecipeBootstrapMachineGroupPayload> {
    const runtimePayload = await getRuntimeRecipeBootstrapProducedByGroup(itemId, machineType, voltageTier, groupOptions);
    if (runtimePayload) {
      return runtimePayload;
    }

    const normalizedMachineKey = `${groupOptions?.machineKey ?? ''}`.trim();
    const machineKey = normalizedMachineKey || (`${machineType ?? ''}`.trim() ? `${machineType}::${voltageTier ?? ''}` : '');
    const manifest = await options.getManifest();
    const published = await tryLoadPublishedMachineGroup(manifest, itemId, 'producedBy', machineKey, groupOptions);
    if (published) {
      return published;
    }

    throw new Error(`Runtime produced-by group unavailable for ${itemId}/${machineKey || machineType}: compiled runtime artifacts are missing`);
  }

  async function getRecipeBootstrapUsedInGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    groupOptions?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
  ): Promise<RecipeBootstrapMachineGroupPayload> {
    const runtimePayload = await getRuntimeRecipeBootstrapUsedInGroup(itemId, machineType, voltageTier, groupOptions);
    if (runtimePayload) {
      return runtimePayload;
    }

    const normalizedMachineKey = `${groupOptions?.machineKey ?? ''}`.trim();
    const machineKey = normalizedMachineKey || (`${machineType ?? ''}`.trim() ? `${machineType}::${voltageTier ?? ''}` : '');
    const manifest = await options.getManifest();
    const published = await tryLoadPublishedMachineGroup(manifest, itemId, 'usedIn', machineKey, groupOptions);
    if (published) {
      return published;
    }

    throw new Error(`Runtime used-in group unavailable for ${itemId}/${machineKey || machineType}: compiled runtime artifacts are missing`);
  }

  async function tryLoadPublishedMachineGroup(
    manifest: PublicRuntimeManifest,
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    machineKey: string,
    groupOptions?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
  ): Promise<RecipeBootstrapMachineGroupPayload | null> {
    if (canUsePublishedRecipeGroupIndex(manifest, itemId, groupOptions) && machineKey) {
      const staticPath = resolvePublishedRecipeGroupIndexPath({
        manifest,
        itemId,
        tab,
        kind: 'machine',
        key: machineKey,
      });
      if (staticPath) {
        try {
          return await options.fetchPublishedJson<RecipeBootstrapMachineGroupPayload>(staticPath);
        } catch {
          // Continue within the compiled group artifact order.
        }
      }
    }
    if (canUsePublishedRecipeGroupWindow(manifest, itemId, groupOptions) && machineKey) {
      const staticPath = resolvePublishedRecipeGroupWindowPath({
        manifest,
        itemId,
        tab,
        kind: 'machine',
        key: machineKey,
        offset: groupOptions?.offset ?? 0,
        limit: groupOptions?.limit ?? 0,
      });
      if (staticPath) {
        try {
          return await options.fetchPublishedJson<RecipeBootstrapMachineGroupPayload>(staticPath);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  async function getRecipeBootstrapCategoryGroup(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    categoryKey: string,
    groupOptions?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
  ): Promise<RecipeBootstrapCategoryGroupPayload> {
    const runtimePayload = await getRuntimeRecipeBootstrapCategoryGroup(itemId, tab, categoryKey, groupOptions);
    if (runtimePayload) {
      return runtimePayload;
    }

    const manifest = await options.getManifest();
    const published = await tryLoadPublishedCategoryGroup(manifest, itemId, tab, categoryKey, groupOptions);
    if (published) {
      return published;
    }

    throw new Error(`Runtime category group unavailable for ${itemId}/${tab}/${categoryKey}: compiled runtime artifacts are missing`);
  }

  async function tryLoadPublishedCategoryGroup(
    manifest: PublicRuntimeManifest,
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    categoryKey: string,
    groupOptions?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
  ): Promise<RecipeBootstrapCategoryGroupPayload | null> {
    if (canUsePublishedRecipeGroupIndex(manifest, itemId, groupOptions)) {
      const staticPath = resolvePublishedRecipeGroupIndexPath({
        manifest,
        itemId,
        tab,
        kind: 'category',
        key: categoryKey,
      });
      if (staticPath) {
        try {
          return await options.fetchPublishedJson<RecipeBootstrapCategoryGroupPayload>(staticPath);
        } catch {
          // Continue within the compiled group artifact order.
        }
      }
    }
    if (canUsePublishedRecipeGroupWindow(manifest, itemId, groupOptions)) {
      const staticPath = resolvePublishedRecipeGroupWindowPath({
        manifest,
        itemId,
        tab,
        kind: 'category',
        key: categoryKey,
        offset: groupOptions?.offset ?? 0,
        limit: groupOptions?.limit ?? 0,
      });
      if (staticPath) {
        try {
          return await options.fetchPublishedJson<RecipeBootstrapCategoryGroupPayload>(staticPath);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  async function getRecipeBootstrapSearch(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    query: string,
    searchOptions?: SearchItemsFastOptions,
  ): Promise<RecipeBootstrapSearchPayload> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return { itemId, tab, query: normalizedQuery, recipeIds: [], itemMatches: [] };
    }

    const publishedPack = await getPublishedRecipeBootstrapSearchPack(itemId, tab);
    if (publishedPack) {
      const itemMatches = await searchPublishedItemMatches(normalizedQuery, 80, { signal: searchOptions?.signal }).catch(() => []);
      return searchPublishedRecipeBootstrapPack(publishedPack, normalizedQuery, itemMatches);
    }

    throw new Error(`Runtime recipe bootstrap search unavailable for ${itemId}/${tab}: compiled search pack is missing`);
  }

  async function prefetchRecipeBootstrapSearchPack(itemId: string, tab: 'usedIn' | 'producedBy'): Promise<void> {
    await getPublishedRecipeBootstrapSearchPack(itemId, tab);
  }

  return {
    clearCaches,
    getRecipeBootstrap,
    getRecipeBootstrapShard,
    getRecipeBootstrapProducedByGroup,
    getRecipeBootstrapUsedInGroup,
    getRecipeBootstrapCategoryGroup,
    getRecipeBootstrapSearch,
    prefetchRecipeBootstrapSearchPack,
  };
}
