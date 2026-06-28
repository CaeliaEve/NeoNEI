import fs from 'fs';
import path from 'path';
import { DIST_DATA_DIR } from '../config/runtime-paths';

type JsonRecord = Record<string, unknown>;

export type RuntimeRecipeRef = {
  recipeId: string;
  categoryId: string;
  displayName: string;
};

export type RuntimeRecipeItemQuery = {
  itemId: string;
  summary: {
    itemId: string;
    counts: {
      producedBy: number;
      usedIn: number;
      machineGroups: number;
    };
    categories: Array<{
      categoryId: string;
      displayName: string;
      recipeCount: number;
      machineIcon?: { itemId?: string; renderAssetRef?: string } | null;
    }>;
  };
  recipes: RuntimeRecipeRef[];
};

export type RuntimeRecipeUiPayloadIndexEntry = {
  recipeId: string;
  path: string;
  payloadKey?: string;
  familyKey?: string;
  recipeType?: string;
  machineType?: string;
  handlerKey?: string;
};

export type RuntimeRecipePage = {
  recipePageId: string;
  recipe: {
    id: string;
    recipeType: string;
    outputs: unknown[];
    inputs: unknown[];
    fluidInputs: unknown[];
    fluidOutputs: unknown[];
    machineInfo: JsonRecord | null;
    metadata: JsonRecord | null;
    additionalData: JsonRecord;
  };
  uiPayload: JsonRecord | null;
};

type RuntimeRecipePack = {
  signature: string;
  itemIndex: Array<{
    itemId: string;
    producedBy?: RuntimeRecipeRef[];
    usedIn?: RuntimeRecipeRef[];
  }>;
  uiPayloadIndex: RuntimeRecipeUiPayloadIndexEntry[];
  categoryIndex: RuntimeRecipeItemQuery['summary']['categories'];
};

const COMPACT_RECIPE_MAGIC = 'NEIRCP1\0';
const NATIVE_BINARY_PACK_MAGIC = 'NNEIBIN\0';
const RECIPE_PACK_SCHEMA = 'neonei/recipe-pack/current';

function readJson(filePath: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : null;
  } catch {
    return null;
  }
}

