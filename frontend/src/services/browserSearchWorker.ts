import { api, type BrowserSearchPackResponse } from "./api";
import { readPersistentRuntimeCache, writePersistentRuntimeCache } from "./persistentRuntimeCache";
import { markPerfEvent } from "./perfMarks";

type WorkerQueryParams = {
  query: string;
  modId?: string;
  page: number;
  pageSize: number;
};

type WorkerQueryResult = {
  id: number;
  total: number;
  totalPages: number;
  page: number;
  itemIds: string[];
};

type SearchWorkerStage = "empty" | "partial" | "full";

const HOT_SHARD_ID = "hot";
const TAIL_SHARD_ID = "tail";

let worker: Worker | null = null;
let warmInitPromise: Promise<void> | null = null;
let fullInitPromise: Promise<void> | null = null;
let nextRequestId = 1;
let activeRuntimeCacheKey: string | null = null;
let activePack: BrowserSearchPackResponse | null = null;
let searchWorkerStage: SearchWorkerStage = "empty";
let backgroundFullLoadQueued = false;
let readyMarkIssuedForRuntime = false;

const pending = new Map<number, { resolve: (result: WorkerQueryResult) => void; reject: (error: unknown) => void }>();

function buildSearchPackCacheKey(runtimeCacheKey: string, suffix: "full" | "hot" = "full"): string {
  return suffix === "full"
    ? `browser-search-pack:${runtimeCacheKey}`
    : `browser-search-pack:${runtimeCacheKey}:${suffix}`;
}

function rejectPendingRequests(error: unknown): void {
  for (const request of pending.values()) {
    request.reject(error);
  }
  pending.clear();
}

function resetWorkerState(nextRuntimeCacheKey: string): void {
  if (activeRuntimeCacheKey === nextRuntimeCacheKey) {
    return;
  }

  if (worker) {
    worker.terminate();
    worker = null;
  }
  rejectPendingRequests(new Error("Browser search worker was reset for a new runtime bundle"));
  activeRuntimeCacheKey = nextRuntimeCacheKey;
  activePack = null;
  searchWorkerStage = "empty";
  warmInitPromise = null;
  fullInitPromise = null;
  backgroundFullLoadQueued = false;
  readyMarkIssuedForRuntime = false;
}

export function resetBrowserSearchWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  rejectPendingRequests(new Error("Browser search worker was manually reset"));
  activeRuntimeCacheKey = null;
  activePack = null;
  searchWorkerStage = "empty";
  warmInitPromise = null;
  fullInitPromise = null;
  backgroundFullLoadQueued = false;
  readyMarkIssuedForRuntime = false;
}

function getWorker(): Worker {
  if (worker) {
    return worker;
  }

  worker = new Worker(new URL("../workers/browserSearch.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<WorkerQueryResult>) => {
    const result = event.data;
    const request = pending.get(result.id);
    if (!request) return;
    pending.delete(result.id);
    request.resolve(result);
  };
  worker.onerror = (error) => {
    rejectPendingRequests(error);
  };
  return worker;
}

function mergeSearchPacks(
  primary: BrowserSearchPackResponse | null,
  secondary: BrowserSearchPackResponse | null,
): BrowserSearchPackResponse | null {
  if (!primary) return secondary;
  if (!secondary) return primary;

  const seen = new Set<string>();
  const items = [...primary.items, ...secondary.items].filter((entry) => {
    if (!entry?.itemId || seen.has(entry.itemId)) {
      return false;
    }
    seen.add(entry.itemId);
    return true;
  });

  return {
    version: Math.max(primary.version ?? 1, secondary.version ?? 1),
    signature: secondary.signature ?? primary.signature,
    total: items.length,
    items,
  };
}

function initializeWorkerWithPack(pack: BrowserSearchPackResponse): void {
  activePack = pack;
  getWorker().postMessage({
    type: "init",
    payload: pack,
  });
}

function appendWorkerPack(pack: BrowserSearchPackResponse): void {
  if (!pack.items?.length) {
    return;
  }

  if (!activePack?.items?.length) {
    initializeWorkerWithPack(pack);
    return;
  }

  activePack = mergeSearchPacks(activePack, pack);
  getWorker().postMessage({
    type: "append",
    payload: pack,
  });
}

function isFullSearchWorkerStage(): boolean {
  return searchWorkerStage === "full";
}

function markSearchWorkerReady(stage: SearchWorkerStage, source: string, pack: BrowserSearchPackResponse | null): void {
  if (!readyMarkIssuedForRuntime && (stage === "partial" || stage === "full")) {
    readyMarkIssuedForRuntime = true;
    markPerfEvent("search-worker-ready", {
      stage,
      source,
      total: pack?.items?.length ?? 0,
    });
    return;
  }

  if (stage === "full") {
    markPerfEvent("search-worker-full-hydrated", {
      source,
      total: pack?.items?.length ?? 0,
    });
  }
}

function scheduleBackgroundFullInitialization(): void {
  if (backgroundFullLoadQueued || searchWorkerStage === "full") {
    return;
  }

  backgroundFullLoadQueued = true;
  const run = () => {
    backgroundFullLoadQueued = false;
    void ensureFullyInitialized().catch(() => {
      // best-effort background hydration only
    });
  };

  const requestIdle = (globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  }).requestIdleCallback;

  if (typeof requestIdle === "function") {
    requestIdle(() => run(), { timeout: 1200 });
    return;
  }

  globalThis.setTimeout(run, 600);
}

