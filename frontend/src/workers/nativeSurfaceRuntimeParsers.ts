import type {
  NativeRuntimeAnimationItem,
  NativeRuntimeAtlasFrame,
  NativeRuntimeTextureItem,
  NativeRuntimeTimelineFrame,
} from "./nativeSurfaceSpriteTimeline";

export type NativeRuntimeGroup = {
  groupKey: string;
  groupLabel?: string | null;
  groupSize?: number | null;
  representativeItemId?: string | null;
  memberItemIds: string[];
};

export type NativeRuntimeStringItem = {
  itemId: string;
  localizedName?: string | null;
  modId?: string | null;
  internalName?: string | null;
  groupKey?: string | null;
  groupLabel?: string | null;
};

export type NativeRuntimeSearchItem = {
  itemId: string;
  publicItemId?: string | null;
  localizedName?: string | null;
  modId?: string | null;
  normalizedLocalizedName: string;
  normalizedInternalName: string;
  normalizedItemId: string;
  normalizedSearchTerms: string;
  pinyinFull: string;
  pinyinAcronym: string;
  popularityScore: number;
  searchRank: number;
  browserIndex: number;
};

const COMPACT_STRING_MAGIC = "NEISTR1\0";
const COMPACT_STRING_HEADER_BYTES = 8 + 4 * 4;
const COMPACT_STRING_ROW_STRIDE = 6;
const COMPACT_SEARCH_MAGIC = "NEISRC2\0";
const COMPACT_SEARCH_HEADER_BYTES = 8 + 4 * 4;
const COMPACT_SEARCH_ROW_STRIDE = 13;

