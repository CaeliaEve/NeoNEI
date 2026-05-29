import { BACKEND_BASE_URL } from './api/core/http';
import { createPublishedJsonClient } from '../runtime/publishClient';
import { createRuntimeManifestClient, getRuntimeCacheSignature } from '../runtime/manifestClient';
import type {
  AnimatedAtlasAssetEntry,
  BrowserAtlasIndexResponse,
  BrowserByIdsPackResponse,
  BrowserDefaultCatalogResponse,
  BrowserGridEntry,
  BrowserGroupItemsResponse,
  BrowserPagePackResponse,
  BrowserPageResourceManifest,
  BrowserSearchCatalogResponse,
  BrowserSearchPackEntry,
  BrowserSearchPackResponse,
  DimensionDTO,
  Fluid,
  FluidGroup,
  FluidStack,
  GregTechMetadata,
  HomeBootstrapResponse,
  Item,
  ItemSearchBasic,
  Mod,
  PageAtlasResult,
  PageRichMediaManifest,
  PaginatedResponse,
  PublicRuntimeManifest,
  PublishedRecipeBootstrapSearchPack,
  PublishBundleWindowPathEntry,
  Recipe,
  RecipeBootstrapCategoryGroupPayload,
  RecipeBootstrapMachineGroupPayload,
  RecipeBootstrapPayload,
  RecipeBootstrapSearchPayload,
  RecipeInputCell,
  RecipeInputRow,
  RecipeItem,
  RecipeTypeDTO,
  RecipeUiPayload,
  RecipeVariantGroup,
  SearchItemsFastOptions,
  indexedItem,
  indexedItemGroup,
  indexedItemMachinesResponse,
  indexedItemRecipeSummaryResponse,
  indexedItemStack,
  indexedMachineGroupSummary,
  indexedMachineInfo,
  indexedMachineOption,
  indexedRecipe,
  indexedRecipeCategorySummary,
  indexedRecipeMetadata,
} from '../runtime/types';
import { browserRuntimeClient } from '../runtime/browserClient';
import { searchRuntimeClient } from '../runtime/searchClient';
import {
  getStoredRuntimeSignature,
  primeRuntimeCacheSignature,
  readPersistentRuntimeCache,
  writePersistentRuntimeCache,
} from './persistentRuntimeCache';
import {
  reportMissingRuntimePayload,
  reportRuntimeContractGap,
  isStrictRuntimeContractsEnabled,
} from '../runtime/diagnostics';
import { markPerfEvent } from './perfMarks';
import { canUsePublishedRecipeGroupIndex, canUsePublishedRecipeGroupWindow, canUsePublishedRecipeSearchPack, getRuntimeRecipeBootstrap, getRuntimeRecipeUiPayload, resolvePublishedRecipeGroupIndexPath, resolvePublishedRecipeGroupWindowPath, resolvePublishedRecipeSearchPath, resolveRuntimeRecipeBootstrapPath } from '../runtime/recipeClient';
import { createTextureRuntimeClient } from '../runtime/textureClient';
import { deleteLabPayload, getLabPayload, postLabPayload, putLabPayload } from '../runtime/devCompatClient';
import { getDistDataHomeBootstrap } from './distDataRuntime';

export type {
  AnimatedAtlasAssetEntry,
  AnimatedAtlasFrameEntry,
  AnimatedAtlasTimelineEntry,
  BrowserAtlasAnimatedFrame,
  BrowserAtlasAnimatedPlacement,
  BrowserAtlasIndexResponse,
  BrowserAtlasItemEntry,
  BrowserAtlasStaticPlacement,
  BrowserByIdsPackResponse,
  BrowserDefaultCatalogResponse,
  BrowserGridEntry,
  BrowserGroupItemsResponse,
  BrowserPagePackResponse,
  BrowserPageResourceManifest,
  BrowserSearchCatalogResponse,
  BrowserSearchPackEntry,
  BrowserSearchPackResponse,
  BrowserVariantGroup,
  DimensionDTO,
  Fluid,
  FluidGroup,
  FluidStack,
  GregTechMetadata,
  HomeBootstrapResponse,
  Item,
  ItemRenderHint,
  ItemSearchBasic,
  Mod,
  PageAtlasResult,
  PageAtlasSpriteEntry,
  PageRichMediaManifest,
  PaginatedResponse,
  PublicRuntimeManifest,
  PublishedRecipeBootstrapSearchEntry,
  PublishedRecipeBootstrapSearchPack,
  PublishBundleSearchShardPathEntry,
  PublishBundleWindowPathEntry,
  PublishStaticBundleManifest,
  Recipe,
  RecipeBootstrapCategoryGroupPayload,
  RecipeBootstrapMachineGroupPayload,
  RecipeBootstrapPayload,
  RecipeBootstrapSearchPayload,
  RecipeInputCell,
  RecipeInputRow,
  RecipeItem,
  RecipeTypeDTO,
  RecipeUiPayload,
  RecipeVariantGroup,
  SearchItemsFastOptions,
  indexedItem,
  indexedItemGroup,
  indexedItemMachinesResponse,
  indexedItemRecipeSummaryResponse,
  indexedItemStack,
  indexedMachineGroupSummary,
  indexedMachineInfo,
  indexedMachineOption,
  indexedRecipe,
  indexedRecipeCategorySummary,
  indexedRecipeMetadata,
} from '../runtime/types';

export { API_BASE_URL, BACKEND_BASE_URL } from './api/core/http';
export {
  getImageUrl,
  getImageUrlFromFileName,
  getImageUrlFromRenderAssetRef,
  getFluidImageUrl,
  getFluidImageUrlFromFluid,
  getItemImageUrlFromEntity,
  getPreferredStaticImageUrlFromEntity,
} from './api/images';

const BATCH_SIZE = 800;

function getNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

const itemDetailCache = new Map<string, Item>();
const indexedCraftingCache = new Map<string, indexedRecipe[]>();
const indexedUsageCache = new Map<string, indexedRecipe[]>();
const indexedSummaryCache = new Map<string, indexedItemRecipeSummaryResponse>();
const itemDetailInFlight = new Map<string, Promise<Item>>();
const indexedCraftingInFlight = new Map<string, Promise<indexedRecipe[]>>();
const indexedUsageInFlight = new Map<string, Promise<indexedRecipe[]>>();
const indexedSummaryInFlight = new Map<string, Promise<indexedItemRecipeSummaryResponse>>();
const recipeBootstrapCache = new Map<string, RecipeBootstrapPayload>();
const recipeBootstrapInFlight = new Map<string, Promise<RecipeBootstrapPayload>>();
const recipeBootstrapShardCache = new Map<string, RecipeBootstrapPayload>();
const recipeBootstrapShardInFlight = new Map<string, Promise<RecipeBootstrapPayload>>();
const recipeBootstrapSearchPackCache = new Map<string, PublishedRecipeBootstrapSearchPack>();
const recipeBootstrapSearchPackInFlight = new Map<string, Promise<PublishedRecipeBootstrapSearchPack | null>>();
const browserSearchShardCache = new Map<string, BrowserSearchPackResponse>();
const browserSearchShardInFlight = new Map<string, Promise<BrowserSearchPackResponse | null>>();
const browserDefaultCatalogCache = new Map<string, BrowserDefaultCatalogResponse>();
const browserDefaultCatalogInFlight = new Map<string, Promise<BrowserDefaultCatalogResponse>>();
const browserSearchCatalogCache = new Map<string, BrowserSearchCatalogResponse>();
const browserSearchCatalogInFlight = new Map<string, Promise<BrowserSearchCatalogResponse>>();
const browserGroupItemsCache = new Map<string, BrowserGroupItemsResponse>();
const browserGroupItemsInFlight = new Map<string, Promise<BrowserGroupItemsResponse>>();
const browserByIdsPackCache = new Map<string, BrowserByIdsPackResponse>();
const browserByIdsPackInFlight = new Map<string, Promise<BrowserByIdsPackResponse>>();
const uiPayloadCache = new Map<string, RecipeUiPayload>();
const uiPayloadInFlight = new Map<string, Promise<RecipeUiPayload | null>>();
const missingUiPayloadCache = new Set<string>();
let browserAtlasIndexCache: BrowserAtlasIndexResponse | null = null;
let browserAtlasIndexInFlight: Promise<BrowserAtlasIndexResponse | null> | null = null;
const browserAtlasEntriesInFlight = new Map<string, Promise<BrowserAtlasIndexResponse | null>>();
const publishedJsonValueCache = new Map<string, unknown>();
const publishedJsonInFlight = new Map<string, Promise<unknown>>();
let publishManifestCache: PublicRuntimeManifest | null = null;
const runtimeManifestClient = createRuntimeManifestClient<PublicRuntimeManifest>({
  onManifest: (manifest) => {
    publishManifestCache = manifest;
    primeRuntimeCacheSignature(getRuntimeCacheSignature(manifest));
  },
});
let ecosystemOverviewCache: EcosystemOverview | null = null;
let ecosystemOverviewInFlight: Promise<EcosystemOverview> | null = null;

const CACHE_LIMITS = {
  itemDetail: 10000,
  indexedCrafting: 3000,
  indexedUsage: 3000,
  indexedSummary: 3000,
  recipeBootstrap: 512,
  recipeBootstrapShard: 512,
  recipeBootstrapSearchPack: 96,
  browserByIdsPack: 96,
  uiPayload: 256,
  publishedJson: 96,
} as const;

function shouldPreferLiveRecipeBootstrap(): boolean {
  if (import.meta.env.VITE_PREFER_LIVE_RECIPE_BOOTSTRAP === '1') {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const override = window.localStorage.getItem('neonei:prefer-live-recipe-bootstrap');
    if (override === '1') {
      return true;
    }
    if (override === '0') {
      return false;
    }
  } catch {
    // Ignore storage access failures and fall back to hostname-based detection.
  }

  // Keep the published/static runtime as the default even during local development.
  // NeoNEI's target browsing feel is closer to in-game NEI when recipe bootstrap
  // reads hit the materialized publish payloads instead of live SQLite routes.
  return false;
}

const PREFER_LIVE_RECIPE_BOOTSTRAP = shouldPreferLiveRecipeBootstrap();
const RECIPE_BOOTSTRAP_CACHE_SCHEMA = 'v3';

