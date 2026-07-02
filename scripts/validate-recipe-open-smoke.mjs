import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const distDataDir = resolve(
  readArg("--dist-data")
    ?? process.env.DIST_DATA_V3_DIR
    ?? join(repoRoot, "backend", "public", "dist-data"),
);
const sampleLimit = Math.max(1, Math.floor(Number(readArg("--sample-limit")) || 80));

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function firstArray(value) {
  return Array.isArray(value) ? value : [];
}

function readRuntimeBin(distDataDir, relativePath, label) {
  if (!hasText(relativePath)) {
    throw new Error(`dist-data manifest must declare ${label}`);
  }
  const filePath = join(distDataDir, relativePath);
  if (!existsSync(filePath)) {
    throw new Error(`Missing native runtime pack ${label}: ${filePath}`);
  }
  const bytes = readFileSync(filePath);
  if (bytes.subarray(0, 8).toString("utf8") !== "NNEIBIN\0") {
    throw new Error(`Invalid native runtime binary magic for ${label}: ${filePath}`);
  }
  const schemaLength = bytes.readUInt32LE(12);
  const payloadLength = Number(bytes.readBigUInt64LE(16));
  const payloadOffset = 24 + schemaLength;
  return bytes.subarray(payloadOffset, payloadOffset + payloadLength);
}

function readCompactString(bytes, baseOffset, relativeOffset) {
  let end = baseOffset + relativeOffset;
  while (end < bytes.length && bytes[end] !== 0) end += 1;
  return bytes.subarray(baseOffset + relativeOffset, end).toString("utf8");
}

function parseCompactStrings(bytes, offset, stringCount) {
  const offsets = [];
  for (let index = 0; index < stringCount; index += 1) {
    offsets.push(bytes.readUInt32LE(offset + index * 4));
  }
  return offsets;
}

function parseSearchBin(distDataDir, relativePath) {
  const bytes = readRuntimeBin(distDataDir, relativePath, "rustSearchBin");
  if (bytes.subarray(0, 8).toString("utf8") !== "NEISRC2\0") {
    throw new Error(`Invalid search.bin payload: ${relativePath}`);
  }
  const rowCount = bytes.readUInt32LE(12);
  const stringCount = bytes.readUInt32LE(16);
  const rowStride = bytes.readUInt32LE(20);
  const offsets = parseCompactStrings(bytes, 24, stringCount);
  const rowOffset = 24 + stringCount * 4;
  const stringsDataBase = rowOffset + rowCount * rowStride * 4;
  const stringAt = (ref) => readCompactString(bytes, stringsDataBase, offsets[ref] ?? 0);
  const items = [];
  for (let row = 0; row < rowCount; row += 1) {
    const base = rowOffset + row * rowStride * 4;
    items.push({
      itemId: stringAt(bytes.readUInt32LE(base)),
      publicItemId: stringAt(bytes.readUInt32LE(base + 4)),
      localizedName: stringAt(bytes.readUInt32LE(base + 8)),
      modId: stringAt(bytes.readUInt32LE(base + 12)),
      family: rowStride > 13 ? stringAt(bytes.readUInt32LE(base + 52)) : "",
      groupKey: rowStride > 14 ? stringAt(bytes.readUInt32LE(base + 56)) : "",
      representativeItemId: rowStride > 15 ? stringAt(bytes.readUInt32LE(base + 60)) : "",
    });
  }
  return { items };
}

function recipeString(strings, index) {
  return strings[index] ?? "";
}

