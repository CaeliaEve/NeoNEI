import {
  ensureGlobalBrowserAtlasIndex,
  hasGlobalBrowserAtlas,
} from '../../services/globalBrowserAtlas';
import { markPerfEvent } from '../../services/perfMarks';

const nativeBrowserWarmScopes = new Set<string>();
const nativeBrowserWarmPromises = new Map<string, Promise<void>>();

export type NativeBrowserRuntimeWarmManager = {
  ensureReady: () => Promise<void>;
  scheduleWarm: () => void;
  dispose: () => void;
};

export function createNativeBrowserRuntimeWarmManager(options: {
  hasActiveSearch: () => boolean;
  getScope: () => string | undefined;
  getPageSize: () => number;
  getItemSize: () => number;
  delayMs?: number;
}): NativeBrowserRuntimeWarmManager {
  let warmTimer: ReturnType<typeof setTimeout> | null = null;

  const buildWarmKey = () => `${options.getScope() ?? 'all'}::${options.getPageSize()}::${options.getItemSize()}`;

  const runWarm = async (warmKey: string, scope: string) => {
    const startedAt = performance.now();
    await Promise.allSettled([
      hasGlobalBrowserAtlas()
        ? ensureGlobalBrowserAtlasIndex()
        : Promise.resolve(false),
    ]).then((results) => {
      markPerfEvent('browser-native-runtime-warm', {
        scope,
        durationMs: Math.round(performance.now() - startedAt),
        catalog: 'native-worker',
        atlasIndex: results[0]?.status ?? 'unknown',
        atlasResident: 'background',
      });
    }).catch(() => undefined);
    nativeBrowserWarmScopes.add(warmKey);
  };

  const ensureReady = async () => {
    if (options.hasActiveSearch()) {
      return;
    }

    const scope = options.getScope() ?? 'all';
    const warmKey = buildWarmKey();
    if (nativeBrowserWarmScopes.has(warmKey)) {
      return;
    }

    const existing = nativeBrowserWarmPromises.get(warmKey);
    if (existing) {
      await existing;
      return;
    }

    const promise = runWarm(warmKey, scope)
      .finally(() => {
        nativeBrowserWarmPromises.delete(warmKey);
      });
    nativeBrowserWarmPromises.set(warmKey, promise);
    await promise;
  };

  return {
    ensureReady,
    scheduleWarm() {
      if (options.hasActiveSearch()) {
        return;
      }

      const warmKey = buildWarmKey();
      if (nativeBrowserWarmScopes.has(warmKey)) {
        return;
      }

      if (warmTimer !== null) {
        clearTimeout(warmTimer);
        warmTimer = null;
      }

      warmTimer = setTimeout(() => {
        warmTimer = null;
        void ensureReady();
      }, options.delayMs ?? 90);
    },
    dispose() {
      if (warmTimer) {
        clearTimeout(warmTimer);
        warmTimer = null;
      }
    },
  };
}
