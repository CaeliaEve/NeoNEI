import { BACKEND_BASE_URL } from '../services/api/core/http.ts';

export function getBackendOrigin(): string {
  return BACKEND_BASE_URL.replace(/\/api\/?$/i, '');
}

export function isPublishStaticFastPathDisabled(): boolean {
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

export function buildPublishedAssetUrl(assetPath: string): string {
  const normalizedPath = `${assetPath ?? ''}`.trim();
  if (!normalizedPath) {
    throw new Error('Missing publish asset path');
  }

  return /^https?:\/\//i.test(normalizedPath)
    ? normalizedPath
    : `${getBackendOrigin()}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

function canonicalPublishedArtifactPath(url: string): string {
  try {
    const resolved = new URL(url, globalThis.location?.href ?? 'http://localhost/');
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return url;
  }
}

export function createPublishedJsonClient(options: {
  isDisabled?: () => boolean;
  getManifestIdentity?: () => string | null;
  getContentHash?: (assetPath: string, resolvedUrl: string) => string | null;
  isArtifactWarm: (request: {
    artifactPath: string;
    resolvedUrl: string;
    manifestIdentity: string;
    contentHash?: string | null;
  }) => boolean;
  loadJson: <T>(request: {
    artifactPath: string;
    resolvedUrl: string;
    manifestIdentity: string;
    contentHash?: string | null;
  }) => Promise<T>;
}) {
  if (typeof options?.loadJson !== 'function' || typeof options?.isArtifactWarm !== 'function') {
    throw new Error('Published JSON client requires the canonical runtime artifact client');
  }

  function isWarm(assetPath: string | null | undefined): boolean {
    const normalizedPath = `${assetPath ?? ''}`.trim();
    if (!normalizedPath) {
      return false;
    }

    const url = buildPublishedAssetUrl(normalizedPath);
    const artifactPath = canonicalPublishedArtifactPath(url);
    const manifestIdentity = options.getManifestIdentity?.() ?? `publish:${url}`;
    return options.isArtifactWarm({
      artifactPath,
      resolvedUrl: url,
      manifestIdentity,
      contentHash: options.getContentHash?.(normalizedPath, url),
    });
  }

  async function fetchJson<T>(assetPath: string): Promise<T> {
    if ((options.isDisabled ?? isPublishStaticFastPathDisabled)()) {
      throw new Error('Static publish fast path disabled');
    }
    const normalizedPath = `${assetPath ?? ''}`.trim();
    if (!normalizedPath) {
      throw new Error('Missing publish asset path');
    }

    const url = buildPublishedAssetUrl(normalizedPath);
    const artifactPath = canonicalPublishedArtifactPath(url);
    const manifestIdentity = options.getManifestIdentity?.() ?? `publish:${url}`;
    return options.loadJson<T>({
      artifactPath,
      resolvedUrl: url,
      manifestIdentity,
      contentHash: options.getContentHash?.(normalizedPath, url),
    });
  }

  return { isWarm, fetchJson };
}

