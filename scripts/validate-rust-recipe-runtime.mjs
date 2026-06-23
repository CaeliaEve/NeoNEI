import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const distDataDir = resolve(
  readArg('--dist-data')
    ?? process.env.DIST_DATA_V3_DIR
    ?? join(repoRoot, 'backend', 'public', 'dist-data'),
);
const gate = args.includes('--gate');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

const COMPACT_RECIPE_MAGIC = 'NEIRCP1\0';

function readNativeBinaryPack(filePath) {
  const bytes = readFileSync(filePath);
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('utf8') !== 'NNEIBIN\0') {
    throw new Error(`invalid NeoNEI binary pack header: ${filePath}`);
  }
  const schemaLength = bytes.readUInt32LE(12);
  const payloadLength = Number(bytes.readBigUInt64LE(16));
  const schemaStart = 24;
  const payloadStart = schemaStart + schemaLength;
  if (payloadStart + payloadLength > bytes.length) {
    throw new Error(`truncated NeoNEI binary pack payload: ${filePath}`);
  }
  return {
    schema: bytes.subarray(schemaStart, payloadStart).toString('utf8'),
    payloadLength,
    payload: bytes.subarray(payloadStart, payloadStart + payloadLength),
  };
}

function readBinaryPackHeader(filePath) {
  const { schema, payloadLength } = readNativeBinaryPack(filePath);
  return { schema, payloadLength };
}