const STRICT_RUNTIME_V3 = isStrictRuntimeContractsEnabled();

function reportRuntimeDevCompatGap(
  scope: string,
  route: string,
  reason: string,
  context?: {
    itemId?: string | null;
    recipeId?: string | null;
    assetId?: string | null;
    path?: string | null;
    sourceSignature?: string | null;
    runtimeCacheKey?: string | null;
    details?: Record<string, unknown>;
  },
): void {
  reportRuntimeContractGap(scope, route, reason, {
    strict: STRICT_RUNTIME_V3,
    context,
  });
}

function getRuntimeDiagnosticIdentity(): {
  sourceSignature?: string | null;
  runtimeCacheKey?: string | null;
} {
  return {
    sourceSignature: publishManifestCache?.sourceSignature ?? null,
    runtimeCacheKey: getRuntimeCacheSignature(publishManifestCache) || getStoredRuntimeSignature(),
  };
}

function setCacheWithLimit<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
}

function isHttpNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const response = (error as { response?: { status?: number } }).response;
  return Number(response?.status ?? 0) === 404;
}

function buildRuntimePayloadCacheKey(
  kind: string,
  signature: string,
  identity: Record<string, unknown>,
): string {
  return JSON.stringify({
    type: kind,
    version: 2,
    signature,
    ...identity,
  });
}

function withRecipeBootstrapCacheSchema<T extends Record<string, unknown>>(identity: T): T & { schema: string } {
  return {
    ...identity,
    schema: RECIPE_BOOTSTRAP_CACHE_SCHEMA,
  };
}

function isPublishedJsonWarm(assetPath: string | null | undefined): boolean {
  return publishedJsonClient.isWarm(assetPath);
}

async function fetchPublishedJson<T>(assetPath: string): Promise<T> {
  return publishedJsonClient.fetchJson<T>(assetPath);
}

async function resolveRuntimeSignature(): Promise<string | null> {
  const cached = getRuntimeCacheSignature(publishManifestCache);
  if (cached) {
    primeRuntimeCacheSignature(cached);
    return cached;
  }
  try {
    const manifest = await api.getPublishManifest();
    const signature = getRuntimeCacheSignature(manifest);
    if (signature) {
      primeRuntimeCacheSignature(signature);
    }
    return signature;
  } catch {
    return getStoredRuntimeSignature();
  }
}

async function readPersistentRuntimePayload<T>(
  kind: string,
  identity: Record<string, unknown>,
): Promise<T | null> {
  const signature = getRuntimeCacheSignature(publishManifestCache) || getStoredRuntimeSignature();
  if (!signature) {
    return null;
  }
  return readPersistentRuntimeCache<T>(buildRuntimePayloadCacheKey(kind, signature, identity));
}

function persistRuntimePayload(
  kind: string,
  identity: Record<string, unknown>,
  payload: unknown,
): void {
  void resolveRuntimeSignature()
    .then(async (signature) => {
      if (!signature) {
        return;
      }
      await writePersistentRuntimeCache(
        buildRuntimePayloadCacheKey(kind, signature, identity),
        payload,
      );
    })
    .catch(() => {
      // best-effort only
    });
}

const publishedJsonClient = createPublishedJsonClient({
  hasMemory: (url) => publishedJsonValueCache.has(url),
  getMemory: <T>(url: string) => publishedJsonValueCache.get(url) as T | undefined,
  setMemory: (url, payload) => setCacheWithLimit(publishedJsonValueCache, url, payload, CACHE_LIMITS.publishedJson),
  getInFlight: <T>(url: string) => publishedJsonInFlight.get(url) as Promise<T> | undefined,
  setInFlight: (url, request) => publishedJsonInFlight.set(url, request),
  deleteInFlight: (url) => publishedJsonInFlight.delete(url),
  readPersistent: <T>(url: string) => readPersistentRuntimePayload<T>('published-json', { url }),
  writePersistent: (url, payload) => persistRuntimePayload('published-json', { url }, payload),
});

const textureRuntimeClient = createTextureRuntimeClient({
  getCachedAtlasIndex: () => browserAtlasIndexCache,
  setCachedAtlasIndex: (index) => {
    browserAtlasIndexCache = index;
  },
  getAtlasIndexInFlight: () => browserAtlasIndexInFlight,
  setAtlasIndexInFlight: (request) => {
    browserAtlasIndexInFlight = request;
  },
  getAtlasEntriesInFlight: (key) => browserAtlasEntriesInFlight.get(key),
  setAtlasEntriesInFlight: (key, request) => browserAtlasEntriesInFlight.set(key, request),
  deleteAtlasEntriesInFlight: (key) => browserAtlasEntriesInFlight.delete(key),
});

type PersistentBrowserPageCacheRecord = {
  data: BrowserGridEntry[];
  items: Item[];
  atlas: PageAtlasResult | null;
  mediaManifest?: PageRichMediaManifest | null;
  resourceManifest?: BrowserPageResourceManifest;
  total: number;
  totalPages: number;
  page: number;
};

function collectDisplayItemIds(entries: BrowserGridEntry[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const itemId = entry.kind === 'item' ? entry.item?.itemId : entry.group.representative?.itemId;
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    ordered.push(itemId);
  }

  return ordered;
}

function trimAtlasEntries(
  atlas: PageAtlasResult | null,
  entries: BrowserGridEntry[],
): PageAtlasResult | null {
  if (!atlas) {
    return null;
  }

  const itemIds = new Set(collectDisplayItemIds(entries));
  return {
    ...atlas,
    entries: Object.fromEntries(
      Object.entries(atlas.entries).filter(([itemId]) => itemIds.has(itemId)),
    ),
  };
}

function trimRichMediaManifest(
  mediaManifest: PageRichMediaManifest | null | undefined,
  entries: BrowserGridEntry[],
): PageRichMediaManifest | null {
  if (!mediaManifest) {
    return null;
  }

  const renderAssetRefs = new Set(
    entries
      .map((entry) => {
        const item = entry.kind === 'item' ? entry.item : entry.group.representative;
        return `${item?.renderAssetRef ?? ''}`.trim();
      })
      .filter(Boolean),
  );

  const animatedAtlases = Object.fromEntries(
    Object.entries(mediaManifest.animatedAtlases ?? {}).filter(([assetId]) => renderAssetRefs.has(assetId)),
  );

  return Object.keys(animatedAtlases).length > 0 ? { animatedAtlases } : null;
}

function buildBrowserPageResourceManifest(
  entries: BrowserGridEntry[],
  atlas: PageAtlasResult | null | undefined,
  mediaManifest: PageRichMediaManifest | null | undefined,
): BrowserPageResourceManifest {
  const displayItems = entries
    .map((entry) => (entry.kind === 'item' ? entry.item : entry.group.representative))
    .filter(Boolean);
  const itemIds = Array.from(new Set(displayItems.map((item) => `${item.itemId ?? ''}`.trim()).filter(Boolean)));
  const renderAssetRefs = Array.from(new Set(displayItems.map((item) => `${item.renderAssetRef ?? ''}`.trim()).filter(Boolean)));
  const atlasUrls = Array.from(new Set([atlas?.atlasUrl].map((url) => `${url ?? ''}`.trim()).filter(Boolean)));
  const animatedAtlasFiles = Array.from(new Set(
    Object.values(mediaManifest?.animatedAtlases ?? {})
      .map((entry) => `${entry?.atlasFile ?? ''}`.trim())
      .filter(Boolean),
  ));

  return {
    itemIds,
    renderAssetRefs,
    atlasUrls,
    animatedAtlasFiles,
    atlasEntryCount: atlas ? Object.keys(atlas.entries ?? {}).length : 0,
    animatedAtlasCount: Object.keys(mediaManifest?.animatedAtlases ?? {}).length,
  };
}

function deriveBrowserPagePackFromWindow(
  window: BrowserPagePackResponse,
  requestedPage: number,
  requestedPageSize: number,
): BrowserPagePackResponse | null {
  const normalizedPage = Math.max(1, Math.floor(requestedPage));
  const normalizedPageSize = Math.max(1, Math.floor(requestedPageSize));
  const startIndex = (normalizedPage - 1) * normalizedPageSize;
  const endIndex = startIndex + normalizedPageSize;
  const windowOffset = Number.isFinite(window.windowOffset)
    ? Math.max(0, Math.floor(window.windowOffset ?? 0))
    : window.page > 1
      ? Math.max(0, Math.floor((window.page - 1) * window.pageSize))
      : 0;
  const windowLength = Number.isFinite(window.windowLength)
    ? Math.max(0, Math.floor(window.windowLength ?? window.data.length))
    : window.data.length;
  const windowEnd = windowOffset + windowLength;
  if (startIndex < windowOffset || endIndex > windowEnd) {
    return null;
  }

  const relativeStartIndex = startIndex - windowOffset;
  const relativeEndIndex = relativeStartIndex + normalizedPageSize;
  const data = window.data.slice(relativeStartIndex, relativeEndIndex);
  const atlas = trimAtlasEntries(window.atlas ?? null, data);
  const mediaManifest = trimRichMediaManifest(window.mediaManifest, data);
  return {
    data,
    total: window.total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalPages: Math.max(1, Math.ceil(window.total / normalizedPageSize)),
    atlas,
    mediaManifest,
    resourceManifest: buildBrowserPageResourceManifest(data, atlas, mediaManifest),
    windowOffset,
    windowLength: data.length,
  };
}

function normalizeExpandedGroups(groups?: string[]): string[] {
  return Array.from(
    new Set(
      (groups ?? [])
        .map((entry) => `${entry ?? ''}`.trim())
        .filter(Boolean),
    ),
  ).sort();
}

function buildPersistentBrowserPageKey(
  signature: string,
  params: {
    page: number;
    pageSize: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
    slotSize?: number;
  },
): string {
  return JSON.stringify({
    type: 'browser-page-pack',
    version: 3,
    signature,
    page: params.page,
    pageSize: params.pageSize,
    search: params.search?.trim() || '',
    modId: params.modId || 'all',
    expandedGroups: normalizeExpandedGroups(params.expandedGroups),
    slotSize: params.slotSize,
  });
}

function getBrowserDefaultCatalogCacheKey(modId?: string): string {
  return `${modId ?? 'all'}`.trim().toLowerCase() || 'all';
}

