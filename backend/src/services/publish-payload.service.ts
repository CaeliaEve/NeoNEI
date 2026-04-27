import type Database from 'better-sqlite3';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import type { BrowserSearchPackEntry } from './items-search.service';
import type { BrowserPageEntry } from './items.service';
import type { PageAtlasResponse } from './page-atlas.service';
import type { BrowserPageRichMediaManifest } from './browser-render-hints.service';

export interface PublishModSummary {
  modId: string;
  modName: string;
  itemCount: number;
}

export interface BrowserPageWindowPayload {
  data: BrowserPageEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  atlas: PageAtlasResponse | null;
  mediaManifest?: BrowserPageRichMediaManifest | null;
  windowOffset?: number;
  windowLength?: number;
}

export interface HomeBootstrapWindowPayload {
  mods: PublishModSummary[];
  pagePack: BrowserPageWindowPayload;
}

export interface BrowserSearchPackPayload {
  version: number;
  signature?: string;
  total: number;
  items: BrowserSearchPackEntry[];
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

export type PublishBundleSidecarEncoding = 'br' | 'gzip';

export interface PublishBundleCompressedVariant {
  path: string;
  contentEncoding: PublishBundleSidecarEncoding;
  extension: '.br' | '.gz';
  sizeBytes: number;
}

export interface PublishBundleAssetMetadata {
  path: string;
  relativePath: string;
  contentType: string;
  sizeBytes: number;
  compressedVariants: PublishBundleCompressedVariant[];
}

export interface PublishStaticBundleManifest {
  version: 1;
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
  compression: {
    sidecars: PublishBundleSidecarEncoding[];
    assets: Record<string, PublishBundleAssetMetadata>;
  };
}

type PublishPayloadRow = {
  payload_key: string;
  payload_json: string;
  signature: string | null;
};

type PublishPayloadType =
  | 'mods-list'
  | 'browser-search-pack'
  | 'browser-page-window'
  | 'home-bootstrap-window';

function normalizeScope(value?: string): string {
  const normalized = `${value ?? ''}`.trim();
  if (!normalized || normalized.toLowerCase() === 'all') {
    return 'all';
  }
  return normalized;
}

function isAbsolutePublicUrl(value: string): boolean {
  return /^https?:\/\//i.test(`${value ?? ''}`.trim());
}

function joinPublicPath(...parts: string[]): string {
  const normalizedParts = parts
    .filter(Boolean)
    .map((part) => `${part}`.trim())
    .filter(Boolean);
  if (normalizedParts.length <= 0) {
    return '/';
  }

  const [first, ...rest] = normalizedParts;
  const normalizedRest = rest
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);

  if (isAbsolutePublicUrl(first)) {
    const base = first.replace(/\/+$/g, '');
    return normalizedRest.length > 0 ? `${base}/${normalizedRest.join('/')}` : base;
  }

  return `/${[first, ...normalizedRest]
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')}`;
}

