import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const NATIVE_RUNTIME_PACK_MAGIC = 'NNEIBIN\0';
export const NATIVE_RUNTIME_PACK_VERSION = 1;
export const NATIVE_RUNTIME_PACK_HEADER_BYTES = 24;

const PACK_SCHEMAS = Object.freeze({
  browser: 'neonei/browser-pack/current',
  groups: 'neonei/group-pack/current',
  search: 'neonei/search-pack/current',
  recipes: 'neonei/recipe-pack/current',
  textures: 'neonei/texture-pack/current',
});

const PAYLOAD_MAGICS = Object.freeze({
  browser: 'NEIBRW1\0',
  groups: 'NEIGRP1\0',
  search: 'NEISRC2\0',
  recipes: 'NEIRCP1\0',
  textures: 'NEITEX1\0',
});

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readAscii(bytes, offset, length) {
  return bytes.subarray(offset, offset + length).toString('utf8');
}

function readU32(bytes, offset, label) {
  if (offset + 4 > bytes.length) {
    throw new Error(`${label} exceeds payload bounds at ${offset}/${bytes.length}`);
  }
  return bytes.readUInt32LE(offset);
}

function readU64(bytes, offset, label) {
  if (offset + 8 > bytes.length) {
    throw new Error(`${label} exceeds payload bounds at ${offset}/${bytes.length}`);
  }
  return bytes.readBigUInt64LE(offset);
}

export function readNativeRuntimePayload(distDataDir, relativePath, options = {}) {
  const {
    label = 'native runtime pack',
    expectedSchema = null,
    optional = false,
  } = options;
  const path = `${relativePath ?? ''}`.trim();
  if (!hasText(path)) {
    if (optional) return null;
    throw new Error(`dist-data manifest must declare ${label}`);
  }
  const filePath = join(distDataDir, path);
  if (!existsSync(filePath)) {
    if (optional) return null;
    throw new Error(`Missing native runtime pack ${label}: ${filePath}`);
  }

  const bytes = readFileSync(filePath);
  if (bytes.length < NATIVE_RUNTIME_PACK_HEADER_BYTES) {
    throw new Error(`${label} is too small: ${bytes.length}`);
  }
  const magic = readAscii(bytes, 0, 8);
  const version = readU32(bytes, 8, `${label} version`);
  const schemaLength = readU32(bytes, 12, `${label} schema length`);
  const payloadLength = Number(readU64(bytes, 16, `${label} payload length`));
  const schemaStart = NATIVE_RUNTIME_PACK_HEADER_BYTES;
  const schemaEnd = schemaStart + schemaLength;
  const payloadEnd = schemaEnd + payloadLength;

  if (magic !== NATIVE_RUNTIME_PACK_MAGIC) {
    throw new Error(`${label} magic mismatch: ${magic}`);
  }
  if (version !== NATIVE_RUNTIME_PACK_VERSION) {
    throw new Error(`${label} version mismatch: ${version}`);
  }
  if (schemaEnd > bytes.length || payloadEnd !== bytes.length) {
    throw new Error(`${label} length mismatch: schema=${schemaLength}, payload=${payloadLength}, bytes=${bytes.length}`);
  }
  const schema = readAscii(bytes, schemaStart, schemaLength);
  if (expectedSchema && schema !== expectedSchema) {
    throw new Error(`${label} schema mismatch: expected ${expectedSchema}, got ${schema}`);
  }

  return {
    path,
    filePath,
    schema,
    bytes: bytes.length,
    payload: bytes.subarray(schemaEnd, payloadEnd),
  };
}

function assertPayloadHeader(bytes, domain, relativePath) {
  if (bytes.length < 12) {
    throw new Error(`${domain} payload is too small: ${relativePath}`);
  }
  const magic = readAscii(bytes, 0, 8);
  if (magic !== PAYLOAD_MAGICS[domain]) {
    throw new Error(`Invalid ${domain} payload magic for ${relativePath}: ${magic}`);
  }
  const version = readU32(bytes, 8, `${domain} payload version`);
  if (version !== 1) {
    throw new Error(`Invalid ${domain} payload version for ${relativePath}: ${version}`);
  }
}