function readJsonRequired(filePath: string, label: string): JsonRecord {
  const parsed = readJson(filePath);
  if (!parsed) {
    throw new Error(`Runtime recipe ${label} is missing or invalid JSON: ${filePath}`);
  }
  return parsed;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function isPortableRuntimePath(value: string): boolean {
  return Boolean(value)
    && !value.startsWith('/')
    && !value.includes('\\')
    && !value.includes('..')
    && !path.isAbsolute(value)
    && !/^[A-Za-z]:[\\/]/.test(value);
}

function resolveDistDataFile(relativePath: string): string {
  const normalized = relativePath.trim().replace(/^\/+/, '');
  if (!isPortableRuntimePath(normalized)) {
    throw new Error(`Runtime recipe pack path must be portable and relative: ${relativePath}`);
  }
  const root = path.resolve(DIST_DATA_DIR);
  const resolved = path.resolve(root, ...normalized.split('/'));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Runtime recipe pack path escapes dist-data root: ${relativePath}`);
  }
  return resolved;
}

function decodeUtf8(buffer: Buffer, offset: number, length: number): string {
  return buffer.subarray(offset, offset + length).toString('utf8');
}

function unwrapNativeBinaryPackEnvelope(buffer: Buffer, expectedSchema: string): Buffer {
  const magic = decodeUtf8(buffer, 0, 8);
  if (magic !== NATIVE_BINARY_PACK_MAGIC) {
    return buffer;
  }
  if (buffer.byteLength < 24) {
    throw new Error(`Native binary recipe envelope is too small: ${buffer.byteLength}`);
  }
  const version = buffer.readUInt32LE(8);
  const schemaLength = buffer.readUInt32LE(12);
  const payloadLength = Number(buffer.readBigUInt64LE(16));
  const schemaStart = 24;
  const schemaEnd = schemaStart + schemaLength;
  const payloadEnd = schemaEnd + payloadLength;
  if (version !== 1) {
    throw new Error(`Native binary recipe envelope version mismatch: ${version}`);
  }
  if (schemaEnd > buffer.byteLength || payloadEnd !== buffer.byteLength) {
    throw new Error(`Native binary recipe envelope length mismatch: schema=${schemaLength}, payload=${payloadLength}, bytes=${buffer.byteLength}`);
  }
  const schema = decodeUtf8(buffer, schemaStart, schemaLength);
  if (schema !== expectedSchema) {
    throw new Error(`Native binary recipe envelope schema mismatch: expected ${expectedSchema}, got ${schema}`);
  }
  return buffer.subarray(schemaEnd, payloadEnd);
}

function compactString(strings: string[], index: number): string {
  return strings[index] ?? '';
}

function parseCompactRecipePack(buffer: Buffer): Omit<RuntimeRecipePack, 'signature'> {
  buffer = unwrapNativeBinaryPackEnvelope(buffer, RECIPE_PACK_SCHEMA);
  if (buffer.byteLength < 52) {
    throw new Error(`Runtime recipe pack is too small: ${buffer.byteLength}`);
  }
  const magic = decodeUtf8(buffer, 0, 8);
  if (magic !== COMPACT_RECIPE_MAGIC) {
    throw new Error(`Runtime recipe pack magic mismatch: ${magic}`);
  }
  const version = buffer.readUInt32LE(8);
  if (version !== 1) {
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
    strings.push(decodeUtf8(buffer, start, end - start));
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

  const itemIndex: RuntimeRecipePack['itemIndex'] = [];
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
      familyKey: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 3)) || undefined,
      recipeType: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 4)) || undefined,
      machineType: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 5)) || undefined,
      handlerKey: compactString(strings, readRowValue(uiRowsStart, row, uiStride, 6)) || undefined,
    });
  }

  const categoryIndex: RuntimeRecipePack['categoryIndex'] = [];
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

export class RuntimeRecipePackService {
  private cache: RuntimeRecipePack | null = null;

  private getRuntimeRecipePackPath(): { path: string; signature: string } {
    const distManifest = readJson(path.join(DIST_DATA_DIR, 'manifest.json'));
    const runtimeManifestPath = asString(asRecord(distManifest?.files)?.rustRuntimeManifest) ?? 'rust/runtime-manifest.json';
    const runtimeManifest = readJson(resolveDistDataFile(runtimeManifestPath));
    const recipePath = asString(asRecord(runtimeManifest?.entrypoints)?.recipes)
      ?? asString(asRecord(distManifest?.files)?.rustRecipeBin)
      ?? 'rust/recipes.bin';
    return {
      path: resolveDistDataFile(recipePath),
      signature: [asString(distManifest?.runtimeCacheKey) ?? 'runtime-cache-missing', recipePath].join('::'),
    };
  }

  private loadPack(): RuntimeRecipePack {
    const { path: packPath, signature } = this.getRuntimeRecipePackPath();
    if (this.cache?.signature === signature) {
      return this.cache;
    }
    if (!fs.existsSync(packPath) || !fs.statSync(packPath).isFile()) {
      throw new Error(`Runtime recipe pack not found: ${packPath}`);
    }
    const parsed = parseCompactRecipePack(fs.readFileSync(packPath));
    this.cache = { signature, ...parsed };
    return this.cache;
  }

  getItemProducedBy(itemId: string): RuntimeRecipeItemQuery | null {
    return this.getItemQuery(itemId, 'producedBy');
  }

  getItemUsedIn(itemId: string): RuntimeRecipeItemQuery | null {
    return this.getItemQuery(itemId, 'usedIn');
  }

  getRecipePage(recipePageId: string): RuntimeRecipePage | null {
    const normalizedRecipePageId = `${recipePageId ?? ''}`.trim();
    if (!normalizedRecipePageId) return null;
    const pack = this.loadPack();
    const entry = pack.uiPayloadIndex.find((candidate) => candidate.recipeId === normalizedRecipePageId);
    if (!entry) return null;
    const shard = readJsonRequired(resolveDistDataFile(entry.path), 'UI payload shard');
    const payloads = asRecord(shard.payloads);
    const uiPayload = asRecord(payloads?.[normalizedRecipePageId]);
    if (!uiPayload) return null;
    const machineInfo = asRecord(uiPayload.machineInfo);
    const metadata = asRecord(uiPayload.metadata);
    return {
      recipePageId: normalizedRecipePageId,
      recipe: {
        id: normalizedRecipePageId,
        recipeType: entry.recipeType ?? entry.familyKey ?? 'runtime-pack',
        outputs: [],
        inputs: [],
        fluidInputs: [],
        fluidOutputs: [],
        machineInfo: machineInfo ?? (entry.machineType ? { machineType: entry.machineType } : null),
        metadata,
        additionalData: {
          uiPayload,
          uiFamilyKey: entry.familyKey ?? null,
          uiPayloadPath: entry.path,
          handlerKey: entry.handlerKey ?? null,
          machineType: entry.machineType ?? null,
          runtimePackBacked: true,
        },
      },
      uiPayload,
    };
  }

  private getItemQuery(itemId: string, relation: 'producedBy' | 'usedIn'): RuntimeRecipeItemQuery | null {
    const normalizedItemId = `${itemId ?? ''}`.trim();
    if (!normalizedItemId) return null;
    const pack = this.loadPack();
    const entry = pack.itemIndex.find((candidate) => candidate.itemId === normalizedItemId);
    if (!entry) return null;
    const recipes = [...(entry[relation] ?? [])];
    const categoryIds = new Set(recipes.map((recipe) => recipe.categoryId).filter(Boolean));
    const categories = pack.categoryIndex.filter((category) => categoryIds.has(category.categoryId));
    return {
      itemId: normalizedItemId,
      summary: {
        itemId: normalizedItemId,
        counts: {
          producedBy: entry.producedBy?.length ?? 0,
          usedIn: entry.usedIn?.length ?? 0,
          machineGroups: categories.length,
        },
        categories,
      },
      recipes,
    };
  }

}

let runtimeRecipePackService: RuntimeRecipePackService | null = null;

export function getRuntimeRecipePackService(): RuntimeRecipePackService {
  if (!runtimeRecipePackService) {
    runtimeRecipePackService = new RuntimeRecipePackService();
  }
  return runtimeRecipePackService;
}

export const RUNTIME_RECIPE_PACK_SCHEMA = RECIPE_PACK_SCHEMA;
