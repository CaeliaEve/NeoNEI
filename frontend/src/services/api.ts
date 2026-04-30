import { BACKEND_BASE_URL, http } from './api/core/http';
import {
  getStoredRuntimeSignature,
  primeRuntimeCacheSignature,
  readPersistentRuntimeCache,
  writePersistentRuntimeCache,
} from './persistentRuntimeCache';

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
const publishedJsonValueCache = new Map<string, unknown>();
const publishedJsonInFlight = new Map<string, Promise<unknown>>();
let publishManifestCache: PublicRuntimeManifest | null = null;
let publishManifestInFlight: Promise<PublicRuntimeManifest> | null = null;
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
  if (import.meta.env.DEV) {
    return true;
  }

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

  const hostname = `${window.location.hostname ?? ''}`.trim().toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

const PREFER_LIVE_RECIPE_BOOTSTRAP = shouldPreferLiveRecipeBootstrap();

function getRuntimeCacheSignature(manifest: Pick<PublicRuntimeManifest, 'runtimeCacheKey' | 'sourceSignature'> | null | undefined): string | null {
  const runtimeCacheKey = `${manifest?.runtimeCacheKey ?? ''}`.trim();
  if (runtimeCacheKey) {
    return runtimeCacheKey;
  }

  const sourceSignature = `${manifest?.sourceSignature ?? ''}`.trim();
  return sourceSignature || null;
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
    version: 1,
    signature,
    ...identity,
  });
}

function getBackendOrigin(): string {
  return BACKEND_BASE_URL.replace(/\/api\/?$/i, '');
}

function isPublishStaticFastPathDisabled(): boolean {
  if (import.meta.env.VITE_DISABLE_PUBLISH_STATIC_FASTPATH === '1') {
    return true;
  }

  if (typeof window !== 'undefined') {
    try {
      return window.localStorage.getItem('neonei:disable-static-fastpath') === '1';
    } catch {
      return false;
    }
  }

  return false;
}

function buildPublishedAssetUrl(assetPath: string): string {
  const normalizedPath = `${assetPath ?? ''}`.trim();
  if (!normalizedPath) {
    throw new Error('Missing publish asset path');
  }

  return /^https?:\/\//i.test(normalizedPath)
    ? normalizedPath
    : `${getBackendOrigin()}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

function isPublishedJsonWarm(assetPath: string | null | undefined): boolean {
  const normalizedPath = `${assetPath ?? ''}`.trim();
  if (!normalizedPath) {
    return false;
  }

  const url = buildPublishedAssetUrl(normalizedPath);
  return publishedJsonValueCache.has(url) || publishedJsonInFlight.has(url);
}

async function fetchPublishedJson<T>(assetPath: string): Promise<T> {
  if (isPublishStaticFastPathDisabled()) {
    throw new Error('Static publish fast path disabled');
  }
  const normalizedPath = `${assetPath ?? ''}`.trim();
  if (!normalizedPath) {
    throw new Error('Missing publish asset path');
  }

  const url = buildPublishedAssetUrl(normalizedPath);
  if (publishedJsonValueCache.has(url)) {
    return publishedJsonValueCache.get(url) as T;
  }
  const existingRequest = publishedJsonInFlight.get(url);
  if (existingRequest) {
    return existingRequest as Promise<T>;
  }

  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Published asset request failed (${response.status}) for ${normalizedPath}`);
      }
      const payload = await response.json();
      setCacheWithLimit(publishedJsonValueCache, url, payload, CACHE_LIMITS.publishedJson);
      return payload;
    })
    .finally(() => {
      publishedJsonInFlight.delete(url);
    });

  publishedJsonInFlight.set(url, request);
  return request as Promise<T>;
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

export interface RecipeItem {
  itemId: string;
  count: number;
  renderAssetRef?: string | null;
  renderHint?: Item['renderHint'];
  localizedName?: string | null;
  imageFileName?: string | null;
  damage?: number;
  nbt?: string;
  probability?: number;
  items?: indexedItemStack[];
  [key: string]: unknown;
}

export type RecipeInputCell = RecipeItem | RecipeItem[] | null;
export type RecipeInputRow = RecipeInputCell[];

export interface RecipeVariantGroup {
  slotKey: string;
  row: number;
  col: number;
  isOreDictionary: boolean;
  oreDictName: string | null;
  options: RecipeItem[];
}

export interface DimensionDTO {
  width: number;
  height: number;
}

