import { decodeBinaryUtf8 } from "./distDataNativeBinaryPack";

type CompactRecipeRef = {
  recipeId: string;
  categoryId: string;
  displayName: string;
};

export type CompactRecipeItemIndexEntry = {
  itemId: string;
  producedBy?: CompactRecipeRef[];
  usedIn?: CompactRecipeRef[];
};

export type CompactRecipeUiPayloadIndexEntry = {
  recipeId: string;
  path: string;
  payloadKey?: string;
  captureKey?: string;
  recipeType?: string;
  machineType?: string;
};

export type CompactRecipeCategoryEntry = {
  categoryId?: string;
  recipeCount?: number;
  displayName?: string;
  sourceCategoryIds?: string[];
  handler?: Record<string, unknown> | null;
  nativeLayout?: Record<string, unknown> | null;
  machineIcon?: {
    itemId?: string;
    renderAssetRef?: string;
  } | null;
};

export type CompactRecipePackPayload = {
  schemaVersion?: string;
  itemIndex?: CompactRecipeItemIndexEntry[];
  uiPayloadIndex?: CompactRecipeUiPayloadIndexEntry[];
  categoryIndex?: CompactRecipeCategoryEntry[];
  recipes?: unknown[];
  handlers?: unknown[];
};

const COMPACT_RECIPE_MAGIC = "NEIRCP1\0";

function compactRecipeString(strings: string[], index: number): string {
  return strings[index] ?? "";
}

