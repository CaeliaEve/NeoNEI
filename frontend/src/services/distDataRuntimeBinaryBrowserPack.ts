import type {
  BrowserSearchPackEntry,
  BrowserSearchPackResponse,
} from "../runtime/types";
import {
  getNativeCompactBrowserRow,
  parseNativeCompactBrowserPack,
} from "../native-surface/NativeRuntimeBrowserPack";
import {
  decodeBinaryUtf8,
  decodeBinaryUtf8Bytes,
} from "./distDataNativeBinaryPack";

export type DistDataBinaryBrowserItem = {
  itemId: string;
  localizedName?: string | null;
  internalName?: string | null;
  modId?: string | null;
  renderAssetRef?: string | null;
  browserOrder?: number | null;
  groupKey?: string | null;
  groupLabel?: string | null;
  groupSize?: number | null;
  representativeItemId?: string | null;
  publicItemId?: string | null;
  variantId?: string | null;
  payloadHash?: string | null;
  semanticFamily?: string | null;
  semanticClassification?: string | null;
  facetSummary?: string | null;
};

export type DistDataBinaryRawGroup = {
  groupKey?: string | null;
  groupLabel?: string | null;
  groupSize?: number | null;
  representativeItemId?: string | null;
  memberItemIds?: string[];
  semanticFamily?: string | null;
  semanticClassification?: string | null;
  groupSource?: string | null;
};

export type DistDataNativeBrowserPackPayload = {
  items: DistDataBinaryBrowserItem[];
};

const COMPACT_SEARCH_MAGIC = "NEISRC2\0";
const COMPACT_SEARCH_HEADER_BYTES = 8 + 4 * 4;
const COMPACT_SEARCH_ROW_STRIDE = 13;
const COMPACT_GROUP_MAGIC = "NEIGRP1\0";
const COMPACT_GROUP_HEADER_BYTES = 8 + 5 * 4;
const COMPACT_GROUP_ROW_STRIDE = 6;

export function parseNativeBrowserPackPayload(payload: ArrayBuffer): DistDataNativeBrowserPackPayload {
  const pack = parseNativeCompactBrowserPack(payload);
  const items: DistDataBinaryBrowserItem[] = [];
  for (let index = 0; index < pack.itemCount; index += 1) {
    const row = getNativeCompactBrowserRow(pack, index);
    if (!row) continue;
    const itemId = pack.strings[row.itemIdRef] ?? "";
    if (!itemId) continue;
    const localizedName = pack.strings[row.localizedNameRef] ?? "";
    const modId = pack.strings[row.modIdRef] ?? "";
    const groupKey = pack.strings[row.groupKeyRef] ?? "";
    items.push({
      itemId,
      localizedName: localizedName || itemId,
      internalName: itemId,
      modId: modId || "unknown",
      groupKey: groupKey || null,
      browserOrder: row.browserOrder,
    });
  }
  return { items };
}

export function parseNativeSearchPackPayload(
  runtimeCacheKey: string,
  payload: ArrayBuffer,
): BrowserSearchPackResponse {
  if (payload.byteLength < COMPACT_SEARCH_HEADER_BYTES) {
    throw new Error(`Compact search payload is too small: ${payload.byteLength}`);
  }
  const bytes = new Uint8Array(payload);
  const magic = decodeBinaryUtf8(payload, 0, 8);
  if (magic !== COMPACT_SEARCH_MAGIC) {
    throw new Error(`Compact search magic mismatch: ${magic}`);
  }

  const view = new DataView(payload);
  const version = view.getUint32(8, true);
  const itemCount = view.getUint32(12, true);
  const stringCount = view.getUint32(16, true);
  const rowStride = view.getUint32(20, true);
  if (version !== 1 || rowStride !== COMPACT_SEARCH_ROW_STRIDE) {
    throw new Error(`Compact search stride mismatch: version=${version}, row=${rowStride}`);
  }

  const offsetsStart = COMPACT_SEARCH_HEADER_BYTES;
  const rowsStart = offsetsStart + stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const stringsStart = rowsStart + rowsBytes;
  if (stringsStart > payload.byteLength) {
    throw new Error(`Compact search table exceeds payload length: ${stringsStart}/${payload.byteLength}`);
  }

  const stringTableBytes = bytes.subarray(stringsStart);
  const strings: string[] = new Array(stringCount);
  for (let index = 0; index < stringCount; index += 1) {
    const offset = view.getUint32(offsetsStart + index * 4, true);
    if (offset >= stringTableBytes.byteLength && stringTableBytes.byteLength > 0) {
      strings[index] = "";
      continue;
    }
    let end = offset;
    while (end < stringTableBytes.byteLength && stringTableBytes[end] !== 0) {
      end += 1;
    }
    strings[index] = decodeBinaryUtf8Bytes(stringTableBytes.subarray(offset, end));
  }

  const items: BrowserSearchPackEntry[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const rowOffset = rowsStart + index * rowStride * 4;
    const itemId = strings[view.getUint32(rowOffset, true)] ?? "";
    if (!itemId) continue;
    items.push({
      itemId,
      publicItemId: strings[view.getUint32(rowOffset + 4, true)] ?? "",
      localizedName: strings[view.getUint32(rowOffset + 8, true)] ?? "",
      modId: strings[view.getUint32(rowOffset + 12, true)] ?? "",
      normalizedLocalizedName: strings[view.getUint32(rowOffset + 16, true)] ?? "",
      normalizedInternalName: strings[view.getUint32(rowOffset + 20, true)] ?? "",
      normalizedItemId: strings[view.getUint32(rowOffset + 24, true)] ?? "",
      normalizedSearchTerms: strings[view.getUint32(rowOffset + 28, true)] ?? "",
      pinyinFull: strings[view.getUint32(rowOffset + 32, true)] ?? "",
      pinyinAcronym: strings[view.getUint32(rowOffset + 36, true)] ?? "",
      aliases: "",
      popularityScore: view.getUint32(rowOffset + 40, true),
      searchRank: view.getUint32(rowOffset + 44, true),
    });
  }

  return {
    version: 3,
    signature: runtimeCacheKey,
    total: items.length,
    items,
  };
}

