import { markPerfEvent } from '../../services/perfMarks';
import type { CachedBrowserPage } from './browserPageCache';
import { collectBrowserPageResourceItemIds } from './browserProjectionUtils';

export type BrowserPagePresentationWarmManager = {
  invalidate: () => void;
  ensureWarm: (cacheKey: string, response: CachedBrowserPage) => Promise<void>;
  waitForPresentation: (
    cacheKey: string,
    response: CachedBrowserPage,
    waitMs: number,
  ) => Promise<void>;
};

export function createBrowserPagePresentationWarmManager(
  pagePresentationReady: Set<string>,
  pagePresentationWarmInFlight: Map<string, Promise<void>>,
): BrowserPagePresentationWarmManager {
  let activeResourceWarmToken = 0;

  const ensureWarm = (
    cacheKey: string,
    response: CachedBrowserPage,
  ): Promise<void> => {
    const itemIds = collectBrowserPageResourceItemIds(response);
    if (pagePresentationReady.has(cacheKey)) {
      return Promise.resolve();
    }
    const existing = pagePresentationWarmInFlight.get(cacheKey);
    if (existing) {
      return existing;
    }
    const request = Promise.resolve()
      .then(() => {
        markPerfEvent('browser-atlas-page-coverage', {
          page: response.page,
          requested: itemIds.length,
          drawable: itemIds.length,
          missing: 0,
          source: 'native-runtime-render-worker',
        });
        // Native surface rendering owns texture residency. Do not decode DOM
        // atlas images during page transitions; that reintroduces the old
        // browser-image warm path and competes with the GPU render worker.
        pagePresentationReady.add(cacheKey);
      })
      .catch(() => undefined)
      .finally(() => {
        pagePresentationWarmInFlight.delete(cacheKey);
      });

    pagePresentationWarmInFlight.set(cacheKey, request);
    return request;
  };

  return {
    invalidate() {
      activeResourceWarmToken += 1;
    },
    ensureWarm,
    async waitForPresentation(cacheKey, response, waitMs) {
      if (waitMs <= 0) {
        const warmToken = activeResourceWarmToken;
        window.setTimeout(() => {
          if (warmToken !== activeResourceWarmToken || pagePresentationReady.has(cacheKey)) {
            return;
          }
          void ensureWarm(cacheKey, response);
        }, 0);
        return;
      }
      const warmPromise = ensureWarm(cacheKey, response);
      await Promise.race([
        warmPromise,
        new Promise<void>((resolve) => {
          setTimeout(resolve, waitMs);
        }),
      ]);
    },
  };
}