function parseRecipeBin(distDataDir, relativePath) {
  const bytes = readRuntimeBin(distDataDir, relativePath, "rustRecipeBin");
  if (bytes.subarray(0, 8).toString("utf8") !== "NEIRCP1\0") {
    throw new Error(`Invalid recipes.bin payload: ${relativePath}`);
  }
  const version = bytes.readUInt32LE(8);
  if (version !== 1) {
    throw new Error(`Unsupported recipes.bin version: ${version}`);
  }
  const stringCount = bytes.readUInt32LE(12);
  const itemCount = bytes.readUInt32LE(16);
  const refCount = bytes.readUInt32LE(20);
  const uiCount = bytes.readUInt32LE(24);
  const categoryCount = bytes.readUInt32LE(28);
  const categorySourceCount = bytes.readUInt32LE(32);
  const itemStride = bytes.readUInt32LE(36);
  const refStride = bytes.readUInt32LE(40);
  const uiStride = bytes.readUInt32LE(44);
  const categoryStride = bytes.readUInt32LE(48);
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
  cursor += categoryCount * categoryStride * 4;
  cursor += categorySourceCount * 4;
  const stringsStart = cursor;
  if (stringsStart > bytes.length) {
    throw new Error(`recipes.bin table exceeds payload length: ${stringsStart}/${bytes.length}`);
  }

  const stringOffsets = parseCompactStrings(bytes, stringOffsetsStart, stringCount);
  const strings = stringOffsets.map((offset) => readCompactString(bytes, stringsStart, offset));
  const readRowValue = (start, row, stride, column) => bytes.readUInt32LE(start + (row * stride + column) * 4);
  const readRef = (row) => {
    if (row < 0 || row >= refCount) {
      return { recipeId: "", categoryId: "", displayName: "" };
    }
    return {
      recipeId: recipeString(strings, readRowValue(refRowsStart, row, refStride, 0)),
      categoryId: recipeString(strings, readRowValue(refRowsStart, row, refStride, 1)),
      displayName: recipeString(strings, readRowValue(refRowsStart, row, refStride, 2)),
    };
  };

  const itemIndex = [];
  for (let row = 0; row < itemCount; row += 1) {
    const itemId = recipeString(strings, readRowValue(itemRowsStart, row, itemStride, 0));
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
    const recipeId = recipeString(strings, readRowValue(uiRowsStart, row, uiStride, 0));
    const path = recipeString(strings, readRowValue(uiRowsStart, row, uiStride, 1));
    if (!recipeId || !path) continue;
    uiPayloadIndex.push({
      recipeId,
      path,
      payloadKey: recipeString(strings, readRowValue(uiRowsStart, row, uiStride, 2)) || undefined,
      familyKey: recipeString(strings, readRowValue(uiRowsStart, row, uiStride, 3)) || undefined,
      recipeType: recipeString(strings, readRowValue(uiRowsStart, row, uiStride, 4)) || undefined,
      machineType: recipeString(strings, readRowValue(uiRowsStart, row, uiStride, 5)) || undefined,
    });
  }

  return { itemIndex, uiPayloadIndex };
}

function fail(failures, code, message, details = {}) {
  failures.push({ code, message, details });
}

