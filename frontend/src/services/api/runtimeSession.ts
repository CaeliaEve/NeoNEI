import { createPublishedJsonClient } from '../../runtime/publishClient';
import { createRuntimeManifestClient, getRuntimeCacheSignature, getRuntimeHealthSummary } from '../../runtime/manifestClient';
import type {
  BrowserAtlasIndexResponse,
  BrowserPagePackResponse,
  HomeBootstrapResponse,
  Mod,
  PublicRuntimeManifest,
} from '../../runtime/types';
import {
  getStoredRuntimeSignature,
  primeRuntimeCacheSignature,
  readPersistentRuntimeCache,
  writePersistentRuntimeCache,
} from '../persistentRuntimeCache';
import {
  clearRuntimeArtifactMemoryCache,
  fetchRuntimeArtifactJson,
  isRuntimeArtifactWarm,
  registerRuntimeArtifactContentHashes,
  setRuntimeArtifactManifestIdentity,
} from '../runtimeArtifactClient.ts';
import {
  reportMissingRuntimePayload,
  reportRuntimeContractGap,
  isStrictRuntimeContractsEnabled,
  setRuntimeDiagnosticIdentity,
} from '../../runtime/diagnostics';
import { createTextureRuntimeClient } from '../../runtime/textureClient';
import { createBrowserCatalogClient } from '../../runtime/browserCatalogClient';
import { createRecipeUiPayloadClient } from '../../runtime/recipeUiPayloadClient';
import { createRecipeBootstrapClient } from '../../runtime/recipeBootstrapClient';
import { buildRuntimePayloadCacheKey } from '../../runtime/cacheUtils';
import { getDistDataHomeBootstrap, getDistDataMods } from '../distDataRuntime';
import {
  deriveBrowserPagePackFromWindow,
} from '../../runtime/browserProjection';
import { resolvePublishedHomeBootstrapWindowPath } from '../../runtime/browserRuntimeArtifactPolicyCatalog';

let browserAtlasIndexCache: BrowserAtlasIndexResponse | null = null;
let browserAtlasIndexInFlight: Promise<BrowserAtlasIndexResponse | null> | null = null;
const browserAtlasEntriesInFlight = new Map<string, Promise<BrowserAtlasIndexResponse | null>>();
let publishManifestCache: PublicRuntimeManifest | null = null;

const STRICT_RUNTIME_V3 = isStrictRuntimeContractsEnabled();

function publishArtifactHashes(manifest: PublicRuntimeManifest): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const asset of Object.values(manifest.publishBundle?.compression?.assets ?? {})) {
    for (const path of [asset.relativePath, asset.path, asset.contentAddressedPath]) {
      if (path && asset.sha256) hashes[path] = asset.sha256;
    }
  }
  return hashes;
}

function resolvePublishedArtifactHash(assetPath: string, resolvedUrl: string): string | null {
  const assets = Object.values(publishManifestCache?.publishBundle?.compression?.assets ?? {});
  const normalizedPath = `${assetPath ?? ''}`.trim();
  const normalizedUrl = `${resolvedUrl ?? ''}`.trim();
  return assets.find((asset) => (
    asset.relativePath === normalizedPath
    || asset.path === normalizedPath
    || asset.path === normalizedUrl
    || asset.contentAddressedPath === normalizedPath
    || asset.contentAddressedPath === normalizedUrl
  ))?.sha256 ?? null;
}

export const runtimeManifestClient = createRuntimeManifestClient<PublicRuntimeManifest>({
  onManifest: (manifest) => {
    publishManifestCache = manifest;
    const runtimeCacheKey = getRuntimeCacheSignature(manifest);
    setRuntimeArtifactManifestIdentity(runtimeCacheKey);
    if (runtimeCacheKey) {
      registerRuntimeArtifactContentHashes(runtimeCacheKey, publishArtifactHashes(manifest));
    }
    primeRuntimeCacheSignature(runtimeCacheKey);
    setRuntimeDiagnosticIdentity({
      sourceSignature: manifest.sourceSignature,
      runtimeCacheKey,
    });
  },
});

export async function getRuntimeHealth(): Promise<import('../../runtime/types').RuntimeHealthSummary> {
  return getRuntimeHealthSummary();
}

export function reportRuntimePayloadGap(
  scope: string,
  authority: string,
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
  reportRuntimeContractGap(scope, authority, reason, {
    strict: STRICT_RUNTIME_V3,
    context,
  });
}

export function getRuntimeDiagnosticIdentity(): {
  sourceSignature?: string | null;
  runtimeCacheKey?: string | null;
} {
  return {
    sourceSignature: publishManifestCache?.sourceSignature ?? null,
    runtimeCacheKey: getRuntimeCacheSignature(publishManifestCache) || getStoredRuntimeSignature(),
  };
}

export function isPublishedJsonWarm(assetPath: string | null | undefined): boolean {
  return publishedJsonClient.isWarm(assetPath);
}

export async function fetchPublishedJson<T>(assetPath: string): Promise<T> {
  return publishedJsonClient.fetchJson<T>(assetPath);
}

export async function resolveRuntimeSignature(): Promise<string | null> {
  const cached = getRuntimeCacheSignature(publishManifestCache);
  if (cached) {
    primeRuntimeCacheSignature(cached);
    return cached;
  }
  try {
    const manifest = await runtimeManifestClient.getPublishManifest();
    const signature = getRuntimeCacheSignature(manifest);
    if (signature) {
      primeRuntimeCacheSignature(signature);
    }
    return signature;
  } catch {
    return getStoredRuntimeSignature();
  }
}