export function readCompactString(bytes, baseOffset, relativeOffset) {
  const start = baseOffset + relativeOffset;
  if (start >= bytes.length) return '';
  let end = start;
  while (end < bytes.length && bytes[end] !== 0) end += 1;
  return bytes.subarray(start, end).toString('utf8');
}

export function parseCompactStringOffsets(bytes, offset, stringCount) {
  const offsets = [];
  for (let index = 0; index < stringCount; index += 1) {
    offsets.push(readU32(bytes, offset + index * 4, 'compact string offset'));
  }
  return offsets;
}

function makeStringReader(bytes, offsets, stringsBase) {
  return (ref) => readCompactString(bytes, stringsBase, offsets[ref] ?? 0);
}

function parseCommonTableHeader(bytes, domain, relativePath, headerBytes) {
  assertPayloadHeader(bytes, domain, relativePath);
  if (bytes.length < headerBytes) {
    throw new Error(`${domain} compact header exceeds payload bounds: ${relativePath}`);
  }
}

export function parseNativeBrowserBin(distDataDir, relativePath, options = {}) {
  const envelope = readNativeRuntimePayload(distDataDir, relativePath, {
    label: 'rustBrowserBin',
    expectedSchema: PACK_SCHEMAS.browser,
    ...options,
  });
  if (!envelope) return null;

  const bytes = envelope.payload;
  parseCommonTableHeader(bytes, 'browser', envelope.path, 24);
  const rowCount = readU32(bytes, 12, 'browser row count');
  const stringCount = readU32(bytes, 16, 'browser string count');
  const rowStride = readU32(bytes, 20, 'browser row stride');
  const offsets = parseCompactStringOffsets(bytes, 24, stringCount);
  const rowOffset = 24 + stringCount * 4;
  const stringsBase = rowOffset + rowCount * rowStride * 4;
  const stringAt = makeStringReader(bytes, offsets, stringsBase);
  const items = [];
  for (let row = 0; row < rowCount; row += 1) {
    const base = rowOffset + row * rowStride * 4;
    items.push({
      itemId: stringAt(readU32(bytes, base, 'browser item id ref')),
      localizedName: stringAt(readU32(bytes, base + 4, 'browser localized name ref')),
      modId: stringAt(readU32(bytes, base + 8, 'browser mod id ref')),
      groupKey: stringAt(readU32(bytes, base + 12, 'browser group key ref')),
      browserOrder: readU32(bytes, base + 16, 'browser order'),
      flags: readU32(bytes, base + 20, 'browser flags'),
    });
  }
  return { items, path: envelope.path, rowCount, stringCount, rowStride };
}

export function parseNativeGroupsBin(distDataDir, relativePath, options = {}) {
  const envelope = readNativeRuntimePayload(distDataDir, relativePath, {
    label: 'rustGroupsBin',
    expectedSchema: PACK_SCHEMAS.groups,
    ...options,
  });
  if (!envelope) return null;

  const bytes = envelope.payload;
  parseCommonTableHeader(bytes, 'groups', envelope.path, 28);
  const rowCount = readU32(bytes, 12, 'groups row count');
  const stringCount = readU32(bytes, 16, 'groups string count');
  const memberCount = readU32(bytes, 20, 'groups member count');
  const rowStride = readU32(bytes, 24, 'groups row stride');
  const offsets = parseCompactStringOffsets(bytes, 28, stringCount);
  const rowOffset = 28 + stringCount * 4;
  const memberOffset = rowOffset + rowCount * rowStride * 4;
  const stringsBase = memberOffset + memberCount * 4;
  const stringAt = makeStringReader(bytes, offsets, stringsBase);
  const memberRefs = [];
  for (let index = 0; index < memberCount; index += 1) {
    memberRefs.push(readU32(bytes, memberOffset + index * 4, 'groups member ref'));
  }

  const groups = [];
  for (let row = 0; row < rowCount; row += 1) {
    const base = rowOffset + row * rowStride * 4;
    const memberStart = readU32(bytes, base + 12, 'groups member start');
    const memberLength = readU32(bytes, base + 16, 'groups member length');
    groups.push({
      groupKey: stringAt(readU32(bytes, base, 'groups key ref')),
      groupLabel: stringAt(readU32(bytes, base + 4, 'groups label ref')),
      representativeItemId: stringAt(readU32(bytes, base + 8, 'groups representative ref')),
      memberItemIds: memberRefs.slice(memberStart, memberStart + memberLength).map(stringAt),
      groupSize: readU32(bytes, base + 20, 'groups size'),
      groupSource: 'native/groups.bin',
    });
  }
  return { groups, path: envelope.path, rowCount, stringCount, memberCount, rowStride };
}

