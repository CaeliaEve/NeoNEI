import {
  RUNTIME_RECIPE_PACK_PAYLOAD_MAGIC,
  RUNTIME_RECIPE_PACK_PAYLOAD_VERSION,
  RUNTIME_RECIPE_PACK_SCHEMA,
  decodeNativeRuntimePackUtf8,
  unwrapNativeRuntimePackEnvelope,
} from './native-runtime-pack-abi';

export type RuntimeRecipeRef = {
  recipeId: string;
  categoryId: string;
  displayName: string;
};

export type RuntimeRecipeUiPayloadIndexEntry = {
  recipeId: string;
  path: string;
  payloadKey?: string;
  captureKey?: string;
  recipeType?: string;
  machineType?: string;
  handlerKey?: string;
};

export type RuntimeRecipeItemIndexEntry = {
  itemId: string;
  producedBy?: RuntimeRecipeRef[];
  usedIn?: RuntimeRecipeRef[];
};

export type RuntimeRecipeCategory = {
  categoryId: string;
  displayName: string;
  recipeCount: number;
  machineIcon?: { itemId?: string; renderAssetRef?: string } | null;
};

export type ParsedRuntimeRecipePack = {
  itemIndex: RuntimeRecipeItemIndexEntry[];
  uiPayloadIndex: RuntimeRecipeUiPayloadIndexEntry[];
  categoryIndex: RuntimeRecipeCategory[];
};

function compactString(strings: string[], index: number): string {
  return strings[index] ?? '';
}

export function parseRuntimeRecipePack(buffer: Buffer): ParsedRuntimeRecipePack {
  buffer = unwrapNativeRuntimePackEnvelope(
    buffer,
    RUNTIME_RECIPE_PACK_SCHEMA,
    'Native binary recipe envelope',
  ).payload;
  if (buffer.byteLength < 52) {
    throw new Error(`Runtime recipe pack is too small: ${buffer.byteLength}`);
  }
  const magic = decodeNativeRuntimePackUtf8(buffer, 0, 8);
  if (magic !== RUNTIME_RECIPE_PACK_PAYLOAD_MAGIC) {
    throw new Error(`Runtime recipe pack magic mismatch: ${magic}`);
  }
  const version = buffer.readUInt32LE(8);
  if (version !== RUNTIME_RECIPE_PACK_PAYLOAD_VERSION) {
    throw new Error(`Runtime recipe pack version mismatch: ${version}`);
  }
  const stringCount = buffer.readUInt32LE(12);
  const itemCount = buffer.readUInt32LE(16);
  const refCount = buffer.readUInt32LE(20);
  const uiCount = buffer.readUInt32LE(24);
  const categoryCount = buffer.readUInt32LE(28);
  const categorySourceCount = buffer.readUInt32LE(32);
  const itemStride = buffer.readUInt32LE(36);
  const refStride = buffer.readUInt32LE(40);
  const uiStride = buffer.readUInt32LE(44);
  const categoryStride = buffer.readUInt32LE(48);
  if (itemStride < 5 || refStride < 3 || uiStride < 7 || categoryStride < 5) {
    throw new Error(`Runtime recipe pack stride mismatch: item=${itemStride}, ref=${refStride}, ui=${uiStride}, category=${categoryStride}`);
  }

  let cursor = 52;
  const bytesNeeded = (count: number, stride = 1) => count * stride * 4;
  const stringOffsetsStart = cursor;
  cursor += bytesNeeded(stringCount);
  const itemRowsStart = cursor;
  cursor += bytesNeeded(itemCount, itemStride);
  const refRowsStart = cursor;
  cursor += bytesNeeded(refCount, refStride);
  const uiRowsStart = cursor;
  cursor += bytesNeeded(uiCount, uiStride);
  const categoryRowsStart = cursor;
  cursor += bytesNeeded(categoryCount, categoryStride);
  const categorySourcesStart = cursor;
  cursor += bytesNeeded(categorySourceCount);
  const stringsStart = cursor;
  if (stringsStart > buffer.byteLength) {
    throw new Error(`Runtime recipe pack table exceeds payload length: ${stringsStart}/${buffer.byteLength}`);
  }

  const strings: string[] = [];
  for (let index = 0; index < stringCount; index += 1) {
    const offset = buffer.readUInt32LE(stringOffsetsStart + index * 4);
    const start = stringsStart + offset;
    if (start >= buffer.byteLength) {
      strings.push('');
      continue;
    }
    let end = start;
    while (end < buffer.byteLength && buffer[end] !== 0) end += 1;
    strings.push(decodeNativeRuntimePackUtf8(buffer, start, end - start));
  }

  const readRowValue = (start: number, row: number, stride: number, column: number): number => (
    buffer.readUInt32LE(start + (row * stride + column) * 4)
  );
  const readRef = (row: number): RuntimeRecipeRef => {
    if (row < 0 || row >= refCount) {
      return { recipeId: '', categoryId: '', displayName: '' };
    }
    return {
      recipeId: compactString(strings, readRowValue(refRowsStart, row, refStride, 0)),
      categoryId: compactString(strings, readRowValue(refRowsStart, row, refStride, 1)),
      displayName: compactString(strings, readRowValue(refRowsStart, row, refStride, 2)),
    };
  };

  const itemIndex: RuntimeRecipeItemIndexEntry[] = [];
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

  const uiPayloadIndex: RuntimeRecipeUiPayloadIndexEntry[] = [];
  for (let row = 0; row < uiCount; row += 1) {
    const recipeId = compactString(strings, readRowValue(uiRowsStart, row, uiStride, 0));
    const payloadPath = compactString(strings, readRowValue(uiRowsStart, row, uiStride, 1));
    if (!recipeId || !payloadPath) continue;
    uiPayloadIndex.push({
      recipeId,
      path: payloadPath,
      payloadKey: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 2)) || undefined,
      captureKey: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 3)) || undefined,
      recipeType: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 4)) || undefined,
      machineType: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 5)) || undefined,
      handlerKey: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 6)) || undefined,
    });
  }

  const categoryIndex: RuntimeRecipeCategory[] = [];
  for (let row = 0; row < categoryCount; row += 1) {
    const categoryId = compactString(strings, readRowValue(categoryRowsStart, row, categoryStride, 0));
    if (!categoryId) continue;
    const sourceStart = readRowValue(categoryRowsStart, row, categoryStride, 3);
    const sourceCount = readRowValue(categoryRowsStart, row, categoryStride, 4);
    for (let offset = 0; offset < sourceCount; offset += 1) {
      const sourceRow = sourceStart + offset;
      if (sourceRow >= categorySourceCount) break;
      buffer.readUInt32LE(categorySourcesStart + sourceRow * 4);
    }
    const itemId = categoryStride >= 7 ? compactString(strings, readRowValue(categoryRowsStart, row, categoryStride, 5)) : '';
    const renderAssetRef = categoryStride >= 7 ? compactString(strings, readRowValue(categoryRowsStart, row, categoryStride, 6)) : '';
    categoryIndex.push({
      categoryId,
      displayName: compactString(strings, readRowValue(categoryRowsStart, row, categoryStride, 1)) || categoryId,
      recipeCount: readRowValue(categoryRowsStart, row, categoryStride, 2),
      machineIcon: itemId || renderAssetRef ? { ...(itemId ? { itemId } : {}), ...(renderAssetRef ? { renderAssetRef } : {}) } : null,
    });
  }

  return { itemIndex, uiPayloadIndex, categoryIndex };
}