export function parseNativeGroupPackPayload(payload: ArrayBuffer): DistDataBinaryRawGroup[] {
  if (payload.byteLength < COMPACT_GROUP_HEADER_BYTES) {
    return [];
  }
  const bytes = new Uint8Array(payload);
  const magic = decodeBinaryUtf8(payload, 0, 8);
  if (magic !== COMPACT_GROUP_MAGIC) {
    throw new Error(`Compact group magic mismatch: ${magic}`);
  }

  const view = new DataView(payload);
  const version = view.getUint32(8, true);
  const groupCount = view.getUint32(12, true);
  const stringCount = view.getUint32(16, true);
  const memberCount = view.getUint32(20, true);
  const rowStride = view.getUint32(24, true);
  if (version !== 1 || rowStride !== COMPACT_GROUP_ROW_STRIDE) {
    throw new Error(`Compact group stride mismatch: version=${version}, row=${rowStride}`);
  }

  const offsetsStart = COMPACT_GROUP_HEADER_BYTES;
  const rowsStart = offsetsStart + stringCount * 4;
  const rowsBytes = groupCount * rowStride * 4;
  const membersStart = rowsStart + rowsBytes;
  const membersBytes = memberCount * 4;
  const stringsStart = membersStart + membersBytes;
  if (stringsStart > payload.byteLength) {
    throw new Error(`Compact group table exceeds payload length: ${stringsStart}/${payload.byteLength}`);
  }

  const stringTableBytes = bytes.subarray(stringsStart);
  const strings: string[] = new Array(stringCount);
  for (let index = 0; index < stringCount; index += 1) {
    const offset = view.getUint32(offsetsStart + index * 4, true);
    if (offset >= stringTableBytes.byteLength && stringTableBytes.byteLength > 0) {
      strings[index] = "";
      continue;
    }
    let end = offset;
    while (end < stringTableBytes.byteLength && stringTableBytes[end] !== 0) {
      end += 1;
    }
    strings[index] = decodeBinaryUtf8Bytes(stringTableBytes.subarray(offset, end));
  }

  const groups: DistDataBinaryRawGroup[] = [];
  for (let index = 0; index < groupCount; index += 1) {
    const rowOffset = rowsStart + index * rowStride * 4;
    const groupKey = strings[view.getUint32(rowOffset, true)] ?? "";
    if (!groupKey) continue;
    const memberStart = view.getUint32(rowOffset + 12, true);
    const rowMemberCount = view.getUint32(rowOffset + 16, true);
    const memberItemIds: string[] = [];
    for (let memberIndex = 0; memberIndex < rowMemberCount; memberIndex += 1) {
      const absoluteMemberIndex = memberStart + memberIndex;
      if (absoluteMemberIndex >= memberCount) break;
      const member = strings[view.getUint32(membersStart + absoluteMemberIndex * 4, true)] ?? "";
      if (member) memberItemIds.push(member);
    }
    groups.push({
      groupKey,
      groupLabel: strings[view.getUint32(rowOffset + 4, true)] || null,
      representativeItemId: strings[view.getUint32(rowOffset + 8, true)] || memberItemIds[0] || null,
      groupSize: view.getUint32(rowOffset + 20, true) || memberItemIds.length,
      memberItemIds,
    });
  }
  return groups;
}
