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

function collectRecipeItemIds(value, output) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) collectRecipeItemIds(entry, output);
    return;
  }

  const direct = value.itemId ?? value.item?.itemId ?? value.stack?.itemId ?? value.representativeItemId;
  if (typeof direct === "string" && direct.trim()) {
    output.add(direct.trim());
  }

  for (const key of ["items", "stacks", "alternatives", "candidates", "variants"]) {
    if (value[key]) collectRecipeItemIds(value[key], output);
  }
}

function encodeRecipeFileName(recipeId) {
  return encodeURIComponent(recipeId).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function includesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function classifyRecipeFamilyKey(recipe, fallback) {
  const descriptor = [
    recipe.family,
    recipe.sourcePlugin,
    recipe.recipeType,
    recipe.displayName,
    recipe.machine?.machineId,
    recipe.machine?.displayName,
    recipe.metadata?.handlerId,
    recipe.metadata?.handlerName,
    recipe.additionalData?.handlerId,
    recipe.additionalData?.handlerName,
  ].filter(Boolean).join(" ").toLowerCase();

  if ((descriptor.includes("industrial") && descriptor.includes("slaughter")) || includesAny(descriptor, ["extreme entity crusher", "infernal drops", "mobsinfo", "kubatech", "工业屠宰场"])) return "industrial_slaughterhouse";
  if (includesAny(descriptor, ["terra plate", "terraplate", "泰拉凝聚板"])) return "botania_terra_plate";
  if (includesAny(descriptor, ["rune altar", "runic altar", "符文祭坛"])) return "botania_rune_altar";
  if (includesAny(descriptor, ["mana pool", "魔力池"])) return "botania_mana_pool";
  if (includesAny(descriptor, ["pure daisy", "白雏菊"])) return "botania_pure_daisy";
  if (includesAny(descriptor, ["elven trade", "alfheim", "精灵交易"])) return "botania_elven_trade";
  if ((descriptor.includes("thaumcraft") && descriptor.includes("infusion")) || includesAny(descriptor, ["arcane infusion", "奥数注魔"])) return "thaumcraft_infusion";
  if ((descriptor.includes("thaumcraft") && descriptor.includes("crucible")) || includesAny(descriptor, ["crucible", "坩埚"])) return "thaumcraft_crucible";
  if (includesAny(descriptor, ["arcane work", "arcane crafting", "奥数合成"])) return "thaumcraft_arcane";
  if (includesAny(descriptor, ["aspect combination", "aspects from items", "要素组合", "物品中的要素"])) return "thaumcraft_aspect";
  if (includesAny(descriptor, ["research station", "研究站"])) return "gt_research_station";
  if (includesAny(descriptor, ["assembly line", "装配线"])) return "gt_assembly_line";
  if (includesAny(descriptor, ["chemical reactor", "large chemical reactor", "化学反应釜", "大型化学反应釜"])) return "gt_chemical_reactor";
  if (includesAny(descriptor, ["blood altar", "血之祭坛", "血祭坛"])) return "blood_magic_altar";
  if (includesAny(descriptor, ["alchemy array", "alchemy table", "炼金阵"])) return "blood_alchemy_table";
  if (includesAny(descriptor, ["binding ritual", "绑定仪式"])) return "blood_binding_ritual";

  return fallback;
}
function buildRecipeUiPayload(recipe) {
  const recipeId = `${recipe.recipeId ?? recipe.id ?? recipe.key ?? ""}`.trim();
  if (!recipeId) return null;
  const inputItemIds = new Set();
  const outputItemIds = new Set();
  collectRecipeItemIds(recipe.inputs ?? recipe.inputItems ?? recipe.ingredients ?? recipe.catalysts ?? recipe.input, inputItemIds);
  collectRecipeItemIds(recipe.outputs ?? recipe.outputItems ?? recipe.results ?? recipe.result ?? recipe.output, outputItemIds);
  const rawFamilyKey = `${recipe.family ?? recipe.sourcePlugin ?? recipe.recipeType ?? recipe.machine?.machineId ?? "unknown"}`.trim() || "unknown";
  const familyKey = classifyRecipeFamilyKey(recipe, rawFamilyKey);
  const recipeType = `${recipe.recipeType ?? recipe.machine?.machineId ?? familyKey}`.trim() || familyKey;
  const machineType = `${recipe.machine?.displayName ?? recipe.displayName ?? recipe.machine?.machineId ?? recipeType}`.trim() || recipeType;
  return {
    recipeId,
    familyKey,
    machineType,
    recipeType,
    inputItemIds: Array.from(inputItemIds),
    outputItemIds: Array.from(outputItemIds),
    slotCount: {
      input: inputItemIds.size,
      output: outputItemIds.size,
    },
    presentation: {
      surface: recipe.machine?.machineId ?? recipeType,
      density: inputItemIds.size + outputItemIds.size > 12 ? "dense" : "normal",
    },
  };
}

function buildRecipeItemIndex(recipes) {
  const byItemId = new Map();
  const ensure = (itemId) => {
    const normalized = `${itemId ?? ""}`.trim();
    if (!normalized) return null;
    const existing = byItemId.get(normalized);
    if (existing) return existing;
    const created = { itemId: normalized, producedBy: [], usedIn: [] };
    byItemId.set(normalized, created);
    return created;
  };

  for (const recipe of recipes) {
    const recipeId = `${recipe.recipeId ?? recipe.id ?? recipe.key ?? ""}`.trim();
    if (!recipeId) continue;
    const categoryId = recipe.machine?.machineId ?? recipe.family ?? recipe.sourcePlugin ?? recipe.recipeType ?? "unknown";
    const summary = {
      recipeId,
      categoryId,
      displayName: recipe.machine?.displayName ?? recipe.displayName ?? categoryId,
    };

    const outputIds = new Set();
    collectRecipeItemIds(recipe.outputs ?? recipe.outputItems ?? recipe.results ?? recipe.result ?? recipe.output, outputIds);
    for (const itemId of outputIds) {
      const bucket = ensure(itemId);
      if (bucket) bucket.producedBy.push(summary);
    }

    const inputIds = new Set();
    collectRecipeItemIds(recipe.inputs ?? recipe.inputItems ?? recipe.ingredients ?? recipe.catalysts ?? recipe.input, inputIds);
    for (const itemId of inputIds) {
      const bucket = ensure(itemId);
      if (bucket) bucket.usedIn.push(summary);
    }
  }

  return Array.from(byItemId.values())
    .sort((left, right) => left.itemId.localeCompare(right.itemId));
}

function normalizeAnimationTimeline(sourceTimeline, frameCount, fallbackDurationMs) {
  const timeline = Array.isArray(sourceTimeline) ? sourceTimeline : [];
  if (timeline.length > 0) {
    return timeline
      .map((frame, index) => ({
        frameIndex: stableNumber(frame.frameIndex ?? frame.index ?? index, index),
        durationMs: Math.max(16, Math.round(stableNumber(frame.durationMs, fallbackDurationMs))),
      }))
      .filter((frame) => frame.frameIndex >= 0);
  }

  const count = Math.max(0, Math.floor(stableNumber(frameCount, 0)));
  return Array.from({ length: count }, (_, index) => ({
    frameIndex: index,
    durationMs: Math.max(16, Math.round(stableNumber(fallbackDurationMs, 50))),
  }));
}

function buildAnimationTable(searchItems, textures, animations, browserAtlasIndex) {
  const itemIdByAssetId = new Map();
  for (const item of searchItems) {
    if (item.renderAssetRef) itemIdByAssetId.set(item.renderAssetRef, item.itemId);
  }
  const textureByAssetId = new Map();
  for (const texture of textures) {
    if (texture.assetId) textureByAssetId.set(texture.assetId, texture);
  }
  const animationByAssetId = new Map();
  for (const animation of animations) {
    if (animation.assetId) animationByAssetId.set(animation.assetId, animation);
  }

  const byItemId = new Map();
  for (const entry of browserAtlasIndex?.items ?? []) {
    if (!entry?.itemId || !entry?.animatedAtlas) continue;
    const animated = entry.animatedAtlas;
    const assetId = entry.assetId ?? null;
    const animation = animationByAssetId.get(assetId) ?? {};
    const texture = textureByAssetId.get(assetId) ?? {};
    byItemId.set(entry.itemId, {
      itemId: entry.itemId,
      assetId,
      variantKey: animated.variantKey ?? animation.variantKey ?? texture.variantKey ?? null,
      mode: entry.mode ?? texture.mode ?? null,
      playbackHint: entry.playbackHint ?? texture.playbackHint ?? null,
      atlasFile: animated.atlasFile ?? texture.atlasFile ?? texture.atlasTexture ?? null,
      atlasGroup: animated.atlasGroup ?? texture.atlasGroup ?? null,
      atlasWidth: stableNumber(animated.atlasWidth, stableNumber(texture.atlasWidth, null)),
      atlasHeight: stableNumber(animated.atlasHeight, stableNumber(texture.atlasHeight, null)),
      frameCount: stableNumber(animated.frameCount, stableNumber(animation.frameCount, stableNumber(texture.frameCount, 0))),
      frameDurationMs: stableNumber(animated.frameDurationMs, stableNumber(animation.frameDurationMs, stableNumber(texture.frameDurationMs, 50))),
      timeline: normalizeAnimationTimeline(animated.timeline ?? animation.timeline, animated.frameCount ?? animation.frameCount ?? texture.frameCount, animated.frameDurationMs ?? animation.frameDurationMs ?? texture.frameDurationMs ?? 50),
    });
  }

  for (const animation of animations) {
    const itemId = itemIdByAssetId.get(animation.assetId);
    if (!itemId || byItemId.has(itemId)) continue;
    const texture = textureByAssetId.get(animation.assetId) ?? {};
    byItemId.set(itemId, {
      itemId,
      assetId: animation.assetId,
      variantKey: animation.variantKey ?? texture.variantKey ?? null,
      mode: animation.mode ?? texture.mode ?? null,
      playbackHint: animation.playbackHint ?? texture.playbackHint ?? null,
      atlasFile: animation.atlasFile ?? texture.atlasFile ?? texture.atlasTexture ?? null,
      atlasGroup: animation.atlasGroup ?? texture.atlasGroup ?? null,
      atlasWidth: stableNumber(animation.atlasWidth, stableNumber(texture.atlasWidth, null)),
      atlasHeight: stableNumber(animation.atlasHeight, stableNumber(texture.atlasHeight, null)),
      frameCount: stableNumber(animation.frameCount, stableNumber(texture.frameCount, 0)),
      frameDurationMs: stableNumber(animation.frameDurationMs, stableNumber(texture.frameDurationMs, 50)),
      timeline: normalizeAnimationTimeline(animation.timeline, animation.frameCount ?? texture.frameCount, animation.frameDurationMs ?? texture.frameDurationMs ?? 50),
    });
  }

  return Array.from(byItemId.values())
    .filter((entry) => entry.frameCount > 1 || entry.timeline.length > 1)
    .sort((left, right) => left.itemId.localeCompare(right.itemId));
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
  const animationTable = buildAnimationTable(searchItems, textures, animations, browserAtlasIndex);

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

  const browserAtlasItems = Array.isArray(browserAtlasIndex?.items) ? browserAtlasIndex.items : [];
  const browserAtlasItemIds = new Set(
    browserAtlasItems
      .filter((entry) => entry?.itemId && (entry.staticAtlas?.atlasFile || entry.animatedAtlas?.atlasFile))
      .map((entry) => entry.itemId),
  );
  const missingBrowserAtlasItemIds = browserItems
    .map((item) => item.itemId)
    .filter((itemId) => itemId && !browserAtlasItemIds.has(itemId));
  const staticBrowserAtlasItems = browserAtlasItems.filter((entry) => entry?.staticAtlas?.atlasFile).length;
  const animatedBrowserAtlasItems = browserAtlasItems.filter((entry) => entry?.animatedAtlas?.atlasFile).length;

  const recipeItemIndex = buildRecipeItemIndex(recipes);
  const recipeUiPayloads = recipes
    .map(buildRecipeUiPayload)
    .filter(Boolean);
  const recipeUiPayloadIndex = recipeUiPayloads.map((payload) => ({
    recipeId: payload.recipeId,
    path: `recipes/ui-payloads/${encodeRecipeFileName(payload.recipeId)}.json`,
    familyKey: payload.familyKey,
    recipeType: payload.recipeType,
    machineType: payload.machineType,
  }));
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
      animationTableItems: animationTable.length,
      browserAtlasItems: browserAtlasItems.length,
      staticBrowserAtlasItems,
      animatedBrowserAtlasItems,
      recipeCategories: recipeCategories.size,
      recipeItemIndexItems: recipeItemIndex.length,
      recipeUiPayloads: recipeUiPayloads.length,
    },
    missing: {
      itemId: items.filter((item) => !item.itemId).length,
      localizedName: items.filter((item) => item.itemId && !item.localizedName).length,
      renderAssetRef: items.filter((item) => item.itemId && !item.renderAssetRef).length,
      textureRows: Math.max(0, items.length - textures.length),
      browserAtlasItems: missingBrowserAtlasItemIds.length,
    },
    samples: {
      missingBrowserAtlasItemIds: missingBrowserAtlasItemIds.slice(0, 100),
    },
    coverage: {
      browserAtlasRatio: browserItems.length > 0 ? Number(((browserItems.length - missingBrowserAtlasItemIds.length) / browserItems.length).toFixed(6)) : 1,
    },
    warnings: [],
    elapsedMs: Date.now() - startedAt,
  };
  if (items.length === 0) validation.warnings.push("items.jsonl is empty; compiler output is structural only.");
  if (recipes.length === 0) validation.warnings.push("recipes.jsonl is empty; recipe indexes cannot be complete.");
  if (missingBrowserAtlasItemIds.length > 0) validation.warnings.push(`Browser atlas is missing drawable entries for ${missingBrowserAtlasItemIds.length} browser item(s).`);

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
      recipeItemIndex: "recipes/item-index.json",
      recipeUiPayloadIndex: "recipes/ui-payload-index.json",
      textureManifest: "textures/atlas-manifest.json",
      animationTable: "textures/animation-table.json",
      browserAtlasIndex: "textures/browser-atlas-index.json",
      validationReport: "validation/report.json",
    },
  });
  writeJsonCompact(join(outputDir, "search", "all.json"), { schemaVersion: "neonei/search-v3-json/v1", items: searchItems });
  writeJsonCompact(join(outputDir, "browser", "item-catalog.json"), { schemaVersion: "neonei/browser-catalog/v1", items: browserItems });
  writeJsonCompact(join(outputDir, "browser", "group-index.json"), { schemaVersion: "neonei/group-index/v1", groups });
  writeJsonCompact(join(outputDir, "recipes", "recipe-category-index.json"), { schemaVersion: "neonei/recipe-category-index/v1", categories: Array.from(recipeCategories.values()) });
  writeJsonCompact(join(outputDir, "recipes", "item-index.json"), { schemaVersion: "neonei/recipe-item-index/v1", items: recipeItemIndex });
  writeJsonCompact(join(outputDir, "recipes", "ui-payload-index.json"), { schemaVersion: "neonei/recipe-ui-payload-index/v1", recipes: recipeUiPayloadIndex });
  for (const payload of recipeUiPayloads) {
    writeJsonCompact(join(outputDir, "recipes", "ui-payloads", `${encodeRecipeFileName(payload.recipeId)}.json`), {
      schemaVersion: "neonei/recipe-ui-payload/v1",
      ...payload,
    });
  }
  writeJsonCompact(join(outputDir, "textures", "atlas-manifest.json"), { schemaVersion: "neonei/texture-manifest/v1", textures, animations });
  writeJsonCompact(join(outputDir, "textures", "animation-table.json"), { schemaVersion: "neonei/animation-table/v1", items: animationTable });
  writeJsonCompact(join(outputDir, "textures", "browser-atlas-index.json"), browserAtlasIndex ?? { schemaVersion: "neonei/browser-atlas-index/v1", items: [] });
  writeJson(join(outputDir, "validation", "report.json"), validation);
  return validation;
}

