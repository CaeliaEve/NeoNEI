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

function readBinaryPackHeader(filePath) {
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
  const recipeBinHeader = existsSync(rustRecipeBinPath) ? readBinaryPackHeader(rustRecipeBinPath) : null;
  if (recipeBinHeader?.schema !== 'neonei/recipe-pack/current') {
    fail(failures, 'RUST_RECIPE_BIN_SCHEMA_MISMATCH', 'rust recipe binary pack schema is wrong', {
      path: rustRecipeBinRelativePath || null,
      schema: recipeBinHeader?.schema ?? null,
    });
  }

  const uiPayloadIndexPath = join(distDataDir, 'recipes', 'ui-payload-index.json');
  const categoryIndexPath = join(distDataDir, 'recipes', 'recipe-category-index.json');
  if (!existsSync(uiPayloadIndexPath)) {
    fail(failures, 'RUST_UI_PAYLOAD_INDEX_MISSING', 'compiled recipe UI payload index is missing');
  }
  if (!existsSync(categoryIndexPath)) {
    fail(failures, 'RUST_CATEGORY_INDEX_MISSING', 'compiled recipe category index is missing');
  }
  const uiPayloadIndex = existsSync(uiPayloadIndexPath) ? readJson(uiPayloadIndexPath) : null;
  const categoryIndex = existsSync(categoryIndexPath) ? readJson(categoryIndexPath) : null;
  const entries = Array.isArray(uiPayloadIndex?.recipes)
    ? uiPayloadIndex.recipes.filter((entry) => entry?.recipeId && entry?.path && entry?.payloadKey)
    : [];
  const categories = Array.isArray(categoryIndex?.categories)
    ? categoryIndex.categories.filter((category) => `${category?.categoryId ?? ''}`.trim())
    : [];
  const categoryIds = categories.map((category) => `${category.categoryId}`.trim());
  const uniqueCategoryIds = new Set(categoryIds);
  if (categories.length <= 0) {
    fail(failures, 'RUST_CATEGORY_INDEX_EMPTY', 'rust recipe category index is empty');
  }
  if (uniqueCategoryIds.size !== categoryIds.length) {
    fail(failures, 'RUST_CATEGORY_INDEX_DUPLICATES', 'rust recipe category index contains duplicate category ids', {
      categoryCount: categoryIds.length,
      uniqueCategoryCount: uniqueCategoryIds.size,
    });
  }
  const categoryRecipeCount = categories.reduce((sum, category) => sum + Math.max(0, Number(category.recipeCount ?? 0) || 0), 0);
  const recipeCount = Number(uiPayloadIndex?.recipes?.length ?? 0);
  if (recipeCount <= 0) {
    fail(failures, 'RUST_RECIPE_COUNT_EMPTY', 'rust recipe pack recipe count is empty');
  }
  if (entries.length !== recipeCount) {
    fail(failures, 'RUST_UI_PAYLOAD_INDEX_COUNT_MISMATCH', 'rust ui payload index does not cover every recipe', {
      entries: entries.length,
      recipeCount,
    });
  }
  if (categoryRecipeCount !== recipeCount) {
    fail(failures, 'RUST_CATEGORY_RECIPE_COUNT_MISMATCH', 'rust category recipe counts do not sum to recipe count', {
      categoryRecipeCount,
      recipeCount,
    });
  }
  const categoryDisplayMissing = categories.filter((category) => !`${category.displayName ?? ''}`.trim());
  if (categoryDisplayMissing.length > 0) {
    fail(failures, 'RUST_CATEGORY_DISPLAY_NAME_MISSING', 'rust category index contains categories without display names', {
      sample: categoryDisplayMissing.slice(0, 5).map((category) => category.categoryId),
    });
  }

  const nonRustEntries = entries.filter((entry) => !`${entry.path}`.replaceAll('\\', '/').startsWith('recipes/ui-payload-shards/'));
  if (nonRustEntries.length > 0) {
    fail(failures, 'RUST_UI_PAYLOAD_INDEX_LEAKS_NON_CANONICAL_SHARDS', 'rust ui payload index contains non-canonical recipe shard paths', {
      sample: nonRustEntries.slice(0, 5).map((entry) => entry.path),
    });
  }

  const sampleLimit = Math.min(entries.length, Number(readArg('--sample-limit')) || 8);
  const sampled = entries.slice(0, sampleLimit);
  const shardCache = new Map();
  const checked = [];
  for (const entry of sampled) {
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
    recipeCount,
    categoryCount: categories.length,
    categoryRecipeCount,
    uiPayloadIndexCount: entries.length,
    checkedCount: checked.length,
    shardCount: shardCache.size,
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
