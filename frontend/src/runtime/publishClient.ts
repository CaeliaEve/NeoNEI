import { BACKEND_BASE_URL } from '../services/api/core/http';
import type { HomeBootstrapResponse } from './types';
import { getLabPayload } from './devCompatClient';

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

export function createPublishedJsonClient(options: {
  isDisabled?: () => boolean;
  hasMemory: (url: string) => boolean;
  getMemory: <T>(url: string) => T | undefined;
  setMemory: (url: string, payload: unknown) => void;
  getInFlight: <T>(url: string) => Promise<T> | undefined;
  setInFlight: (url: string, request: Promise<unknown>) => void;
  deleteInFlight: (url: string) => void;
  readPersistent?: <T>(url: string) => Promise<T | null>;
  writePersistent?: (url: string, payload: unknown) => void;
}) {
  function isWarm(assetPath: string | null | undefined): boolean {
    const normalizedPath = `${assetPath ?? ''}`.trim();
    if (!normalizedPath) {
      return false;
    }

    const url = buildPublishedAssetUrl(normalizedPath);
    return options.hasMemory(url) || Boolean(options.getInFlight(url));
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
    if (options.hasMemory(url)) {
      return options.getMemory<T>(url) as T;
    }
    const persistent = await options.readPersistent?.<T>(url);
    if (persistent) {
      options.setMemory(url, persistent);
      return persistent;
    }
    const existingRequest = options.getInFlight<T>(url);
    if (existingRequest) {
      return existingRequest;
    }

    const request = fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Published asset request failed (${response.status}) for ${normalizedPath}`);
        }
        const payload = await response.json();
        options.setMemory(url, payload);
        options.writePersistent?.(url, payload);
        return payload;
      })
      .finally(() => {
        options.deleteInFlight(url);
      });

    options.setInFlight(url, request);
    return request as Promise<T>;
  }

  return { isWarm, fetchJson };
}

export function getHomeBootstrapCompat(params: {
  page?: number;
  pageSize?: number;
  slotSize?: number;
}): Promise<HomeBootstrapResponse> {
  return getLabPayload<HomeBootstrapResponse>('/publish/home-bootstrap', {
    params,
  });
}

