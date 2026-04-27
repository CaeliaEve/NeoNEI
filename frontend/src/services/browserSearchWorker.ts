import { api, type BrowserSearchPackResponse } from "./api";
import { readPersistentRuntimeCache, writePersistentRuntimeCache } from "./persistentRuntimeCache";

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

let worker: Worker | null = null;
let initPromise: Promise<void> | null = null;
let nextRequestId = 1;
const pending = new Map<number, { resolve: (result: WorkerQueryResult) => void; reject: (error: unknown) => void }>();

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
    for (const request of pending.values()) {
      request.reject(error);
    }
    pending.clear();
  };
  return worker;
}

async function ensureInitialized(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = api.getPublishManifest()
    .then(async (manifest) => {
      const runtimeCacheKey = `${manifest.runtimeCacheKey ?? manifest.sourceSignature ?? ''}`.trim();
      const cacheKey = `browser-search-pack:${runtimeCacheKey}`;
      const cachedPack = await readPersistentRuntimeCache<BrowserSearchPackResponse>(cacheKey);
      if (cachedPack?.items?.length) {
        getWorker().postMessage({
          type: "init",
          payload: cachedPack,
        });
        return;
      }

      const pack = await api.getBrowserSearchPack();
      getWorker().postMessage({
        type: "init",
        payload: pack,
      });
      void writePersistentRuntimeCache(cacheKey, pack);
    })
    .catch((error) => {
      initPromise = null;
      throw error;
    });

  return initPromise;
}

export async function preloadBrowserSearchWorker(): Promise<void> {
  await ensureInitialized();
}

export async function queryBrowserSearchWorker(params: WorkerQueryParams): Promise<WorkerQueryResult> {
  await ensureInitialized();

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