function getBrowserGroupItemsCacheKey(groupKey: string, modId?: string): string {
  return `${groupKey ?? ''}`.trim().toLowerCase() + `::${`${modId ?? 'all'}`.trim().toLowerCase() || 'all'}`;
}

function getBrowserSearchCatalogCacheKey(search: string, modId?: string): string {
  return `${`${search ?? ''}`.trim().toLowerCase()}::${`${modId ?? 'all'}`.trim().toLowerCase() || 'all'}`;
}

function normalizeSearchNeedle(value: string): string {
  return `${value ?? ''}`.trim().toLowerCase().replace(/\s+/g, '');
}

function browserEntryMatchesLocalSearch(entry: BrowserGridEntry, query: string): boolean {
  const needle = normalizeSearchNeedle(query);
  if (!needle) {
    return true;
  }
  const item = entry.kind === 'item' ? entry.item : entry.group.representative;
  const haystack = [
    item.localizedName,
    item.internalName,
    item.itemId,
    item.modId,
    item.searchTerms,
    item.unlocalizedName,
    entry.kind !== 'item' ? entry.group.label : '',
  ]
    .map((value) => normalizeSearchNeedle(`${value ?? ''}`))
    .filter(Boolean)
    .join('|');
  return haystack.includes(needle);
}

function buildBrowserByIdsPackCacheKey(params: { itemIds: string[]; slotSize?: number }): string {
  return JSON.stringify({
    itemIds: params.itemIds.map((itemId) => `${itemId ?? ''}`.trim()).filter(Boolean),
    slotSize: Number.isFinite(Number(params.slotSize)) ? Number(params.slotSize) : null,
  });
}

function collectDisplayItemsFromBrowserEntries(entries: BrowserGridEntry[]): Item[] {
  const ordered: Item[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const item = entry.kind === 'item' ? entry.item : entry.group.representative;
    const itemId = `${item?.itemId ?? ''}`.trim();
    if (!item || !itemId || seen.has(itemId)) {
      continue;
    }
    seen.add(itemId);
    ordered.push(item);
  }

  return ordered;
}

function resolvePublishedWindowPath(
  entries: PublishBundleWindowPathEntry[] | undefined,
  slotSize: number | undefined,
  requestedPage: number,
  requestedPageSize: number,
): string | null {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const normalizedSlotSize = Math.max(1, Math.floor(Number(slotSize) || 0));
  const startIndex = (Math.max(1, Math.floor(requestedPage)) - 1) * Math.max(1, Math.floor(requestedPageSize));
  const endIndex = startIndex + Math.max(1, Math.floor(requestedPageSize));
  const candidates = entries.filter((entry) =>
    entry.scope === 'all'
    && startIndex >= Math.max(0, Math.floor(entry.offset ?? 0))
    && endIndex <= Math.max(0, Math.floor(entry.offset ?? 0)) + Math.max(0, Math.floor(entry.length ?? 0)),
  );
  if (candidates.length <= 0) {
    return null;
  }

  const pickBestCoverage = (coverageEntries: PublishBundleWindowPathEntry[]): PublishBundleWindowPathEntry | null => {
    if (coverageEntries.length <= 0) {
      return null;
    }
    return coverageEntries
      .slice()
      .sort((left, right) => {
        const warmDelta = Number(isPublishedJsonWarm(right.path)) - Number(isPublishedJsonWarm(left.path));
        if (warmDelta !== 0) {
          return warmDelta;
        }

        const slotDelta = Math.abs(left.slotSize - normalizedSlotSize) - Math.abs(right.slotSize - normalizedSlotSize);
        if (slotDelta !== 0) {
          return slotDelta;
        }

        const leftTrailingSlack = Math.max(
          0,
          Math.floor(left.offset ?? 0) + Math.floor(left.length ?? 0) - endIndex,
        );
        const rightTrailingSlack = Math.max(
          0,
          Math.floor(right.offset ?? 0) + Math.floor(right.length ?? 0) - endIndex,
        );
        const trailingSlackDelta = rightTrailingSlack - leftTrailingSlack;
        if (trailingSlackDelta !== 0) {
          return trailingSlackDelta;
        }

        const leftLeadingSlack = Math.max(0, startIndex - Math.floor(left.offset ?? 0));
        const rightLeadingSlack = Math.max(0, startIndex - Math.floor(right.offset ?? 0));
        const leadingSlackDelta = leftLeadingSlack - rightLeadingSlack;
        if (leadingSlackDelta !== 0) {
          return leadingSlackDelta;
        }

        return Math.floor(right.offset ?? 0) - Math.floor(left.offset ?? 0);
      })[0] ?? null;
  };

  const exactSlotCoverage = candidates.filter((entry) => entry.slotSize === normalizedSlotSize);
  return pickBestCoverage(exactSlotCoverage)?.path
    ?? pickBestCoverage(candidates)?.path
    ?? null;
}

function resolvePublishedRecipeBootstrapPath(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
  kind: 'bootstrap' | 'shard',
): string | null {
  const normalizedItemId = `${itemId ?? ''}`.trim();
  if (!normalizedItemId) {
    return null;
  }

  const bundle = manifest?.publishBundle;
  const publishedItems = Array.isArray(bundle?.files.recipeBootstrapItems)
    ? bundle?.files.recipeBootstrapItems
    : [];
  if (!publishedItems.includes(normalizedItemId)) {
    return null;
  }

  return resolveRuntimeRecipeBootstrapPath(
    kind === 'bootstrap' ? bundle?.files.recipeBootstrapBasePath : bundle?.files.recipeBootstrapShardBasePath,
    normalizedItemId,
  );
}