export function parseNativeSearchBin(distDataDir, relativePath, options = {}) {
  const envelope = readNativeRuntimePayload(distDataDir, relativePath, {
    label: 'rustSearchBin',
    expectedSchema: PACK_SCHEMAS.search,
    ...options,
  });
  if (!envelope) return null;

  const bytes = envelope.payload;
  parseCommonTableHeader(bytes, 'search', envelope.path, 24);
  const rowCount = readU32(bytes, 12, 'search row count');
  const stringCount = readU32(bytes, 16, 'search string count');
  const rowStride = readU32(bytes, 20, 'search row stride');
  const offsets = parseCompactStringOffsets(bytes, 24, stringCount);
  const rowOffset = 24 + stringCount * 4;
  const stringsBase = rowOffset + rowCount * rowStride * 4;
  const stringAt = makeStringReader(bytes, offsets, stringsBase);
  const items = [];
  for (let row = 0; row < rowCount; row += 1) {
    const base = rowOffset + row * rowStride * 4;
    items.push({
      itemId: stringAt(readU32(bytes, base, 'search item id ref')),
      publicItemId: stringAt(readU32(bytes, base + 4, 'search public item id ref')),
      localizedName: stringAt(readU32(bytes, base + 8, 'search localized name ref')),
      modId: stringAt(readU32(bytes, base + 12, 'search mod id ref')),
      normalizedLocalizedName: stringAt(readU32(bytes, base + 16, 'search normalized localized ref')),
      normalizedInternalName: stringAt(readU32(bytes, base + 20, 'search normalized internal ref')),
      normalizedItemId: stringAt(readU32(bytes, base + 24, 'search normalized item ref')),
      normalizedSearchTerms: stringAt(readU32(bytes, base + 28, 'search normalized terms ref')),
      pinyinFull: stringAt(readU32(bytes, base + 32, 'search pinyin full ref')),
      pinyinAcronym: stringAt(readU32(bytes, base + 36, 'search pinyin acronym ref')),
      popularityScore: readU32(bytes, base + 40, 'search popularity score'),
      searchRank: readU32(bytes, base + 44, 'search rank'),
      browserIndex: readU32(bytes, base + 48, 'search browser index'),
      family: rowStride > 13 ? stringAt(readU32(bytes, base + 52, 'search family ref')) : '',
      groupKey: rowStride > 14 ? stringAt(readU32(bytes, base + 56, 'search group key ref')) : '',
      representativeItemId: rowStride > 15 ? stringAt(readU32(bytes, base + 60, 'search representative ref')) : '',
    });
  }
  return { items, path: envelope.path, rowCount, stringCount, rowStride };
}