function createSelfTestRawExport(root) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  writeJson(join(root, "manifest.json"), { schemaVersion: "nesqlpp/raw-export/v3-alpha1", repositoryName: "self-test" });
  writeFileSync(join(root, "items.jsonl"), [
    JSON.stringify({ itemId: "i~minecraft~iron_ingot~0", modId: "minecraft", internalName: "iron_ingot", localizedName: "Iron Ingot", renderAssetRef: "nesqlpp:item/i~minecraft~iron_ingot~0", searchTerms: "iron ingot" }),
    JSON.stringify({ itemId: "i~botania~manaResource~4", modId: "botania", internalName: "manaResource", localizedName: "Terrasteel Ingot", renderAssetRef: "nesqlpp:item/i~botania~manaResource~4", searchTerms: "terrasteel" }),
  ].join("\n") + "\n", "utf8");
  writeFileSync(join(root, "fluids.jsonl"), `${JSON.stringify({ fluidId: "f~gregtech~molten.iron", localizedName: "Molten Iron" })}\n`, "utf8");
  writeFileSync(join(root, "recipes.jsonl"), `${JSON.stringify({ recipeId: "r1", family: "minecraft", machine: { machineId: "furnace", displayName: "Furnace" }, inputs: [{ itemId: "i~minecraft~iron_ore~0" }], outputs: [{ itemId: "i~minecraft~iron_ingot~0" }] })}\n`, "utf8");
  writeFileSync(join(root, "groups.jsonl"), `${JSON.stringify({ groupKey: "nei:iron", groupLabel: "Iron", groupSize: 1, representativeItemId: "i~minecraft~iron_ingot~0", memberItemIds: ["i~minecraft~iron_ingot~0"] })}\n`, "utf8");
  writeFileSync(join(root, "nei_order.jsonl"), `${JSON.stringify({ entryOrder: 0, entryKind: "item", itemId: "i~minecraft~iron_ingot~0" })}\n${JSON.stringify({ entryOrder: 1, entryKind: "item", itemId: "i~botania~manaResource~4" })}\n`, "utf8");
  writeFileSync(join(root, "textures.jsonl"), `${JSON.stringify({ assetId: "nesqlpp:item/i~minecraft~iron_ingot~0", atlasFile: "static-atlas-0.webp" })}\n${JSON.stringify({ assetId: "nesqlpp:item/i~botania~manaResource~4", atlasFile: "animated-atlas-0.webp", frameCount: 8, frameDurationMs: 100 })}\n`, "utf8");
  writeFileSync(join(root, "animations.jsonl"), `${JSON.stringify({ assetId: "nesqlpp:item/i~botania~manaResource~4", frameCount: 8, frameDurationMs: 100 })}\n`, "utf8");
  writeJson(join(root, "browser_atlas_index.json"), { schemaVersion: "browser-atlas-index-self-test", itemCount: 2, items: [{ itemId: "i~minecraft~iron_ingot~0", assetId: "nesqlpp:item/i~minecraft~iron_ingot~0", hasStaticAtlas: true, staticAtlas: { atlasFile: "static-atlas-0.webp", atlasWidth: 16, atlasHeight: 16, x: 0, y: 0, width: 16, height: 16 } }, { itemId: "i~botania~manaResource~4", assetId: "nesqlpp:item/i~botania~manaResource~4", hasAnimatedAtlas: true, animatedAtlas: { atlasFile: "animated-atlas-0.webp", atlasWidth: 16, atlasHeight: 128, frameCount: 8, frameDurationMs: 100, frames: [[0, 0, 0, 16, 16], [1, 0, 16, 16, 16]], timeline: [[0, 100], [1, 100]] } }] });
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
if (selfTest && (report.counts.items !== 2 || report.counts.recipes !== 1 || report.counts.animations !== 1 || report.counts.browserAtlasItems !== 2 || report.counts.recipeItemIndexItems !== 2 || report.counts.recipeUiPayloads !== 1)) {
  throw new Error("Self-test compiler counts did not match expected values");
}