function resolvePublishedItemRecipeBundlePath(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
): string | null {
  const normalizedItemId = `${itemId ?? ''}`.trim();
  if (!normalizedItemId) {
    return null;
  }

  const bundle = manifest?.publishBundle;
  const publishedItems = Array.isArray(bundle?.files.itemRecipeBundleItems)
    ? bundle?.files.itemRecipeBundleItems
    : [];
  const basePath = `${bundle?.files.itemRecipeBundleBasePath ?? ''}`.trim();
  if (!basePath || !publishedItems.includes(normalizedItemId)) {
    return null;
  }

  return `${basePath.replace(/\/+$/g, '')}/${encodeURIComponent(normalizedItemId)}.json`;
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
// Pattern Management Interfaces
export interface PatternGroup {
  groupId: string;
  groupName: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pattern {
  patternId: string;
  groupId: string | null;
  recipeId: string;
  patternName: string;
  outputItemId: string | null;
  priority: number;
  enabled: number;
  crafting: number;
  substitute: number;
  beSubstitute: number;
  createdAt: string;
  updatedAt: string;
}

export interface PatternWithDetails extends Pattern {
  recipe: Recipe | null;
  outputItem: Item | null;
}

export interface PatternGroupWithPatterns extends PatternGroup {
  patterns: PatternWithDetails[];
  patternCount: number;
}

type RecipeBootstrapLoadSource =
  | 'dist-data-v3'
  | 'memory-cache'
  | 'in-flight'
  | 'persistent-cache'
  | 'item-recipe-bundle'
  | 'legacy-static-bootstrap'
  | 'dev-compat-api';

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
export interface GTDiagramItemRef {
  itemId: string;
  localizedName: string;
  tier?: number | null;
  tierName?: string | null;
}

export interface GTCircuitLine {
  startTier: number;
  boards: GTDiagramItemRef[];
  circuits: GTDiagramItemRef[];
}

export interface GTIndividualCircuit {
  tier: number;
  boards: GTDiagramItemRef[];
  circuit: GTDiagramItemRef | null;
}

export interface GTCircuitPartGroup {
  key: string;
  parts: Array<{
    prefix: string;
    itemId: string;
    localizedName: string;
  }>;
}

export interface GTCircuitProgressionDocument {
  generatedFrom: string;
  circuitLines: GTCircuitLine[];
  individualCircuits: GTIndividualCircuit[];
  circuitParts: GTCircuitPartGroup[];
}

export interface GTMaterialPartRef {
  prefix: string;
  itemId: string;
  localizedName: string;
}

export interface GTMaterialFluidRef {
  kind: string;
  fluidId: string;
  localizedName: string;
}

export interface GTMaterialPartsEntry {
  materialName: string;
  materialId: string;
  sections: Record<string, GTMaterialPartRef[]>;
  fluids: GTMaterialFluidRef[];
}

export interface GTMaterialPartsDocument {
  generatedFrom: string;
  materials: GTMaterialPartsEntry[];
}

export interface GTDiagramsOverview {
  circuits: GTCircuitProgressionDocument | null;
  materials: GTMaterialPartsDocument | null;
}

export interface ForestryGeneticsItemDrop {
  itemId: string;
  localizedName: string;
  chance: number;
}

export interface ForestryGeneticsSpecies {
  uid: string;
  name: string;
  memberItemId: string;
  products: ForestryGeneticsItemDrop[];
  specialties: ForestryGeneticsItemDrop[];
}

export interface ForestryGeneticsMutation {
  allele0: string;
  allele1: string;
  result: string;
  chance: number;
  restricted: boolean;
  dimensions?: string[];
  biomes?: string[];
}

export interface ForestryGeneticsBranch {
  species: ForestryGeneticsSpecies[];
  mutations: ForestryGeneticsMutation[];
}

export interface ForestryGeneticsOverview {
  generatedFrom: string;
  bees: ForestryGeneticsBranch | null;
  trees: ForestryGeneticsBranch | null;
}

export interface MultiblockDimensions {
  x: number;
  y: number;
  z: number;
  raw?: string;
}

export interface MultiblockVoxelLegendEntry {
  label: string;
  color?: string;
  textureUrl?: string;
  blockId?: string;
  faceIcons?: Record<string, string>;
  faceTextureUrls?: Record<string, string>;
  faceUv?: Record<
    string,
    {
      minU: number;
      maxU: number;
      minV: number;
      maxV: number;
    }
  >;
  orientationKind?: string;
}

export interface MultiblockVoxelBlueprint {
  size: { x: number; y: number; z: number };
  // layers[ y ][ z ] = row string (x-axis tokens)
  layers: string[][];
  legend: Record<string, MultiblockVoxelLegendEntry>;
}

export interface MultiblockBlueprint {
  metaTileId: number;
  className: string;
  controllerItemId: string;
  controllerLocalizedName: string;
  structureSource?: string;
  supports?: {
    inputSeparation?: boolean;
    batchMode?: boolean;
    recipeLocking?: boolean;
    voidProtection?: boolean;
  };
  dimensions?: MultiblockDimensions | null;
  information?: string[];
  structureInformation?: string[];
  structureHints?: string[];
  voxelBlueprint?: MultiblockVoxelBlueprint;
}

export interface PatternExportData {
  version: number;
  modVersion: string;
  exportedAt?: string;
  patternCount: number;
  compatibility?: {
    target: 'oc-pattern';
    itemIdFormat: 'minecraft-registry';
    beSubstitute: 'pattern-field';
    crafterUUID: 'synthetic-pattern-id';
    author: 'default-exporter';
  };
  warnings?: string[];
  patterns?: Array<{
    crafting: boolean;
    substitute: boolean;
    beSubstitute: boolean;
    patternId: string;
    crafterUUID: string;
    author: string;
  }>;
  [key: string]: unknown;
}

export interface EcosystemLaneDetail {
  label: string;
  value: string;
  ok: boolean;
}

export interface EcosystemLaneStatus {
  id: 'nesql-exporter-main' | 'neonei' | 'oc-pattern';
  label: string;
  role: string;
  repoPath: string;
  detected: boolean;
  details: EcosystemLaneDetail[];
}

export interface EcosystemOverview {
  hub: string;
  workflow: string[];
  lanes: EcosystemLaneStatus[];
}

export interface RenderContractAssetEntry {
  assetId: string;
  variantKey: string;
  sourceType: string | null;
  family: string | null;
  mode: string | null;
  renderMode: string | null;
  animationMode: string | null;
  captureMethod: string | null;
  captureSource: string | null;
  rendererFamily: string | null;
  playbackHint: string | null;
  staticFile: string | null;
  primaryArtifact: string | null;
  spriteMetadataFile: string | null;
  nativeSpriteAtlasFile: string | null;
  contractFile: string | null;
  atlasGroup: string | null;
  frameCount: number | null;
  frameDurationMs: number | null;
  layers: Array<Record<string, unknown>>;
  rendererContract: Record<string, unknown> | null;
  shaderContract: Record<string, unknown> | null;
  captureContract: Record<string, unknown> | null;
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

function normalizeBrowserSearchKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function rankBrowserSearchPackEntry(entry: BrowserSearchPackEntry, normalized: string): number | null {
  if (!normalized) return null;

  const aliases = entry.aliases || '';
  if (entry.normalizedLocalizedName === normalized) return 0;
  if (entry.pinyinFull === normalized) return 1;
  if (entry.pinyinAcronym === normalized) return 2;
  if (aliases === normalized) return 3;
  if (entry.normalizedInternalName === normalized) return 4;
  if (entry.normalizedItemId === normalized) return 5;
  if (entry.normalizedSearchTerms === normalized) return 6;

  if (entry.normalizedLocalizedName.startsWith(normalized)) return 10;
  if (entry.pinyinFull.startsWith(normalized)) return 11;
  if (entry.pinyinAcronym.startsWith(normalized)) return 12;
  if (aliases.startsWith(normalized)) return 13;
  if (entry.normalizedInternalName.startsWith(normalized)) return 14;
  if (entry.normalizedSearchTerms.startsWith(normalized)) return 15;
  if (entry.normalizedItemId.startsWith(normalized)) return 16;

  if (entry.normalizedLocalizedName.includes(normalized)) return 20;
  if (entry.pinyinFull.includes(normalized)) return 21;
  if (entry.pinyinAcronym.includes(normalized)) return 22;
  if (aliases.includes(normalized)) return 23;
  if (entry.normalizedInternalName.includes(normalized)) return 24;
  if (entry.normalizedSearchTerms.includes(normalized)) return 25;
  if (entry.normalizedItemId.includes(normalized)) return 26;

  return null;
}

function searchBrowserSearchPackEntries(
  entries: BrowserSearchPackEntry[],
  query: string,
  limit: number,
): ItemSearchBasic[] {
  const normalized = normalizeBrowserSearchKeyword(query);
  if (!normalized || entries.length === 0) {
    return [];
  }

  return entries
    .map((entry, sourceIndex) => ({
      entry,
      sourceIndex,
      rank: rankBrowserSearchPackEntry(entry, normalized),
    }))
    .filter((entry): entry is { entry: BrowserSearchPackEntry; sourceIndex: number; rank: number } => entry.rank !== null)
    .sort((left, right) =>
      left.rank - right.rank
      || left.entry.searchRank - right.entry.searchRank
      || right.entry.popularityScore - left.entry.popularityScore
      || left.sourceIndex - right.sourceIndex,
    )
    .slice(0, Math.max(1, limit))
    .map(({ entry }) => ({
      itemId: entry.itemId,
      localizedName: entry.localizedName,
      modId: entry.modId,
    }));
}

function mergeBrowserSearchPackEntries(
  primary: BrowserSearchPackEntry[],
  secondary: BrowserSearchPackEntry[],
): BrowserSearchPackEntry[] {
  if (primary.length === 0) return [...secondary];
  if (secondary.length === 0) return [...primary];

  const seen = new Set(primary.map((entry) => entry.itemId));
  const merged = [...primary];
  for (const entry of secondary) {
    if (!entry?.itemId || seen.has(entry.itemId)) {
      continue;
    }
    seen.add(entry.itemId);
    merged.push(entry);
  }
  return merged;
}

async function searchPublishedItemMatches(
  query: string,
  limit: number,
  options?: SearchItemsFastOptions,
): Promise<ItemSearchBasic[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.toLowerCase().startsWith('type:')) {
    return [];
  }

  const ensureNotAborted = () => {
    if (options?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
  };

  ensureNotAborted();
  const hotShard = await api.getBrowserSearchPackShard('hot');
  ensureNotAborted();

  const hotMatches = searchBrowserSearchPackEntries(hotShard?.items ?? [], normalizedQuery, limit);
  if (hotMatches.length >= limit) {
    return hotMatches;
  }

  const tailShard = await api.getBrowserSearchPackShard('tail');
  ensureNotAborted();
  const mergedEntries = mergeBrowserSearchPackEntries(hotShard?.items ?? [], tailShard?.items ?? []);
  const mergedMatches = searchBrowserSearchPackEntries(mergedEntries, normalizedQuery, limit);
  if (mergedMatches.length > 0 || mergedEntries.length > 0) {
    return mergedMatches;
  }

  const fullPack = await api.getBrowserSearchPack().catch(() => null);
  ensureNotAborted();
  return searchBrowserSearchPackEntries(fullPack?.items ?? [], normalizedQuery, limit);
}

async function getPublishedRecipeBootstrapSearchPack(
  itemId: string,
  tab: 'usedIn' | 'producedBy',
): Promise<PublishedRecipeBootstrapSearchPack | null> {
  if (PREFER_LIVE_RECIPE_BOOTSTRAP) {
    return null;
  }

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
    const persistent = await readPersistentRuntimePayload<PublishedRecipeBootstrapSearchPack>(
      'recipe-bootstrap-search-pack',
      { itemId: normalizedItemId, tab },
    );
    if (persistent) {
      setCacheWithLimit(
        recipeBootstrapSearchPackCache,
        cacheKey,
        persistent,
        CACHE_LIMITS.recipeBootstrapSearchPack,
      );
      return persistent;
    }

    const manifest = await api.getPublishManifest();
    if (!canUsePublishedRecipeSearchPack(manifest, normalizedItemId)) {
      return null;
    }

    const staticPath = resolvePublishedRecipeSearchPath(manifest, normalizedItemId, tab);
    if (!staticPath) {
      return null;
    }

    try {
      const published = await fetchPublishedJson<PublishedRecipeBootstrapSearchPack>(staticPath);
      setCacheWithLimit(
        recipeBootstrapSearchPackCache,
        cacheKey,
        published,
        CACHE_LIMITS.recipeBootstrapSearchPack,
      );
      persistRuntimePayload('recipe-bootstrap-search-pack', { itemId: normalizedItemId, tab }, published);
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

export const api = {
  trimPreheatRuntimeCaches(): void {
    itemDetailCache.clear();
    itemDetailInFlight.clear();
    recipeBootstrapCache.clear();
    recipeBootstrapInFlight.clear();
    recipeBootstrapShardCache.clear();
    recipeBootstrapShardInFlight.clear();
    recipeBootstrapSearchPackCache.clear();
    recipeBootstrapSearchPackInFlight.clear();
    browserSearchShardCache.clear();
    browserSearchShardInFlight.clear();
    browserSearchCatalogCache.clear();
    browserSearchCatalogInFlight.clear();
    uiPayloadCache.clear();
    uiPayloadInFlight.clear();
    missingUiPayloadCache.clear();
    publishedJsonValueCache.clear();
    publishedJsonInFlight.clear();
  },

  resetRuntimeCaches(): void {
    itemDetailCache.clear();
    indexedCraftingCache.clear();
    indexedUsageCache.clear();
    indexedSummaryCache.clear();
    itemDetailInFlight.clear();
    indexedCraftingInFlight.clear();
    indexedUsageInFlight.clear();
    indexedSummaryInFlight.clear();
    recipeBootstrapCache.clear();
    recipeBootstrapInFlight.clear();
    recipeBootstrapShardCache.clear();
    recipeBootstrapShardInFlight.clear();
    recipeBootstrapSearchPackCache.clear();
    recipeBootstrapSearchPackInFlight.clear();
    browserSearchShardCache.clear();
    browserSearchShardInFlight.clear();
    browserSearchCatalogCache.clear();
    browserSearchCatalogInFlight.clear();
    uiPayloadCache.clear();
    uiPayloadInFlight.clear();
    missingUiPayloadCache.clear();
    publishedJsonValueCache.clear();
    publishedJsonInFlight.clear();
    publishManifestCache = null;
    runtimeManifestClient.clear();
    ecosystemOverviewCache = null;
    ecosystemOverviewInFlight = null;
  },

  async getPublishManifest(): Promise<PublicRuntimeManifest> {
    return runtimeManifestClient.getPublishManifest();
  },

  async getHomeBootstrap(params: {
    page?: number;
    pageSize?: number;
    slotSize?: number;
    modId?: string;
  }): Promise<HomeBootstrapResponse> {
    const distDataBootstrap = await getDistDataHomeBootstrap(params);
    if (distDataBootstrap) {
      return distDataBootstrap;
    }
    reportRuntimeDevCompatGap('home-bootstrap', '/publish/home-bootstrap', 'dist-data home bootstrap missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: params,
    });

    const manifest = await api.getPublishManifest();
    const requestedPage = Math.max(1, Math.floor(params.page ?? 1));
    const requestedPageSize = Math.max(1, Math.floor(params.pageSize ?? 50));
    const staticPath = !params.modId
      ? resolvePublishedWindowPath(
          manifest.publishBundle?.files.homeBootstrapWindows,
          params.slotSize,
          requestedPage,
          requestedPageSize,
        )
      : null;
    if (staticPath) {
      try {
        const published = await fetchPublishedJson<{
          mods: Mod[];
          pagePack: BrowserPagePackResponse;
        }>(staticPath);
        const pagePack = deriveBrowserPagePackFromWindow(
          published.pagePack,
          requestedPage,
          requestedPageSize,
        );
        if (pagePack) {
          if (Array.isArray(published.mods)) {
            persistRuntimePayload('mods-list', { scope: 'all' }, published.mods);
          }
          return {
            manifest,
            mods: Array.isArray(published.mods) ? published.mods : [],
            pagePack,
          };
        }
      } catch {
        // Fall back to the API route when the static publish bundle is unavailable.
      }
    }

    const response = { data: await getLabPayload<HomeBootstrapResponse>('/publish/home-bootstrap', {
      params,
    }) };
    if (response.data?.manifest) {
      publishManifestCache = response.data.manifest;
      primeRuntimeCacheSignature(getRuntimeCacheSignature(response.data.manifest));
    }
    if (Array.isArray(response.data?.mods)) {
      persistRuntimePayload('mods-list', { scope: 'all' }, response.data.mods);
    }
    return response.data;
  },

  // Get items with pagination
  async getItems(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
  }): Promise<PaginatedResponse<Item>> {
    return getLabPayload<PaginatedResponse<Item>>('/items', { params });
  },

  async getBrowserItems(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
  }): Promise<PaginatedResponse<BrowserGridEntry>> {
    const distDataPage = await browserRuntimeClient.getPagePack(params);
    if (distDataPage) {
      return {
        data: distDataPage.data,
        total: distDataPage.total,
        page: distDataPage.page,
        pageSize: distDataPage.pageSize,
        totalPages: distDataPage.totalPages,
      };
    }
    reportRuntimeDevCompatGap('browser-items', '/items/browser', 'dist-data browser page missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: params,
    });

    return getLabPayload<PaginatedResponse<BrowserGridEntry>>('/items/browser', {
      params: {
        ...params,
        expandedGroups: (params.expandedGroups ?? []).join(','),
      },
    });
  },

  async getBrowserDefaultCatalog(params?: {
    modId?: string;
  }): Promise<BrowserDefaultCatalogResponse> {
    const cacheKey = getBrowserDefaultCatalogCacheKey(params?.modId);
    const cached = browserDefaultCatalogCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserDefaultCatalogInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const distDataCatalog = await browserRuntimeClient.getDefaultCatalog(params?.modId);
      if (distDataCatalog) {
        browserDefaultCatalogCache.set(cacheKey, distDataCatalog);
        return distDataCatalog;
      }
      reportRuntimeDevCompatGap('browser-default-catalog', '/items/browser/default-catalog', 'dist-data default catalog missing', {
        ...getRuntimeDiagnosticIdentity(),
        details: params,
      });

      const persistent = await readPersistentRuntimePayload<BrowserDefaultCatalogResponse>(
        'browser-default-catalog',
        { scope: cacheKey },
      );
      if (persistent?.data?.length) {
        browserDefaultCatalogCache.set(cacheKey, persistent);
        return persistent;
      }

      const payload = await getLabPayload<BrowserDefaultCatalogResponse>('/items/browser/default-catalog', {
        params,
      });
      browserDefaultCatalogCache.set(cacheKey, payload);
      persistRuntimePayload('browser-default-catalog', { scope: cacheKey }, payload);
      return payload;
    })().finally(() => {
      browserDefaultCatalogInFlight.delete(cacheKey);
    });

    browserDefaultCatalogInFlight.set(cacheKey, request);
    return request;
  },

  peekBrowserDefaultCatalog(modId?: string): BrowserDefaultCatalogResponse | null {
    return browserDefaultCatalogCache.get(getBrowserDefaultCatalogCacheKey(modId)) ?? null;
  },

  async getBrowserSearchCatalog(params: {
    search: string;
    modId?: string;
  }): Promise<BrowserSearchCatalogResponse> {
    const normalizedSearch = `${params.search ?? ''}`.trim();
    if (!normalizedSearch) {
      return api.getBrowserDefaultCatalog({ modId: params.modId });
    }

    const distDataCatalog = await browserRuntimeClient.getSearchCatalog(normalizedSearch, params.modId);
    if (distDataCatalog) {
      browserSearchCatalogCache.set(getBrowserSearchCatalogCacheKey(normalizedSearch, params.modId), distDataCatalog);
      return distDataCatalog;
    }
    reportRuntimeDevCompatGap('browser-search-catalog', 'local default-catalog projection', 'dist-data search catalog missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: params,
    });

    const cacheKey = getBrowserSearchCatalogCacheKey(normalizedSearch, params.modId);
    const cached = browserSearchCatalogCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserSearchCatalogInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const defaultCatalog = browserDefaultCatalogCache.get(getBrowserDefaultCatalogCacheKey(params.modId));
      const filtered = (defaultCatalog?.data ?? [])
        .filter((entry) => browserEntryMatchesLocalSearch(entry, normalizedSearch));
      const result: BrowserSearchCatalogResponse = {
        data: filtered,
        total: filtered.length,
        page: 1,
        pageSize: filtered.length,
        totalPages: 1,
      };
      browserSearchCatalogCache.set(cacheKey, result);
      return result;
    })().finally(() => {
      browserSearchCatalogInFlight.delete(cacheKey);
    });

    browserSearchCatalogInFlight.set(cacheKey, request);
    return request;
  },

  peekBrowserSearchCatalog(search: string, modId?: string): BrowserSearchCatalogResponse | null {
    const normalizedSearch = `${search ?? ''}`.trim();
    if (!normalizedSearch) {
      return api.peekBrowserDefaultCatalog(modId);
    }
    return browserSearchCatalogCache.get(getBrowserSearchCatalogCacheKey(normalizedSearch, modId)) ?? null;
  },

  async getBrowserGroupItems(groupKey: string, modId?: string): Promise<BrowserGroupItemsResponse> {
    const normalizedGroupKey = `${groupKey ?? ''}`.trim();
    if (!normalizedGroupKey) {
      return {
        groupKey: '',
        total: 0,
        items: [],
      };
    }

    const distDataGroupItems = await browserRuntimeClient.getGroupItems(normalizedGroupKey, modId);
    if (distDataGroupItems?.items?.length) {
      return distDataGroupItems;
    }
    reportRuntimeDevCompatGap('browser-group-items', `/items/browser/group/${normalizedGroupKey}`, 'dist-data group items missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: { groupKey: normalizedGroupKey, modId },
    });

    const cacheKey = getBrowserGroupItemsCacheKey(normalizedGroupKey, modId);
    const cached = browserGroupItemsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserGroupItemsInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const persistent = await readPersistentRuntimePayload<BrowserGroupItemsResponse>(
        'browser-group-items',
        { groupKey: normalizedGroupKey, scope: getBrowserDefaultCatalogCacheKey(modId) },
      );
      if (persistent?.items?.length) {
        browserGroupItemsCache.set(cacheKey, persistent);
        return persistent;
      }

      const payload = await getLabPayload<BrowserGroupItemsResponse>(`/items/browser/group/${encodeURIComponent(normalizedGroupKey)}`, {
        params: modId ? { modId } : undefined,
      });
      browserGroupItemsCache.set(cacheKey, payload);
      persistRuntimePayload(
        'browser-group-items',
        { groupKey: normalizedGroupKey, scope: getBrowserDefaultCatalogCacheKey(modId) },
        payload,
      );
      return payload;
    })().finally(() => {
      browserGroupItemsInFlight.delete(cacheKey);
    });

    browserGroupItemsInFlight.set(cacheKey, request);
    return request;
  },

  peekBrowserGroupItems(groupKey: string, modId?: string): BrowserGroupItemsResponse | null {
    const normalizedGroupKey = `${groupKey ?? ''}`.trim();
    if (!normalizedGroupKey) {
      return null;
    }
    return browserGroupItemsCache.get(getBrowserGroupItemsCacheKey(normalizedGroupKey, modId)) ?? null;
  },

  async getBrowserPagePack(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
    slotSize?: number;
  }): Promise<BrowserPagePackResponse> {
    const distDataPagePack = await browserRuntimeClient.getPagePack(params);
    if (distDataPagePack) {
      return distDataPagePack;
    }
    reportRuntimeDevCompatGap('browser-page-pack', '/items/browser/page-pack', 'dist-data page pack missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: params,
    });

    const normalizedExpandedGroups = params.expandedGroups ?? [];
    const canUseStaticBundle = !params.search?.trim()
      && !params.modId
      && normalizedExpandedGroups.length === 0;
    if (canUseStaticBundle) {
      const manifest = await api.getPublishManifest();
      const staticPath = resolvePublishedWindowPath(
        manifest.publishBundle?.files.browserPageWindows,
        params.slotSize,
        Math.max(1, Math.floor(params.page ?? 1)),
        Math.max(1, Math.floor(params.pageSize ?? 50)),
      );
      if (staticPath) {
        try {
          const published = await fetchPublishedJson<BrowserPagePackResponse>(staticPath);
          const derived = deriveBrowserPagePackFromWindow(
            published,
            Math.max(1, Math.floor(params.page ?? 1)),
            Math.max(1, Math.floor(params.pageSize ?? 50)),
          );
          if (derived) {
            return derived;
          }
        } catch {
          // Fall back to the API route when the static publish bundle is unavailable.
        }
      }
    }

    return getLabPayload<BrowserPagePackResponse>('/items/browser/page-pack', {
      params: {
        ...params,
        expandedGroups: (params.expandedGroups ?? []).join(','),
      },
    });
  },

  async primeDefaultBrowserPagePack(params: {
    page: number;
    pageSize: number;
    slotSize?: number;
  }): Promise<BrowserPagePackResponse> {
    const normalized = {
      page: Math.max(1, Math.floor(params.page)),
      pageSize: Math.max(1, Math.floor(params.pageSize)),
      slotSize: params.slotSize,
    };
    const response = await api.getBrowserPagePack(normalized);
    const signature = await resolveRuntimeSignature();
    if (signature) {
      primeRuntimeCacheSignature(signature);
      const payload: PersistentBrowserPageCacheRecord = {
        data: response.data,
        items: collectDisplayItemsFromBrowserEntries(response.data),
        atlas: response.atlas ?? null,
        mediaManifest: response.mediaManifest ?? null,
        resourceManifest: response.resourceManifest,
        total: response.total,
        totalPages: response.totalPages,
        page: response.page,
      };
      await writePersistentRuntimeCache(
        buildPersistentBrowserPageKey(signature, normalized),
        payload,
      );
    }
    return response;
  },

  async getBrowserSearchPack(): Promise<BrowserSearchPackResponse> {
    const distDataSearch = await searchRuntimeClient.getSearchPack();
    if (distDataSearch?.items?.length) {
      return distDataSearch;
    }
    reportRuntimeDevCompatGap('browser-search-pack', '/items/search/pack', 'dist-data search pack missing', {
      ...getRuntimeDiagnosticIdentity(),
    });

    const manifest = await api.getPublishManifest();
    const staticPath = manifest.publishBundle?.files.browserSearchPack;
    if (staticPath) {
      try {
        return await fetchPublishedJson<BrowserSearchPackResponse>(staticPath);
      } catch {
        // Fall back to the API route when the static publish bundle is unavailable.
      }
    }
    return getLabPayload<BrowserSearchPackResponse>('/items/search/pack');
  },

  async getBrowserSearchPackShard(shardId: string): Promise<BrowserSearchPackResponse | null> {
    const normalizedShardId = `${shardId ?? ''}`.trim();
    if (!normalizedShardId) {
      return null;
    }

    const distDataSearch = await searchRuntimeClient.getSearchPack();
    if (distDataSearch?.items?.length) {
      return distDataSearch;
    }
    reportRuntimeDevCompatGap('browser-search-shard', `publish search shard ${normalizedShardId}`, 'dist-data search pack missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: { shardId: normalizedShardId },
    });

    const cached = browserSearchShardCache.get(normalizedShardId);
    if (cached) {
      return cached;
    }
    const inflight = browserSearchShardInFlight.get(normalizedShardId);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const manifest = await api.getPublishManifest();
      const shardPath = manifest.publishBundle?.files.browserSearchShards?.find(
        (entry) => entry.scope === 'all' && entry.shardId === normalizedShardId,
      )?.path;
      if (!shardPath) {
        return null;
      }

      try {
        const shard = await fetchPublishedJson<BrowserSearchPackResponse>(shardPath);
        browserSearchShardCache.set(normalizedShardId, shard);
        return shard;
      } catch {
        return null;
      }
    })().finally(() => {
      browserSearchShardInFlight.delete(normalizedShardId);
    });

    browserSearchShardInFlight.set(normalizedShardId, request);
    return request;
  },

  async getBrowserPagePackByIds(params: {
    itemIds: string[];
    slotSize?: number;
  }): Promise<BrowserByIdsPackResponse> {
    const normalizedParams = {
      itemIds: params.itemIds.map((itemId) => `${itemId ?? ''}`.trim()).filter(Boolean),
      slotSize: params.slotSize,
    };
    const cacheKey = buildBrowserByIdsPackCacheKey(normalizedParams);
    const cached = browserByIdsPackCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserByIdsPackInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const distDataPack = await browserRuntimeClient.getByIdsPack(normalizedParams.itemIds);
      if (distDataPack) {
        return distDataPack;
      }
      reportRuntimeDevCompatGap('browser-by-ids-pack', '/items/browser/by-ids-pack', 'dist-data by-id pack missing', {
        ...getRuntimeDiagnosticIdentity(),
        details: { itemIds: normalizedParams.itemIds, slotSize: normalizedParams.slotSize },
      });
      return postLabPayload<BrowserByIdsPackResponse, typeof normalizedParams>('/items/browser/by-ids-pack', normalizedParams);
    })()
      .then((data) => {
        setCacheWithLimit(browserByIdsPackCache, cacheKey, data, CACHE_LIMITS.browserByIdsPack);
        return data;
      })
      .finally(() => {
        browserByIdsPackInFlight.delete(cacheKey);
      });

    browserByIdsPackInFlight.set(cacheKey, request);
    return request;
  },

  peekBrowserPagePackByIds(params: {
    itemIds: string[];
    slotSize?: number;
  }): BrowserByIdsPackResponse | null {
    const normalizedParams = {
      itemIds: params.itemIds.map((itemId) => `${itemId ?? ''}`.trim()).filter(Boolean),
      slotSize: params.slotSize,
    };
    return browserByIdsPackCache.get(buildBrowserByIdsPackCacheKey(normalizedParams)) ?? null;
  },

  // Get item by ID
  async getItem(itemId: string): Promise<Item> {
    const cached = itemDetailCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = itemDetailInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = getLabPayload<Item>(`/items/${itemId}`)
      .then((payload) => {
        setCacheWithLimit(itemDetailCache, itemId, payload, CACHE_LIMITS.itemDetail);
        return payload;
      })
      .finally(() => {
        itemDetailInFlight.delete(itemId);
      });
    itemDetailInFlight.set(itemId, request);
    return request;
  },

  // Get all mods
  async getMods(): Promise<Mod[]> {
    const persistent = await readPersistentRuntimePayload<Mod[]>(
      'mods-list',
      { scope: 'all' },
    );
    if (persistent) {
      return persistent;
    }

    const manifest = await api.getPublishManifest();
    const staticPath = manifest.publishBundle?.files.modsList;
    if (staticPath) {
      try {
        const published = await fetchPublishedJson<Mod[]>(staticPath);
        persistRuntimePayload('mods-list', { scope: 'all' }, published);
        return published;
      } catch {
        // Fall back to the API route when the static publish bundle is unavailable.
      }
    }

    const payload = await getLabPayload<Mod[]>('/items/mods');
    persistRuntimePayload('mods-list', { scope: 'all' }, payload);
    return payload;
  },

  async getItemsByIds(itemIds: string[]): Promise<Item[]> {
    const uniqueIds = Array.from(new Set(itemIds));
    const missingIds = uniqueIds.filter((id) => !itemDetailCache.has(id));

    if (missingIds.length > 0) {
      for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
        const chunk = missingIds.slice(i, i + BATCH_SIZE);
        const payload = await postLabPayload<Item[], { itemIds: string[] }>('/items/batch', { itemIds: chunk });
        for (const item of payload) {
          itemDetailCache.set(item.itemId, item);
        }
      }
    }

    return itemIds
      .map((id) => itemDetailCache.get(id))
      .filter((item): item is Item => item !== undefined);
  },

  // === indexed Recipe API (with machine icons) ===

  // Get machines for an item (indexed recipe API with machineIcon support)
  async getItemMachines(itemId: string): Promise<{
    itemId: string;
    itemName: string;
    machines: {
      machineType: string;
      category: string;
      voltageTier: string | null;
      voltage: number | null;
      recipeCount: number;
      recipes: Recipe[];
    }[];
  }> {
    return getLabPayload<{
      itemId: string;
      itemName: string;
      machines: {
        machineType: string;
        category: string;
        voltageTier: string | null;
        voltage: number | null;
        recipeCount: number;
        recipes: Recipe[];
      }[];
    }>(`/recipes/${itemId}/machines`);
  },

  // === Pattern Management ===

  // Get all pattern groups
  async getPatternGroups(): Promise<PatternGroup[]> {
    return getLabPayload<PatternGroup[]>('/patterns/groups');
  },

  // Get single pattern group
  async getPatternGroup(groupId: string): Promise<PatternGroup> {
    return getLabPayload<PatternGroup>(`/patterns/groups/${groupId}`);
  },

  // Get pattern group with patterns
  async getPatternGroupWithPatterns(groupId: string): Promise<PatternGroupWithPatterns> {
    return getLabPayload<PatternGroupWithPatterns>(`/patterns/groups/${groupId}/detail`);
  },

  // Create pattern group
  async createPatternGroup(groupName: string, description?: string): Promise<PatternGroup> {
    return postLabPayload<PatternGroup>('/patterns/groups', {
      groupName,
      description
    });
  },

  // Update pattern group
  async updatePatternGroup(groupId: string, groupName: string, description?: string): Promise<void> {
    await putLabPayload(`/patterns/groups/${groupId}`, {
      groupName,
      description
    });
  },

  // Delete pattern group
  async deletePatternGroup(groupId: string): Promise<void> {
    await deleteLabPayload(`/patterns/groups/${groupId}`);
  },

  // Create pattern
  async createPattern(data: {
    groupId?: string;
    recipeId: string;
    patternName: string;
    outputItemId?: string;
    crafting?: number;
    substitute?: number;
    beSubstitute?: number;
    priority?: number;
  }): Promise<Pattern> {
    return postLabPayload<Pattern>('/patterns', data);
  },

  // Delete pattern
  async deletePattern(patternId: string): Promise<void> {
    await deleteLabPayload(`/patterns/${patternId}`);
  },

  // Update pattern
  async updatePattern(patternId: string, updates: {
    patternName?: string;
    priority?: number;
    enabled?: number;
    crafting?: number;
    substitute?: number;
    beSubstitute?: number;
  }): Promise<void> {
    await putLabPayload(`/patterns/${patternId}`, updates);
  },

  // Export pattern group to OC-AE JSON
  async exportPatternGroup(groupId: string): Promise<PatternExportData> {
    return getLabPayload<PatternExportData>(`/patterns/groups/${groupId}/export`);
  },

  async getEcosystemOverview(): Promise<EcosystemOverview> {
    if (ecosystemOverviewCache) {
      return ecosystemOverviewCache;
    }
    if (ecosystemOverviewInFlight) {
      return ecosystemOverviewInFlight;
    }
    const request = getLabPayload<EcosystemOverview>('/ecosystem/overview')
      .then((payload) => {
        ecosystemOverviewCache = payload;
        return payload;
      })
      .finally(() => {
        ecosystemOverviewInFlight = null;
      });
    ecosystemOverviewInFlight = request;
    return request;
  },

  async getAnimatedAtlasEntry(assetId: string): Promise<AnimatedAtlasAssetEntry> {
    return getLabPayload<AnimatedAtlasAssetEntry>('/render-contract/animated-atlas', {
      params: { assetId },
    });
  },

  async getRenderContractAsset(assetId: string): Promise<RenderContractAssetEntry> {
    return getLabPayload<RenderContractAssetEntry>('/render-contract/asset', {
      params: { assetId },
    });
  },

  async getBrowserAtlasIndex(): Promise<BrowserAtlasIndexResponse | null> {
    return textureRuntimeClient.getBrowserAtlasIndex();
  },

  async getBrowserAtlasEntries(itemIds: string[]): Promise<BrowserAtlasIndexResponse | null> {
    return textureRuntimeClient.getBrowserAtlasEntries(itemIds);
  },

  async getOptionalRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload | null> {
    const cached = uiPayloadCache.get(recipeId);
    if (cached) {
      return cached;
    }
    if (missingUiPayloadCache.has(recipeId)) {
      return null;
    }
    const existingRequest = uiPayloadInFlight.get(recipeId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = (async () => {
      const distDataPayload = await getRuntimeRecipeUiPayload(recipeId);
      if (distDataPayload) {
        missingUiPayloadCache.delete(recipeId);
        setCacheWithLimit(uiPayloadCache, recipeId, distDataPayload, CACHE_LIMITS.uiPayload);
        return distDataPayload;
      }
      const runtimeSignature = await resolveRuntimeSignature();

      const persistent = await readPersistentRuntimePayload<RecipeUiPayload>(
        'recipe-ui-payload',
        { recipeId },
      );
      if (persistent) {
        setCacheWithLimit(uiPayloadCache, recipeId, persistent, CACHE_LIMITS.uiPayload);
        return persistent;
      }
      try {
        const payload = await getLabPayload<RecipeUiPayload>('/render-contract/ui-payload', {
          params: { recipeId },
        });
        missingUiPayloadCache.delete(recipeId);
        setCacheWithLimit(uiPayloadCache, recipeId, payload, CACHE_LIMITS.uiPayload);
        persistRuntimePayload('recipe-ui-payload', { recipeId }, payload);
        return payload;
      } catch (error) {
        if (isHttpNotFoundError(error)) {
          missingUiPayloadCache.add(recipeId);
          reportMissingRuntimePayload({
            recipeId,
            runtimeCacheKey: runtimeSignature,
            message: 'Recipe UI payload is missing from dist-data, persistent cache, and lab compatibility API',
            details: {
              labRoute: '/render-contract/ui-payload',
            },
          });
          return null;
        }
        throw error;
      }
    })().finally(() => {
      uiPayloadInFlight.delete(recipeId);
    });
    uiPayloadInFlight.set(recipeId, request);
    return request;
  },

  async getRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload> {
    const payload = await api.getOptionalRecipeUiPayload(recipeId);
    if (!payload) {
      throw new Error(`Missing recipe UI payload for ${recipeId}`);
    }
    return payload;
  },

  async getRecipeBootstrap(itemId: string): Promise<RecipeBootstrapPayload> {
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

      if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
        const persistent = await readPersistentRuntimePayload<RecipeBootstrapPayload>(
          'recipe-bootstrap',
          withRecipeBootstrapCacheSchema({ itemId }),
        );
        if (persistent) {
          setCacheWithLimit(recipeBootstrapCache, itemId, persistent, CACHE_LIMITS.recipeBootstrap);
          markRecipeBootstrapResolved(itemId, 'persistent-cache', startedAt, persistent);
          return persistent;
        }

        const manifest = await api.getPublishManifest();
        const staticPath = resolvePublishedRecipeBootstrapPath(manifest, itemId, 'bootstrap');
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapPayload>(staticPath);
            setCacheWithLimit(recipeBootstrapCache, itemId, published, CACHE_LIMITS.recipeBootstrap);
            persistRuntimePayload('recipe-bootstrap', withRecipeBootstrapCacheSchema({ itemId }), published);
            markRecipeBootstrapResolved(itemId, 'legacy-static-bootstrap', startedAt, published);
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
        const itemRecipeBundlePath = resolvePublishedItemRecipeBundlePath(manifest, itemId);
        if (itemRecipeBundlePath) {
          try {
            const publishedBundle = await fetchPublishedJson<unknown>(itemRecipeBundlePath);
            const bundledBootstrap = unwrapPublishedItemRecipeBundle(publishedBundle);
            if (bundledBootstrap) {
              setCacheWithLimit(recipeBootstrapCache, itemId, bundledBootstrap, CACHE_LIMITS.recipeBootstrap);
              persistRuntimePayload('recipe-bootstrap', withRecipeBootstrapCacheSchema({ itemId }), bundledBootstrap);
              markRecipeBootstrapResolved(itemId, 'item-recipe-bundle', startedAt, bundledBootstrap);
              return bundledBootstrap;
            }
          } catch {
            // Fall back to the API route when the item-centric bundle is unavailable.
          }
        }
      }

      const payload = await getLabPayload<RecipeBootstrapPayload>(`/recipe-bootstrap/${encodeURIComponent(itemId)}`);
      setCacheWithLimit(recipeBootstrapCache, itemId, payload, CACHE_LIMITS.recipeBootstrap);
      persistRuntimePayload('recipe-bootstrap', withRecipeBootstrapCacheSchema({ itemId }), payload);
      markRecipeBootstrapResolved(itemId, 'dev-compat-api', startedAt, payload);
      return payload;
    })().finally(() => {
      recipeBootstrapInFlight.delete(itemId);
    });
    recipeBootstrapInFlight.set(itemId, request);
    return request;
  },

  async getRecipeBootstrapShard(itemId: string): Promise<RecipeBootstrapPayload> {
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

      if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
        const persistent = await readPersistentRuntimePayload<RecipeBootstrapPayload>(
          'recipe-bootstrap-shard',
          withRecipeBootstrapCacheSchema({ itemId }),
        );
        if (persistent) {
          setCacheWithLimit(recipeBootstrapShardCache, itemId, persistent, CACHE_LIMITS.recipeBootstrapShard);
          return persistent;
        }

        const manifest = await api.getPublishManifest();
        const staticPath = resolvePublishedRecipeBootstrapPath(manifest, itemId, 'shard');
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapPayload>(staticPath);
            setCacheWithLimit(recipeBootstrapShardCache, itemId, published, CACHE_LIMITS.recipeBootstrapShard);
            persistRuntimePayload('recipe-bootstrap-shard', withRecipeBootstrapCacheSchema({ itemId }), published);
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }

      const payload = await getLabPayload<RecipeBootstrapPayload>(`/recipe-bootstrap/${encodeURIComponent(itemId)}/shard`);
      setCacheWithLimit(recipeBootstrapShardCache, itemId, payload, CACHE_LIMITS.recipeBootstrapShard);
      persistRuntimePayload('recipe-bootstrap-shard', withRecipeBootstrapCacheSchema({ itemId }), payload);
      return payload;
    })().finally(() => {
      recipeBootstrapShardInFlight.delete(itemId);
    });
    recipeBootstrapShardInFlight.set(itemId, request);
    return request;
  },

  async getRecipeBootstrapProducedByGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
  ): Promise<RecipeBootstrapMachineGroupPayload> {
    const normalizedMachineKey = `${options?.machineKey ?? ''}`.trim();
    const machineKey = normalizedMachineKey || (`${machineType ?? ''}`.trim() ? `${machineType}::${voltageTier ?? ''}` : '');
    if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
      const persistent = await readPersistentRuntimePayload<RecipeBootstrapMachineGroupPayload>(
        'recipe-bootstrap-produced-by-group',
        withRecipeBootstrapCacheSchema({
          itemId,
          machineType,
          machineKey: machineKey || null,
          voltageTier: voltageTier ?? null,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? null,
          includeRecipeIds: options?.includeRecipeIds === true,
        }),
      );
      if (persistent) {
        return persistent;
      }

      const manifest = await api.getPublishManifest();
      if (canUsePublishedRecipeGroupIndex(manifest, itemId, options) && machineKey) {
        const staticPath = resolvePublishedRecipeGroupIndexPath({
          manifest,
          itemId,
          tab: 'producedBy',
          kind: 'machine',
          key: machineKey,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapMachineGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-produced-by-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                machineType,
                machineKey: machineKey || null,
                voltageTier: voltageTier ?? null,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
      if (canUsePublishedRecipeGroupWindow(manifest, itemId, options) && machineKey) {
        const staticPath = resolvePublishedRecipeGroupWindowPath({
          manifest,
          itemId,
          tab: 'producedBy',
          kind: 'machine',
          key: machineKey,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? 0,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapMachineGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-produced-by-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                machineType,
                machineKey: machineKey || null,
                voltageTier: voltageTier ?? null,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
    }

    const payload = await getLabPayload<RecipeBootstrapMachineGroupPayload>(`/recipe-bootstrap/${encodeURIComponent(itemId)}/produced-by-group`, {
      params: {
        machineType,
        ...(voltageTier ? { voltageTier } : {}),
        ...(typeof options?.offset === 'number' ? { offset: options.offset } : {}),
        ...(typeof options?.limit === 'number' ? { limit: options.limit } : {}),
        ...(options?.includeRecipeIds ? { includeRecipeIds: 1 } : {}),
      },
    });
    persistRuntimePayload(
      'recipe-bootstrap-produced-by-group',
      withRecipeBootstrapCacheSchema({
        itemId,
        machineType,
        machineKey: machineKey || null,
        voltageTier: voltageTier ?? null,
        offset: options?.offset ?? 0,
        limit: options?.limit ?? null,
        includeRecipeIds: options?.includeRecipeIds === true,
      }),
      payload,
    );
    return payload;
  },

  async getRecipeBootstrapUsedInGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
  ): Promise<RecipeBootstrapMachineGroupPayload> {
    const normalizedMachineKey = `${options?.machineKey ?? ''}`.trim();
    const machineKey = normalizedMachineKey || (`${machineType ?? ''}`.trim() ? `${machineType}::${voltageTier ?? ''}` : '');
    if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
      const persistent = await readPersistentRuntimePayload<RecipeBootstrapMachineGroupPayload>(
        'recipe-bootstrap-used-in-group',
        withRecipeBootstrapCacheSchema({
          itemId,
          machineType,
          machineKey: machineKey || null,
          voltageTier: voltageTier ?? null,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? null,
          includeRecipeIds: options?.includeRecipeIds === true,
        }),
      );
      if (persistent) {
        return persistent;
      }

      const manifest = await api.getPublishManifest();
      if (canUsePublishedRecipeGroupIndex(manifest, itemId, options) && machineKey) {
        const staticPath = resolvePublishedRecipeGroupIndexPath({
          manifest,
          itemId,
          tab: 'usedIn',
          kind: 'machine',
          key: machineKey,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapMachineGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-used-in-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                machineType,
                machineKey: machineKey || null,
                voltageTier: voltageTier ?? null,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
      if (canUsePublishedRecipeGroupWindow(manifest, itemId, options) && machineKey) {
        const staticPath = resolvePublishedRecipeGroupWindowPath({
          manifest,
          itemId,
          tab: 'usedIn',
          kind: 'machine',
          key: machineKey,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? 0,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapMachineGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-used-in-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                machineType,
                machineKey: machineKey || null,
                voltageTier: voltageTier ?? null,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
    }

    const payload = await getLabPayload<RecipeBootstrapMachineGroupPayload>(`/recipe-bootstrap/${encodeURIComponent(itemId)}/used-in-group`, {
      params: {
        machineType,
        ...(voltageTier ? { voltageTier } : {}),
        ...(typeof options?.offset === 'number' ? { offset: options.offset } : {}),
        ...(typeof options?.limit === 'number' ? { limit: options.limit } : {}),
        ...(options?.includeRecipeIds ? { includeRecipeIds: 1 } : {}),
      },
    });
    persistRuntimePayload(
      'recipe-bootstrap-used-in-group',
      withRecipeBootstrapCacheSchema({
        itemId,
        machineType,
        machineKey: machineKey || null,
        voltageTier: voltageTier ?? null,
        offset: options?.offset ?? 0,
        limit: options?.limit ?? null,
        includeRecipeIds: options?.includeRecipeIds === true,
      }),
      payload,
    );
    return payload;
  },

  async getRecipeBootstrapCategoryGroup(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    categoryKey: string,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
  ): Promise<RecipeBootstrapCategoryGroupPayload> {
    if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
      const persistent = await readPersistentRuntimePayload<RecipeBootstrapCategoryGroupPayload>(
        'recipe-bootstrap-category-group',
        withRecipeBootstrapCacheSchema({
          itemId,
          tab,
          categoryKey,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? null,
          includeRecipeIds: options?.includeRecipeIds === true,
        }),
      );
      if (persistent) {
        return persistent;
      }

      const manifest = await api.getPublishManifest();
      if (canUsePublishedRecipeGroupIndex(manifest, itemId, options)) {
        const staticPath = resolvePublishedRecipeGroupIndexPath({
          manifest,
          itemId,
          tab,
          kind: 'category',
          key: categoryKey,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapCategoryGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-category-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                tab,
                categoryKey,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
      if (canUsePublishedRecipeGroupWindow(manifest, itemId, options)) {
        const staticPath = resolvePublishedRecipeGroupWindowPath({
          manifest,
          itemId,
          tab,
          kind: 'category',
          key: categoryKey,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? 0,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapCategoryGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-category-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                tab,
                categoryKey,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
    }

    const payload = await getLabPayload<RecipeBootstrapCategoryGroupPayload>(`/recipe-bootstrap/${encodeURIComponent(itemId)}/category-group`, {
      params: {
        tab,
        categoryKey,
        ...(typeof options?.offset === 'number' ? { offset: options.offset } : {}),
        ...(typeof options?.limit === 'number' ? { limit: options.limit } : {}),
        ...(options?.includeRecipeIds ? { includeRecipeIds: 1 } : {}),
      },
    });
    persistRuntimePayload(
      'recipe-bootstrap-category-group',
      withRecipeBootstrapCacheSchema({
        itemId,
        tab,
        categoryKey,
        offset: options?.offset ?? 0,
        limit: options?.limit ?? null,
        includeRecipeIds: options?.includeRecipeIds === true,
      }),
      payload,
    );
    return payload;
  },

  async getRecipeBootstrapSearch(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    query: string,
    options?: SearchItemsFastOptions,
  ): Promise<RecipeBootstrapSearchPayload> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return {
        itemId,
        tab,
        query: normalizedQuery,
        recipeIds: [],
        itemMatches: [],
      };
    }

    if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
      const persistent = await readPersistentRuntimePayload<RecipeBootstrapSearchPayload>(
        'recipe-bootstrap-search',
        { itemId, tab, query: normalizedQuery },
      );
      if (persistent) {
        return persistent;
      }

      const publishedPack = await getPublishedRecipeBootstrapSearchPack(itemId, tab);
      if (publishedPack) {
        const itemMatches = await searchPublishedItemMatches(normalizedQuery, 80, { signal: options?.signal })
          .catch(() => []);
        const result = searchPublishedRecipeBootstrapPack(publishedPack, normalizedQuery, itemMatches);
        persistRuntimePayload('recipe-bootstrap-search', { itemId, tab, query: normalizedQuery }, result);
        return result;
      }
    }

    const payload = await getLabPayload<RecipeBootstrapSearchPayload>(`/recipe-bootstrap/${encodeURIComponent(itemId)}/search`, {
      params: {
        tab,
        q: normalizedQuery,
      },
      signal: options?.signal,
    });
    persistRuntimePayload('recipe-bootstrap-search', { itemId, tab, query: normalizedQuery }, payload);
    return payload;
  },

  async prefetchRecipeBootstrapSearchPack(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
  ): Promise<void> {
    await getPublishedRecipeBootstrapSearchPack(itemId, tab);
  },

  // === indexed Recipes API ===

  async getIndexedItemRecipeSummary(itemId: string): Promise<indexedItemRecipeSummaryResponse> {
    const cached = indexedSummaryCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = indexedSummaryInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = getLabPayload<indexedItemRecipeSummaryResponse>(`/recipes/item/${encodeURIComponent(itemId)}/summary`)
      .then((payload) => {
        setCacheWithLimit(indexedSummaryCache, itemId, payload, CACHE_LIMITS.indexedSummary);
        return payload;
      })
      .finally(() => {
        indexedSummaryInFlight.delete(itemId);
      });
    indexedSummaryInFlight.set(itemId, request);
    return request;
  },

  // Get recipe by ID
  async getIndexedRecipe(recipeId: string): Promise<indexedRecipe> {
    return getLabPayload<indexedRecipe>(`/recipes/${recipeId}`);
  },

  async getIndexedRecipesByIds(recipeIds: string[], options?: SearchItemsFastOptions): Promise<indexedRecipe[]> {
    const uniqueIds = Array.from(new Set(recipeIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return [];
    }
    return postLabPayload<indexedRecipe[], { recipeIds: string[] }>('/recipes/batch', { recipeIds: uniqueIds }, {
      signal: options?.signal,
    });
  },

  // Get crafting recipes for item
  async getIndexedCraftingRecipes(itemId: string): Promise<indexedRecipe[]> {
    const cached = indexedCraftingCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = indexedCraftingInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = getLabPayload<indexedRecipe[]>(`/recipes/${itemId}/crafting`)
      .then((payload) => {
        setCacheWithLimit(indexedCraftingCache, itemId, payload, CACHE_LIMITS.indexedCrafting);
        return payload;
      })
      .finally(() => {
        indexedCraftingInFlight.delete(itemId);
      });
    indexedCraftingInFlight.set(itemId, request);
    return request;
  },

  // Get usage recipes for item
  async getIndexedUsageRecipes(itemId: string): Promise<indexedRecipe[]> {
    const cached = indexedUsageCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = indexedUsageInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = getLabPayload<indexedRecipe[]>(`/recipes/${itemId}/usage`)
      .then((payload) => {
        setCacheWithLimit(indexedUsageCache, itemId, payload, CACHE_LIMITS.indexedUsage);
        return payload;
      })
      .finally(() => {
        indexedUsageInFlight.delete(itemId);
      });
    indexedUsageInFlight.set(itemId, request);
    return request;
  },

  async searchItemsFast(keyword: string, limit: number = 60, options?: SearchItemsFastOptions): Promise<ItemSearchBasic[]> {
    if (!keyword || !keyword.trim()) {
      return [];
    }
    return getLabPayload<ItemSearchBasic[]>('/items/search/fast', {
      params: {
        q: keyword.trim(),
        limit,
      },
      signal: options?.signal,
    });
  },

  // Get all available machines for item
  async getIndexedMachinesForItem(itemId: string): Promise<indexedItemMachinesResponse> {
    return getLabPayload<indexedItemMachinesResponse>(`/recipes/${itemId}/machines`);
  },

  // Get all machine types
  async getIndexedMachineTypes(): Promise<string[]> {
    return getLabPayload<string[]>('/recipes/machines/list');
  },

  // Get recipes by machine type
  async getIndexedRecipesByMachine(machineType: string, voltageTier?: string): Promise<{
    machineType: string;
    voltageTier: string;
    recipeCount: number;
    recipes: indexedRecipe[];
  }> {
    const params = voltageTier ? { voltageTier } : {};
    return getLabPayload<{
      machineType: string;
      voltageTier: string;
      recipeCount: number;
      recipes: indexedRecipe[];
    }>(`/recipes/machines/${encodeURIComponent(machineType)}/recipes`, { params });
  },

  // Get multiblock blueprint by controller item ID
  async getMultiblockBlueprint(controllerItemId: string): Promise<MultiblockBlueprint> {
    return getLabPayload<MultiblockBlueprint>(`/multiblocks/${encodeURIComponent(controllerItemId)}`);
  },

  async getGTDiagramsOverview(): Promise<GTDiagramsOverview> {
    return getLabPayload<GTDiagramsOverview>('/gt-diagrams/overview');
  },

  async getForestryGeneticsOverview(): Promise<ForestryGeneticsOverview> {
    return getLabPayload<ForestryGeneticsOverview>('/forestry-genetics/overview');
  }
};