export function parseNativeTexturesBin(distDataDir, relativePath, options = {}) {
  const envelope = readNativeRuntimePayload(distDataDir, relativePath, {
    label: 'rustTextureBin',
    expectedSchema: PACK_SCHEMAS.textures,
    ...options,
  });
  if (!envelope) return null;

  const bytes = envelope.payload;
  parseCommonTableHeader(bytes, 'textures', envelope.path, 32);
  const rowCount = readU32(bytes, 12, 'textures row count');
  const stringCount = readU32(bytes, 16, 'textures string count');
  const frameCount = readU32(bytes, 20, 'textures frame count');
  const rowStride = readU32(bytes, 24, 'textures row stride');
  const frameStride = readU32(bytes, 28, 'textures frame stride');
  const offsets = parseCompactStringOffsets(bytes, 32, stringCount);
  const rowOffset = 32 + stringCount * 4;
  const frameOffset = rowOffset + rowCount * rowStride * 4;
  const stringsBase = frameOffset + frameCount * frameStride * 4;
  const stringAt = makeStringReader(bytes, offsets, stringsBase);
  const frameRows = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const base = frameOffset + frame * frameStride * 4;
    frameRows.push({
      x: readU32(bytes, base, 'textures frame x'),
      y: readU32(bytes, base + 4, 'textures frame y'),
      width: readU32(bytes, base + 8, 'textures frame width'),
      height: readU32(bytes, base + 12, 'textures frame height'),
      durationMs: readU32(bytes, base + 16, 'textures frame duration'),
    });
  }
  const items = [];
  for (let row = 0; row < rowCount; row += 1) {
    const base = rowOffset + row * rowStride * 4;
    const staticAtlasFile = stringAt(readU32(bytes, base + 4, 'textures static atlas ref'));
    const animatedAtlasFile = stringAt(readU32(bytes, base + 24, 'textures animated atlas ref'));
    const frameStart = readU32(bytes, base + 28, 'textures frame start');
    const animatedFrameCount = readU32(bytes, base + 32, 'textures frame count');
    items.push({
      itemId: stringAt(readU32(bytes, base, 'textures item ref')),
      staticAtlas: staticAtlasFile ? {
        atlasFile: staticAtlasFile,
        x: readU32(bytes, base + 8, 'textures static x'),
        y: readU32(bytes, base + 12, 'textures static y'),
        width: readU32(bytes, base + 16, 'textures static width'),
        height: readU32(bytes, base + 20, 'textures static height'),
      } : null,
      animatedAtlas: animatedAtlasFile ? {
        atlasFile: animatedAtlasFile,
        frameStart,
        frameCount: animatedFrameCount,
        frameDurationMs: readU32(bytes, base + 36, 'textures frame duration'),
        frames: frameRows.slice(frameStart, frameStart + animatedFrameCount),
      } : null,
    });
  }
  return { items, path: envelope.path, rowCount, stringCount, frameCount, rowStride, frameStride };
}

function compactString(strings, index) {
  return strings[index] ?? '';
}