export function parseCompactRecipePayload(payload: ArrayBuffer): CompactRecipePackPayload {
  if (payload.byteLength < 52) {
    throw new Error(`Compact recipe payload is too small: ${payload.byteLength}`);
  }
  const view = new DataView(payload);
  const magic = decodeBinaryUtf8(payload, 0, 8);
  if (magic !== COMPACT_RECIPE_MAGIC) {
    throw new Error(`Compact recipe magic mismatch: ${magic}`);
  }
  const version = view.getUint32(8, true);
  if (version !== 1) {
    throw new Error(`Compact recipe version mismatch: ${version}`);
  }
  const stringCount = view.getUint32(12, true);
  const itemCount = view.getUint32(16, true);
  const refCount = view.getUint32(20, true);
  const uiCount = view.getUint32(24, true);
  const categoryCount = view.getUint32(28, true);
  const categorySourceCount = view.getUint32(32, true);
  const itemStride = view.getUint32(36, true);
  const refStride = view.getUint32(40, true);
  const uiStride = view.getUint32(44, true);
  const categoryStride = view.getUint32(48, true);
  if (itemStride < 5 || refStride < 3 || uiStride < 7 || categoryStride < 5) {
    throw new Error(`Compact recipe stride mismatch: item=${itemStride}, ref=${refStride}, ui=${uiStride}, category=${categoryStride}`);
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
  if (stringsStart > payload.byteLength) {
    throw new Error(`Compact recipe table exceeds payload length: ${stringsStart}/${payload.byteLength}`);
  }

  const strings: string[] = [];
  const bytes = new Uint8Array(payload);
  for (let index = 0; index < stringCount; index += 1) {
    const offset = view.getUint32(stringOffsetsStart + index * 4, true);
    const start = stringsStart + offset;
    if (start >= payload.byteLength) {
      strings.push("");
      continue;
    }
    let end = start;
    while (end < payload.byteLength && bytes[end] !== 0) {
      end += 1;
    }
    strings.push(decodeBinaryUtf8(payload, start, end - start));
  }

  const readRowValue = (start: number, row: number, stride: number, column: number): number => (
    view.getUint32(start + (row * stride + column) * 4, true)
  );
  const readRef = (row: number): CompactRecipeRef => {
    if (row < 0 || row >= refCount) {
      return { recipeId: "", categoryId: "", displayName: "" };
    }
    return {
      recipeId: compactRecipeString(strings, readRowValue(refRowsStart, row, refStride, 0)),
      categoryId: compactRecipeString(strings, readRowValue(refRowsStart, row, refStride, 1)),
      displayName: compactRecipeString(strings, readRowValue(refRowsStart, row, refStride, 2)),
    };
  };

  const itemIndex: CompactRecipeItemIndexEntry[] = [];
  for (let row = 0; row < itemCount; row += 1) {
    const itemId = compactRecipeString(strings, readRowValue(itemRowsStart, row, itemStride, 0));
    const producedStart = readRowValue(itemRowsStart, row, itemStride, 1);
    const producedCount = readRowValue(itemRowsStart, row, itemStride, 2);
    const usedStart = readRowValue(itemRowsStart, row, itemStride, 3);
    const usedCount = readRowValue(itemRowsStart, row, itemStride, 4);
    if (!itemId) continue;
    const producedBy = Array.from({ length: producedCount }, (_, offset) => readRef(producedStart + offset)).filter((entry) => entry.recipeId);
    const usedIn = Array.from({ length: usedCount }, (_, offset) => readRef(usedStart + offset)).filter((entry) => entry.recipeId);
    itemIndex.push({ itemId, producedBy, usedIn });
  }

  const uiPayloadIndex: CompactRecipeUiPayloadIndexEntry[] = [];
  for (let row = 0; row < uiCount; row += 1) {
    const recipeId = compactRecipeString(strings, readRowValue(uiRowsStart, row, uiStride, 0));
    const path = compactRecipeString(strings, readRowValue(uiRowsStart, row, uiStride, 1));
    if (!recipeId || !path) continue;
    uiPayloadIndex.push({
      recipeId,
      path,
      payloadKey: compactRecipeString(strings, readRowValue(uiRowsStart, row, uiStride, 2)) || undefined,
      captureKey: compactRecipeString(strings, readRowValue(uiRowsStart, row, uiStride, 3)) || undefined,
      recipeType: compactRecipeString(strings, readRowValue(uiRowsStart, row, uiStride, 4)) || undefined,
      machineType: compactRecipeString(strings, readRowValue(uiRowsStart, row, uiStride, 5)) || undefined,
    });
  }

  const categoryIndex: CompactRecipeCategoryEntry[] = [];
  for (let row = 0; row < categoryCount; row += 1) {
    const categoryId = compactRecipeString(strings, readRowValue(categoryRowsStart, row, categoryStride, 0));
    if (!categoryId) continue;
    const sourceStart = readRowValue(categoryRowsStart, row, categoryStride, 3);
    const sourceCount = readRowValue(categoryRowsStart, row, categoryStride, 4);
    const sourceCategoryIds = Array.from({ length: sourceCount }, (_, offset) => {
      const sourceRow = sourceStart + offset;
      if (sourceRow < 0 || sourceRow >= categorySourceCount) return "";
      return compactRecipeString(strings, view.getUint32(categorySourcesStart + sourceRow * 4, true));
    }).filter(Boolean);
    categoryIndex.push({
      categoryId,
      displayName: compactRecipeString(strings, readRowValue(categoryRowsStart, row, categoryStride, 1)) || categoryId,
      recipeCount: readRowValue(categoryRowsStart, row, categoryStride, 2),
      sourceCategoryIds,
      machineIcon: categoryStride >= 7
        ? (() => {
            const itemId = compactRecipeString(strings, readRowValue(categoryRowsStart, row, categoryStride, 5));
            const renderAssetRef = compactRecipeString(strings, readRowValue(categoryRowsStart, row, categoryStride, 6));
            return itemId || renderAssetRef ? { ...(itemId ? { itemId } : {}), ...(renderAssetRef ? { renderAssetRef } : {}) } : null;
          })()
        : null,
    });
  }

  return { schemaVersion: "neonei/recipe-pack/current", itemIndex, uiPayloadIndex, categoryIndex };
}
