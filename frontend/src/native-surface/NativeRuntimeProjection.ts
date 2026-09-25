import type {
  NativeCompactBrowserPack,
} from "./NativeRuntimeBrowserPack";
import { getNativeCompactBrowserRow } from "./NativeRuntimeBrowserPack";

export type NativeRuntimeProjectionFilter = {
  query?: string | null;
  modId?: string | null;
};

export type NativeRuntimeProjectionCache = {
  key: string | null;
  indices: Uint32Array | null;
};

export function normalizeNativeRuntimeSearchText(value: string | null | undefined): string {
  return `${value ?? ""}`.trim().toLowerCase().replace(/\s+/g, "");
}

export function buildNativeRuntimeProjectionCacheKey(
  browserPack: Pick<NativeCompactBrowserPack, "itemCount"> | null | undefined,
  filter: NativeRuntimeProjectionFilter,
): string {
  return [
    browserPack?.itemCount ?? 0,
    normalizeNativeRuntimeSearchText(filter.query),
    `${filter.modId ?? ""}`.trim().toLowerCase(),
  ].join("|");
}

export function projectNativeRuntimeBrowserIndices(
  browserPack: NativeCompactBrowserPack,
  filter: NativeRuntimeProjectionFilter,
): Uint32Array {
  const query = normalizeNativeRuntimeSearchText(filter.query);
  const modFilter = `${filter.modId ?? ""}`.trim().toLowerCase();
  const indices: number[] = [];

  for (let index = 0; index < browserPack.itemCount; index += 1) {
    const row = getNativeCompactBrowserRow(browserPack, index);
    if (!row) continue;
    const itemId = browserPack.strings[row.itemIdRef] ?? "";
    const localizedName = browserPack.strings[row.localizedNameRef] ?? "";
    const modId = browserPack.strings[row.modIdRef] ?? "";
    const groupKey = browserPack.strings[row.groupKeyRef] ?? "";
    if (modFilter && modId.toLowerCase() !== modFilter) continue;
    if (query) {
      const haystack = normalizeNativeRuntimeSearchText(`${localizedName}|${itemId}|${modId}|${groupKey}`);
      if (!haystack.includes(query)) continue;
    }
    indices.push(index);
  }

  return Uint32Array.from(indices);
}

export function getCachedNativeRuntimeProjectionIndices(
  browserPack: NativeCompactBrowserPack,
  filter: NativeRuntimeProjectionFilter,
  cache: NativeRuntimeProjectionCache,
): Uint32Array {
  const cacheKey = buildNativeRuntimeProjectionCacheKey(browserPack, filter);
  if (cache.key === cacheKey && cache.indices) return cache.indices;
  const indices = projectNativeRuntimeBrowserIndices(browserPack, filter);
  cache.key = cacheKey;
  cache.indices = indices;
  return indices;
}