export function parseNativeRecipeBin(distDataDir, relativePath, options = {}) {
  const envelope = readNativeRuntimePayload(distDataDir, relativePath, {
    label: 'rustRecipeBin',
    expectedSchema: PACK_SCHEMAS.recipes,
    ...options,
  });
  if (!envelope) return null;

  const bytes = envelope.payload;
  parseCommonTableHeader(bytes, 'recipes', envelope.path, 52);
  const stringCount = readU32(bytes, 12, 'recipes string count');
  const itemCount = readU32(bytes, 16, 'recipes item count');
  const refCount = readU32(bytes, 20, 'recipes ref count');
  const uiCount = readU32(bytes, 24, 'recipes ui count');
  const categoryCount = readU32(bytes, 28, 'recipes category count');
  const categorySourceCount = readU32(bytes, 32, 'recipes category source count');
  const itemStride = readU32(bytes, 36, 'recipes item stride');
  const refStride = readU32(bytes, 40, 'recipes ref stride');
  const uiStride = readU32(bytes, 44, 'recipes ui stride');
  const categoryStride = readU32(bytes, 48, 'recipes category stride');
  if (itemStride < 5 || refStride < 3 || uiStride < 7 || categoryStride < 5) {
    throw new Error(`Invalid recipes.bin strides: item=${itemStride}, ref=${refStride}, ui=${uiStride}, category=${categoryStride}`);
  }

  let cursor = 52;
  const stringOffsetsStart = cursor;
  cursor += stringCount * 4;
  const itemRowsStart = cursor;
  cursor += itemCount * itemStride * 4;
  const refRowsStart = cursor;
  cursor += refCount * refStride * 4;
  const uiRowsStart = cursor;
  cursor += uiCount * uiStride * 4;
  const categoryRowsStart = cursor;
  cursor += categoryCount * categoryStride * 4;
  const categorySourcesStart = cursor;
  cursor += categorySourceCount * 4;
  const stringsStart = cursor;
  if (stringsStart > bytes.length) {
    throw new Error(`recipes.bin table exceeds payload length: ${stringsStart}/${bytes.length}`);
  }

  const offsets = parseCompactStringOffsets(bytes, stringOffsetsStart, stringCount);
  const strings = offsets.map((offset) => readCompactString(bytes, stringsStart, offset));
  const readRowValue = (start, row, stride, column) => readU32(bytes, start + (row * stride + column) * 4, 'recipes row value');
  const readRef = (row) => {
    if (row < 0 || row >= refCount) {
      return { recipeId: '', categoryId: '', displayName: '' };
    }
    return {
      recipeId: compactString(strings, readRowValue(refRowsStart, row, refStride, 0)),
      categoryId: compactString(strings, readRowValue(refRowsStart, row, refStride, 1)),
      displayName: compactString(strings, readRowValue(refRowsStart, row, refStride, 2)),
    };
  };

  const itemIndex = [];
  for (let row = 0; row < itemCount; row += 1) {
    const itemId = compactString(strings, readRowValue(itemRowsStart, row, itemStride, 0));
    if (!itemId) continue;
    const producedStart = readRowValue(itemRowsStart, row, itemStride, 1);
    const producedCount = readRowValue(itemRowsStart, row, itemStride, 2);
    const usedStart = readRowValue(itemRowsStart, row, itemStride, 3);
    const usedCount = readRowValue(itemRowsStart, row, itemStride, 4);
    itemIndex.push({
      itemId,
      producedBy: Array.from({ length: producedCount }, (_, offset) => readRef(producedStart + offset)).filter((entry) => entry.recipeId),
      usedIn: Array.from({ length: usedCount }, (_, offset) => readRef(usedStart + offset)).filter((entry) => entry.recipeId),
    });
  }

  const uiPayloadIndex = [];
  for (let row = 0; row < uiCount; row += 1) {
    const recipeId = compactString(strings, readRowValue(uiRowsStart, row, uiStride, 0));
    const path = compactString(strings, readRowValue(uiRowsStart, row, uiStride, 1));
    if (!recipeId || !path) continue;
    uiPayloadIndex.push({
      recipeId,
      path,
      payloadKey: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 2)) || undefined,
      familyKey: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 3)) || undefined,
      recipeType: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 4)) || undefined,
      machineType: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 5)) || undefined,
      handlerKey: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 6)) || undefined,
    });
  }

  const categoryIndex = [];
  for (let row = 0; row < categoryCount; row += 1) {
    const categoryId = compactString(strings, readRowValue(categoryRowsStart, row, categoryStride, 0));
    if (!categoryId) continue;
    const sourceStart = readRowValue(categoryRowsStart, row, categoryStride, 3);
    const sourceCount = readRowValue(categoryRowsStart, row, categoryStride, 4);
    const sourceCategoryIds = Array.from({ length: sourceCount }, (_, offset) => {
      const sourceRow = sourceStart + offset;
      if (sourceRow < 0 || sourceRow >= categorySourceCount) return '';
      return compactString(strings, readU32(bytes, categorySourcesStart + sourceRow * 4, 'recipes category source'));
    }).filter(Boolean);
    const itemId = categoryStride >= 7 ? compactString(strings, readRowValue(categoryRowsStart, row, categoryStride, 5)) : '';
    const renderAssetRef = categoryStride >= 7 ? compactString(strings, readRowValue(categoryRowsStart, row, categoryStride, 6)) : '';
    categoryIndex.push({
      categoryId,
      displayName: compactString(strings, readRowValue(categoryRowsStart, row, categoryStride, 1)) || categoryId,
      recipeCount: readRowValue(categoryRowsStart, row, categoryStride, 2),
      sourceCategoryIds,
      machineIcon: itemId || renderAssetRef ? { ...(itemId ? { itemId } : {}), ...(renderAssetRef ? { renderAssetRef } : {}) } : null,
    });
  }

  return {
    itemIndex,
    uiPayloadIndex,
    categoryIndex,
    path: envelope.path,
    header: {
      stringCount,
      itemCount,
      refCount,
      uiCount,
      categoryCount,
      categorySourceCount,
      itemStride,
      refStride,
      uiStride,
      categoryStride,
    },
  };
}
