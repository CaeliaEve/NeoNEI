import { api, type BrowserGridEntry, type BrowserSearchPackEntry } from "./api";
import { getDistDataSearchPack } from "./distDataRuntime";
import { markPerfEvent } from "./perfMarks";

type WorkerQueryParams = {
  query: string;
  modId?: string;
  page: number;
  pageSize: number;
};

export type WorkerQueryResult = {
  id: number;
  total: number;
  totalPages: number;
  page: number;
  itemIds: string[];
  entries?: BrowserSearchPackEntry[];
  elapsedMs?: number;
  candidateCount?: number;
  indexReady?: boolean;
};

let nextRequestId = 1;
let warmInitPromise: Promise<void> | null = null;

function getBrowserEntryItemId(entry: BrowserGridEntry): string {
  if (entry.kind === "item") {
    return `${entry.item?.itemId ?? ""}`.trim();
  }
  return `${entry.group?.representative?.itemId ?? ""}`.trim();
}

export function resetBrowserSearchWorker(): void {
  warmInitPromise = null;
}

export async function preloadBrowserSearchWorker(): Promise<void> {
  if (warmInitPromise) {
    return warmInitPromise;
  }

  warmInitPromise = (async () => {
    const startedAt = performance.now();
    const distData = await getDistDataSearchPack();
    markPerfEvent("search-runtime-ready", {
      source: "dist-data-native-search-pack",
      total: distData?.pack?.items?.length ?? 0,
      elapsedMs: performance.now() - startedAt,
    });
  })().catch((error) => {
    warmInitPromise = null;
    throw error;
  });

  return warmInitPromise;
}

export async function queryBrowserSearchWorker(params: WorkerQueryParams): Promise<WorkerQueryResult> {
  const startedAt = performance.now();
  await preloadBrowserSearchWorker();
  const page = Math.max(1, Math.floor(params.page || 1));
  const pageSize = Math.min(Math.max(1, Math.floor(params.pageSize || 50)), 500);
  const catalog = await api.getBrowserSearchCatalog({
    search: params.query,
    modId: params.modId,
  });
  const allEntries = catalog.data ?? [];
  const offset = (page - 1) * pageSize;
  const pageEntries = allEntries.slice(offset, offset + pageSize);
  const result: WorkerQueryResult = {
    id: nextRequestId++,
    total: catalog.total ?? allEntries.length,
    totalPages: Math.max(1, Math.ceil((catalog.total ?? allEntries.length) / pageSize)),
    page,
    itemIds: pageEntries.map(getBrowserEntryItemId).filter(Boolean),
    elapsedMs: performance.now() - startedAt,
    candidateCount: catalog.total ?? allEntries.length,
    indexReady: true,
  };
  markPerfEvent("browser-search-runtime-query", {
    queryLength: params.query.length,
    page,
    pageSize,
    elapsedMs: result.elapsedMs ?? null,
    total: result.total,
    source: "runtime-search-catalog",
  });
  return result;
}
