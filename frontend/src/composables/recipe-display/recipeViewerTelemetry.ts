import { nextTick } from 'vue';

export async function waitForPaint(): Promise<void> {
  await nextTick();
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    resolve();
  });
}

export function logSearchLatency(query: string, resultCount: number, durationMs: number): void {
  if (!import.meta.env.DEV) return;
  console.debug(
    `[obs] recipe-search-latency query="${query}" results=${resultCount} latency=${durationMs.toFixed(2)}ms`,
  );
}

export function logRecipeSwitchLatency(
  source: string,
  fromRecipeId: string | null,
  toRecipeId: string | null,
  durationMs: number,
): void {
  if (!import.meta.env.DEV) return;
  console.debug(
    `[obs] recipe-switch-latency source=${source} from=${fromRecipeId ?? 'null'} to=${toRecipeId ?? 'null'} latency=${durationMs.toFixed(2)}ms`,
  );
}

export function logDetailHydration(recipeIds: string[], durationMs: number, source: string): void {
  if (!import.meta.env.DEV) return;
  console.debug(`[obs] recipe-detail-hydration source=${source} count=${recipeIds.length} latency=${durationMs.toFixed(2)}ms ids=${recipeIds.join(',')}`);
}

export type RecipeSwitchLatencyTracker = {
  mark: (source: string) => void;
  flush: () => Promise<void>;
  clear: () => void;
};

export function createRecipeSwitchLatencyTracker(options: {
  getCurrentRecipeId: () => string | null;
  getNow: () => number;
  waitForPaint: () => Promise<void>;
  logRecipeSwitchLatency: (
    source: string,
    fromRecipeId: string | null,
    toRecipeId: string | null,
    durationMs: number,
  ) => void;
}): RecipeSwitchLatencyTracker {
  let recipeSwitchSeq = 0;
  let pending: {
    requestSeq: number;
    source: string;
    startedAt: number;
    fromRecipeId: string | null;
  } | null = null;

  return {
    mark(source: string) {
      pending = {
        requestSeq: ++recipeSwitchSeq,
        source,
        startedAt: options.getNow(),
        fromRecipeId: options.getCurrentRecipeId(),
      };
    },
    async flush() {
      if (!pending) return;
      const current = pending;
      await options.waitForPaint();
      if (pending?.requestSeq !== current.requestSeq) return;
      const toRecipeId = options.getCurrentRecipeId();
      const durationMs = options.getNow() - current.startedAt;
      options.logRecipeSwitchLatency(current.source, current.fromRecipeId, toRecipeId, durationMs);
      pending = null;
    },
    clear() {
      pending = null;
    },
  };
}