export async function readPersistentRuntimePayload<T>(
  kind: string,
  identity: Record<string, unknown>,
): Promise<T | null> {
  const signature = getRuntimeCacheSignature(publishManifestCache) || getStoredRuntimeSignature();
  if (!signature) {
    return null;
  }
  return readPersistentRuntimeCache<T>(buildRuntimePayloadCacheKey(kind, signature, identity));
}

export function persistRuntimePayload(
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

export const publishedJsonClient = createPublishedJsonClient({
  getManifestIdentity: () => (
    getRuntimeCacheSignature(publishManifestCache) || getStoredRuntimeSignature()
  ),
  getContentHash: resolvePublishedArtifactHash,
  isArtifactWarm: isRuntimeArtifactWarm,
  loadJson: fetchRuntimeArtifactJson,
});

export const textureRuntimeClient = createTextureRuntimeClient({
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
  getDiagnosticIdentity: getRuntimeDiagnosticIdentity,
});

export const browserCatalogClient = createBrowserCatalogClient({
  getManifest: () => runtimeManifestClient.getPublishManifest(),
  fetchPublishedJson,
  isPublishedJsonWarm,
  reportGap: (scope, route, reason, context) => reportRuntimePayloadGap(scope, route, reason, {
    ...getRuntimeDiagnosticIdentity(),
    details: context?.details,
  }),
  resolveRuntimeSignature,
  primeRuntimeSignature: primeRuntimeCacheSignature,
  writePersistentRuntimeCache,
});

export const recipeUiPayloadClient = createRecipeUiPayloadClient({
  resolveRuntimeSignature,
  reportMissing: reportMissingRuntimePayload,
});

export const recipeBootstrapClient = createRecipeBootstrapClient({
  getManifest: () => runtimeManifestClient.getPublishManifest(),
  fetchPublishedJson,
  getBrowserSearchPackShard: (shardId) => browserCatalogClient.getBrowserSearchPackShard(shardId),
  getBrowserSearchPack: () => browserCatalogClient.getBrowserSearchPack(),
});

export function clearPublishedRuntimeCaches(): void {
  clearRuntimeArtifactMemoryCache();
}

export function resetRuntimeSessionCaches(): void {
  clearPublishedRuntimeCaches();
  publishManifestCache = null;
  runtimeManifestClient.clear();
}

export function updateCachedPublishManifest(manifest: PublicRuntimeManifest | null | undefined): void {
  if (!manifest) {
    return;
  }
  publishManifestCache = manifest;
  const runtimeCacheKey = getRuntimeCacheSignature(manifest);
  setRuntimeArtifactManifestIdentity(runtimeCacheKey);
  if (runtimeCacheKey) {
    registerRuntimeArtifactContentHashes(runtimeCacheKey, publishArtifactHashes(manifest));
  }
  primeRuntimeCacheSignature(runtimeCacheKey);
}


export async function getRuntimeHomeBootstrap(params: {
  page?: number;
  pageSize?: number;
  slotSize?: number;
  modId?: string;
}): Promise<HomeBootstrapResponse> {
  const distDataBootstrap = await getDistDataHomeBootstrap(params);
  if (distDataBootstrap) {
    return distDataBootstrap;
  }

  const manifest = await runtimeManifestClient.getPublishManifest();
  const requestedPage = Math.max(1, Math.floor(params.page ?? 1));
  const requestedPageSize = Math.max(1, Math.floor(params.pageSize ?? 50));
  let publishedArtifactFailure: string | null = null;
  const staticPath = resolvePublishedHomeBootstrapWindowPath({
    manifest,
    request: params,
    isWarm: isPublishedJsonWarm,
  });
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
      publishedArtifactFailure = 'published home bootstrap window could not derive requested page';
    } catch {
      publishedArtifactFailure = 'published home bootstrap window could not be read';
    }
  } else {
    publishedArtifactFailure = params.modId
      ? 'mod-scoped home bootstrap requires runtime catalog projection'
      : 'published home bootstrap window missing';
  }

  reportRuntimePayloadGap('home-bootstrap', 'published home bootstrap window', 'runtime home bootstrap unavailable', {
    ...getRuntimeDiagnosticIdentity(),
    details: { ...params, publishedArtifactFailure },
  });
  throw new Error(`Runtime home bootstrap unavailable: ${publishedArtifactFailure ?? 'missing compiled payload'}`);
}

export async function getRuntimeMods(): Promise<Mod[]> {
  const persistent = await readPersistentRuntimePayload<Mod[]>(
    'mods-list',
    { scope: 'all' },
  );
  if (persistent) {
    return persistent;
  }

  const distDataMods = await getDistDataMods();
  if (distDataMods?.length) {
    persistRuntimePayload('mods-list', { scope: 'all' }, distDataMods);
    return distDataMods;
  }

  const manifest = await runtimeManifestClient.getPublishManifest();
  const staticPath = manifest.publishBundle?.files.modsList;
  if (staticPath) {
    try {
      const published = await fetchPublishedJson<Mod[]>(staticPath);
      persistRuntimePayload('mods-list', { scope: 'all' }, published);
      return published;
    } catch {
      reportRuntimePayloadGap('mods-list', 'published mods list', 'published mods list could not be read', {
        ...getRuntimeDiagnosticIdentity(),
        details: { staticPath },
      });
      throw new Error(`Runtime mods list unavailable: published mods list could not be read (${staticPath})`);
    }
  }

  reportRuntimePayloadGap('mods-list', 'published mods list', 'runtime mods list missing', {
    ...getRuntimeDiagnosticIdentity(),
  });
  throw new Error('Runtime mods list unavailable: publish manifest does not declare a mods list');
}
