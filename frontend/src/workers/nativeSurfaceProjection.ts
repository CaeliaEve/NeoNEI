import type { NativeSurfaceEngineEntry } from '../native-surface/NativeSurfaceEngineProtocol';
import {
  getNativeCompactBrowserRow,
  type NativeCompactBrowserPack,
} from '../native-surface/NativeRuntimeBrowserPack';
import type { NativeRuntimeSearchItem } from './nativeSurfaceRuntimeParsers';

type RuntimeSearchPrefixState = {
  runtimeSearchPrefixCache: Map<string, Uint32Array>;
  runtimeSearchSortedKeys: string[];
  runtimeSearchExactIndex: Map<string, Uint32Array>;
};

export function normalizeRuntimeSearchKey(value: unknown): string {
  return `${value ?? ''}`.trim().toLowerCase().replace(/\s+/g, '');
}

function addRuntimeSearchIndexCandidate(
  index: Map<string, number[]>,
  key: string,
  browserIndex: number,
): void {
  const normalized = normalizeRuntimeSearchKey(key);
  if (!normalized) return;
  const list = index.get(normalized);
  if (list) {
    list.push(browserIndex);
    return;
  }
  index.set(normalized, [browserIndex]);
}

function dedupeRuntimeSearchIndex(index: Map<string, number[]>): Map<string, Uint32Array> {
  const result = new Map<string, Uint32Array>();
  for (const [key, values] of index) {
    values.sort((left, right) => left - right);
    const unique: number[] = [];
    let previous = -1;
    for (const value of values) {
      if (value === previous) continue;
      unique.push(value);
      previous = value;
    }
    result.set(key, Uint32Array.from(unique));
  }
  return result;
}

export function buildRuntimeSearchExactIndex(searchByItemId: Map<string, NativeRuntimeSearchItem>): Map<string, Uint32Array> {
  const exactIndex = new Map<string, number[]>();
  const addKey = (key: unknown, browserIndex: number): void => {
    addRuntimeSearchIndexCandidate(exactIndex, `${key ?? ''}`, browserIndex);
  };
  for (const item of searchByItemId.values()) {
    const browserIndex = Math.max(0, Math.floor(Number(item.browserIndex) || 0));
    addKey(item.itemId, browserIndex);
    addKey(item.publicItemId, browserIndex);
    addKey(item.localizedName, browserIndex);
    addKey(item.modId, browserIndex);
    addKey(item.normalizedLocalizedName, browserIndex);
    addKey(item.normalizedInternalName, browserIndex);
    addKey(item.normalizedItemId, browserIndex);
    addKey(item.pinyinFull, browserIndex);
    addKey(item.pinyinAcronym, browserIndex);
    for (const token of `${item.normalizedSearchTerms ?? ''}`.split(/[|,;\s]+/)) {
      addKey(token, browserIndex);
    }
  }
  return dedupeRuntimeSearchIndex(exactIndex);
}

function lowerBoundRuntimeSearchKey(keys: string[], target: string): number {
  let left = 0;
  let right = keys.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if ((keys[middle] ?? '') < target) left = middle + 1;
    else right = middle;
  }
  return left;
}

export function getRuntimeSearchPrefixCandidates(surface: RuntimeSearchPrefixState, normalizedQuery: string): Uint32Array | null {
  const cached = surface.runtimeSearchPrefixCache.get(normalizedQuery);
  if (cached) return cached;
  if (surface.runtimeSearchSortedKeys.length <= 0) return null;
  const merged: number[] = [];
  const seen = new Set<number>();
  for (
    let index = lowerBoundRuntimeSearchKey(surface.runtimeSearchSortedKeys, normalizedQuery);
    index < surface.runtimeSearchSortedKeys.length;
    index += 1
  ) {
    const key = surface.runtimeSearchSortedKeys[index] ?? '';
    if (!key.startsWith(normalizedQuery)) break;
    const candidates = surface.runtimeSearchExactIndex.get(key);
    if (!candidates) continue;
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      merged.push(candidate);
    }
  }
  if (merged.length <= 0) return null;
  merged.sort((left, right) => left - right);
  const compact = Uint32Array.from(merged);
  surface.runtimeSearchPrefixCache.set(normalizedQuery, compact);
  return compact;
}

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