function chooseSamples(itemIndexItems, searchItems, limit) {
  const searchByItemId = new Map(searchItems.map((entry) => [entry.itemId, entry]));
  const preferredFamilies = [
    "facade.",
    "thaumcraft.wand",
    "tool.tconstruct",
    "tool.gregtech",
    "genetics.",
    "fluid.container",
    "data_carrier.",
  ];
  const produced = [];
  const used = [];
  const variants = [];
  const representatives = [];
  for (const row of itemIndexItems) {
    const search = searchByItemId.get(row.itemId);
    if (!search) continue;
    const producedBy = firstArray(row.producedBy);
    const usedIn = firstArray(row.usedIn);
    if (producedBy.length && produced.length < limit) produced.push({ row, search, mode: "producedBy" });
    if (usedIn.length && used.length < limit) used.push({ row, search, mode: "usedIn" });
    const family = `${search.family ?? ""}`;
    if (preferredFamilies.some((prefix) => family.startsWith(prefix)) && (producedBy.length || usedIn.length) && variants.length < limit) {
      variants.push({ row, search, mode: producedBy.length ? "producedBy" : "usedIn" });
    }
    if (`${search.representativeItemId ?? ""}` === search.itemId && `${search.groupKey ?? ""}` && (producedBy.length || usedIn.length) && representatives.length < limit) {
      representatives.push({ row, search, mode: producedBy.length ? "producedBy" : "usedIn" });
    }
  }
  const samples = [];
  const seen = new Set();
  for (const entry of [...variants, ...representatives, ...produced, ...used]) {
    const key = `${entry.row.itemId}:${entry.mode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push(entry);
    if (samples.length >= limit) break;
  }
  return samples;
}

function main() {
  const manifestPath = join(distDataDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`dist-data manifest not found: ${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  const recipePack = parseRecipeBin(distDataDir, manifest.files?.rustRecipeBin);
  const searchPack = parseSearchBin(distDataDir, manifest.files?.rustSearchBin);
  const itemIndexItems = firstArray(recipePack.itemIndex);
  const recipes = firstArray(recipePack.uiPayloadIndex);
  const searchItems = firstArray(searchPack.items);
  const payloadEntryByRecipeId = new Map(recipes.map((entry) => [entry.recipeId, entry]));
  const shardCache = new Map();
  const failures = [];
  const checked = [];

  for (const sample of chooseSamples(itemIndexItems, searchItems, sampleLimit)) {
    const refs = firstArray(sample.row[sample.mode]);
    const recipeRef = refs.find((entry) => hasText(entry?.recipeId));
    if (!recipeRef) {
      fail(failures, "RECIPE_REF_MISSING", "sample item has recipe bucket but no recipeId", {
        itemId: sample.row.itemId,
        mode: sample.mode,
      });
      continue;
    }
    const payloadEntry = payloadEntryByRecipeId.get(recipeRef.recipeId);
    const shardPath = payloadEntry?.path;
    if (!hasText(shardPath)) {
      fail(failures, "RECIPE_PAYLOAD_INDEX_MISSING", "recipe item-index references a recipe absent from ui-payload-index", {
        itemId: sample.row.itemId,
        recipeId: recipeRef.recipeId,
        mode: sample.mode,
      });
      continue;
    }
    const absoluteShardPath = join(distDataDir, shardPath);
    if (!existsSync(absoluteShardPath)) {
      fail(failures, "RECIPE_PAYLOAD_SHARD_MISSING", "recipe ui payload shard is missing", {
        recipeId: recipeRef.recipeId,
        shardPath,
      });
      continue;
    }
    const shard = shardCache.get(shardPath) ?? readJson(absoluteShardPath);
    shardCache.set(shardPath, shard);
    const payload = shard.payloads?.[payloadEntry?.payloadKey] ?? shard.payloads?.[recipeRef.recipeId];
    if (!payload) {
      fail(failures, "RECIPE_PAYLOAD_MISSING", "recipe ui payload shard does not contain recipeId", {
        recipeId: recipeRef.recipeId,
        shardPath,
      });
      continue;
    }
    if (!hasText(payload.recipeId) || !hasText(payload.familyKey) || !hasText(payload.machineType)) {
      fail(failures, "RECIPE_PAYLOAD_CORE_FIELD_MISSING", "recipe ui payload is missing core display fields", {
        recipeId: recipeRef.recipeId,
        payloadRecipeId: payload.recipeId ?? null,
        familyKey: payload.familyKey ?? null,
        machineType: payload.machineType ?? null,
      });
      continue;
    }
    checked.push({
      itemId: sample.row.itemId,
      localizedName: sample.search.localizedName ?? null,
      family: sample.search.family ?? null,
      mode: sample.mode,
      recipeId: recipeRef.recipeId,
      familyKey: payload.familyKey,
      machineType: payload.machineType,
    });
  }

  const report = {
    schemaVersion: "neonei/recipe-open-smoke/v1",
    generatedAt: new Date().toISOString(),
    distDataDir,
    source: manifest.source ?? null,
    sourceRepository: manifest.sourceRepository ?? null,
    runtimeSource: "rust/native-binary",
    sampleLimit,
    checkedCount: checked.length,
    shardCount: shardCache.size,
    failures,
    samples: checked.slice(0, 40),
  };
  const outputDir = join(repoRoot, ".runtime-logs");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "recipe-open-smoke.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) {
    process.exit(1);
  }
}

main();
