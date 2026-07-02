import { serviceUnavailable } from '../utils/http';
import { createWeakEtag } from '../utils/http-cache';
import { resolveAccelerationCompilerAuthority } from './acceleration-runtime-compiler-authority.service';
import { attachRenderHintsToEntries, buildBrowserRichMediaManifest } from './browser-render-hints.service';
import { ItemsService, type BrowserPageEntry, type Item, type PaginatedResponse } from './items.service';
import { getPublishManifestService, type PublicRuntimeManifest } from './publish-manifest.service';
import {
  derivePagePackFromWindow,
  getPublishPayloadService,
  type BrowserPageWindowPayload,
  type PublishModSummary,
} from './publish-payload.service';

type PublishHomeBootstrapQuery = Readonly<{
  page?: unknown;
  pageSize?: unknown;
  slotSize?: unknown;
  modId?: unknown;
}>;

type NormalizedPublishHomeBootstrapQuery = Readonly<{
  page: number;
  pageSize: number;
  slotSize: number;
  modId?: string;
}>;

type DynamicHomeBootstrapPagePack = PaginatedResponse<BrowserPageEntry> & Readonly<{
  mediaManifest: ReturnType<typeof buildBrowserRichMediaManifest>;
}>;

export type PublishManifestDelivery = Readonly<{
  payload: PublicRuntimeManifest;
  etag: string;
}>;

export type PublishHomeBootstrapPayload = Readonly<{
  manifest: PublicRuntimeManifest;
  mods: PublishModSummary[];
  pagePack: BrowserPageWindowPayload | DynamicHomeBootstrapPagePack;
}>;

export type PublishHomeBootstrapDelivery = Readonly<{
  etag: string;
  loadPayload: () => Promise<PublishHomeBootstrapPayload>;
}>;

const itemsService = new ItemsService({ splitExportFallback: false });

function parseBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(`${value ?? ''}`, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeHomeBootstrapQuery(query: PublishHomeBootstrapQuery): NormalizedPublishHomeBootstrapQuery {
  const modIdRaw = typeof query.modId === 'string' ? query.modId.trim() : '';
  const modId = modIdRaw && modIdRaw !== 'all' ? modIdRaw : undefined;
  return Object.freeze({
    page: parseBoundedInteger(query.page, 1, 1, 1_000_000),
    pageSize: parseBoundedInteger(query.pageSize, 50, 1, 500),
    slotSize: parseBoundedInteger(query.slotSize, 48, 24, 128),
    modId,
  });
}

function isExternalRuntimeAuthority(): boolean {
  return resolveAccelerationCompilerAuthority() === 'external-runtime';
}

function collectDisplayItems(entries: BrowserPageEntry[]): Item[] {
  const ordered: Item[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const item = entry.kind === 'item' ? entry.item : entry.group.representative;
    if (!item?.itemId || seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    ordered.push(item);
  }

  return ordered;
}

function createPublishManifestEtag(manifest: PublicRuntimeManifest): string {
  return createWeakEtag(
    'publish-manifest',
    manifest.version,
    manifest.sourceSignature,
    manifest.compiledAt,
    manifest.publishRevision,
    manifest.publishCompiledAt,
    manifest.runtimeCacheKey,
  );
}

function createHomeBootstrapEtag(
  manifest: PublicRuntimeManifest,
  query: NormalizedPublishHomeBootstrapQuery,
): string {
  return createWeakEtag(
    'publish-home-bootstrap',
    manifest.version,
    manifest.runtimeCacheKey,
    manifest.compiledAt,
    query.page,
    query.pageSize,
    query.slotSize,
    query.modId ?? 'all',
  );
}

function readMaterializedHomeBootstrap(
  manifest: PublicRuntimeManifest,
  query: NormalizedPublishHomeBootstrapQuery,
): PublishHomeBootstrapPayload | null {
  const shouldUseMaterializedHomeBootstrap = query.page === 1
    && !query.modId
    && (manifest.publishBundle?.files.homeBootstrapWindows?.length ?? 0) > 0;
  if (!shouldUseMaterializedHomeBootstrap) {
    return null;
  }

  const materialized = getPublishPayloadService().getHomeBootstrapWindow({
    slotSize: query.slotSize,
  }, manifest.sourceSignature);
  if (!materialized) {
    return null;
  }

  const pagePack = derivePagePackFromWindow(materialized.pagePack, 1, query.pageSize);
  if (!pagePack) {
    return null;
  }

  return Object.freeze({
    manifest,
    mods: materialized.mods,
    pagePack,
  });
}

async function buildDynamicHomeBootstrap(
  manifest: PublicRuntimeManifest,
  query: NormalizedPublishHomeBootstrapQuery,
): Promise<PublishHomeBootstrapPayload> {
  const [mods, pagePack] = await Promise.all([
    itemsService.getMods(),
    itemsService.getBrowserItems({
      page: query.page,
      pageSize: query.pageSize,
      modId: query.modId,
      expandedGroups: [],
    }),
  ]);
  attachRenderHintsToEntries(pagePack.data);
  const displayItems = collectDisplayItems(pagePack.data);

  return Object.freeze({
    manifest,
    mods,
    pagePack: Object.freeze({
      ...pagePack,
      mediaManifest: buildBrowserRichMediaManifest(displayItems),
    }),
  });
}

async function loadHomeBootstrapPayload(
  manifest: PublicRuntimeManifest,
  query: NormalizedPublishHomeBootstrapQuery,
): Promise<PublishHomeBootstrapPayload> {
  const materialized = readMaterializedHomeBootstrap(manifest, query);
  if (materialized) {
    return materialized;
  }

  if (isExternalRuntimeAuthority()) {
    throw serviceUnavailable(
      'External runtime publish home bootstrap requires a materialized publish bundle; dynamic SQLite fallback is disabled.',
      'EXTERNAL_RUNTIME_PUBLISH_BUNDLE_REQUIRED',
    );
  }

  return buildDynamicHomeBootstrap(manifest, query);
}

export function getPublishManifestDelivery(): PublishManifestDelivery {
  const manifest = getPublishManifestService().getRuntimeManifest();
  return Object.freeze({
    payload: manifest,
    etag: createPublishManifestEtag(manifest),
  });
}

export function createPublishHomeBootstrapDelivery(query: PublishHomeBootstrapQuery): PublishHomeBootstrapDelivery {
  const normalizedQuery = normalizeHomeBootstrapQuery(query);
  const manifest = getPublishManifestService().getRuntimeManifest();
  return Object.freeze({
    etag: createHomeBootstrapEtag(manifest, normalizedQuery),
    loadPayload: () => loadHomeBootstrapPayload(manifest, normalizedQuery),
  });
}