function dispatchQueryToWorker(params: WorkerQueryParams): Promise<WorkerQueryResult> {
  const id = nextRequestId++;
  return new Promise<WorkerQueryResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({
      type: "query",
      id,
      payload: params,
    });
  });
}

async function ensureWarmInitialized(): Promise<void> {
  if (warmInitPromise) {
    return warmInitPromise;
  }

  warmInitPromise = api.getPublishManifest()
    .then(async (manifest) => {
      const runtimeCacheKey = `${manifest.runtimeCacheKey ?? manifest.sourceSignature ?? ""}`.trim();
      resetWorkerState(runtimeCacheKey);

      const fullCacheKey = buildSearchPackCacheKey(runtimeCacheKey, "full");
      const cachedFullPack = await readPersistentRuntimeCache<BrowserSearchPackResponse>(fullCacheKey);
      if (cachedFullPack?.items?.length) {
        initializeWorkerWithPack(cachedFullPack);
        searchWorkerStage = "full";
        markSearchWorkerReady("full", "persistent-full", cachedFullPack);
        return;
      }

      const hotCacheKey = buildSearchPackCacheKey(runtimeCacheKey, "hot");
      const cachedHotPack = await readPersistentRuntimeCache<BrowserSearchPackResponse>(hotCacheKey);
      if (cachedHotPack?.items?.length) {
        initializeWorkerWithPack(cachedHotPack);
        searchWorkerStage = "partial";
        markSearchWorkerReady("partial", "persistent-hot", cachedHotPack);
        scheduleBackgroundFullInitialization();
        return;
      }

      const hotShard = await api.getBrowserSearchPackShard(HOT_SHARD_ID);
      if (hotShard?.items?.length) {
        initializeWorkerWithPack(hotShard);
        searchWorkerStage = "partial";
        markSearchWorkerReady("partial", "published-hot", hotShard);
        void writePersistentRuntimeCache(hotCacheKey, hotShard);
        scheduleBackgroundFullInitialization();
        return;
      }

      const fullPack = await api.getBrowserSearchPack();
      initializeWorkerWithPack(fullPack);
      searchWorkerStage = "full";
      markSearchWorkerReady("full", "api-full", fullPack);
      void writePersistentRuntimeCache(fullCacheKey, fullPack);
    })
    .catch((error) => {
      warmInitPromise = null;
      throw error;
    });

  return warmInitPromise;
}

async function ensureFullyInitialized(): Promise<void> {
  await ensureWarmInitialized();
  if (searchWorkerStage === "full") {
    return;
  }
  if (fullInitPromise) {
    return fullInitPromise;
  }

  fullInitPromise = (async () => {
    const runtimeCacheKey = `${activeRuntimeCacheKey ?? ""}`.trim();
    if (!runtimeCacheKey) {
      return;
    }

    const fullCacheKey = buildSearchPackCacheKey(runtimeCacheKey, "full");
    const cachedFullPack = await readPersistentRuntimeCache<BrowserSearchPackResponse>(fullCacheKey);
    if (cachedFullPack?.items?.length) {
      initializeWorkerWithPack(cachedFullPack);
      searchWorkerStage = "full";
      markSearchWorkerReady("full", "persistent-full", cachedFullPack);
      return;
    }

    const tailShard = await api.getBrowserSearchPackShard(TAIL_SHARD_ID);
    if (tailShard?.items?.length && activePack?.items?.length) {
      appendWorkerPack(tailShard);
      if (activePack) {
        searchWorkerStage = "full";
        markSearchWorkerReady("full", "published-tail", activePack);
        await writePersistentRuntimeCache(fullCacheKey, activePack);
        return;
      }
    }

    const fullPack = await api.getBrowserSearchPack();
    initializeWorkerWithPack(fullPack);
    activePack = fullPack;
    searchWorkerStage = "full";
    markSearchWorkerReady("full", "api-full", fullPack);
    await writePersistentRuntimeCache(fullCacheKey, fullPack);
  })().finally(() => {
    fullInitPromise = null;
  });

  return fullInitPromise;
}

export async function preloadBrowserSearchWorker(): Promise<void> {
  await ensureWarmInitialized();
  scheduleBackgroundFullInitialization();
}

export async function queryBrowserSearchWorker(params: WorkerQueryParams): Promise<WorkerQueryResult> {
  await ensureWarmInitialized();

  const partialResult = await dispatchQueryToWorker(params);
  if (isFullSearchWorkerStage()) {
    return partialResult;
  }

  const normalizedPage = Math.max(1, Math.floor(params.page || 1));
  const normalizedPageSize = Math.min(Math.max(1, Math.floor(params.pageSize || 50)), 500);
  const canSatisfyFromHotShard = normalizedPage === 1 && partialResult.total >= normalizedPageSize;
  if (canSatisfyFromHotShard) {
    scheduleBackgroundFullInitialization();
    return partialResult;
  }

  await ensureFullyInitialized();
  if (!isFullSearchWorkerStage()) {
    return partialResult;
  }

  return dispatchQueryToWorker(params);
}