function decodeAscii(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function readNullTerminatedString(bytes: Uint8Array, offset: number): string {
  if (offset < 0 || offset >= bytes.byteLength) return "";
  let end = offset;
  while (end < bytes.byteLength && bytes[end] !== 0) end += 1;
  return new TextDecoder("utf-8").decode(bytes.subarray(offset, end));
}

function parseCompactStringPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeStringItem> | null {
  if (payloadBuffer.byteLength < COMPACT_STRING_HEADER_BYTES) return null;
  const bytes = new Uint8Array(payloadBuffer);
  const magic = decodeAscii(bytes.subarray(0, 8));
  if (magic !== COMPACT_STRING_MAGIC) return null;

  const view = new DataView(payloadBuffer);
  const version = view.getUint32(8, true);
  const itemCount = view.getUint32(12, true);
  const stringCount = view.getUint32(16, true);
  const rowStride = view.getUint32(20, true);
  if (version !== 1 || rowStride !== COMPACT_STRING_ROW_STRIDE) {
    throw new Error(`compact string pack has invalid header: version=${version}, rowStride=${rowStride}`);
  }

  const offsetsStart = COMPACT_STRING_HEADER_BYTES;
  const rowsStart = offsetsStart + stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const stringTableStart = rowsStart + rowsBytes;
  if (stringTableStart > payloadBuffer.byteLength) {
    throw new Error(`compact string pack exceeds payload bounds: rows=${itemCount}, strings=${stringCount}, bytes=${payloadBuffer.byteLength}`);
  }

  const stringTableBytes = bytes.subarray(stringTableStart);
  const strings: string[] = new Array(stringCount);
  for (let index = 0; index < stringCount; index += 1) {
    const offset = view.getUint32(offsetsStart + index * 4, true);
    strings[index] = readNullTerminatedString(stringTableBytes, offset);
  }

  const result = new Map<string, NativeRuntimeStringItem>();
  for (let index = 0; index < itemCount; index += 1) {
    const rowOffset = rowsStart + index * rowStride * 4;
    const itemId = strings[view.getUint32(rowOffset, true)] ?? "";
    if (!itemId) continue;
    result.set(itemId, {
      itemId,
      localizedName: strings[view.getUint32(rowOffset + 4, true)] ?? "",
      modId: strings[view.getUint32(rowOffset + 8, true)] ?? "",
      internalName: strings[view.getUint32(rowOffset + 12, true)] ?? "",
      groupKey: strings[view.getUint32(rowOffset + 16, true)] ?? "",
      groupLabel: strings[view.getUint32(rowOffset + 20, true)] ?? "",
    });
  }
  return result;
}

function parseCompactSearchPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeSearchItem> | null {
  if (payloadBuffer.byteLength < COMPACT_SEARCH_HEADER_BYTES) return null;
  const bytes = new Uint8Array(payloadBuffer);
  const magic = decodeAscii(bytes.subarray(0, 8));
  if (magic !== COMPACT_SEARCH_MAGIC) return null;

  const view = new DataView(payloadBuffer);
  const version = view.getUint32(8, true);
  const itemCount = view.getUint32(12, true);
  const stringCount = view.getUint32(16, true);
  const rowStride = view.getUint32(20, true);
  if (version !== 1 || rowStride !== COMPACT_SEARCH_ROW_STRIDE) {
    throw new Error(`compact search pack has invalid header: version=${version}, rowStride=${rowStride}`);
  }

  const offsetsStart = COMPACT_SEARCH_HEADER_BYTES;
  const rowsStart = offsetsStart + stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const stringTableStart = rowsStart + rowsBytes;
  if (stringTableStart > payloadBuffer.byteLength) {
    throw new Error(`compact search pack exceeds payload bounds: rows=${itemCount}, strings=${stringCount}, bytes=${payloadBuffer.byteLength}`);
  }

  const stringTableBytes = bytes.subarray(stringTableStart);
  const strings: string[] = new Array(stringCount);
  for (let index = 0; index < stringCount; index += 1) {
    const offset = view.getUint32(offsetsStart + index * 4, true);
    strings[index] = readNullTerminatedString(stringTableBytes, offset);
  }

  const result = new Map<string, NativeRuntimeSearchItem>();
  for (let index = 0; index < itemCount; index += 1) {
    const rowOffset = rowsStart + index * rowStride * 4;
    const itemId = strings[view.getUint32(rowOffset, true)] ?? "";
    if (!itemId) continue;
    result.set(itemId, {
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
      popularityScore: view.getUint32(rowOffset + 40, true),
      searchRank: view.getUint32(rowOffset + 44, true),
      browserIndex: view.getUint32(rowOffset + 48, true),
    });
  }
  return result;
}

export function parseNativeSearchPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeSearchItem> {
  const compact = parseCompactSearchPack(payloadBuffer);
  if (!compact) {
    throw new Error("native search pack must use compact NEISRC2 binary encoding");
  }
  return compact;
}

const COMPACT_GROUP_MAGIC = "NEIGRP1\0";
const COMPACT_GROUP_HEADER_BYTES = 8 + 5 * 4;
const COMPACT_GROUP_ROW_STRIDE = 6;

function parseCompactGroupPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeGroup> | null {
  if (payloadBuffer.byteLength < COMPACT_GROUP_HEADER_BYTES) return null;
  const bytes = new Uint8Array(payloadBuffer);
  const magic = decodeAscii(bytes.subarray(0, 8));
  if (magic !== COMPACT_GROUP_MAGIC) return null;

  const view = new DataView(payloadBuffer);
  const version = view.getUint32(8, true);
  const groupCount = view.getUint32(12, true);
  const stringCount = view.getUint32(16, true);
  const memberCount = view.getUint32(20, true);
  const rowStride = view.getUint32(24, true);
  if (version !== 1 || rowStride !== COMPACT_GROUP_ROW_STRIDE) {
    throw new Error(`compact group pack has invalid header: version=${version}, rowStride=${rowStride}`);
  }

  const offsetsStart = COMPACT_GROUP_HEADER_BYTES;
  const rowsStart = offsetsStart + stringCount * 4;
  const rowsBytes = groupCount * rowStride * 4;
  const membersStart = rowsStart + rowsBytes;
  const membersBytes = memberCount * 4;
  const stringTableStart = membersStart + membersBytes;
  if (stringTableStart > payloadBuffer.byteLength) {
    throw new Error(`compact group pack exceeds payload bounds: groups=${groupCount}, strings=${stringCount}, members=${memberCount}, bytes=${payloadBuffer.byteLength}`);
  }

  const stringTableBytes = bytes.subarray(stringTableStart);
  const strings: string[] = new Array(stringCount);
  for (let index = 0; index < stringCount; index += 1) {
    const offset = view.getUint32(offsetsStart + index * 4, true);
    strings[index] = readNullTerminatedString(stringTableBytes, offset);
  }

  const result = new Map<string, NativeRuntimeGroup>();
  for (let index = 0; index < groupCount; index += 1) {
    const rowOffset = rowsStart + index * rowStride * 4;
    const groupKey = strings[view.getUint32(rowOffset, true)] ?? "";
    if (!groupKey) continue;
    const memberStart = view.getUint32(rowOffset + 12, true);
    const rowMemberCount = view.getUint32(rowOffset + 16, true);
    const members: string[] = [];
    for (let memberIndex = 0; memberIndex < rowMemberCount; memberIndex += 1) {
      const absoluteMemberIndex = memberStart + memberIndex;
      if (absoluteMemberIndex >= memberCount) break;
      const member = strings[view.getUint32(membersStart + absoluteMemberIndex * 4, true)] ?? "";
      if (member) members.push(member);
    }
    result.set(groupKey, {
      groupKey,
      groupLabel: strings[view.getUint32(rowOffset + 4, true)] ?? null,
      groupSize: view.getUint32(rowOffset + 20, true) || members.length,
      representativeItemId: strings[view.getUint32(rowOffset + 8, true)] || members[0] || null,
      memberItemIds: members,
    });
  }
  return result;
}
export function parseNativeGroupPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeGroup> {
  const compact = parseCompactGroupPack(payloadBuffer);
  if (!compact) {
    throw new Error("native group pack must use compact NEIGRP1 binary encoding");
  }
  return compact;
}

export function parseNativeStringPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeStringItem> {
  const compact = parseCompactStringPack(payloadBuffer);
  if (!compact) {
    throw new Error("native string pack must use compact NEISTR1 binary encoding");
  }
  return compact;
}

const COMPACT_TEXTURE_MAGIC = "NEITEX1\0";
const COMPACT_TEXTURE_HEADER_BYTES = 8 + 6 * 4;
const COMPACT_TEXTURE_ROW_STRIDE = 10;
const COMPACT_TEXTURE_FRAME_STRIDE = 5;

function parseCompactTexturePack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeTextureItem> | null {
  if (payloadBuffer.byteLength < COMPACT_TEXTURE_HEADER_BYTES) return null;
  const bytes = new Uint8Array(payloadBuffer);
  const magic = decodeAscii(bytes.subarray(0, 8));
  if (magic !== COMPACT_TEXTURE_MAGIC) return null;

  const view = new DataView(payloadBuffer);
  const version = view.getUint32(8, true);
  const itemCount = view.getUint32(12, true);
  const stringCount = view.getUint32(16, true);
  const frameCount = view.getUint32(20, true);
  const rowStride = view.getUint32(24, true);
  const frameStride = view.getUint32(28, true);
  if (version !== 1 || rowStride !== COMPACT_TEXTURE_ROW_STRIDE || frameStride !== COMPACT_TEXTURE_FRAME_STRIDE) {
    throw new Error(`compact texture pack has invalid header: version=${version}, rowStride=${rowStride}, frameStride=${frameStride}`);
  }

  const offsetsStart = COMPACT_TEXTURE_HEADER_BYTES;
  const rowsStart = offsetsStart + stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const framesStart = rowsStart + rowsBytes;
  const framesBytes = frameCount * frameStride * 4;
  const stringTableStart = framesStart + framesBytes;
  if (stringTableStart > payloadBuffer.byteLength) {
    throw new Error(`compact texture pack exceeds payload bounds: rows=${itemCount}, strings=${stringCount}, frames=${frameCount}, bytes=${payloadBuffer.byteLength}`);
  }

  const stringTableBytes = bytes.subarray(stringTableStart);
  const strings: string[] = new Array(stringCount);
  for (let index = 0; index < stringCount; index += 1) {
    const offset = view.getUint32(offsetsStart + index * 4, true);
    strings[index] = readNullTerminatedString(stringTableBytes, offset);
  }

  const result = new Map<string, NativeRuntimeTextureItem>();
  for (let index = 0; index < itemCount; index += 1) {
    const rowOffset = rowsStart + index * rowStride * 4;
    const itemId = strings[view.getUint32(rowOffset, true)] ?? "";
    if (!itemId) continue;
    const staticAtlasFile = strings[view.getUint32(rowOffset + 4, true)] ?? "";
    const staticWidth = view.getUint32(rowOffset + 16, true);
    const staticHeight = view.getUint32(rowOffset + 20, true);
    const animatedAtlasFile = strings[view.getUint32(rowOffset + 24, true)] ?? "";
    const frameStart = view.getUint32(rowOffset + 28, true);
    const rowFrameCount = view.getUint32(rowOffset + 32, true);
    const frameDurationMs = view.getUint32(rowOffset + 36, true);
    const frames: NativeRuntimeAtlasFrame[] = [];
    const timeline: NativeRuntimeTimelineFrame[] = [];
    for (let frameIndex = 0; frameIndex < rowFrameCount; frameIndex += 1) {
      const absoluteFrameIndex = frameStart + frameIndex;
      if (absoluteFrameIndex >= frameCount) break;
      const frameOffset = framesStart + absoluteFrameIndex * frameStride * 4;
      const width = view.getUint32(frameOffset + 8, true);
      const height = view.getUint32(frameOffset + 12, true);
      if (width <= 0 || height <= 0) continue;
      frames.push({
        index: frameIndex,
        x: view.getUint32(frameOffset, true),
        y: view.getUint32(frameOffset + 4, true),
        width,
        height,
      });
      timeline.push({
        frameIndex,
        durationMs: Math.max(16, view.getUint32(frameOffset + 16, true) || frameDurationMs || 50),
      });
    }
    result.set(itemId, {
      itemId,
      rowIndex: index,
      staticAtlas: staticAtlasFile && staticWidth > 0 && staticHeight > 0 ? {
        atlasFile: staticAtlasFile,
        x: view.getUint32(rowOffset + 8, true),
        y: view.getUint32(rowOffset + 12, true),
        width: staticWidth,
        height: staticHeight,
      } : null,
      animatedAtlas: animatedAtlasFile && frames.length > 0 ? {
        atlasFile: animatedAtlasFile,
        frames,
        timeline,
        frameDurationMs: frameDurationMs || null,
      } : null,
    });
  }
  return result;
}
export function parseNativeTexturePack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeTextureItem> {
  const compact = parseCompactTexturePack(payloadBuffer);
  if (!compact) {
    throw new Error("native texture pack must use compact NEITEX1 binary encoding");
  }
  return compact;
}


const COMPACT_ANIMATION_MAGIC = "NEIANM1\0";
const COMPACT_ANIMATION_HEADER_BYTES = 8 + 6 * 4;
const COMPACT_ANIMATION_ROW_STRIDE = 5;
const COMPACT_ANIMATION_FRAME_STRIDE = 2;

function parseCompactAnimationPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeAnimationItem> | null {
  if (payloadBuffer.byteLength < COMPACT_ANIMATION_HEADER_BYTES) return null;
  const bytes = new Uint8Array(payloadBuffer);
  const magic = decodeAscii(bytes.subarray(0, 8));
  if (magic !== COMPACT_ANIMATION_MAGIC) return null;

  const view = new DataView(payloadBuffer);
  const version = view.getUint32(8, true);
  const itemCount = view.getUint32(12, true);
  const stringCount = view.getUint32(16, true);
  const frameCount = view.getUint32(20, true);
  const rowStride = view.getUint32(24, true);
  const frameStride = view.getUint32(28, true);
  if (version !== 1 || rowStride !== COMPACT_ANIMATION_ROW_STRIDE || frameStride !== COMPACT_ANIMATION_FRAME_STRIDE) {
    throw new Error(`compact animation pack has invalid header: version=${version}, rowStride=${rowStride}, frameStride=${frameStride}`);
  }

  const offsetsStart = COMPACT_ANIMATION_HEADER_BYTES;
  const rowsStart = offsetsStart + stringCount * 4;
  const rowsBytes = itemCount * rowStride * 4;
  const framesStart = rowsStart + rowsBytes;
  const framesBytes = frameCount * frameStride * 4;
  const stringTableStart = framesStart + framesBytes;
  if (stringTableStart > payloadBuffer.byteLength) {
    throw new Error(`compact animation pack exceeds payload bounds: rows=${itemCount}, strings=${stringCount}, frames=${frameCount}, bytes=${payloadBuffer.byteLength}`);
  }

  const stringTableBytes = bytes.subarray(stringTableStart);
  const strings: string[] = new Array(stringCount);
  for (let index = 0; index < stringCount; index += 1) {
    const offset = view.getUint32(offsetsStart + index * 4, true);
    strings[index] = readNullTerminatedString(stringTableBytes, offset);
  }

  const result = new Map<string, NativeRuntimeAnimationItem>();
  for (let index = 0; index < itemCount; index += 1) {
    const rowOffset = rowsStart + index * rowStride * 4;
    const itemId = strings[view.getUint32(rowOffset, true)] ?? "";
    if (!itemId) continue;
    const atlasFile = strings[view.getUint32(rowOffset + 4, true)] ?? "";
    const frameStart = view.getUint32(rowOffset + 8, true);
    const rowFrameCount = view.getUint32(rowOffset + 12, true);
    const frameDurationMs = view.getUint32(rowOffset + 16, true);
    const timeline: NativeRuntimeTimelineFrame[] = [];
    for (let frameIndex = 0; frameIndex < rowFrameCount; frameIndex += 1) {
      const absoluteFrameIndex = frameStart + frameIndex;
      if (absoluteFrameIndex >= frameCount) break;
      const frameOffset = framesStart + absoluteFrameIndex * frameStride * 4;
      timeline.push({
        frameIndex: view.getUint32(frameOffset, true),
        durationMs: Math.max(16, view.getUint32(frameOffset + 4, true) || frameDurationMs || 50),
      });
    }
    result.set(itemId, {
      itemId,
      rowIndex: index,
      atlasFile,
      timeline,
      frameDurationMs: frameDurationMs || null,
    });
  }
  return result;
}
export function parseNativeAnimationPack(payloadBuffer: ArrayBuffer): Map<string, NativeRuntimeAnimationItem> {
  const compact = parseCompactAnimationPack(payloadBuffer);
  if (!compact) {
    throw new Error("native animation pack must use compact NEIANM1 binary encoding");
  }
  return compact;
}


