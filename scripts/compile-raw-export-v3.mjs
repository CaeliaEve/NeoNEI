import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");
const inputArg = readArg("--input");
const outputArg = readArg("--output");

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeKeyword(value) {
  return `${value ?? ""}`.trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeLoose(value) {
  return `${value ?? ""}`.trim().toLowerCase();
}

function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf8");
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL at ${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonCompact(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function stableNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildSearchEntry(item, index, renderByAssetId, layoutByItemId) {
  const layout = layoutByItemId.get(item.itemId) ?? {};
  const renderAsset = renderByAssetId.get(item.renderAssetRef) ?? renderByAssetId.get("nesqlpp:item/" + item.itemId) ?? null;
  const searchTerms = [
    item.localizedName,
    item.internalName,
    item.unlocalizedName,
    item.modId,
    item.tooltip,
    item.searchTerms,
  ].filter(Boolean).join(" ");
  return {
    itemId: item.itemId,
    localizedName: item.localizedName ?? item.internalName ?? item.itemId,
    modId: item.modId ?? "unknown",
    normalizedLocalizedName: normalizeLoose(item.localizedName),
    normalizedInternalName: normalizeKeyword(item.internalName),
    normalizedItemId: normalizeKeyword(item.itemId),
    normalizedSearchTerms: normalizeLoose(searchTerms),
    pinyinFull: normalizeKeyword(item.pinyinFull),
    pinyinAcronym: normalizeKeyword(item.pinyinAcronym),
    aliases: normalizeLoose(item.aliases),
    popularityScore: stableNumber(item.popularityScore, layout.groupSize > 1 ? 10 : 0),
    searchRank: stableNumber(item.neiOrder, stableNumber(layout.browserOrder, index)),
    renderAssetRef: item.renderAssetRef ?? null,
    atlasFile: renderAsset?.atlasFile ?? renderAsset?.atlasTexture ?? null,
    animationMode: renderAsset?.animationMode ?? renderAsset?.mode ?? null,
  };
}

function compileRawExport(inputDir, outputDir) {
  const startedAt = Date.now();
  const manifestPath = join(inputDir, "manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  const items = readJsonl(join(inputDir, "items.jsonl"));
  const fluids = readJsonl(join(inputDir, "fluids.jsonl"));
  const recipes = readJsonl(join(inputDir, "recipes.jsonl"));
  const groups = readJsonl(join(inputDir, "groups.jsonl"));
  const neiOrder = readJsonl(join(inputDir, "nei_order.jsonl"));
  const textures = readJsonl(join(inputDir, "textures.jsonl"));
  const animations = readJsonl(join(inputDir, "animations.jsonl"));
  const browserAtlasIndexPath = join(inputDir, "browser_atlas_index.json");
  const browserAtlasIndex = existsSync(browserAtlasIndexPath)
    ? JSON.parse(readFileSync(browserAtlasIndexPath, "utf8"))
    : null;

  const renderByAssetId = new Map();
  for (const texture of textures) {
    if (texture.assetId) renderByAssetId.set(texture.assetId, texture);
  }

  const layoutByItemId = new Map();
  for (const entry of neiOrder) {
    if (entry.itemId) layoutByItemId.set(entry.itemId, entry);
  }
  for (const group of groups) {
    for (const itemId of group.memberItemIds ?? []) {
      layoutByItemId.set(itemId, {
        ...(layoutByItemId.get(itemId) ?? {}),
        groupKey: group.groupKey,
        groupLabel: group.groupLabel,
        groupSize: group.groupSize,
        representativeItemId: group.representativeItemId,
        groupSortOrder: group.groupSortOrder,
      });
    }
  }

  const searchItems = items
    .filter((item) => item && item.itemId)
    .map((item, index) => buildSearchEntry(item, index, renderByAssetId, layoutByItemId));

  const browserItems = searchItems.map((entry, index) => {
    const layout = layoutByItemId.get(entry.itemId) ?? {};
    return {
      itemId: entry.itemId,
      localizedName: entry.localizedName,
      modId: entry.modId,
      renderAssetRef: entry.renderAssetRef,
      browserOrder: stableNumber(layout.browserOrder, stableNumber(layout.entryOrder, index)),
      groupKey: layout.groupKey ?? null,
      groupLabel: layout.groupLabel ?? null,
      groupSize: stableNumber(layout.groupSize, 1),
      representativeItemId: layout.representativeItemId ?? entry.itemId,
    };
  }).sort((left, right) => left.browserOrder - right.browserOrder || left.itemId.localeCompare(right.itemId));

  const recipeCategories = new Map();
  for (const recipe of recipes) {
    const key = recipe.machine?.machineId ?? recipe.family ?? recipe.sourcePlugin ?? "unknown";
    const existing = recipeCategories.get(key) ?? { categoryId: key, recipeCount: 0, displayName: recipe.machine?.displayName ?? key };
    existing.recipeCount += 1;
    recipeCategories.set(key, existing);
  }

  const validation = {
    schemaVersion: "neonei/compiler-validation/v3-alpha1",
    generatedAt: new Date().toISOString(),
    inputDir,
    outputDir,
    counts: {
      items: items.length,
      fluids: fluids.length,
      recipes: recipes.length,
      groups: groups.length,
      neiOrderEntries: neiOrder.length,
      textures: textures.length,
      animations: animations.length,
      browserAtlasItems: Array.isArray(browserAtlasIndex?.items) ? browserAtlasIndex.items.length : 0,
      recipeCategories: recipeCategories.size,
    },
    missing: {
      itemId: items.filter((item) => !item.itemId).length,
      localizedName: items.filter((item) => item.itemId && !item.localizedName).length,
      renderAssetRef: items.filter((item) => item.itemId && !item.renderAssetRef).length,
      textureRows: Math.max(0, items.length - textures.length),
    },
    warnings: [],
    elapsedMs: Date.now() - startedAt,
  };
  if (items.length === 0) validation.warnings.push("items.jsonl is empty; compiler output is structural only.");
  if (recipes.length === 0) validation.warnings.push("recipes.jsonl is empty; recipe indexes cannot be complete.");

  writeJson(outputDir + "/manifest.json", {
    schemaVersion: "neonei/dist-data/v3-alpha1",
    generatedAt: new Date().toISOString(),
    source: manifest?.schemaVersion ?? "unknown",
    sourceRepository: manifest?.repositoryName ?? null,
    files: {
      searchAll: "search/all.json",
      browserCatalog: "browser/item-catalog.json",
      browserGroups: "browser/group-index.json",
      recipeCategories: "recipes/recipe-category-index.json",
      textureManifest: "textures/atlas-manifest.json",
      browserAtlasIndex: "textures/browser-atlas-index.json",
      validationReport: "validation/report.json",
    },
  });
  writeJsonCompact(join(outputDir, "search", "all.json"), { schemaVersion: "neonei/search-v3-json/v1", items: searchItems });
  writeJsonCompact(join(outputDir, "browser", "item-catalog.json"), { schemaVersion: "neonei/browser-catalog/v1", items: browserItems });
  writeJsonCompact(join(outputDir, "browser", "group-index.json"), { schemaVersion: "neonei/group-index/v1", groups });
  writeJsonCompact(join(outputDir, "recipes", "recipe-category-index.json"), { schemaVersion: "neonei/recipe-category-index/v1", categories: Array.from(recipeCategories.values()) });
  writeJsonCompact(join(outputDir, "textures", "atlas-manifest.json"), { schemaVersion: "neonei/texture-manifest/v1", textures, animations });
  writeJsonCompact(join(outputDir, "textures", "browser-atlas-index.json"), browserAtlasIndex ?? { schemaVersion: "neonei/browser-atlas-index/v1", items: [] });
  writeJson(join(outputDir, "validation", "report.json"), validation);
  return validation;
}

function createSelfTestRawExport(root) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  writeJson(join(root, "manifest.json"), { schemaVersion: "nesqlpp/raw-export/v3-alpha1", repositoryName: "self-test" });
  writeFileSync(join(root, "items.jsonl"), [
    JSON.stringify({ itemId: "i~minecraft~iron_ingot~0", modId: "minecraft", internalName: "iron_ingot", localizedName: "铁锭", renderAssetRef: "nesqlpp:item/i~minecraft~iron_ingot~0", searchTerms: "iron ingot" }),
    JSON.stringify({ itemId: "i~botania~manaResource~4", modId: "botania", internalName: "manaResource", localizedName: "泰拉钢锭", renderAssetRef: "nesqlpp:item/i~botania~manaResource~4", searchTerms: "terrasteel" }),
  ].join("\n") + "\n", "utf8");
  writeFileSync(join(root, "fluids.jsonl"), `${JSON.stringify({ fluidId: "f~gregtech~molten.iron", localizedName: "熔融铁" })}\n`, "utf8");
  writeFileSync(join(root, "recipes.jsonl"), `${JSON.stringify({ recipeId: "r1", family: "minecraft", machine: { machineId: "furnace", displayName: "熔炉" } })}\n`, "utf8");
  writeFileSync(join(root, "groups.jsonl"), `${JSON.stringify({ groupKey: "nei:iron", groupLabel: "Iron", groupSize: 1, representativeItemId: "i~minecraft~iron_ingot~0", memberItemIds: ["i~minecraft~iron_ingot~0"] })}\n`, "utf8");
  writeFileSync(join(root, "nei_order.jsonl"), `${JSON.stringify({ entryOrder: 0, entryKind: "item", itemId: "i~minecraft~iron_ingot~0" })}\n${JSON.stringify({ entryOrder: 1, entryKind: "item", itemId: "i~botania~manaResource~4" })}\n`, "utf8");
  writeFileSync(join(root, "textures.jsonl"), `${JSON.stringify({ assetId: "nesqlpp:item/i~minecraft~iron_ingot~0", atlasFile: "static-atlas-0.webp" })}\n${JSON.stringify({ assetId: "nesqlpp:item/i~botania~manaResource~4", atlasFile: "animated-atlas-0.webp", frameCount: 8, frameDurationMs: 100 })}\n`, "utf8");
  writeFileSync(join(root, "animations.jsonl"), `${JSON.stringify({ assetId: "nesqlpp:item/i~botania~manaResource~4", frameCount: 8, frameDurationMs: 100 })}\n`, "utf8");
  writeJson(join(root, "browser_atlas_index.json"), { schemaVersion: "browser-atlas-index-self-test", itemCount: 1, items: [{ itemId: "i~minecraft~iron_ingot~0", assetId: "nesqlpp:item/i~minecraft~iron_ingot~0", hasStaticAtlas: true, staticAtlas: { atlasFile: "static-atlas-0.webp", atlasWidth: 16, atlasHeight: 16, x: 0, y: 0, width: 16, height: 16 } }] });
}

let inputDir = inputArg ? resolve(inputArg) : null;
let outputDir = outputArg ? resolve(outputArg) : null;
if (selfTest) {
  inputDir = join(repoRoot, ".tmp-runtime", "raw-export-v3-self-test");
  outputDir = join(repoRoot, ".tmp-runtime", "dist-data-v3-self-test");
  createSelfTestRawExport(inputDir);
}
if (!inputDir || !outputDir) {
  console.error("Usage: node scripts/compile-raw-export-v3.mjs --input <raw-export> --output <dist-data> [--self-test]");
  process.exit(2);
}
const report = compileRawExport(inputDir, outputDir);
console.log(JSON.stringify({ outputDir, counts: report.counts, missing: report.missing, warnings: report.warnings, elapsedMs: report.elapsedMs }, null, 2));
if (selfTest && (report.counts.items !== 2 || report.counts.recipes !== 1 || report.counts.animations !== 1 || report.counts.browserAtlasItems !== 1)) {
  throw new Error("Self-test compiler counts did not match expected values");
}
