import type { NativeSurfaceEngineEntry } from '../native-surface/NativeSurfaceEngineProtocol';
import {
  getNativeCompactBrowserRow,
  type NativeCompactBrowserPack,
} from '../native-surface/NativeRuntimeBrowserPack';

export function buildRuntimeBrowserIndexByItemId(browserPack: NativeCompactBrowserPack | null): Map<string, number> {
  const indexByItemId = new Map<string, number>();
  if (!browserPack) return indexByItemId;
  for (let index = 0; index < browserPack.itemCount; index += 1) {
    const row = getNativeCompactBrowserRow(browserPack, index);
    if (!row) continue;
    const itemId = browserPack.strings[row.itemIdRef] ?? '';
    if (itemId && !indexByItemId.has(itemId)) {
      indexByItemId.set(itemId, index);
    }
  }
  return indexByItemId;
}

export function buildRuntimeHistoryEntries(params: {
  browserPack: NativeCompactBrowserPack | null;
  historyItems: string[];
  runtimeBrowserIndexByItemId: Map<string, number>;
}): NativeSurfaceEngineEntry[] {
  const browserPack = params.browserPack;
  if (!browserPack || params.historyItems.length <= 0) return [];
  const projected: NativeSurfaceEngineEntry[] = [];
  for (const itemId of params.historyItems) {
    const index = params.runtimeBrowserIndexByItemId.get(itemId);
    if (index === undefined) continue;
    const row = getNativeCompactBrowserRow(browserPack, index);
    if (!row) continue;
    const groupKey = browserPack.strings[row.groupKeyRef] ?? '';
    projected.push({
      key: `native-history:${itemId}:${projected.length}`,
      kind: 'item',
      entryIndex: projected.length,
      itemId,
      groupKey: groupKey || null,
    });
  }
  return projected;
}
