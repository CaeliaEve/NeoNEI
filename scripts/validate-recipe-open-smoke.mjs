import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseNativeRecipeBin,
  parseNativeSearchBin,
} from "./native-runtime-pack-reader.mjs";

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
  const recipePack = parseNativeRecipeBin(distDataDir, manifest.files?.rustRecipeBin);
  const searchPack = parseNativeSearchBin(distDataDir, manifest.files?.rustSearchBin);
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