function parseCompactRecipeIndex(filePath, sampleLimit) {
  const pack = readNativeBinaryPack(filePath);
  if (pack.schema !== 'neonei/recipe-pack/current') {
    return { schema: pack.schema, payloadLength: pack.payloadLength, failures: [`schema mismatch: ${pack.schema}`] };
  }

  const payload = pack.payload;
  const failures = [];
  if (payload.length < 52 || payload.subarray(0, 8).toString('utf8') !== COMPACT_RECIPE_MAGIC) {
    return { schema: pack.schema, payloadLength: pack.payloadLength, failures: ['compact recipe payload magic mismatch'] };
  }
  const version = payload.readUInt32LE(8);
  const stringCount = payload.readUInt32LE(12);
  const itemCount = payload.readUInt32LE(16);
  const refCount = payload.readUInt32LE(20);
  const uiCount = payload.readUInt32LE(24);
  const categoryCount = payload.readUInt32LE(28);
  const categorySourceCount = payload.readUInt32LE(32);
  const itemStride = payload.readUInt32LE(36);
  const refStride = payload.readUInt32LE(40);
  const uiStride = payload.readUInt32LE(44);
  const categoryStride = payload.readUInt32LE(48);
  if (version !== 1) failures.push(`compact recipe version mismatch: ${version}`);
  if (itemStride < 5 || refStride < 3 || uiStride < 7 || categoryStride < 5) {
    failures.push(`compact recipe stride mismatch: item=${itemStride}, ref=${refStride}, ui=${uiStride}, category=${categoryStride}`);
  }

  const bytesNeeded = (count, stride = 1) => count * stride * 4;
  let cursor = 52;
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
  if (stringsStart > payload.length) {
    failures.push(`compact recipe tables exceed payload length: ${stringsStart}/${payload.length}`);
  }

  const stringCache = new Map();
  function stringAt(index) {
    if (!Number.isInteger(index) || index <= 0 || index >= stringCount || stringOffsetsStart + index * 4 + 4 > payload.length) {
      return '';
    }
    const cached = stringCache.get(index);
    if (cached !== undefined) return cached;
    const offset = payload.readUInt32LE(stringOffsetsStart + index * 4);
    const start = stringsStart + offset;
    if (start < stringsStart || start >= payload.length) {
      stringCache.set(index, '');
      return '';
    }
    let end = start;
    while (end < payload.length && payload[end] !== 0) end += 1;
    const value = payload.subarray(start, end).toString('utf8');
    stringCache.set(index, value);
    return value;
  }
  function rowValue(start, row, stride, column) {
    const offset = start + (row * stride + column) * 4;
    return offset + 4 <= payload.length ? payload.readUInt32LE(offset) : 0;
  }

  let validUiEntryCount = 0;
  const nonCanonicalPaths = [];
  const sampled = [];
  const shardPaths = new Set();
  for (let row = 0; row < uiCount; row += 1) {
    const recipeId = stringAt(rowValue(uiRowsStart, row, uiStride, 0));
    const shardPath = stringAt(rowValue(uiRowsStart, row, uiStride, 1)).replaceAll('\\', '/');
    const payloadKey = stringAt(rowValue(uiRowsStart, row, uiStride, 2));
    if (recipeId && shardPath && payloadKey) validUiEntryCount += 1;
    if (shardPath) {
      shardPaths.add(shardPath);
      if (!shardPath.startsWith('recipes/ui-payload-shards/') && nonCanonicalPaths.length < 5) {
        nonCanonicalPaths.push(shardPath);
      }
    }
    if (sampled.length < sampleLimit && recipeId && shardPath && payloadKey) {
      sampled.push({
        recipeId,
        path: shardPath,
        payloadKey,
        familyKey: stringAt(rowValue(uiRowsStart, row, uiStride, 3)),
        recipeType: stringAt(rowValue(uiRowsStart, row, uiStride, 4)),
        machineType: stringAt(rowValue(uiRowsStart, row, uiStride, 5)),
      });
    }
  }

  let categoryRecipeCount = 0;
  let categoriesWithDisplayName = 0;
  const categoryIds = [];
  const categoryDisplayMissing = [];
  for (let row = 0; row < categoryCount; row += 1) {
    const categoryId = stringAt(rowValue(categoryRowsStart, row, categoryStride, 0));
    const displayName = stringAt(rowValue(categoryRowsStart, row, categoryStride, 1));
    categoryRecipeCount += rowValue(categoryRowsStart, row, categoryStride, 2);
    if (categoryId) categoryIds.push(categoryId);
    if (displayName) categoriesWithDisplayName += 1;
    if (categoryId && !displayName && categoryDisplayMissing.length < 5) categoryDisplayMissing.push(categoryId);
  }
  const uniqueCategoryCount = new Set(categoryIds).size;

  return {
    schema: pack.schema,
    payloadLength: pack.payloadLength,
    failures,
    header: {
      version,
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
    recipeCount: uiCount,
    validUiEntryCount,
    categoryCount,
    categoryRecipeCount,
    categoryIds: categoryIds.length,
    uniqueCategoryCount,
    categoriesWithDisplayName,
    categoryDisplayMissing,
    nonCanonicalPaths,
    shardPathCount: shardPaths.size,
    samples: sampled,
  };
}

function fail(failures, code, message, details = {}) {
  failures.push({ code, message, details });
}

function main() {
  const failures = [];
  const warnings = [];
  const manifestPath = join(distDataDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`dist-data manifest not found: ${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  const rustRecipeBinRelativePath = `${manifest.files?.rustRecipeBin ?? ''}`.trim();
  if (!rustRecipeBinRelativePath) {
    fail(failures, 'RUST_RECIPE_BIN_NOT_DECLARED', 'manifest does not declare files.rustRecipeBin');
  }
  const rustRecipeBinPath = join(distDataDir, rustRecipeBinRelativePath || 'rust/recipes.bin');
  if (!existsSync(rustRecipeBinPath)) {
    fail(failures, 'RUST_RECIPE_BIN_MISSING', 'rust recipe binary pack file is missing', { path: rustRecipeBinRelativePath });
  }
  const sampleLimit = Math.max(0, Number(readArg('--sample-limit')) || 8);
  const recipeBinaryIndex = existsSync(rustRecipeBinPath) ? parseCompactRecipeIndex(rustRecipeBinPath, sampleLimit) : null;
  const recipeBinHeader = recipeBinaryIndex
    ? { schema: recipeBinaryIndex.schema, payloadLength: recipeBinaryIndex.payloadLength }
    : null;
  if (recipeBinHeader?.schema !== 'neonei/recipe-pack/current') {
    fail(failures, 'RUST_RECIPE_BIN_SCHEMA_MISMATCH', 'rust recipe binary pack schema is wrong', {
      path: rustRecipeBinRelativePath || null,
      schema: recipeBinHeader?.schema ?? null,
    });
  }
  for (const message of recipeBinaryIndex?.failures ?? []) {
    fail(failures, 'RUST_RECIPE_BIN_COMPACT_INDEX_INVALID', 'rust recipe binary compact index is invalid', { message });
  }

  const uiPayloadIndexPath = join(distDataDir, 'recipes', 'ui-payload-index.json');
  const categoryIndexPath = join(distDataDir, 'recipes', 'recipe-category-index.json');
  if (!existsSync(uiPayloadIndexPath)) {
    fail(failures, 'RUST_UI_PAYLOAD_INDEX_MISSING', 'compiled recipe UI payload index is missing');
  }
  if (!existsSync(categoryIndexPath)) {
    fail(failures, 'RUST_CATEGORY_INDEX_MISSING', 'compiled recipe category index is missing');
  }
  const entries = recipeBinaryIndex?.samples ?? [];
  const recipeCount = Number(recipeBinaryIndex?.recipeCount ?? 0);
  const categoryCount = Number(recipeBinaryIndex?.categoryCount ?? 0);
  const categoryRecipeCount = Number(recipeBinaryIndex?.categoryRecipeCount ?? 0);
  if (categoryCount <= 0) {
    fail(failures, 'RUST_CATEGORY_INDEX_EMPTY', 'rust recipe category index is empty');
  }
  if (recipeBinaryIndex && recipeBinaryIndex.uniqueCategoryCount !== recipeBinaryIndex.categoryIds) {
    fail(failures, 'RUST_CATEGORY_INDEX_DUPLICATES', 'rust recipe category index contains duplicate category ids', {
      categoryCount: recipeBinaryIndex.categoryIds,
      uniqueCategoryCount: recipeBinaryIndex.uniqueCategoryCount,
    });
  }
  if (recipeCount <= 0) {
    fail(failures, 'RUST_RECIPE_COUNT_EMPTY', 'rust recipe pack recipe count is empty');
  }
  if (recipeBinaryIndex && recipeBinaryIndex.validUiEntryCount !== recipeCount) {
    fail(failures, 'RUST_UI_PAYLOAD_INDEX_COUNT_MISMATCH', 'rust ui payload index does not cover every recipe', {
      entries: recipeBinaryIndex.validUiEntryCount,
      recipeCount,
    });
  }
  if (categoryRecipeCount !== recipeCount) {
    fail(failures, 'RUST_CATEGORY_RECIPE_COUNT_MISMATCH', 'rust category recipe counts do not sum to recipe count', {
      categoryRecipeCount,
      recipeCount,
    });
  }
  if ((recipeBinaryIndex?.categoryDisplayMissing?.length ?? 0) > 0) {
    fail(failures, 'RUST_CATEGORY_DISPLAY_NAME_MISSING', 'rust category index contains categories without display names', {
      sample: recipeBinaryIndex.categoryDisplayMissing,
    });
  }

  if ((recipeBinaryIndex?.nonCanonicalPaths?.length ?? 0) > 0) {
    fail(failures, 'RUST_UI_PAYLOAD_INDEX_LEAKS_NON_CANONICAL_SHARDS', 'rust ui payload index contains non-canonical recipe shard paths', {
      sample: recipeBinaryIndex.nonCanonicalPaths,
    });
  }

  const shardCache = new Map();
  const checked = [];
  for (const entry of entries) {
    const shardPath = `${entry.path}`.replaceAll('\\', '/');
    const absoluteShardPath = join(distDataDir, shardPath);
    if (!existsSync(absoluteShardPath)) {
      fail(failures, 'RUST_UI_PAYLOAD_SHARD_MISSING', 'rust ui payload shard is missing', { recipeId: entry.recipeId, shardPath });
      continue;
    }
    const shard = shardCache.get(shardPath) ?? readJson(absoluteShardPath);
    shardCache.set(shardPath, shard);
    const payload = shard?.payloads?.[entry.payloadKey];
    if (!payload) {
      fail(failures, 'RUST_UI_PAYLOAD_MISSING', 'rust ui payload shard lacks indexed payload', {
        recipeId: entry.recipeId,
        payloadKey: entry.payloadKey,
        shardPath,
      });
      continue;
    }
    if (payload.recipeId !== entry.recipeId) {
      fail(failures, 'RUST_UI_PAYLOAD_RECIPE_ID_MISMATCH', 'rust ui payload recipeId differs from index', {
        indexedRecipeId: entry.recipeId,
        payloadRecipeId: payload.recipeId,
      });
    }
    if (payload.schemaVersion !== 'neonei/recipe-ui-payload/v1') {
      fail(failures, 'RUST_UI_PAYLOAD_SCHEMA_MISMATCH', 'rust ui payload schemaVersion is wrong', {
        recipeId: entry.recipeId,
        schemaVersion: payload.schemaVersion ?? null,
      });
    }
    for (const key of ['familyKey', 'machineType', 'recipeType']) {
      if (!`${payload[key] ?? ''}`.trim()) {
        fail(failures, 'RUST_UI_PAYLOAD_DISPLAY_FIELD_MISSING', `rust ui payload missing ${key}`, { recipeId: entry.recipeId });
      }
    }
    if (!Array.isArray(payload.inputItemIds) || !Array.isArray(payload.outputItemIds)) {
      fail(failures, 'RUST_UI_PAYLOAD_ITEM_ARRAYS_MISSING', 'rust ui payload lacks item id arrays', { recipeId: entry.recipeId });
    }
    checked.push({
      recipeId: entry.recipeId,
      shardPath,
      familyKey: payload.familyKey,
      machineType: payload.machineType,
    });
  }

  const report = {
    schemaVersion: 'neonei/rust-recipe-runtime-validation/v1',
    generatedAt: new Date().toISOString(),
    distDataDir,
    source: manifest.source ?? null,
    sourceRepository: manifest.sourceRepository ?? null,
    rustRecipeBin: rustRecipeBinRelativePath || null,
    rustRecipeBinSchema: recipeBinHeader?.schema ?? null,
    rustRecipeBinPayloadBytes: recipeBinHeader?.payloadLength ?? null,
    rustRecipeBinHeader: recipeBinaryIndex?.header ?? null,
    recipeCount,
    categoryCount,
    categoryRecipeCount,
    uiPayloadIndexCount: recipeBinaryIndex?.validUiEntryCount ?? 0,
    checkedCount: checked.length,
    shardCount: recipeBinaryIndex?.shardPathCount ?? shardCache.size,
    checkedShardCount: shardCache.size,
    failures,
    warnings,
    samples: checked,
  };
  const outputDir = join(repoRoot, '.runtime-logs');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'rust-recipe-runtime-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (gate && failures.length > 0) {
    process.exit(1);
  }
}

main();
