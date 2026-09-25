import { resolvePublishedWindowPath } from './browserProjection';
import type { PublicRuntimeManifest } from './types';

export type BrowserPublishedArtifactKey =
  | 'browser-page-window'
  | 'home-bootstrap-window'
  | 'browser-search-pack'
  | 'browser-search-shard';

type BrowserPublishedArtifactDescriptor = Readonly<{
  key: BrowserPublishedArtifactKey;
  route: string;
  pathShape: 'window-entry' | 'manifest-file' | 'search-shard-entry';
  scope: 'default-browser' | 'global-search';
}>;

type BrowserPublishedWindowRequest = {
  page?: number;
  pageSize?: number;
  slotSize?: number;
  search?: string;
  modId?: string;
  expandedGroups?: string[];
};

const BROWSER_PUBLISHED_ARTIFACT_DESCRIPTORS: readonly BrowserPublishedArtifactDescriptor[] = validateArtifactDescriptors([
  {
    key: 'browser-page-window',
    route: 'publishBundle.files.browserPageWindows',
    pathShape: 'window-entry',
    scope: 'default-browser',
  },
  {
    key: 'home-bootstrap-window',
    route: 'publishBundle.files.homeBootstrapWindows',
    pathShape: 'window-entry',
    scope: 'default-browser',
  },
  {
    key: 'browser-search-pack',
    route: 'publishBundle.files.browserSearchPack',
    pathShape: 'manifest-file',
    scope: 'global-search',
  },
  {
    key: 'browser-search-shard',
    route: 'publishBundle.files.browserSearchShards',
    pathShape: 'search-shard-entry',
    scope: 'global-search',
  },
]);

const BROWSER_ARTIFACT_DESCRIPTOR_BY_KEY = new Map(
  BROWSER_PUBLISHED_ARTIFACT_DESCRIPTORS.map((descriptor) => [descriptor.key, descriptor]),
);

function validateArtifactDescriptors(
  descriptors: readonly BrowserPublishedArtifactDescriptor[],
): readonly BrowserPublishedArtifactDescriptor[] {
  const seen = new Set<string>();
  for (const descriptor of descriptors) {
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate browser published artifact descriptor: ${descriptor.key}`);
    }
    if (!descriptor.route || !descriptor.pathShape || !descriptor.scope) {
      throw new Error(`Browser published artifact descriptor is incomplete: ${descriptor.key}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function browserArtifactDescriptor(key: BrowserPublishedArtifactKey): BrowserPublishedArtifactDescriptor {
  const descriptor = BROWSER_ARTIFACT_DESCRIPTOR_BY_KEY.get(key);
  if (!descriptor) {
    throw new Error(`Unknown browser published artifact descriptor: ${key}`);
  }
  return descriptor;
}

export function canUsePublishedBrowserPageWindow(params: BrowserPublishedWindowRequest): boolean {
  const expandedGroups = params.expandedGroups ?? [];
  return !params.search?.trim() && !params.modId && expandedGroups.length === 0;
}

export function resolvePublishedBrowserPageWindowPath(params: {
  manifest: PublicRuntimeManifest | null | undefined;
  request: BrowserPublishedWindowRequest;
  isWarm: (assetPath: string | null | undefined) => boolean;
}): string | null {
  const descriptor = browserArtifactDescriptor('browser-page-window');
  if (descriptor.pathShape !== 'window-entry' || !canUsePublishedBrowserPageWindow(params.request)) {
    return null;
  }
  return resolvePublishedWindowPath(
    params.manifest?.publishBundle?.files.browserPageWindows,
    params.request.slotSize,
    Math.max(1, Math.floor(params.request.page ?? 1)),
    Math.max(1, Math.floor(params.request.pageSize ?? 50)),
    params.isWarm,
  );
}

export function resolvePublishedHomeBootstrapWindowPath(params: {
  manifest: PublicRuntimeManifest | null | undefined;
  request: BrowserPublishedWindowRequest;
  isWarm: (assetPath: string | null | undefined) => boolean;
}): string | null {
  const descriptor = browserArtifactDescriptor('home-bootstrap-window');
  if (descriptor.pathShape !== 'window-entry' || params.request.modId) {
    return null;
  }
  return resolvePublishedWindowPath(
    params.manifest?.publishBundle?.files.homeBootstrapWindows,
    params.request.slotSize,
    Math.max(1, Math.floor(params.request.page ?? 1)),
    Math.max(1, Math.floor(params.request.pageSize ?? 50)),
    params.isWarm,
  );
}

export function resolvePublishedBrowserSearchPackPath(
  manifest: PublicRuntimeManifest | null | undefined,
): string | null {
  const descriptor = browserArtifactDescriptor('browser-search-pack');
  if (descriptor.pathShape !== 'manifest-file') {
    return null;
  }
  return `${manifest?.publishBundle?.files.browserSearchPack ?? ''}`.trim() || null;
}

export function resolvePublishedBrowserSearchShardPath(
  manifest: PublicRuntimeManifest | null | undefined,
  shardId: string,
): string | null {
  const descriptor = browserArtifactDescriptor('browser-search-shard');
  const normalizedShardId = `${shardId ?? ''}`.trim();
  if (descriptor.pathShape !== 'search-shard-entry' || !normalizedShardId) {
    return null;
  }
  return manifest?.publishBundle?.files.browserSearchShards?.find(
    (entry) => entry.scope === 'all' && entry.shardId === normalizedShardId,
  )?.path ?? null;
}

export const BROWSER_RUNTIME_ARTIFACT_POLICY_CATALOG = Object.freeze({
  abi: 'neonei.browser-runtime-artifact-policy.v1',
  authority: 'compiled-browser-artifacts-fail-closed',
  descriptors: BROWSER_PUBLISHED_ARTIFACT_DESCRIPTORS,
});
