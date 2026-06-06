import axios from 'axios';
import { BACKEND_BASE_URL } from '../services/api/core/http';
import type { PublicRuntimeManifest, RuntimeHealthSummary } from './types';

const runtimeHttp = axios.create({
  baseURL: `${BACKEND_BASE_URL.replace(/\/+$/g, '')}/runtime`,
  timeout: 120000,
});

export type RuntimeManifestIdentity = {
  runtimeCacheKey?: string | null;
  sourceSignature?: string | null;
};

export function getRuntimeCacheSignature(
  manifest: RuntimeManifestIdentity | null | undefined,
): string | null {
  const runtimeCacheKey = `${manifest?.runtimeCacheKey ?? ''}`.trim();
  if (runtimeCacheKey) {
    return runtimeCacheKey;
  }

  const sourceSignature = `${manifest?.sourceSignature ?? ''}`.trim();
  return sourceSignature || null;
}

export function createRuntimeManifestClient<TManifest extends RuntimeManifestIdentity = PublicRuntimeManifest>(options?: {
  onManifest?: (manifest: TManifest) => void;
}) {
  let cache: TManifest | null = null;
  let inFlight: Promise<TManifest> | null = null;

  function clear(): void {
    cache = null;
    inFlight = null;
  }

  async function getPublishManifest(): Promise<TManifest> {
    if (cache) {
      return cache;
    }
    if (inFlight) {
      return inFlight;
    }
    inFlight = runtimeHttp.get('/manifest', {
      params: { _runtime: Date.now() },
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })
      .then((response) => {
        cache = response.data as TManifest;
        options?.onManifest?.(cache);
        return cache;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return { clear, getPublishManifest };
}

export async function getRuntimeHealthSummary(): Promise<RuntimeHealthSummary> {
  const response = await runtimeHttp.get('/health', {
    params: { _runtime: Date.now() },
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  return response.data as RuntimeHealthSummary;
}

