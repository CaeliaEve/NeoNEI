import { serviceUnavailable } from '../utils/http';
import { resolveAccelerationCompilerAuthority } from './acceleration-runtime-compiler-authority.service';
import { attachRenderHintsToEntries, buildBrowserRichMediaManifest } from './browser-render-hints.service';
import { ItemsService, type BrowserPageEntry, type Item, type PaginatedResponse } from './items.service';
import { getPublishManifestService, type PublicRuntimeManifest } from './publish-manifest.service';
import {
  createHomeBootstrapEtag,
  createPublishManifestEtag,
  getMaterializedHomeBootstrapPage,
  getPublishRuntimeExternalBundleRequiredError,
  isPublishExternalRuntimeAuthority,
  normalizeHomeBootstrapQuery,
  shouldUseMaterializedHomeBootstrap,
  type NormalizedPublishHomeBootstrapQuery,
  type PublishHomeBootstrapQuery,
} from './publish-runtime-delivery-abi';
import {
  derivePagePackFromWindow,
  getPublishPayloadService,
  type BrowserPageWindowPayload,
  type PublishModSummary,
} from './publish-payload.service';

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

const itemsService = new ItemsService();

function isExternalRuntimeAuthority(): boolean {
  return isPublishExternalRuntimeAuthority(resolveAccelerationCompilerAuthority());
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

function readMaterializedHomeBootstrap(
  manifest: PublicRuntimeManifest,
  query: NormalizedPublishHomeBootstrapQuery,
): PublishHomeBootstrapPayload | null {
  if (!shouldUseMaterializedHomeBootstrap(manifest, query)) {
    return null;
  }

  const materialized = getPublishPayloadService().getHomeBootstrapWindow({
    slotSize: query.slotSize,
  }, manifest.sourceSignature);
  if (!materialized) {
    return null;
  }

  const pagePack = derivePagePackFromWindow(
    materialized.pagePack,
    getMaterializedHomeBootstrapPage(),
    query.pageSize,
  );
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
    const error = getPublishRuntimeExternalBundleRequiredError();
    throw serviceUnavailable(
      error.message,
      error.code,
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