export function normalizePublishPublicPath(value: string): string {
  const normalized = `${value ?? ''}`.trim().replace(/\/+$/, '');
  if (!normalized) {
    return '/publish';
  }
  if (isAbsolutePublicUrl(normalized)) {
    return normalized;
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export function buildPublishBundleBasePublicPath(publicPath: string, sourceSignature: string): string {
  return joinPublicPath(normalizePublishPublicPath(publicPath), encodeURIComponent(sourceSignature));
}

export function buildPublishModsListRelativePath(modId?: string): string {
  return `mods/${normalizeScope(modId)}.json`;
}

export function buildPublishBrowserSearchPackRelativePath(modId?: string): string {
  return `search/${normalizeScope(modId)}.json`;
}

export function buildPublishBrowserSearchShardRelativePath(params: {
  modId?: string;
  shardId: string;
}): string {
  return `search/shards/${normalizeScope(params.modId)}/${encodeURIComponent(`${params.shardId ?? ''}`.trim() || 'default')}.json`;
}

export function buildPublishBrowserPageWindowRelativePath(params: {
  modId?: string;
  slotSize: number;
}): string {
  return `browser/page-window/${normalizeScope(params.modId)}/slot-${Math.max(1, Math.floor(params.slotSize))}.json`;
}

export function buildPublishHomeBootstrapWindowRelativePath(params: {
  modId?: string;
  slotSize: number;
}): string {
  return `browser/home-bootstrap/${normalizeScope(params.modId)}/slot-${Math.max(1, Math.floor(params.slotSize))}.json`;
}

export function buildPublishRecipeBootstrapBaseRelativePath(): string {
  return 'recipes/bootstrap';
}

export function buildPublishRecipeBootstrapShardBaseRelativePath(): string {
  return 'recipes/shard';
}

export function buildPublishRecipeBootstrapRelativePath(itemId: string): string {
  return `${buildPublishRecipeBootstrapBaseRelativePath()}/${encodeURIComponent(`${itemId ?? ''}`.trim())}.json`;
}

export function buildPublishRecipeBootstrapShardRelativePath(itemId: string): string {
  return `${buildPublishRecipeBootstrapShardBaseRelativePath()}/${encodeURIComponent(`${itemId ?? ''}`.trim())}.json`;
}

export function buildPublishRecipeGroupIndexBaseRelativePath(): string {
  return 'recipes/groups/index';
}

export function buildPublishRecipeSearchBaseRelativePath(): string {
  return 'recipes/search';
}

export function buildPublishRecipeSearchRelativePath(params: {
  itemId: string;
  relation: 'produced-by' | 'used-in';
}): string {
  return `${buildPublishRecipeSearchBaseRelativePath()}/${encodeURIComponent(`${params.itemId ?? ''}`.trim())}/${params.relation}.json`;
}

export function buildPublishRecipeMachineGroupIndexRelativePath(params: {
  itemId: string;
  relation: 'produced-by' | 'used-in';
  machineKey: string;
}): string {
  return `${buildPublishRecipeGroupIndexBaseRelativePath()}/machine/${encodeURIComponent(`${params.itemId ?? ''}`.trim())}/${params.relation}/${encodeURIComponent(`${params.machineKey ?? ''}`.trim())}.json`;
}

export function buildPublishRecipeCategoryGroupIndexRelativePath(params: {
  itemId: string;
  relation: 'produced-by' | 'used-in';
  categoryKey: string;
}): string {
  return `${buildPublishRecipeGroupIndexBaseRelativePath()}/category/${encodeURIComponent(`${params.itemId ?? ''}`.trim())}/${params.relation}/${encodeURIComponent(`${params.categoryKey ?? ''}`.trim())}.json`;
}

export function buildPublishBundleManifestRelativePath(): string {
  return 'manifest.json';
}

export function buildPublishBundlePublicAssetPath(basePublicPath: string, relativePath: string): string {
  return joinPublicPath(basePublicPath, relativePath);
}

function buildPayloadKey(type: PublishPayloadType, scope: Record<string, string | number>): string {
  const pairs = Object.entries(scope)
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort((left, right) => left.localeCompare(right));
  return `${type}::${pairs.join('::')}`;
}

export function buildModsListPayloadKey(modId?: string): string {
  return buildPayloadKey('mods-list', {
    mod: normalizeScope(modId),
  });
}

export function buildBrowserSearchPackPayloadKey(modId?: string): string {
  return buildPayloadKey('browser-search-pack', {
    mod: normalizeScope(modId),
  });
}

export function buildBrowserPageWindowPayloadKey(params: {
  modId?: string;
  slotSize: number;
}): string {
  return buildPayloadKey('browser-page-window', {
    mod: normalizeScope(params.modId),
    slotSize: Math.max(1, Math.floor(params.slotSize)),
  });
}

export function buildHomeBootstrapWindowPayloadKey(params: {
  modId?: string;
  slotSize: number;
}): string {
  return buildPayloadKey('home-bootstrap-window', {
    mod: normalizeScope(params.modId),
    slotSize: Math.max(1, Math.floor(params.slotSize)),
  });
}

function collectDisplayItemIds(entries: BrowserPageEntry[]): string[] {
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
  atlas: PageAtlasResponse | null,
  entries: BrowserPageEntry[],
): PageAtlasResponse | null {
  if (!atlas) {
    return null;
  }

  const itemIds = new Set(collectDisplayItemIds(entries));
  const trimmedEntries = Object.fromEntries(
    Object.entries(atlas.entries).filter(([itemId]) => itemIds.has(itemId)),
  );

  return {
    ...atlas,
    entries: trimmedEntries,
  };
}

function trimRichMediaManifest(
  mediaManifest: BrowserPageRichMediaManifest | null | undefined,
  entries: BrowserPageEntry[],
): BrowserPageRichMediaManifest | null {
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

  if (Object.keys(animatedAtlases).length === 0) {
    return null;
  }

  return {
    animatedAtlases,
  };
}

export function derivePagePackFromWindow(
  window: BrowserPageWindowPayload,
  requestedPage: number,
  requestedPageSize: number,
): BrowserPageWindowPayload | null {
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
    atlas: trimAtlasEntries(window.atlas, data),
    mediaManifest: trimRichMediaManifest(window.mediaManifest, data),
    windowOffset,
    windowLength: data.length,
  };
}

export interface PublishPayloadServiceOptions {
  databaseManager?: DatabaseManager;
}

export class PublishPayloadService {
  private readonly databaseManager: DatabaseManager;
  private readonly cache = new Map<string, unknown>();

  constructor(options: PublishPayloadServiceOptions = {}) {
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
  }

  private getAccelerationDatabase(): Database.Database | null {
    try {
      return this.databaseManager.getDatabase();
    } catch {
      return null;
    }
  }

  private canUsePublishPayloads(db: Database.Database | null): db is Database.Database {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'publish_payloads'")
        .get() as { name?: string } | undefined;
      return row?.name === 'publish_payloads';
    } catch {
      return false;
    }
  }

  private readPayload<T>(payloadKey: string, signature?: string): T | null {
    const cacheKey = `${signature ?? '*'}::${payloadKey}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached as T | null;
    }

    const db = this.getAccelerationDatabase();
    if (!this.canUsePublishPayloads(db)) {
      this.cache.set(cacheKey, null);
      return null;
    }

    const row = db.prepare(`
      SELECT payload_key, payload_json, signature
      FROM publish_payloads
      WHERE payload_key = ?
    `).get(payloadKey) as PublishPayloadRow | undefined;

    if (!row || (signature && row.signature && row.signature !== signature)) {
      this.cache.set(cacheKey, null);
      return null;
    }

    try {
      const parsed = JSON.parse(row.payload_json) as T;
      this.cache.set(cacheKey, parsed);
      return parsed;
    } catch {
      this.cache.set(cacheKey, null);
      return null;
    }
  }

  getModsList(signature?: string, modId?: string): PublishModSummary[] | null {
    return this.readPayload<PublishModSummary[]>(
      buildModsListPayloadKey(modId),
      signature,
    );
  }

  getBrowserSearchPack(signature?: string, modId?: string): BrowserSearchPackPayload | null {
    return this.readPayload<BrowserSearchPackPayload>(
      buildBrowserSearchPackPayloadKey(modId),
      signature,
    );
  }

  getBrowserPageWindow(
    params: { slotSize: number; modId?: string },
    signature?: string,
  ): BrowserPageWindowPayload | null {
    return this.readPayload<BrowserPageWindowPayload>(
      buildBrowserPageWindowPayloadKey(params),
      signature,
    );
  }

  getHomeBootstrapWindow(
    params: { slotSize: number; modId?: string },
    signature?: string,
  ): HomeBootstrapWindowPayload | null {
    return this.readPayload<HomeBootstrapWindowPayload>(
      buildHomeBootstrapWindowPayloadKey(params),
      signature,
    );
  }
}

let publishPayloadService: PublishPayloadService | null = null;

export function getPublishPayloadService(): PublishPayloadService {
  if (!publishPayloadService) {
    publishPayloadService = new PublishPayloadService();
  }
  return publishPayloadService;
}
