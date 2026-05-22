import type { BrowserGridEntry } from './api';

export type HomeGridLayoutCommand = {
  key: string;
  kind: 'item' | 'group-collapsed' | 'group-header';
  entryIndex: number;
  itemId: string;
  x: number;
  y: number;
  size: number;
  iconX: number;
  iconY: number;
  iconSize: number;
};

export type HomeGridLayoutResult = {
  id: number;
  layoutKey: string;
  canvasWidth: number;
  canvasHeight: number;
  itemIds: string[];
  renderAssetRefs: string[];
  drawCommands: HomeGridLayoutCommand[];
  offscreenCanvasSupported: boolean;
};

type HomeGridLayoutParams = {
  entries: BrowserGridEntry[];
  columns: number;
  cardSize: number;
  gap: number;
  iconSize: number;
  canvasWidth: number;
  canvasHeight: number;
  layoutKey: string;
};

type PendingRequest = {
  resolve: (result: HomeGridLayoutResult) => void;
  reject: (error: unknown) => void;
};

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

export function canUseHomeGridOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas !== 'undefined';
}

function rejectPending(error: unknown): void {
  for (const request of pending.values()) {
    request.reject(error);
  }
  pending.clear();
}

function getEntryItem(entry: BrowserGridEntry) {
  return entry.kind === 'item' ? entry.item : entry.group.representative;
}

function toWorkerEntries(entries: BrowserGridEntry[]) {
  return entries.map((entry) => {
    const item = getEntryItem(entry);
    return {
      key: entry.key,
      kind: entry.kind,
      itemId: `${item?.itemId ?? ''}`,
      renderAssetRef: item?.renderAssetRef ?? null,
    };
  });
}

function computeFallbackLayout(params: HomeGridLayoutParams, id = 0): HomeGridLayoutResult {
  const safeColumns = Math.max(1, Math.floor(params.columns || 1));
  const safeCardSize = Math.max(1, Math.floor(params.cardSize || 1));
  const safeGap = Math.max(0, Math.floor(params.gap || 0));
  const safeIconSize = Math.max(1, Math.floor(params.iconSize || 1));
  const workerEntries = toWorkerEntries(params.entries);
  const drawCommands = workerEntries.map((entry, index) => {
    const col = index % safeColumns;
    const row = Math.floor(index / safeColumns);
    const x = col * (safeCardSize + safeGap);
    const y = row * (safeCardSize + safeGap);
    return {
      key: entry.key,
      kind: entry.kind,
      entryIndex: index,
      itemId: entry.itemId,
      x,
      y,
      size: safeCardSize,
      iconX: x + Math.round((safeCardSize - safeIconSize) / 2),
      iconY: y + Math.round((safeCardSize - safeIconSize) / 2),
      iconSize: safeIconSize,
    };
  });

  return {
    id,
    layoutKey: params.layoutKey,
    canvasWidth: params.canvasWidth,
    canvasHeight: params.canvasHeight,
    itemIds: Array.from(new Set(workerEntries.map((entry) => entry.itemId).filter(Boolean))),
    renderAssetRefs: Array.from(new Set(workerEntries.map((entry) => `${entry.renderAssetRef ?? ''}`.trim()).filter(Boolean))),
    drawCommands,
    offscreenCanvasSupported: canUseHomeGridOffscreenCanvas(),
  };
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') {
    return null;
  }
  if (worker) {
    return worker;
  }
  try {
    worker = new Worker(new URL('../workers/homeGridLayout.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<HomeGridLayoutResult>) => {
      const result = event.data;
      const request = pending.get(result.id);
      if (!request) return;
      pending.delete(result.id);
      request.resolve(result);
    };
    worker.onerror = (error) => {
      rejectPending(error);
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    worker = null;
    return null;
  }
}

export async function computeHomeGridLayout(params: HomeGridLayoutParams): Promise<HomeGridLayoutResult> {
  const id = nextRequestId++;
  const activeWorker = getWorker();
  if (!activeWorker) {
    return computeFallbackLayout(params, id);
  }

  return new Promise<HomeGridLayoutResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    activeWorker.postMessage({
      type: 'layout',
      id,
      payload: {
        entries: toWorkerEntries(params.entries),
        columns: params.columns,
        cardSize: params.cardSize,
        gap: params.gap,
        iconSize: params.iconSize,
        canvasWidth: params.canvasWidth,
        canvasHeight: params.canvasHeight,
        layoutKey: params.layoutKey,
        offscreenCanvasSupported: canUseHomeGridOffscreenCanvas(),
      },
    });
  }).catch(() => computeFallbackLayout(params, id));
}

export function resetHomeGridLayoutWorker(): void {
  worker?.terminate();
  worker = null;
  rejectPending(new Error('Home grid layout worker reset'));
}