export interface RecipeTypeDTO {
  id?: string;
  category?: string;
  type?: string;
  iconInfo?: string;
  shapeless?: boolean;
  machineIcon?: {
    itemId: string;
    modId: string;
    internalName: string;
    localizedName: string;
    renderAssetRef?: string | null;
    imageFileName?: string;
  };
  itemInputDimension?: DimensionDTO;
  fluidInputDimension?: DimensionDTO;
  itemOutputDimension?: DimensionDTO;
  fluidOutputDimension?: DimensionDTO;
  machineType?: string;
  [key: string]: unknown;
}

export interface GregTechMetadata {
  voltageTier?: string;
  voltage?: number;
  amperage?: number;
  duration?: number;
  totalEU?: number;
  requiresCleanroom?: boolean;
  requiresLowGravity?: boolean;
  additionalInfo?: string;
  specialItems?: RecipeItem[];
  heatCapacity?: number;
  catalyst?: string;
  fluidInputs?: Array<{ name: string; amount: number }>;
  fluidOutputs?: Array<{ name: string; amount: number }>;
  machineInfo?: {
    machineIcon?: {
      itemId?: string;
      imageFileName?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  variantGroups?: RecipeVariantGroup[];
  [key: string]: unknown;
}

export interface Fluid {
  fluidId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  temperature: number;
}

export interface FluidStack {
  fluid: Fluid;
  amount: number;
  probability: number;
}

export interface FluidGroup {
  slotIndex: number;
  fluids: FluidStack[];
}

export interface Recipe {
  recipeId: string;
  recipeType: string;
  recipeTypeData?: RecipeTypeDTO;
  inputs: RecipeInputRow[];
  outputs: RecipeItem[];
  fluidInputs?: FluidGroup[];
  fluidOutputs?: FluidStack[];
  additionalData?: GregTechMetadata;
  machineInfo?: {
    machineId: string;
    category: string;
    machineType: string;
    iconInfo: string;
    shapeless: boolean;
    parsedVoltageTier: string | null;
    parsedVoltage: number | null;
    machineIcon?: {
      itemId: string;
      modId: string;
      internalName: string;
      localizedName: string;
      renderAssetRef?: string | null;
      imageFileName: string;
    };
  };
  metadata?: GregTechMetadata;
}

export interface Item {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  renderHint?: {
    renderMode: string | null;
    animationMode: string | null;
    playbackHint: string | null;
    frameCount: number | null;
    explicitStatic: boolean;
    prefersNativeSprite: boolean;
    prefersCapturedAtlas: boolean;
    hasAnimation: boolean;
  } | null;
  preferredImageUrl?: string | null;
  unlocalizedName?: string;
  damage?: number;
  maxStackSize?: number;
  maxDamage?: number;
  imageFileName?: string | null;
  tooltip?: string | null;
  searchTerms?: string | null;
  toolClasses?: string | null;
  browserGroupKey?: string | null;
  browserGroupLabel?: string | null;
  browserGroupSize?: number | null;
  nbt?: string | null;
  [key: string]: unknown;
}

export interface BrowserVariantGroup {
  key: string;
  representative: Item;
  size: number;
  visibleCount: number;
  expandable: boolean;
  label: string;
}

export type BrowserGridEntry =
  | { key: string; kind: 'item'; item: Item }
  | { key: string; kind: 'group-collapsed' | 'group-header'; group: BrowserVariantGroup };

export interface PageAtlasSpriteEntry {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  slotSize: number;
  x: number;
  y: number;
}

export interface PageAtlasResult {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  slotSize: number;
  entries: Record<string, PageAtlasSpriteEntry>;
}

export interface PageRichMediaManifest {
  animatedAtlases: Record<string, AnimatedAtlasAssetEntry>;
}

export interface BrowserPagePackResponse extends PaginatedResponse<BrowserGridEntry> {
  atlas: PageAtlasResult | null;
  mediaManifest?: PageRichMediaManifest | null;
  windowOffset?: number;
  windowLength?: number;
}

export interface BrowserDefaultCatalogResponse extends PaginatedResponse<BrowserGridEntry> {}
export interface BrowserSearchCatalogResponse extends PaginatedResponse<BrowserGridEntry> {}

export interface BrowserGroupItemsResponse {
  groupKey: string;
  total: number;
  items: Item[];
}

export interface BrowserByIdsPackResponse {
  data: Array<{ key: string; kind: 'item'; item: Item }>;
  atlas: PageAtlasResult | null;
  mediaManifest?: PageRichMediaManifest | null;
}

type PersistentBrowserPageCacheRecord = {
  data: BrowserGridEntry[];
  items: Item[];
  atlas: PageAtlasResult | null;
  mediaManifest?: PageRichMediaManifest | null;
  total: number;
  totalPages: number;
  page: number;
};

export interface HomeBootstrapResponse {
  manifest: PublicRuntimeManifest;
  mods: Mod[];
  pagePack: BrowserPagePackResponse;
}

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
  return {
    data,
    total: window.total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalPages: Math.max(1, Math.ceil(window.total / normalizedPageSize)),
    atlas: trimAtlasEntries(window.atlas ?? null, data),
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
    version: 1,
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

  const basePath = kind === 'bootstrap'
    ? bundle?.files.recipeBootstrapBasePath
    : bundle?.files.recipeBootstrapShardBasePath;
  if (!basePath) {
    return null;
  }

  return `${basePath.replace(/\/+$/g, '')}/${encodeURIComponent(normalizedItemId)}.json`;
}

function toPublishedRecipeRelationSegment(tab: 'usedIn' | 'producedBy'): 'used-in' | 'produced-by' {
  return tab === 'usedIn' ? 'used-in' : 'produced-by';
}

function canUsePublishedRecipeGroupIndex(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
): boolean {
  const normalizedItemId = `${itemId ?? ''}`.trim();
  if (!normalizedItemId) {
    return false;
  }

  const bundle = manifest?.publishBundle;
  const indexBasePath = `${bundle?.files.recipeGroupIndexBasePath ?? ''}`.trim();
  const publishedItems = Array.isArray(bundle?.files.recipeBootstrapItems)
    ? bundle?.files.recipeBootstrapItems
    : [];
  if (!indexBasePath || !publishedItems.includes(normalizedItemId)) {
    return false;
  }

  const offset = Math.max(0, Math.floor(Number(options?.offset ?? 0) || 0));
  return offset === 0 && options?.includeRecipeIds === true;
}

function resolvePublishedRecipeGroupIndexPath(params: {
  manifest: PublicRuntimeManifest | null | undefined;
  itemId: string;
  tab: 'usedIn' | 'producedBy';
  kind: 'machine' | 'category';
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

function canUsePublishedRecipeSearchPack(
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

function resolvePublishedRecipeSearchPath(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
  tab: 'usedIn' | 'producedBy',
): string | null {
  const normalizedItemId = `${itemId ?? ''}`.trim();
  const basePath = `${manifest?.publishBundle?.files.recipeSearchBasePath ?? ''}`.trim();
  if (!normalizedItemId || !basePath) {
    return null;
  }

  return `${basePath.replace(/\/+$/g, '')}/${encodeURIComponent(normalizedItemId)}/${toPublishedRecipeRelationSegment(tab)}.json`;
}

export interface BrowserSearchPackEntry {
  itemId: string;
  localizedName: string;
  modId: string;
  normalizedLocalizedName: string;
  normalizedInternalName: string;
  normalizedItemId: string;
  normalizedSearchTerms: string;
  pinyinFull: string;
  pinyinAcronym: string;
  aliases: string;
  popularityScore: number;
  searchRank: number;
}

export interface BrowserSearchPackResponse {
  version: number;
  signature?: string;
  total: number;
  items: BrowserSearchPackEntry[];
}

export interface PublicRuntimeManifest {
  version: number;
  sourceSignature: string;
  compiledAt: string | null;
  publishRevision?: string | null;
  publishCompiledAt?: string | null;
  runtimeCacheKey?: string;
  publishBundle?: PublishStaticBundleManifest | null;
}

export interface PublishBundleWindowPathEntry {
  scope: string;
  slotSize: number;
  path: string;
  offset: number;
  length: number;
}

export interface PublishBundleSearchShardPathEntry {
  scope: string;
  shardId: string;
  path: string;
  total: number;
}

export interface PublishStaticBundleManifest {
  version: number;
  sourceSignature: string;
  revision: string;
  compiledAt: string;
  publicBasePath: string;
  firstPageSize: number;
  slotSizes: number[];
  includeBrowserSearchPack: boolean;
  files: {
    manifest: string;
    modsList: string | null;
    browserSearchPack: string | null;
    browserSearchShards: PublishBundleSearchShardPathEntry[];
    recipeBootstrapBasePath: string | null;
    recipeBootstrapShardBasePath: string | null;
    recipeBootstrapItems: string[];
    recipeGroupIndexBasePath: string | null;
    recipeSearchBasePath: string | null;
    recipeSearchItems: string[];
    browserPageWindows: PublishBundleWindowPathEntry[];
    homeBootstrapWindows: PublishBundleWindowPathEntry[];
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Mod {
  modId: string;
  modName: string;
  itemCount: number;
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

// Indexed recipe types
export interface indexedItem {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  renderHint?: Item['renderHint'];
  damage: number;
  stackSize: number;
  maxStackSize: number;
  maxDamage: number;
  nbt: string | null;
  imageFileName: string | null;
  tooltip: string | null;
}

export interface indexedItemStack {
  item: indexedItem;
  stackSize: number;
  probability: number;
}

export interface indexedItemGroup {
  slotIndex: number;
  items: indexedItemStack[];
  isOreDictionary: boolean;
  oreDictName: string | null;
}

export interface ItemSearchBasic {
  itemId: string;
  localizedName: string;
  modId: string;
}

export interface SearchItemsFastOptions {
  signal?: AbortSignal;
}

export interface indexedMachineInfo {
  machineId: string;
  category: string;
  machineType: string;
  iconInfo: string;
  shapeless: boolean;
  parsedVoltageTier: string | null;
  parsedVoltage: number | null;
  machineIcon?: {
    itemId: string;
    modId: string;
    internalName: string;
    localizedName: string;
    renderAssetRef?: string | null;
    renderHint?: Item['renderHint'];
    imageFileName: string;
  };
}

export interface indexedRecipeMetadata {
  voltageTier: string | null;
  voltage: number | null;
  amperage: number | null;
  duration: number | null;
  totalEU: number | null;
  requiresCleanroom: boolean | null;
  requiresLowGravity: boolean | null;
  additionalInfo: string | null;
  aspects?: Record<string, unknown>;
  specialRecipeType?: unknown;
  research?: unknown;
  centralItemId?: unknown;
  centerInputSlotIndex?: unknown;
  instability?: unknown;
  componentSlotOrder?: unknown[];
  [key: string]: unknown;
}

export interface indexedRecipe {
  id: string;
  recipeType: string;
  recipeTypeData?: RecipeTypeDTO;
  outputs: indexedItemStack[];
  inputs: indexedItemGroup[] | indexedItemGroup[][];
  fluidInputs?: unknown[];
  fluidOutputs?: unknown[];
  machineInfo: indexedMachineInfo | null;
  metadata: indexedRecipeMetadata | null;
  [key: string]: unknown;
}

export interface indexedMachineOption {
  machineType: string;
  category: string;
  voltageTier: string | null;
  voltage: number | null;
  recipeCount: number;
  recipes: indexedRecipe[];
}

export interface indexedMachineGroupSummary {
  machineType: string;
  category: string;
  voltageTier: string | null;
  voltage: number | null;
  recipeCount: number;
  machineKey?: string;
  machineIcon?: indexedMachineInfo['machineIcon'] | null;
}

export interface indexedRecipeCategorySummary {
  type: 'crafting' | 'machine';
  name: string;
  recipeType: string;
  recipeCount: number;
  categoryKey: string;
  machineKey?: string | null;
  voltageTier?: string | null;
  machineIcon?: indexedMachineInfo['machineIcon'] | null;
}

export interface indexedItemMachinesResponse {
  itemId: string;
  itemName: string;
  machines: indexedMachineOption[];
}

export interface indexedItemRecipeSummaryResponse {
  itemId: string;
  itemName: string;
  machineGroups: indexedMachineGroupSummary[];
  producedByMachineGroups?: indexedMachineGroupSummary[];
  usedInMachineGroups?: indexedMachineGroupSummary[];
  producedByCategoryGroups?: indexedRecipeCategorySummary[];
  usedInCategoryGroups?: indexedRecipeCategorySummary[];
  counts: {
    producedBy: number;
    usedIn: number;
    machineGroups: number;
  };
}

export interface RecipeBootstrapPayload {
  item: Item;
  recipeIndex: {
    usedInRecipes: string[];
    producedByRecipes: string[];
  };
  indexedCrafting: indexedRecipe[];
  indexedUsage: indexedRecipe[];
  indexedSummary: indexedItemRecipeSummaryResponse | null;
  mediaManifest?: PageRichMediaManifest | null;
}

export interface RecipeBootstrapMachineGroupPayload {
  itemId: string;
  machineType: string;
  voltageTier: string | null;
  recipeCount: number;
  recipes: indexedRecipe[];
  recipeIds?: string[];
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  mediaManifest?: PageRichMediaManifest | null;
}

export interface RecipeBootstrapCategoryGroupPayload {
  itemId: string;
  categoryKey: string;
  tab: 'usedIn' | 'producedBy';
  recipeCount: number;
  recipes: indexedRecipe[];
  recipeIds?: string[];
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  mediaManifest?: PageRichMediaManifest | null;
}

export interface RecipeBootstrapSearchPayload {
  itemId: string;
  tab: 'usedIn' | 'producedBy';
  query: string;
  recipeIds: string[];
  itemMatches: ItemSearchBasic[];
}

export interface PublishedRecipeBootstrapSearchEntry {
  recipeId: string;
  machineType: string;
  referencedItemIds: string[];
  searchText: string;
}

export interface PublishedRecipeBootstrapSearchPack {
  version: number;
  sourceSignature: string;
  itemId: string;
  tab: 'usedIn' | 'producedBy';
  relation: 'produced-by' | 'used-in';
  recipeCount: number;
  entries: PublishedRecipeBootstrapSearchEntry[];
}

export interface RecipeUiPayload {
  recipeId: string;
  familyKey: string;
  machineType?: string;
  recipeType?: string;
  inputItemIds?: string[];
  outputItemIds?: string[];
  slotCount?: {
    input?: number;
    output?: number;
  };
  presentation?: {
    surface?: string;
    density?: string;
  };
  [key: string]: unknown;
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

export interface AnimatedAtlasFrameEntry {
  index: number;
  sourcePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnimatedAtlasTimelineEntry {
  timelineIndex: number;
  frameIndex: number;
  index: number;
  durationMs: number;
}

export interface AnimatedAtlasAssetEntry {
  assetId: string;
  variantKey: string;
  frameDurationMs: number | null;
  loopMode: string | null;
  frameCount: number;
  timeline: AnimatedAtlasTimelineEntry[];
  frames: AnimatedAtlasFrameEntry[];
  atlasFile: string;
  atlasGroup: string;
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
    publishManifestInFlight = null;
    ecosystemOverviewCache = null;
    ecosystemOverviewInFlight = null;
  },

  async getPublishManifest(): Promise<PublicRuntimeManifest> {
    if (publishManifestCache) {
      return publishManifestCache;
    }
    if (publishManifestInFlight) {
      return publishManifestInFlight;
    }
    publishManifestInFlight = http.get('/publish/manifest')
      .then((response) => {
        publishManifestCache = response.data;
        primeRuntimeCacheSignature(getRuntimeCacheSignature(response.data));
        return response.data;
      })
      .finally(() => {
        publishManifestInFlight = null;
      });
    return publishManifestInFlight;
  },

  async getHomeBootstrap(params: {
    page?: number;
    pageSize?: number;
    slotSize?: number;
    modId?: string;
  }): Promise<HomeBootstrapResponse> {
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

    const response = await http.get('/publish/home-bootstrap', {
      params,
    });
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
    const response = await http.get('/items', { params });
    return response.data;
  },

  async getBrowserItems(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
  }): Promise<PaginatedResponse<BrowserGridEntry>> {
    const response = await http.get('/items/browser', {
      params: {
        ...params,
        expandedGroups: (params.expandedGroups ?? []).join(','),
      },
    });
    return response.data;
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
      const persistent = await readPersistentRuntimePayload<BrowserDefaultCatalogResponse>(
        'browser-default-catalog',
        { scope: cacheKey },
      );
      if (persistent?.data?.length) {
        browserDefaultCatalogCache.set(cacheKey, persistent);
        return persistent;
      }

      const response = await http.get('/items/browser/default-catalog', {
        params,
      });
      browserDefaultCatalogCache.set(cacheKey, response.data);
      persistRuntimePayload('browser-default-catalog', { scope: cacheKey }, response.data);
      return response.data;
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

    const cacheKey = getBrowserSearchCatalogCacheKey(normalizedSearch, params.modId);
    const cached = browserSearchCatalogCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserSearchCatalogInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = http.get('/items/browser/search-catalog', {
      params: {
        q: normalizedSearch,
        ...(params.modId ? { modId: params.modId } : {}),
      },
    }).then((response) => {
      browserSearchCatalogCache.set(cacheKey, response.data);
      return response.data;
    }).finally(() => {
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

      const response = await http.get(`/items/browser/group/${encodeURIComponent(normalizedGroupKey)}`, {
        params: modId ? { modId } : undefined,
      });
      browserGroupItemsCache.set(cacheKey, response.data);
      persistRuntimePayload(
        'browser-group-items',
        { groupKey: normalizedGroupKey, scope: getBrowserDefaultCatalogCacheKey(modId) },
        response.data,
      );
      return response.data;
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

    const response = await http.get('/items/browser/page-pack', {
      params: {
        ...params,
        expandedGroups: (params.expandedGroups ?? []).join(','),
      },
    });
    return response.data;
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
    const manifest = await api.getPublishManifest();
    const staticPath = manifest.publishBundle?.files.browserSearchPack;
    if (staticPath) {
      try {
        return await fetchPublishedJson<BrowserSearchPackResponse>(staticPath);
      } catch {
        // Fall back to the API route when the static publish bundle is unavailable.
      }
    }
    const response = await http.get('/items/search/pack');
    return response.data;
  },

  async getBrowserSearchPackShard(shardId: string): Promise<BrowserSearchPackResponse | null> {
    const normalizedShardId = `${shardId ?? ''}`.trim();
    if (!normalizedShardId) {
      return null;
    }

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

    const request = http.post('/items/browser/by-ids-pack', normalizedParams)
      .then((response) => {
        setCacheWithLimit(browserByIdsPackCache, cacheKey, response.data, CACHE_LIMITS.browserByIdsPack);
        return response.data;
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
    const request = http.get(`/items/${itemId}`)
      .then((response) => {
        setCacheWithLimit(itemDetailCache, itemId, response.data, CACHE_LIMITS.itemDetail);
        return response.data;
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

    const response = await http.get('/items/mods');
    persistRuntimePayload('mods-list', { scope: 'all' }, response.data);
    return response.data;
  },

  async getItemsByIds(itemIds: string[]): Promise<Item[]> {
    const uniqueIds = Array.from(new Set(itemIds));
    const missingIds = uniqueIds.filter((id) => !itemDetailCache.has(id));

    if (missingIds.length > 0) {
      for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
        const chunk = missingIds.slice(i, i + BATCH_SIZE);
        const response = await http.post('/items/batch', { itemIds: chunk });
        for (const item of response.data as Item[]) {
          itemDetailCache.set(item.itemId, item);
        }
      }
    }

    return itemIds
      .map((id) => itemDetailCache.get(id))
      .filter((item): item is Item => item !== undefined);
  },

  async postPageAtlas(itemIds: string[], slotSize: number): Promise<PageAtlasResult | null> {
    const response = await http.post('/items/page-atlas', { itemIds, slotSize });
    return response.data;
  },

  async getPrecomputedPageAtlas(params: {
    page: number;
    pageSize: number;
    slotSize: number;
    modId?: string;
  }): Promise<PageAtlasResult | null> {
    const response = await http.get('/items/page-atlas/precomputed', {
      params,
    });
    return response.data;
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
    const response = await http.get(`/recipes-indexed/${itemId}/machines`);
    return response.data;
  },

  // === Pattern Management ===

  // Get all pattern groups
  async getPatternGroups(): Promise<PatternGroup[]> {
    const response = await http.get('/patterns/groups');
    return response.data;
  },

  // Get single pattern group
  async getPatternGroup(groupId: string): Promise<PatternGroup> {
    const response = await http.get(`/patterns/groups/${groupId}`);
    return response.data;
  },

  // Get pattern group with patterns
  async getPatternGroupWithPatterns(groupId: string): Promise<PatternGroupWithPatterns> {
    const response = await http.get(`/patterns/groups/${groupId}/detail`);
    return response.data;
  },

  // Create pattern group
  async createPatternGroup(groupName: string, description?: string): Promise<PatternGroup> {
    const response = await http.post('/patterns/groups', {
      groupName,
      description
    });
    return response.data;
  },

  // Update pattern group
  async updatePatternGroup(groupId: string, groupName: string, description?: string): Promise<void> {
    await http.put(`/patterns/groups/${groupId}`, {
      groupName,
      description
    });
  },

  // Delete pattern group
  async deletePatternGroup(groupId: string): Promise<void> {
    await http.delete(`/patterns/groups/${groupId}`);
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
    const response = await http.post('/patterns', data);
    return response.data;
  },

  // Delete pattern
  async deletePattern(patternId: string): Promise<void> {
    await http.delete(`/patterns/${patternId}`);
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
    await http.put(`/patterns/${patternId}`, updates);
  },

  // Export pattern group to OC-AE JSON
  async exportPatternGroup(groupId: string): Promise<PatternExportData> {
    const response = await http.get(`/patterns/groups/${groupId}/export`);
    return response.data;
  },

  async getEcosystemOverview(): Promise<EcosystemOverview> {
    if (ecosystemOverviewCache) {
      return ecosystemOverviewCache;
    }
    if (ecosystemOverviewInFlight) {
      return ecosystemOverviewInFlight;
    }
    const request = http.get('/ecosystem/overview')
      .then((response) => {
        ecosystemOverviewCache = response.data;
        return response.data;
      })
      .finally(() => {
        ecosystemOverviewInFlight = null;
      });
    ecosystemOverviewInFlight = request;
    return request;
  },

  async getAnimatedAtlasEntry(assetId: string): Promise<AnimatedAtlasAssetEntry> {
    const response = await http.get('/render-contract/animated-atlas', {
      params: { assetId },
    });
    return response.data;
  },

  async getRenderContractAsset(assetId: string): Promise<RenderContractAssetEntry> {
    const response = await http.get('/render-contract/asset', {
      params: { assetId },
    });
    return response.data;
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
      const persistent = await readPersistentRuntimePayload<RecipeUiPayload>(
        'recipe-ui-payload',
        { recipeId },
      );
      if (persistent) {
        setCacheWithLimit(uiPayloadCache, recipeId, persistent, CACHE_LIMITS.uiPayload);
        return persistent;
      }
      try {
        const response = await http.get('/render-contract/ui-payload', {
          params: { recipeId },
        });
        missingUiPayloadCache.delete(recipeId);
        setCacheWithLimit(uiPayloadCache, recipeId, response.data, CACHE_LIMITS.uiPayload);
        persistRuntimePayload('recipe-ui-payload', { recipeId }, response.data);
        return response.data;
      } catch (error) {
        if (isHttpNotFoundError(error)) {
          missingUiPayloadCache.add(recipeId);
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
    const cached = recipeBootstrapCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = recipeBootstrapInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = (async () => {
      if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
        const persistent = await readPersistentRuntimePayload<RecipeBootstrapPayload>(
          'recipe-bootstrap',
          { itemId },
        );
        if (persistent) {
          setCacheWithLimit(recipeBootstrapCache, itemId, persistent, CACHE_LIMITS.recipeBootstrap);
          return persistent;
        }

        const manifest = await api.getPublishManifest();
        const staticPath = resolvePublishedRecipeBootstrapPath(manifest, itemId, 'bootstrap');
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapPayload>(staticPath);
            setCacheWithLimit(recipeBootstrapCache, itemId, published, CACHE_LIMITS.recipeBootstrap);
            persistRuntimePayload('recipe-bootstrap', { itemId }, published);
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }

      const response = await http.get(`/recipe-bootstrap/${encodeURIComponent(itemId)}`);
      setCacheWithLimit(recipeBootstrapCache, itemId, response.data, CACHE_LIMITS.recipeBootstrap);
      persistRuntimePayload('recipe-bootstrap', { itemId }, response.data);
      return response.data;
    })().finally(() => {
      recipeBootstrapInFlight.delete(itemId);
    });
    recipeBootstrapInFlight.set(itemId, request);
    return request;
  },

  async getRecipeBootstrapShard(itemId: string): Promise<RecipeBootstrapPayload> {
    const cached = recipeBootstrapShardCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = recipeBootstrapShardInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = (async () => {
      if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
        const persistent = await readPersistentRuntimePayload<RecipeBootstrapPayload>(
          'recipe-bootstrap-shard',
          { itemId },
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
            persistRuntimePayload('recipe-bootstrap-shard', { itemId }, published);
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }

      const response = await http.get(`/recipe-bootstrap/${encodeURIComponent(itemId)}/shard`);
      setCacheWithLimit(recipeBootstrapShardCache, itemId, response.data, CACHE_LIMITS.recipeBootstrapShard);
      persistRuntimePayload('recipe-bootstrap-shard', { itemId }, response.data);
      return response.data;
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
        {
          itemId,
          machineType,
          machineKey: machineKey || null,
          voltageTier: voltageTier ?? null,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? null,
          includeRecipeIds: options?.includeRecipeIds === true,
        },
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
              {
                itemId,
                machineType,
                machineKey: machineKey || null,
                voltageTier: voltageTier ?? null,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              },
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
    }

    const response = await http.get(`/recipe-bootstrap/${encodeURIComponent(itemId)}/produced-by-group`, {
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
      {
        itemId,
        machineType,
        machineKey: machineKey || null,
        voltageTier: voltageTier ?? null,
        offset: options?.offset ?? 0,
        limit: options?.limit ?? null,
        includeRecipeIds: options?.includeRecipeIds === true,
      },
      response.data,
    );
    return response.data;
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
        {
          itemId,
          machineType,
          machineKey: machineKey || null,
          voltageTier: voltageTier ?? null,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? null,
          includeRecipeIds: options?.includeRecipeIds === true,
        },
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
              {
                itemId,
                machineType,
                machineKey: machineKey || null,
                voltageTier: voltageTier ?? null,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              },
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
    }

    const response = await http.get(`/recipe-bootstrap/${encodeURIComponent(itemId)}/used-in-group`, {
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
      {
        itemId,
        machineType,
        machineKey: machineKey || null,
        voltageTier: voltageTier ?? null,
        offset: options?.offset ?? 0,
        limit: options?.limit ?? null,
        includeRecipeIds: options?.includeRecipeIds === true,
      },
      response.data,
    );
    return response.data;
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
        {
          itemId,
          tab,
          categoryKey,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? null,
          includeRecipeIds: options?.includeRecipeIds === true,
        },
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
              {
                itemId,
                tab,
                categoryKey,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              },
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
    }

    const response = await http.get(`/recipe-bootstrap/${encodeURIComponent(itemId)}/category-group`, {
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
      {
        itemId,
        tab,
        categoryKey,
        offset: options?.offset ?? 0,
        limit: options?.limit ?? null,
        includeRecipeIds: options?.includeRecipeIds === true,
      },
      response.data,
    );
    return response.data;
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

    const response = await http.get(`/recipe-bootstrap/${encodeURIComponent(itemId)}/search`, {
      params: {
        tab,
        q: normalizedQuery,
      },
      signal: options?.signal,
    });
    persistRuntimePayload('recipe-bootstrap-search', { itemId, tab, query: normalizedQuery }, response.data);
    return response.data;
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
    const request = http.get(`/recipes-indexed/item/${encodeURIComponent(itemId)}/summary`)
      .then((response) => {
        setCacheWithLimit(indexedSummaryCache, itemId, response.data, CACHE_LIMITS.indexedSummary);
        return response.data;
      })
      .finally(() => {
        indexedSummaryInFlight.delete(itemId);
      });
    indexedSummaryInFlight.set(itemId, request);
    return request;
  },

  // Get recipe by ID
  async getIndexedRecipe(recipeId: string): Promise<indexedRecipe> {
    const response = await http.get(`/recipes-indexed/${recipeId}`);
    return response.data;
  },

  async getIndexedRecipesByIds(recipeIds: string[], options?: SearchItemsFastOptions): Promise<indexedRecipe[]> {
    const uniqueIds = Array.from(new Set(recipeIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return [];
    }
    const response = await http.post('/recipes-indexed/batch', { recipeIds: uniqueIds }, {
      signal: options?.signal,
    });
    return response.data;
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
    const request = http.get(`/recipes-indexed/${itemId}/crafting`)
      .then((response) => {
        setCacheWithLimit(indexedCraftingCache, itemId, response.data, CACHE_LIMITS.indexedCrafting);
        return response.data;
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
    const request = http.get(`/recipes-indexed/${itemId}/usage`)
      .then((response) => {
        setCacheWithLimit(indexedUsageCache, itemId, response.data, CACHE_LIMITS.indexedUsage);
        return response.data;
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
    const response = await http.get('/items/search/fast', {
      params: {
        q: keyword.trim(),
        limit,
      },
      signal: options?.signal,
    });
    return response.data;
  },

  // Get all available machines for item
  async getIndexedMachinesForItem(itemId: string): Promise<indexedItemMachinesResponse> {
    const response = await http.get(`/recipes-indexed/${itemId}/machines`);
    return response.data;
  },

  // Get all machine types
  async getIndexedMachineTypes(): Promise<string[]> {
    const response = await http.get('/recipes-indexed/machines/list');
    return response.data;
  },

  // Get recipes by machine type
  async getIndexedRecipesByMachine(machineType: string, voltageTier?: string): Promise<{
    machineType: string;
    voltageTier: string;
    recipeCount: number;
    recipes: indexedRecipe[];
  }> {
    const params = voltageTier ? { voltageTier } : {};
    const response = await http.get(`/recipes-indexed/machines/${encodeURIComponent(machineType)}/recipes`, { params });
    return response.data;
  },

  // Get multiblock blueprint by controller item ID
  async getMultiblockBlueprint(controllerItemId: string): Promise<MultiblockBlueprint> {
    const response = await http.get(`/multiblocks/${encodeURIComponent(controllerItemId)}`);
    return response.data;
  },

  async getGTDiagramsOverview(): Promise<GTDiagramsOverview> {
    const response = await http.get('/gt-diagrams/overview');
    return response.data;
  },

  async getForestryGeneticsOverview(): Promise<ForestryGeneticsOverview> {
    const response = await http.get('/forestry-genetics/overview');
    return response.data;
  }
};
