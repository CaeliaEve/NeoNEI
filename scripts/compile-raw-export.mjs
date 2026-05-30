import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  const rows = [];
  const fd = openSync(filePath, "r");
  const decoder = new TextDecoder("utf-8");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  let pending = "";
  let lineNumber = 0;
  const parseLine = (rawLine) => {
    lineNumber += 1;
    const line = rawLine.trim();
    if (!line) return;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Invalid JSONL at ${filePath}:${lineNumber}: ${error.message}`);
    }
  };
  try {
    while (true) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead <= 0) break;
      pending += decoder.decode(buffer.subarray(0, bytesRead), { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) parseLine(line);
    }
    pending += decoder.decode();
    if (pending) parseLine(pending);
    return rows;
  } finally {
    closeSync(fd);
  }
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readJsonIfReasonable(filePath, maxBytes = 128 * 1024 * 1024) {
  if (!existsSync(filePath)) return null;
  const size = statSync(filePath).size;
  if (size > maxBytes) return null;
  return readJson(filePath);
}

function resolveRawFile(inputDir, manifest, logicalName, fallbackPath) {
  const declared = manifest?.files?.[logicalName];
  const relativePath = `${declared || fallbackPath || ""}`.trim();
  return relativePath ? join(inputDir, relativePath) : null;
}

function readRawJsonl(inputDir, manifest, logicalName, fallbackPath) {
  const declaredPath = resolveRawFile(inputDir, manifest, logicalName, fallbackPath);
  if (declaredPath && existsSync(declaredPath)) {
    return readJsonl(declaredPath);
  }
  if (fallbackPath) {
    return readJsonl(join(inputDir, fallbackPath));
  }
  return [];
}

function readRawJson(inputDir, manifest, logicalName, fallbackPath) {
  const declaredPath = resolveRawFile(inputDir, manifest, logicalName, fallbackPath);
  if (declaredPath && existsSync(declaredPath)) {
    return readJson(declaredPath);
  }
  if (fallbackPath) {
    return readJson(join(inputDir, fallbackPath));
  }
  return null;
}

function readRawRecipes(inputDir, manifest) {
  const index = readRawJson(inputDir, manifest, "recipeIndex", "facts/recipes/index.json");
  const shards = Array.isArray(index?.shards) ? index.shards : [];
  const recipes = [];
  for (const shard of shards) {
    const shardPath = `${shard?.path ?? ""}`.trim();
    if (!shardPath) continue;
    const shardFile = join(inputDir, shardPath);
    if (!existsSync(shardFile)) continue;
    recipes.push(...readJsonl(shardFile));
  }
  if (recipes.length > 0 || shards.length > 0) {
    return recipes;
  }
  return readRawJsonl(inputDir, manifest, "recipes", "recipes.jsonl");
}

function buildRawExportCountMismatches(exportReport, actualCounts) {
  const reported = exportReport?.counts ?? {};
  const pairs = [
    ["items", "rawItems", "items"],
    ["fluids", "rawFluids", "fluids"],
    ["recipes", "rawRecipes", "recipes"],
    ["groups", "rawGroups", "groups"],
    ["neiOrderEntries", "rawNeiOrderEntries", "neiOrderEntries"],
    ["textures", "rawTextures", "textures"],
    ["animations", "rawAnimations", "animations"],
    ["entities", "rawEntities", "entities"],
  ];
  const mismatches = [];
  for (const [label, reportKey, actualKey] of pairs) {
    if (reported[reportKey] === undefined || reported[reportKey] === null) continue;
    const expected = stableNumber(reported[reportKey], 0);
    const actual = stableNumber(actualCounts[actualKey], 0);
    if (expected !== actual) {
      mismatches.push({ label, expected, actual, reportKey });
    }
  }
  return mismatches;
}

function readCanonicalSibling(inputDir, manifest, siblingFileName) {
  const repositoryPath = resolveRawFile(inputDir, manifest, "canonicalRepository", null);
  if (!repositoryPath) return null;
  return readJsonIfReasonable(join(dirname(repositoryPath), siblingFileName));
}

function buildCanonicalCountMismatches(canonicalRepository, canonicalBrowserLayout, canonicalRenderAssets, actualCounts) {
  const pairs = [
    ["items", canonicalRepository?.items, "items", "canonicalRepository"],
    ["fluids", canonicalRepository?.fluids, "fluids", "canonicalRepository"],
    ["recipes", canonicalRepository?.recipes, "recipes", "canonicalRepository"],
    ["groups", canonicalBrowserLayout?.groups, "groups", "canonicalBrowserLayout"],
    ["neiOrderEntries", canonicalBrowserLayout?.defaultEntries, "neiOrderEntries", "canonicalBrowserLayout"],
    ["textures", canonicalRenderAssets?.assets, "textures", "canonicalRenderAssets"],
  ];
  const mismatches = [];
  for (const [label, canonicalRows, actualKey, source] of pairs) {
    if (!Array.isArray(canonicalRows)) continue;
    const expected = canonicalRows.length;
    const actual = stableNumber(actualCounts[actualKey], 0);
    if (expected !== actual) {
      mismatches.push({ label, expected, actual, source });
    }
  }
  if (Array.isArray(canonicalRenderAssets?.assets)) {
    const expected = canonicalRenderAssets.assets.filter((asset) => isAnimatedResource(asset, null)).length;
    const actual = stableNumber(actualCounts.animations, 0);
    if (expected !== actual) {
      mismatches.push({ label: "animations", expected, actual, source: "canonicalRenderAssets" });
    }
  }
  return mismatches;
}

function buildMigrationReadiness(validation, exportReport, canonicalRepository, specialDomains, atlasAuthorityReport) {
  const gate = (name, ok, summary, details = {}) => ({
    name,
    status: ok ? "ready" : "blocked",
    summary,
    ...details,
  });
  const hasCanonical = Boolean(canonicalRepository);
  const specialPayloadMismatches = stableNumber(validation.counts.specialPayloadMismatches, 0);
  const rawExportMismatches = stableNumber(validation.counts.rawExportCountMismatches, 0);
  const canonicalMismatches = stableNumber(validation.counts.canonicalCountMismatches, 0);
  const exporterReadinessStatus = `${exportReport?.validation?.readinessStatus ?? ""}`.trim();
  const exporterValidationStatus = `${exportReport?.validation?.status ?? ""}`.trim();
  const exporterReady = Boolean(exportReport) && (!exporterReadinessStatus || exporterReadinessStatus === "ready");
  const atlasMissing =
    stableNumber(validation.missing.browserAtlasItems, 0) +
    stableNumber(validation.missing.browserAtlasDrawableItems, 0) +
    stableNumber(validation.missing.browserAtlasFiles, 0) +
    stableNumber(validation.missing.atlasAssetRefs, 0) +
    stableNumber(validation.missing.browserAtlasDuplicateItemIds, 0);
  const coreMissing =
    stableNumber(validation.missing.itemId, 0) +
    stableNumber(validation.missing.renderAssetRef, 0);
  const gates = [
    gate(
      "raw-report-parity",
      exporterReady && rawExportMismatches === 0,
      exporterReady && rawExportMismatches === 0
        ? "Compiler counts match exporter report and exporter readiness is acceptable."
        : `${rawExportMismatches} exporter/compiler count area(s) differ or exporter readiness is blocked.`,
      {
        mismatchCount: rawExportMismatches,
        exporterReadinessStatus: exporterReadinessStatus || null,
        exporterValidationStatus: exporterValidationStatus || null,
        exporterBlockedGates: (exportReport?.validation?.gates ?? [])
          .filter((entry) => entry?.status && entry.status !== "ready")
          .map((entry) => entry.name ?? "unknown"),
      },
    ),
    gate(
      "canonical-parity",
      !hasCanonical || canonicalMismatches === 0,
      hasCanonical
        ? canonicalMismatches === 0
          ? "Raw Export output matches legacy canonical counts."
          : `${canonicalMismatches} canonical count area(s) differ.`
        : "Legacy canonical repository was skipped; Raw Export is the authoritative migration source.",
      { mismatchCount: canonicalMismatches, canonicalAvailable: hasCanonical },
    ),
    gate(
      "atlas-authority",
      atlasMissing === 0 && atlasAuthorityReport.coverageRatio === 1,
      atlasMissing === 0 ? "Browser atlas is complete and authoritative." : `${atlasMissing} atlas authority issue(s) remain.`,
      { issueCount: atlasMissing, coverageRatio: atlasAuthorityReport.coverageRatio },
    ),
    gate(
      "special-payloads",
      specialPayloadMismatches === 0,
      specialPayloadMismatches === 0 ? "Special-domain recipe rows and payload rows are aligned." : `${specialPayloadMismatches} special domain(s) have payload drift.`,
      { mismatchCount: specialPayloadMismatches, domainCount: specialDomains.length },
    ),
    gate(
      "core-fields",
      coreMissing === 0,
      coreMissing === 0 ? "Core item identifiers and render references are complete." : `${coreMissing} core field issue(s) remain.`,
      { issueCount: coreMissing },
    ),
  ];
  const blocked = gates.filter((entry) => entry.status !== "ready");
  return {
    schemaVersion: "neonei/raw-export-migration-readiness/v1",
    status: blocked.length === 0 ? "ready" : "blocked",
    summary:
      blocked.length === 0
        ? "Raw Export is ready to be treated as the primary compiler source for covered data."
        : `Raw Export is blocked by ${blocked.length} readiness gate(s).`,
    gates,
    blockedGates: blocked.map((entry) => entry.name),
  };
}

function fileSizeIfPresent(filePath) {
  try {
    return filePath && existsSync(filePath) ? statSync(filePath).size : -1;
  } catch {
    return -1;
  }
}

function validateRawManifest(inputDir, manifest) {
  const knownCapabilities = new Set(["facts", "assets", "models", "special", "validation"]);
  const warnings = [];
  const missing = [];
  const empty = [];
  const unknownCapabilities = [];
  if (!manifest) {
    warnings.push("raw-export manifest.json is missing; compiler is using legacy file fallbacks.");
    return { warnings, missing, empty, unknownCapabilities };
  }

  for (const capability of manifest.capabilities ?? []) {
    if (!knownCapabilities.has(capability)) unknownCapabilities.push(capability);
  }
  if (unknownCapabilities.length > 0) {
    warnings.push(`Raw Export manifest declares unknown capabilities: ${unknownCapabilities.join(", ")}.`);
  }

  const requiredFiles = ["items", "recipes", "recipeIndex", "groups", "neiOrder", "textures", "browserAtlasIndex"];
  for (const logicalName of requiredFiles) {
    const filePath = resolveRawFile(inputDir, manifest, logicalName, null);
    if (!filePath || !existsSync(filePath)) {
      missing.push(logicalName);
      continue;
    }
    if (fileSizeIfPresent(filePath) === 0 && logicalName !== "groups" && logicalName !== "neiOrder") {
      empty.push(logicalName);
    }
  }

  const index = readRawJson(inputDir, manifest, "recipeIndex", "facts/recipes/index.json");
  const shards = Array.isArray(index?.shards) ? index.shards : [];
  const missingRecipeShards = [];
  for (const shard of shards) {
    const shardPath = `${shard?.path ?? ""}`.trim();
    if (!shardPath || !existsSync(join(inputDir, shardPath))) {
      missingRecipeShards.push(shard?.handlerId ?? shardPath ?? "unknown");
    }
  }
  if (missingRecipeShards.length > 0) {
    warnings.push(`Recipe index references ${missingRecipeShards.length} missing shard file(s).`);
  }
  return { warnings, missing, empty, unknownCapabilities, missingRecipeShards };
}

function normalizeAtlasFileRef(value) {
  const normalized = `${value ?? ""}`.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized || null;
}

function resolveAtlasFileForValidation(inputDir, atlasFile) {
  const normalized = normalizeAtlasFileRef(atlasFile);
  if (!normalized) return null;
  const candidates = [
    join(inputDir, normalized),
    join(inputDir, "..", normalized),
  ];
  return {
    atlasFile: normalized,
    exists: candidates.some((candidate) => existsSync(candidate)),
  };
}

function buildAtlasAuthorityReport(inputDir, browserItems, browserAtlasItems, renderByAssetId) {
  const byItemId = new Map();
  const duplicates = [];
  const duplicateSamples = [];
  const atlasFiles = new Map();
  const mismatchedAssetRefs = [];
  const atlasEntriesWithoutDrawable = [];

  for (const entry of browserAtlasItems) {
    const itemId = `${entry?.itemId ?? ""}`.trim();
    if (!itemId) continue;
    const existing = byItemId.get(itemId);
    if (existing) {
      duplicates.push(itemId);
      if (duplicateSamples.length < 50) {
        duplicateSamples.push({
          itemId,
          firstAssetId: existing.assetId ?? null,
          nextAssetId: entry.assetId ?? null,
        });
      }
      continue;
    }
    byItemId.set(itemId, entry);

    const files = [entry.staticAtlas?.atlasFile, entry.animatedAtlas?.atlasFile]
      .map(normalizeAtlasFileRef)
      .filter(Boolean);
    if (files.length === 0) {
      atlasEntriesWithoutDrawable.push(itemId);
    }
    for (const atlasFile of files) {
      if (!atlasFiles.has(atlasFile)) atlasFiles.set(atlasFile, resolveAtlasFileForValidation(inputDir, atlasFile));
    }
  }

  const missingBrowserAtlasItemIds = [];
  const missingRenderAssetRefs = [];
  const missingDrawableItemIds = [];

  for (const item of browserItems) {
    const itemId = `${item?.itemId ?? ""}`.trim();
    if (!itemId) continue;
    const atlasEntry = byItemId.get(itemId);
    if (!atlasEntry) {
      missingBrowserAtlasItemIds.push(itemId);
      continue;
    }
    const hasDrawable = Boolean(atlasEntry.staticAtlas?.atlasFile || atlasEntry.animatedAtlas?.atlasFile);
    if (!hasDrawable) {
      missingDrawableItemIds.push(itemId);
    }
    const renderAssetRef = `${item.renderAssetRef ?? ""}`.trim();
    if (renderAssetRef && !renderByAssetId.has(renderAssetRef)) {
      missingRenderAssetRefs.push(renderAssetRef);
    }
    const atlasAssetId = `${atlasEntry.assetId ?? ""}`.trim();
    if (renderAssetRef && atlasAssetId && renderAssetRef !== atlasAssetId) {
      mismatchedAssetRefs.push({ itemId, renderAssetRef, atlasAssetId });
    }
  }

  const referencedAtlasFiles = Array.from(atlasFiles.values()).filter(Boolean);
  const missingAtlasFiles = referencedAtlasFiles
    .filter((entry) => !entry.exists)
    .map((entry) => entry.atlasFile);

  const total = browserItems.length;
  const drawable = total - missingBrowserAtlasItemIds.length - missingDrawableItemIds.length;
  return {
    totalBrowserItems: total,
    indexedBrowserItems: total - missingBrowserAtlasItemIds.length,
    drawableBrowserItems: drawable,
    referencedAtlasFiles: referencedAtlasFiles.length,
    presentAtlasFiles: referencedAtlasFiles.length - missingAtlasFiles.length,
    duplicateItemIds: duplicates.length,
    atlasEntriesWithoutDrawable: atlasEntriesWithoutDrawable.length,
    missingDrawableItemIds: missingDrawableItemIds.length,
    missingRenderAssetRefs: missingRenderAssetRefs.length,
    mismatchedAssetRefs: mismatchedAssetRefs.length,
    missingAtlasFiles: missingAtlasFiles.length,
    coverageRatio: total > 0 ? Number((drawable / total).toFixed(6)) : 1,
    samples: {
      missingBrowserAtlasItemIds: missingBrowserAtlasItemIds.slice(0, 100),
      missingDrawableItemIds: missingDrawableItemIds.slice(0, 100),
      missingRenderAssetRefs: Array.from(new Set(missingRenderAssetRefs)).slice(0, 100),
      mismatchedAssetRefs: mismatchedAssetRefs.slice(0, 50),
      duplicateItemIds: duplicateSamples,
      atlasEntriesWithoutDrawable: atlasEntriesWithoutDrawable.slice(0, 100),
      missingAtlasFiles: missingAtlasFiles.slice(0, 100),
    },
  };
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
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) {
    return stableNumber(value.value, fallback);
  }
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

function normalizeRecipeCategoryName(value) {
  return `${value ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/鎼俒0-9a-fk-or]/gi, "")
    .replace(/\s+/g, " ");
}

function recipeCategoryDisplayName(recipe) {
  return `${recipe.machine?.displayName ?? recipe.displayName ?? recipe.machine?.machineType ?? recipe.recipeType ?? recipe.family ?? recipe.sourcePlugin ?? "unknown"}`.trim() || "unknown";
}

function recipeCategoryRawId(recipe) {
  return `${recipe.machine?.machineId ?? recipe.family ?? recipe.sourcePlugin ?? recipe.recipeType ?? "unknown"}`.trim() || "unknown";
}

function recipeCategoryIdFromDisplayName(displayName, rawId) {
  const normalized = normalizeRecipeCategoryName(displayName);
  if (!normalized || normalized === "unknown") return rawId;
  return `display~${encodeRecipeFileName(normalized)}`;
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

  if ((descriptor.includes("industrial") && descriptor.includes("slaughter")) || includesAny(descriptor, ["extreme entity crusher", "infernal drops", "mobsinfo", "kubatech"])) return "industrial_slaughterhouse";
  if (includesAny(descriptor, ["terra plate", "terraplate"])) return "botania_terra_plate";
  if (includesAny(descriptor, ["rune altar", "runic altar"])) return "botania_rune_altar";
  if (includesAny(descriptor, ["mana pool"])) return "botania_mana_pool";
  if (includesAny(descriptor, ["pure daisy"])) return "botania_pure_daisy";
  if (includesAny(descriptor, ["elven trade", "alfheim"])) return "botania_elven_trade";
  if ((descriptor.includes("thaumcraft") && descriptor.includes("infusion")) || includesAny(descriptor, ["arcane infusion"])) return "thaumcraft_infusion";
  if ((descriptor.includes("thaumcraft") && descriptor.includes("crucible")) || includesAny(descriptor, ["crucible"])) return "thaumcraft_crucible";
  if (includesAny(descriptor, ["arcane work", "arcane crafting"])) return "thaumcraft_arcane";
  if (includesAny(descriptor, ["aspect combination", "aspects from items"])) return "thaumcraft_aspect";
  if (includesAny(descriptor, ["research station"])) return "gt_research_station";
  if (includesAny(descriptor, ["assembly line"])) return "gt_assembly_line";
  if (includesAny(descriptor, ["chemical reactor", "large chemical reactor"])) return "gt_chemical_reactor";
  if (includesAny(descriptor, ["blood altar"])) return "blood_magic_altar";
  if (includesAny(descriptor, ["alchemy array", "alchemy table"])) return "blood_alchemy_table";
  if (includesAny(descriptor, ["binding ritual"])) return "blood_binding_ritual";

  return fallback;
}function buildRecipeUiPayload(recipe) {
  const recipeId = `${recipe.recipeId ?? recipe.id ?? recipe.key ?? ""}`.trim();
  if (!recipeId) return null;
  const inputItemIds = new Set();
  const outputItemIds = new Set();
  collectRecipeItemIds(recipe.inputs ?? recipe.inputItems ?? recipe.itemInputs ?? recipe.ingredients ?? recipe.catalysts ?? recipe.input, inputItemIds);
  collectRecipeItemIds(recipe.outputs ?? recipe.outputItems ?? recipe.itemOutputs ?? recipe.results ?? recipe.result ?? recipe.output, outputItemIds);
  const rawFamilyKey = `${recipe.family ?? recipe.sourcePlugin ?? recipe.recipeType ?? recipe.machine?.machineId ?? "unknown"}`.trim() || "unknown";
  const familyKey = classifyRecipeFamilyKey(recipe, rawFamilyKey);
  const recipeType = `${recipe.recipeType ?? recipe.machine?.machineId ?? familyKey}`.trim() || familyKey;
  const machineType = `${recipe.machine?.displayName ?? recipe.displayName ?? recipe.machine?.machineId ?? recipeType}`.trim() || recipeType;
  const payload = {
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
  const domainFacts = compactFactObject(recipe.domainFacts);
  const metadataFacts = compactFactObject(recipe.metadata);
  const layoutFacts = compactFactObject(recipe.layout);
  if (domainFacts) payload.domainFacts = domainFacts;
  if (metadataFacts) payload.metadata = metadataFacts;
  if (layoutFacts) payload.layout = layoutFacts;
  return payload;
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
    collectRecipeItemIds(recipe.outputs ?? recipe.outputItems ?? recipe.itemOutputs ?? recipe.results ?? recipe.result ?? recipe.output, outputIds);
    for (const itemId of outputIds) {
      const bucket = ensure(itemId);
      if (bucket) bucket.producedBy.push(summary);
    }

    const inputIds = new Set();
    collectRecipeItemIds(recipe.inputs ?? recipe.inputItems ?? recipe.itemInputs ?? recipe.ingredients ?? recipe.catalysts ?? recipe.input, inputIds);
    for (const itemId of inputIds) {
      const bucket = ensure(itemId);
      if (bucket) bucket.usedIn.push(summary);
    }
  }

  return Array.from(byItemId.values())
    .sort((left, right) => left.itemId.localeCompare(right.itemId));
}


function mergeAnimationFacts(animations, nativeSprites, renderedGifs) {
  const byAssetId = new Map();
  const addAll = (rows, sourceKind) => {
    for (const row of rows ?? []) {
      if (!row?.assetId) continue;
      byAssetId.set(row.assetId, {
        ...(byAssetId.get(row.assetId) ?? {}),
        ...row,
        animationSourceKind: sourceKind,
      });
    }
  };
  addAll(animations, "index");
  addAll(nativeSprites, "native_sprite");
  addAll(renderedGifs, "rendered_gif");
  return Array.from(byAssetId.values()).sort((left, right) => `${left.assetId}`.localeCompare(`${right.assetId}`));
}
function normalizeAnimationTimeline(sourceTimeline, frameCount, fallbackDurationMs) {
  const timeline = Array.isArray(sourceTimeline) ? sourceTimeline : [];
  if (timeline.length > 0) {
    return timeline
      .map((frame, index) => {
        if (Array.isArray(frame)) {
          return {
            frameIndex: stableNumber(frame[0] ?? index, index),
            durationMs: Math.max(16, Math.round(stableNumber(frame[1], fallbackDurationMs))),
          };
        }
        return {
          frameIndex: stableNumber(frame?.frameIndex ?? frame?.index ?? index, index),
          durationMs: Math.max(16, Math.round(stableNumber(frame?.durationMs ?? frame?.duration ?? frame?.timeMs, fallbackDurationMs))),
        };
      })
      .filter((frame) => frame.frameIndex >= 0);
  }

  const count = Math.max(0, Math.floor(stableNumber(frameCount, 0)));
  return Array.from({ length: count }, (_, index) => ({
    frameIndex: index,
    durationMs: Math.max(16, Math.round(stableNumber(fallbackDurationMs, 50))),
  }));
}

function numericField(source, keys, fallback = null) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null) {
      const parsed = stableNumber(source[key], NaN);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function firstPresent(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && `${value}`.trim()) return value;
  }
  return null;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function compactFactValue(value, depth = 0) {
  if (value === null || value === undefined) return undefined;
  if (depth > 5) return undefined;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed && trimmed.length <= 512 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const compacted = value
      .slice(0, 64)
      .map((entry) => compactFactValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
    return compacted.length > 0 ? compacted : undefined;
  }
  if (!isPlainObject(value)) return undefined;
  const compacted = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalized = compactFactValue(entry, depth + 1);
    if (normalized !== undefined) compacted[key] = normalized;
  }
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function compactFactObject(value) {
  const compacted = compactFactValue(value, 0);
  return isPlainObject(compacted) && Object.keys(compacted).length > 0 ? compacted : null;
}

function normalizeAtlasFrames(frames, fallbackWidth, fallbackHeight) {
  if (!Array.isArray(frames)) return [];
  return frames
    .map((frame, index) => {
      if (Array.isArray(frame)) return frame;
      const width = numericField(frame, ["width", "w"], fallbackWidth);
      const height = numericField(frame, ["height", "h"], fallbackHeight);
      return [
        numericField(frame, ["frameIndex", "index"], index),
        numericField(frame, ["x", "u"], 0),
        numericField(frame, ["y", "v"], index * stableNumber(height, 16)),
        stableNumber(width, 16),
        stableNumber(height, 16),
      ];
    })
    .filter((frame) => Array.isArray(frame) && frame.length >= 5);
}

function normalizeBrowserAtlasPlacement(placement, animated = false) {
  if (!placement || typeof placement !== "object") return null;
  const width = stableNumber(placement.width, 16);
  const height = stableNumber(placement.height, 16);
  const normalized = {
    ...placement,
    atlasWidth: placement.atlasWidth === null || placement.atlasWidth === undefined ? null : stableNumber(placement.atlasWidth, null),
    atlasHeight: placement.atlasHeight === null || placement.atlasHeight === undefined ? null : stableNumber(placement.atlasHeight, null),
    x: stableNumber(placement.x, 0),
    y: stableNumber(placement.y, 0),
    width,
    height,
  };
  if (animated) {
    const frameCount = stableNumber(placement.frameCount, Array.isArray(placement.frames) ? placement.frames.length : 0);
    const frameDurationMs = stableNumber(placement.frameDurationMs, 50);
    normalized.frameCount = frameCount;
    normalized.frameDurationMs = frameDurationMs;
    normalized.frames = normalizeAtlasFrames(placement.frames, width, height);
    normalized.timeline = normalizeAnimationTimeline(placement.timeline, frameCount, frameDurationMs);
  }
  return normalized;
}

function normalizeBrowserAtlasEntry(entry) {
  if (!entry || typeof entry !== "object") return entry;
  return {
    ...entry,
    staticAtlas: normalizeBrowserAtlasPlacement(entry.staticAtlas, false),
    animatedAtlas: normalizeBrowserAtlasPlacement(entry.animatedAtlas, true),
    hasStaticAtlas: Boolean(entry.staticAtlas?.atlasFile),
    hasAnimatedAtlas: Boolean(entry.animatedAtlas?.atlasFile),
  };
}

function buildPlacementFromResource(resource, animation = null, animated = false) {
  if (!resource && !animation) return null;
  const source = { ...(resource ?? {}), ...(animation ?? {}) };
  const atlasFile = normalizeAtlasFileRef(firstPresent(source, ["atlasFile", "atlasTexture", "atlasExportFile", "nativeSpriteAtlasFile"]));
  if (!atlasFile) return null;

  const rect = source.rect && typeof source.rect === "object" ? source.rect : {};
  const baseSize = source.baseSize && typeof source.baseSize === "object" ? source.baseSize : {};
  const width = numericField(rect, ["width", "w"], numericField(baseSize, ["width", "w"], 16));
  const height = numericField(rect, ["height", "h"], numericField(baseSize, ["height", "h"], 16));
  const placement = {
    atlasFile,
    atlasGroup: source.atlasGroup ?? null,
    atlasWidth: numericField(source, ["atlasWidth"], null),
    atlasHeight: numericField(source, ["atlasHeight"], null),
    x: numericField(rect, ["x", "u"], 0),
    y: numericField(rect, ["y", "v"], 0),
    width: stableNumber(width, 16),
    height: stableNumber(height, 16),
  };

  if (!animated) return placement;
  const frameCount = stableNumber(source.frameCount ?? source.capturedFrameCount ?? source.configuredFrameCount, 0);
  const frameDurationMs = stableNumber(source.frameDurationMs, 50);
  return {
    ...placement,
    frameCount,
    frameDurationMs,
    frames: normalizeAtlasFrames(source.frames, placement.width, placement.height),
    timeline: normalizeAnimationTimeline(source.timeline, frameCount, frameDurationMs),
  };
}

function isAnimatedResource(resource, animation) {
  const source = { ...(resource ?? {}), ...(animation ?? {}) };
  return stableNumber(source.frameCount ?? source.capturedFrameCount ?? source.configuredFrameCount, 0) > 1
    || Array.isArray(source.frames) && source.frames.length > 1
    || Array.isArray(source.timeline) && source.timeline.length > 1
    || [source.animationMode, source.mode, source.playbackHint].some((value) => `${value ?? ""}`.toLowerCase().includes("anim"));
}

function buildBrowserAtlasIndexFromResources(existingIndex, browserItems, textures, animationFacts) {
  const textureByAssetId = new Map(textures.filter((entry) => entry?.assetId).map((entry) => [entry.assetId, entry]));
  const animationByAssetId = new Map(animationFacts.filter((entry) => entry?.assetId).map((entry) => [entry.assetId, entry]));
  const byItemId = new Map();
  for (const entry of existingIndex?.items ?? []) {
    if (entry?.itemId) byItemId.set(entry.itemId, { ...entry });
  }

  let generatedFromResourceIndex = 0;
  let repairedFromResourceIndex = 0;
  for (const item of browserItems) {
    const itemId = `${item?.itemId ?? ""}`.trim();
    if (!itemId) continue;
    const assetId = `${item.renderAssetRef ?? ""}`.trim() || `nesqlpp:item/${itemId}`;
    const texture = textureByAssetId.get(assetId);
    const animation = animationByAssetId.get(assetId);
    if (!texture && !animation) continue;

    const animated = isAnimatedResource(texture, animation);
    const placement = buildPlacementFromResource(texture, animation, animated);
    if (!placement) continue;

    const current = byItemId.get(itemId);
    const needsDrawable = !current?.staticAtlas?.atlasFile && !current?.animatedAtlas?.atlasFile;
    const needsAssetRepair = current?.assetId && current.assetId !== assetId;
    if (!current || needsDrawable || needsAssetRepair) {
      byItemId.set(itemId, {
        ...(current ?? {}),
        itemId,
        assetId,
        mode: current?.mode ?? texture?.mode ?? animation?.mode ?? null,
        renderMode: current?.renderMode ?? texture?.renderMode ?? animation?.renderMode ?? null,
        resolutionMode: current?.resolutionMode ?? texture?.resolutionMode ?? animation?.resolutionMode ?? null,
        rendererFamily: current?.rendererFamily ?? texture?.family ?? animation?.family ?? null,
        playbackHint: current?.playbackHint ?? texture?.playbackHint ?? animation?.playbackHint ?? null,
        staticAtlas: animated ? (current?.staticAtlas ?? null) : placement,
        animatedAtlas: animated ? placement : (current?.animatedAtlas ?? null),
        hasStaticAtlas: animated ? Boolean(current?.staticAtlas?.atlasFile) : true,
        hasAnimatedAtlas: animated ? true : Boolean(current?.animatedAtlas?.atlasFile),
        generatedByCompiler: true,
      });
      if (current) repairedFromResourceIndex += 1;
      else generatedFromResourceIndex += 1;
    }
  }

  const items = Array.from(byItemId.values()).map(normalizeBrowserAtlasEntry).sort((left, right) => `${left.itemId}`.localeCompare(`${right.itemId}`));
  return {
    ...(existingIndex ?? {}),
    schemaVersion: existingIndex?.schemaVersion ?? "neonei/browser-atlas-index/generated-from-raw-export",
    generatedByCompiler: true,
    generatedFromResourceIndex,
    repairedFromResourceIndex,
    itemCount: items.length,
    animatedItemCount: items.filter((entry) => entry?.animatedAtlas?.atlasFile).length,
    missingAtlasCount: items.filter((entry) => !entry?.staticAtlas?.atlasFile && !entry?.animatedAtlas?.atlasFile).length,
    items,
  };
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
      frameDurationSource: normalizeFrameDurationSource(entry, animation, texture),
      atlasFile: animated.atlasFile ?? texture.atlasFile ?? texture.atlasTexture ?? null,
      atlasGroup: animated.atlasGroup ?? texture.atlasGroup ?? null,
      atlasWidth: stableNumber(animated.atlasWidth, stableNumber(texture.atlasWidth, null)),
      atlasHeight: stableNumber(animated.atlasHeight, stableNumber(texture.atlasHeight, null)),
      frameCount: stableNumber(animated.frameCount, stableNumber(animation.frameCount, stableNumber(animation.capturedFrameCount, stableNumber(animation.configuredFrameCount, stableNumber(texture.frameCount, 0))))),
      frameDurationMs: stableNumber(animated.frameDurationMs, stableNumber(animation.frameDurationMs, stableNumber(texture.frameDurationMs, 50))),
      timeline: normalizeAnimationTimeline(animated.timeline ?? animation.timeline, animated.frameCount ?? animation.frameCount ?? animation.capturedFrameCount ?? animation.configuredFrameCount ?? texture.frameCount, animated.frameDurationMs ?? animation.frameDurationMs ?? texture.frameDurationMs ?? 50),
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
      frameDurationSource: normalizeFrameDurationSource(animation, animation, texture),
      atlasFile: animation.atlasFile ?? texture.atlasFile ?? texture.atlasTexture ?? null,
      atlasGroup: animation.atlasGroup ?? texture.atlasGroup ?? null,
      atlasWidth: stableNumber(animation.atlasWidth, stableNumber(texture.atlasWidth, null)),
      atlasHeight: stableNumber(animation.atlasHeight, stableNumber(texture.atlasHeight, null)),
      frameCount: stableNumber(animation.frameCount, stableNumber(animation.capturedFrameCount, stableNumber(animation.configuredFrameCount, stableNumber(texture.frameCount, 0)))),
      frameDurationMs: stableNumber(animation.frameDurationMs, stableNumber(texture.frameDurationMs, 50)),
      timeline: normalizeAnimationTimeline(animation.timeline, animation.frameCount ?? animation.capturedFrameCount ?? animation.configuredFrameCount ?? texture.frameCount, animation.frameDurationMs ?? texture.frameDurationMs ?? 50),
    });
  }

  return Array.from(byItemId.values())
    .filter((entry) => entry.atlasFile || entry.frameCount > 1 || entry.timeline.length > 1)
    .sort((left, right) => left.itemId.localeCompare(right.itemId));
}

function normalizeFrameDurationSource(entry, animation = {}, texture = {}) {
  const inferred = inferFrameDurationSource(entry, animation, texture);
  const declared = animation?.frameDurationSource ?? texture?.frameDurationSource ?? null;
  if (declared === "gif_metadata" && inferred === "minecraft_tick_capture") return inferred;
  return declared ?? inferred;
}
function inferFrameDurationSource(entry, animation = {}, texture = {}) {
  const mode = `${entry?.mode ?? animation?.mode ?? texture?.mode ?? ""}`;
  const animationMode = `${entry?.animationMode ?? animation?.animationMode ?? texture?.animationMode ?? ""}`;
  const playbackHint = `${entry?.playbackHint ?? animation?.playbackHint ?? texture?.playbackHint ?? ""}`;
  if (mode === "native_sprite_animation" || animationMode.includes("native_sprite") || playbackHint === "native_sprite") {
    return "native_sprite_metadata";
  }
  if (mode === "rendered_frames" || playbackHint === "atlas_timeline") return "minecraft_tick_capture";
  if (animationMode === "gif_sequence") return "gif_metadata";
  return null;
}

function normalizeBrowserGroups(groups, availableItemIds) {
  return (groups ?? [])
    .filter((group) => group?.groupKey)
    .map((group) => {
      const members = Array.from(new Set((group.memberItemIds ?? []).filter((itemId) => availableItemIds.has(itemId))));
      const representative = availableItemIds.has(group.representativeItemId)
        ? group.representativeItemId
        : (members[0] ?? group.representativeItemId ?? null);
      const groupSize = members.length > 0 ? members.length : stableNumber(group.groupSize, 1);
      return {
        ...group,
        representativeItemId: representative,
        memberItemIds: members,
        groupSize,
      };
    });
}

function sanitizePathSegment(value) {
  return `${value ?? "unknown"}`.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

const EXPECTED_SPECIAL_FACT_KEYS = {
  gregtech: ["duration", "voltage", "amperage", "totalEU", "voltageTier", "requiresCleanroom", "requiresLowGravity"],
  thaumcraft: ["research", "centralItemId", "centerInputSlotIndex", { key: "aspects", aliases: ["aspects", "aspect", "aspectCosts", "inputAspects"] }, "instability"],
  botania: [{ key: "mana", aliases: ["mana", "manaCost"] }, "ticks", "catalyst", { key: "recipeKind", aliases: ["recipeKind", "brewKey", "correctedMachineType"] }],
  bloodmagic: ["bloodCost", "lpCost", "requiredLP", "tier", { key: "altarTier", aliases: ["altarTier", "tier"] }, "consumptionRate", "drainRate"],
  forestry: ["chance", { key: "allele", aliases: ["allele", "alleles"] }, { key: "species", aliases: ["species", "beeSpecies", "mutations"] }, "temperature", "humidity"],
  eec: ["mobName", { key: "entityId", aliases: ["entityId", "mobName", "entityName"] }, { key: "health", aliases: ["health", "maxHealth"] }, { key: "drops", aliases: ["drops", "normalOutputsCount", "rareOutputsCount", "infernalOutputsCount"] }, { key: "dropChance", aliases: ["dropChance", "eliteChance", "ultraChance", "infernoChance"] }],
};

function incrementCounter(map, key) {
  const normalized = `${key ?? ""}`.trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function countFactKeys(source, counter, prefix = "") {
  if (!isPlainObject(source)) return;
  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined || value === "") continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    incrementCounter(counter, fullKey);
    if (isPlainObject(value) && prefix.split(".").length < 2) {
      countFactKeys(value, counter, fullKey);
    }
  }
}

function summarizeCounter(counter, total) {
  return Array.from(counter.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({
      key,
      count,
      ratio: total > 0 ? Number((count / total).toFixed(4)) : 0,
    }));
}

function countAnyFactKey(payload, keys) {
  let count = 0;
  for (const payloadRow of payload ?? []) {
    const sources = [payloadRow?.domainFacts, payloadRow?.metadata, payloadRow?.extensions, payloadRow?.machine, payloadRow?.layout];
    if (keys.some((key) => sources.some((source) => isPlainObject(source) && source[key] !== undefined && source[key] !== null && source[key] !== ""))) {
      count += 1;
    }
  }
  return count;
}

function buildSpecialFactsCoverage(domainId, payloads) {
  const domainFactCounter = new Map();
  const metadataCounter = new Map();
  const extensionCounter = new Map();
  for (const payload of payloads ?? []) {
    countFactKeys(payload?.domainFacts, domainFactCounter);
    countFactKeys(payload?.metadata, metadataCounter);
    countFactKeys(payload?.extensions, extensionCounter);
  }
  const totalPayloads = payloads?.length ?? 0;
  const expected = EXPECTED_SPECIAL_FACT_KEYS[domainId] ?? [];
  const expectedEntries = expected.map((entry) => (
    typeof entry === "string"
      ? { key: entry, aliases: [entry] }
      : { key: `${entry?.key ?? ""}`.trim(), aliases: Array.isArray(entry?.aliases) ? entry.aliases : [`${entry?.key ?? ""}`.trim()] }
  )).filter((entry) => entry.key);
  return {
    domain: domainId,
    payloadCount: totalPayloads,
    domainFactKeys: summarizeCounter(domainFactCounter, totalPayloads),
    metadataKeys: summarizeCounter(metadataCounter, totalPayloads),
    extensionKeys: summarizeCounter(extensionCounter, totalPayloads),
    expectedCoverage: expectedEntries.map(({ key, aliases }) => {
      const count = countAnyFactKey(payloads, aliases);
      return {
        key,
        aliases,
        count,
        ratio: totalPayloads > 0 ? Number((count / totalPayloads).toFixed(4)) : 0,
        status: count > 0 ? "present" : "missing",
      };
    }),
  };
}

function readSpecialDomains(inputDir, specialIndex) {
  const domains = [];
  for (const domain of specialIndex?.domains ?? []) {
    const domainId = sanitizePathSegment(domain?.domain);
    const recipesPath = `${domain?.recipes ?? ""}`.trim();
    const payloadsPath = `${domain?.payloads ?? ""}`.trim();
    const indexPath = `${domain?.index ?? ""}`.trim();
    const summaryPath = `${domain?.summary ?? ""}`.trim();
    const recipes = recipesPath ? readJsonl(join(inputDir, recipesPath)) : [];
    const payloads = payloadsPath ? readJsonl(join(inputDir, payloadsPath)) : [];
    const index = indexPath ? readJson(join(inputDir, indexPath)) : null;
    const summary = summaryPath ? readJson(join(inputDir, summaryPath)) : (domain?.stats ?? index?.stats ?? null);
    const factsCoverage = buildSpecialFactsCoverage(domainId, payloads);
    domains.push({
      domain: domainId,
      recipeCount: recipes.length,
      declaredRecipeCount: stableNumber(domain?.recipeCount ?? index?.recipeCount, recipes.length),
      payloadCount: payloads.length,
      declaredPayloadCount: stableNumber(domain?.payloadCount ?? index?.payloadCount, payloads.length),
      recipesPath,
      payloadsPath,
      indexPath,
      summaryPath,
      outputRecipes: `special/${domainId}/recipes.json`,
      outputPayloads: `special/${domainId}/payloads.json`,
      outputSummary: `special/${domainId}/summary.json`,
      summary: { ...(summary ?? { domain: domainId, recipeCount: recipes.length }), factsCoverage },
      factsCoverage,
      recipes,
      payloads,
    });
  }
  return domains;
}
function compileRawExport(inputDir, outputDir) {
  const startedAt = Date.now();
  const manifestPath = join(inputDir, "manifest.json");
  const manifest = readJson(manifestPath);
  const manifestValidation = validateRawManifest(inputDir, manifest);
  const exportReport = readRawJson(inputDir, manifest, "exportReport", "validation/export_report.json");
  const canonicalRepositoryPath = resolveRawFile(inputDir, manifest, "canonicalRepository", null);
  const canonicalRepository = canonicalRepositoryPath ? readJsonIfReasonable(canonicalRepositoryPath) : null;
  const canonicalBrowserLayout = readCanonicalSibling(inputDir, manifest, "browser-layout-index.json");
  const canonicalRenderAssets = readCanonicalSibling(inputDir, manifest, "render-assets.json");
  const items = readRawJsonl(inputDir, manifest, "items", "items.jsonl");
  const fluids = readRawJsonl(inputDir, manifest, "fluids", "fluids.jsonl");
  const recipes = readRawRecipes(inputDir, manifest);
  const rawGroups = readRawJsonl(inputDir, manifest, "groups", "groups.jsonl");
  const neiOrder = readRawJsonl(inputDir, manifest, "neiOrder", "nei_order.jsonl");
  const textures = readRawJsonl(inputDir, manifest, "textures", "textures.jsonl");
  const animations = readRawJsonl(inputDir, manifest, "animations", "animations.jsonl");
  const nativeSprites = readRawJsonl(inputDir, manifest, "nativeSprites", "native_sprites.jsonl");
  const renderedGifs = readRawJsonl(inputDir, manifest, "renderedGifs", "rendered_gifs.jsonl");
  const entities = readRawJsonl(inputDir, manifest, "entities", "models/entities/index.jsonl");
  const browserAtlasIndex = readRawJson(inputDir, manifest, "browserAtlasIndex", "browser_atlas_index.json");
  const specialIndex = readRawJson(inputDir, manifest, "specialIndex", "special/index.json");
  const specialDomains = readSpecialDomains(inputDir, specialIndex);
  const animationFacts = mergeAnimationFacts(animations, nativeSprites, renderedGifs);
  const itemIds = new Set(items.map((item) => item?.itemId).filter(Boolean));
  const groups = normalizeBrowserGroups(rawGroups, itemIds);

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

  const missingAnimationTimingAssetIds = animationFacts
    .filter((entry) => entry?.assetId && stableNumber(entry.frameCount, 0) > 1 && !entry.timeline && !entry.frameDurationMs)
    .map((entry) => entry.assetId);

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

  const generatedBrowserAtlasIndex = buildBrowserAtlasIndexFromResources(browserAtlasIndex, browserItems, textures, animationFacts);
  const browserAtlasItems = Array.isArray(generatedBrowserAtlasIndex?.items) ? generatedBrowserAtlasIndex.items : [];
  const animationTable = buildAnimationTable(searchItems, textures, animationFacts, generatedBrowserAtlasIndex);
  const atlasAuthorityReport = buildAtlasAuthorityReport(inputDir, browserItems, browserAtlasItems, renderByAssetId);
  const missingBrowserAtlasItemIds = atlasAuthorityReport.samples.missingBrowserAtlasItemIds;
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
    const displayName = recipeCategoryDisplayName(recipe);
    const rawCategoryId = recipeCategoryRawId(recipe);
    const key = recipeCategoryIdFromDisplayName(displayName, rawCategoryId);
    const existing = recipeCategories.get(key) ?? {
      categoryId: key,
      recipeCount: 0,
      displayName,
      sourceCategoryIds: [],
    };
    existing.recipeCount += 1;
    if (!existing.sourceCategoryIds.includes(rawCategoryId)) {
      existing.sourceCategoryIds.push(rawCategoryId);
    }
    recipeCategories.set(key, existing);
  }

  const recipeCategorySplits = Array.from(
    Array.from(recipeCategories.values()).reduce((acc, category) => {
      const normalizedName = normalizeRecipeCategoryName(category.displayName ?? category.categoryId);
      if (!normalizedName) return acc;
      const bucket = acc.get(normalizedName) ?? { displayName: category.displayName ?? category.categoryId, categoryIds: [] };
      bucket.categoryIds.push(category.categoryId);
      acc.set(normalizedName, bucket);
      return acc;
    }, new Map()).values(),
  ).filter((entry) => new Set(entry.categoryIds).size > 1);
  const rawExportCountMismatches = buildRawExportCountMismatches(exportReport, {
    items: items.length,
    fluids: fluids.length,
    recipes: recipes.length,
    groups: rawGroups.length,
    neiOrderEntries: neiOrder.length,
    textures: textures.length,
    animations: animations.length,
    entities: entities.length,
  });
  const canonicalCountMismatches = buildCanonicalCountMismatches(canonicalRepository, canonicalBrowserLayout, canonicalRenderAssets, {
    items: items.length,
    fluids: fluids.length,
    recipes: recipes.length,
    groups: rawGroups.length,
    neiOrderEntries: neiOrder.length,
    textures: textures.length,
    animations: animations.length,
  });
  const specialFactsCoverage = {
    schemaVersion: "neonei/special-facts-coverage/v1",
    domains: specialDomains.map((domain) => domain.factsCoverage),
  };
  const specialExpectedFactKeys = specialFactsCoverage.domains
    .flatMap((domain) => domain.expectedCoverage ?? []);
  const specialExpectedFactKeysPresent = specialExpectedFactKeys.filter((entry) => entry.status === "present").length;
  const validation = {
    schemaVersion: "neonei/compiler-validation/v3-alpha1",
    generatedAt: new Date().toISOString(),
    inputDir: "<raw-export>",
    outputDir: "<dist-data>",
    counts: {
      items: items.length,
      fluids: fluids.length,
      recipes: recipes.length,
      groups: groups.length,
      neiOrderEntries: neiOrder.length,
      textures: textures.length,
      animations: animations.length,
      nativeSprites: nativeSprites.length,
      renderedGifs: renderedGifs.length,
      entities: entities.length,
      animationFacts: animationFacts.length,
      animationTableItems: animationTable.length,
      browserAtlasItems: browserAtlasItems.length,
      staticBrowserAtlasItems,
      animatedBrowserAtlasItems,
      browserAtlasGeneratedFromResourceIndex: stableNumber(generatedBrowserAtlasIndex?.generatedFromResourceIndex, 0),
      browserAtlasRepairedFromResourceIndex: stableNumber(generatedBrowserAtlasIndex?.repairedFromResourceIndex, 0),
      specialDomains: specialDomains.length,
      specialRecipes: specialDomains.reduce((sum, domain) => sum + domain.recipeCount, 0),
      specialPayloads: specialDomains.reduce((sum, domain) => sum + domain.payloads.length, 0),
      specialPayloadMismatches: specialDomains.filter((domain) => domain.recipeCount !== domain.payloads.length || domain.declaredPayloadCount !== domain.payloads.length).length,
      specialExpectedFactKeys: specialExpectedFactKeys.length,
      specialExpectedFactKeysPresent,
      specialExpectedFactKeysMissing: specialExpectedFactKeys.length - specialExpectedFactKeysPresent,
      rawExportCountMismatches: rawExportCountMismatches.length,
      canonicalCountMismatches: canonicalCountMismatches.length,
      recipeCategories: recipeCategories.size,
      recipeItemIndexItems: recipeItemIndex.length,
      recipeUiPayloads: recipeUiPayloads.length,
      recipeCategorySplits: recipeCategorySplits.length,
    },
    manifestValidation,
    missing: {
      itemId: items.filter((item) => !item.itemId).length,
      localizedName: items.filter((item) => item.itemId && !item.localizedName).length,
      renderAssetRef: items.filter((item) => item.itemId && !item.renderAssetRef).length,
      textureRows: Math.max(0, items.length - textures.length),
      browserAtlasItems: atlasAuthorityReport.totalBrowserItems - atlasAuthorityReport.indexedBrowserItems,
      browserAtlasDrawableItems: atlasAuthorityReport.missingDrawableItemIds,
      browserAtlasFiles: atlasAuthorityReport.missingAtlasFiles,
      renderAssetRefs: atlasAuthorityReport.missingRenderAssetRefs,
      atlasAssetRefs: atlasAuthorityReport.mismatchedAssetRefs,
      browserAtlasDuplicateItemIds: atlasAuthorityReport.duplicateItemIds,
      animationTiming: missingAnimationTimingAssetIds.length,
    },
    samples: {
      missingBrowserAtlasItemIds: atlasAuthorityReport.samples.missingBrowserAtlasItemIds,
      missingDrawableItemIds: atlasAuthorityReport.samples.missingDrawableItemIds,
      missingRenderAssetRefs: atlasAuthorityReport.samples.missingRenderAssetRefs,
      mismatchedAtlasAssetRefs: atlasAuthorityReport.samples.mismatchedAssetRefs,
      duplicateBrowserAtlasItemIds: atlasAuthorityReport.samples.duplicateItemIds,
      missingBrowserAtlasFiles: atlasAuthorityReport.samples.missingAtlasFiles,
      recipeCategorySplits: recipeCategorySplits.slice(0, 50),
      rawExportCountMismatches,
      canonicalCountMismatches,
      missingAnimationTimingAssetIds: missingAnimationTimingAssetIds.slice(0, 100),
    },
    coverage: {
      browserAtlasRatio: atlasAuthorityReport.coverageRatio,
    },
    atlasAuthorityReport,
    warnings: [],
    elapsedMs: Date.now() - startedAt,
  };
  validation.warnings.push(...manifestValidation.warnings);
  if (manifestValidation.missing.length > 0) validation.warnings.push(`Raw Export manifest is missing declared core file(s): ${manifestValidation.missing.join(", ")}.`);
  if (manifestValidation.empty.length > 0) validation.warnings.push(`Raw Export manifest declares empty core file(s): ${manifestValidation.empty.join(", ")}.`);
  if (items.length === 0) validation.warnings.push("items.jsonl is empty; compiler output is structural only.");
  if (recipes.length === 0) validation.warnings.push("recipes.jsonl is empty; recipe indexes cannot be complete.");
  if (atlasAuthorityReport.indexedBrowserItems < atlasAuthorityReport.totalBrowserItems) validation.warnings.push(`Browser atlas is missing indexed entries for ${atlasAuthorityReport.totalBrowserItems - atlasAuthorityReport.indexedBrowserItems} browser item(s).`);
  if (atlasAuthorityReport.missingDrawableItemIds > 0) validation.warnings.push(`Browser atlas has ${atlasAuthorityReport.missingDrawableItemIds} indexed item(s) without drawable atlas files.`);
  if (atlasAuthorityReport.missingAtlasFiles > 0) validation.warnings.push(`Browser atlas references ${atlasAuthorityReport.missingAtlasFiles} atlas file(s) that are not present beside the Raw Export.`);
  if (atlasAuthorityReport.mismatchedAssetRefs > 0) validation.warnings.push(`Browser atlas has ${atlasAuthorityReport.mismatchedAssetRefs} item(s) whose atlas assetId differs from item renderAssetRef.`);
  if (atlasAuthorityReport.duplicateItemIds > 0) validation.warnings.push(`Browser atlas contains ${atlasAuthorityReport.duplicateItemIds} duplicate itemId row(s).`);
  if (missingAnimationTimingAssetIds.length > 0) validation.warnings.push(`Animation timing metadata is missing for ${missingAnimationTimingAssetIds.length} animated asset(s).`);
  if (recipeCategorySplits.length > 0) validation.warnings.push(`Recipe categories have ${recipeCategorySplits.length} duplicate display-name split(s).`);
  if (rawExportCountMismatches.length > 0) validation.warnings.push(`Raw Export compiler counts differ from exporter report in ${rawExportCountMismatches.length} area(s).`);
  if (canonicalCountMismatches.length > 0) validation.warnings.push(`Raw Export compiler counts differ from canonical repository in ${canonicalCountMismatches.length} area(s).`);
  for (const domain of specialDomains) {
    if (domain.recipeCount !== domain.payloads.length) {
      validation.warnings.push(`Special domain ${domain.domain} has ${domain.recipeCount} recipe row(s) but ${domain.payloads.length} payload row(s).`);
    }
    if (domain.declaredPayloadCount !== domain.payloads.length) {
      validation.warnings.push(`Special domain ${domain.domain} declares ${domain.declaredPayloadCount} payload row(s) but compiler read ${domain.payloads.length}.`);
    }
  }
  validation.migrationReadiness = buildMigrationReadiness(validation, exportReport, canonicalRepository, specialDomains, atlasAuthorityReport);

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
      entityModels: "models/entities/index.json",
      specialIndex: "special/index.json",
      specialFactsCoverage: "special/facts-coverage.json",
      validationReport: "validation/report.json",
      migrationReadiness: "validation/migration-readiness.json",
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
  writeJsonCompact(join(outputDir, "textures", "atlas-manifest.json"), { schemaVersion: "neonei/texture-manifest/v1", textures, animations: animationFacts, nativeSprites, renderedGifs });
  writeJsonCompact(join(outputDir, "textures", "animation-table.json"), { schemaVersion: "neonei/animation-table/v1", items: animationTable });
  writeJsonCompact(join(outputDir, "textures", "browser-atlas-index.json"), generatedBrowserAtlasIndex ?? { schemaVersion: "neonei/browser-atlas-index/v1", items: [] });
  writeJsonCompact(join(outputDir, "models", "entities", "index.json"), { schemaVersion: "neonei/entity-model-index/v1", entities });
  const distSpecialIndex = {
    schemaVersion: "neonei/special-index/v1",
    sourceSchemaVersion: specialIndex?.schemaVersion ?? null,
    domains: specialDomains.map(({ recipes, payloads, summary, factsCoverage, ...domain }) => domain),
  };
  writeJsonCompact(join(outputDir, "special", "index.json"), distSpecialIndex);
  writeJsonCompact(join(outputDir, "special", "facts-coverage.json"), specialFactsCoverage);
  for (const domain of specialDomains) {
    writeJsonCompact(join(outputDir, domain.outputRecipes), { schemaVersion: "neonei/special-domain-recipes/v1", domain: domain.domain, recipes: domain.recipes });
    writeJsonCompact(join(outputDir, domain.outputPayloads), { schemaVersion: "neonei/special-domain-payloads/v1", domain: domain.domain, payloads: domain.payloads });
    writeJsonCompact(join(outputDir, domain.outputSummary), { schemaVersion: "neonei/special-domain-summary/v1", ...domain.summary });
  }
  writeJson(join(outputDir, "validation", "report.json"), validation);
  writeJson(join(outputDir, "validation", "migration-readiness.json"), validation.migrationReadiness);
  return validation;
}

function createSelfTestRawExport(root) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  for (const relativeDir of [
    "facts",
    "facts/recipes",
    "facts/nei",
    "assets/textures",
    "assets/animations",
    "models/entities",
  ]) {
    mkdirSync(join(root, relativeDir), { recursive: true });
  }
  writeJson(join(root, "manifest.json"), {
    schemaVersion: "nesqlpp/raw-export/alpha1",
    repositoryName: "self-test",
    capabilities: ["facts", "assets", "validation"],
    files: {
      items: "facts/items.jsonl",
      fluids: "facts/fluids.jsonl",
      recipes: "facts/recipes/all.jsonl",
      recipeIndex: "facts/recipes/index.json",
      groups: "facts/nei/groups.jsonl",
      neiOrder: "facts/nei/order.jsonl",
      textures: "assets/textures/index.jsonl",
      animations: "assets/animations/index.jsonl",
      nativeSprites: "assets/animations/native-sprites.jsonl",
      renderedGifs: "assets/animations/rendered-gifs.jsonl",
      browserAtlasIndex: "assets/textures/browser_atlas_index.json",
      entities: "models/entities/index.jsonl",
      specialIndex: "special/index.json",
      exportReport: "validation/export_report.json",
      canonicalRepository: "../canonical/repository.json",
    },
  });
  writeFileSync(join(root, "facts/items.jsonl"), [
    JSON.stringify({ itemId: "i~minecraft~iron_ingot~0", modId: "minecraft", internalName: "iron_ingot", localizedName: "Iron Ingot", renderAssetRef: "nesqlpp:item/i~minecraft~iron_ingot~0", searchTerms: "iron ingot" }),
    JSON.stringify({ itemId: "i~botania~manaResource~4", modId: "botania", internalName: "manaResource", localizedName: "Terrasteel Ingot", renderAssetRef: "nesqlpp:item/i~botania~manaResource~4", searchTerms: "terrasteel" }),
    JSON.stringify({ itemId: "i~minecraft~gold_ingot~0", modId: "minecraft", internalName: "gold_ingot", localizedName: "Gold Ingot", renderAssetRef: "nesqlpp:item/i~minecraft~gold_ingot~0", searchTerms: "gold ingot" }),
  ].join("\n") + "\n", "utf8");
  writeFileSync(join(root, "facts/fluids.jsonl"), `${JSON.stringify({ fluidId: "f~gregtech~molten.iron", localizedName: "Molten Iron" })}\n`, "utf8");
  writeFileSync(join(root, "facts/recipes/all.jsonl"), `${JSON.stringify({ recipeId: "r1", family: "minecraft", machine: { machineId: "furnace", displayName: "Furnace" }, inputs: [{ itemId: "i~minecraft~iron_ore~0" }], outputs: [{ itemId: "i~minecraft~iron_ingot~0" }, { itemId: "i~botania~manaResource~4" }] })}\n`, "utf8");
  writeJson(join(root, "facts/recipes/index.json"), { schemaVersion: "nesqlpp/raw-export/alpha1/recipe-index", shards: [{ handlerId: "all", path: "facts/recipes/all.jsonl", recipeCount: 1 }] });
  writeFileSync(join(root, "facts/nei/groups.jsonl"), `${JSON.stringify({ groupKey: "nei:iron", groupLabel: "Iron", groupSize: 1, representativeItemId: "i~minecraft~iron_ingot~0", memberItemIds: ["i~minecraft~iron_ingot~0"] })}\n`, "utf8");
  writeFileSync(join(root, "facts/nei/order.jsonl"), `${JSON.stringify({ entryOrder: 0, entryKind: "item", itemId: "i~minecraft~iron_ingot~0" })}\n${JSON.stringify({ entryOrder: 1, entryKind: "item", itemId: "i~botania~manaResource~4" })}\n${JSON.stringify({ entryOrder: 2, entryKind: "item", itemId: "i~minecraft~gold_ingot~0" })}\n`, "utf8");
  writeFileSync(join(root, "assets/textures/index.jsonl"), `${JSON.stringify({ assetId: "nesqlpp:item/i~minecraft~iron_ingot~0", atlasFile: "static-atlas-0.webp" })}\n${JSON.stringify({ assetId: "nesqlpp:item/i~botania~manaResource~4", atlasFile: "animated-atlas-0.webp", frameCount: 8, frameDurationMs: 100 })}\n${JSON.stringify({ assetId: "nesqlpp:item/i~minecraft~gold_ingot~0", atlasFile: "generated-static-atlas-0.webp", rect: { x: 0, y: 0, width: 16, height: 16 } })}\n`, "utf8");
  writeFileSync(join(root, "assets/animations/index.jsonl"), `${JSON.stringify({ assetId: "nesqlpp:item/i~botania~manaResource~4", frameCount: 8, frameDurationMs: 100 })}\n`, "utf8");
  writeFileSync(join(root, "assets/animations/native-sprites.jsonl"), `${JSON.stringify({ assetId: "nesqlpp:item/i~botania~manaResource~4", animationMode: "native_sprite", frameCount: 8, frameDurationMs: 100, spriteMetadataFile: "textures/items/terrasteel.png.mcmeta" })}\n`, "utf8");
  writeFileSync(join(root, "assets/animations/rendered-gifs.jsonl"), "", "utf8");
  writeFileSync(join(root, "models/entities/index.jsonl"), `${JSON.stringify({ entityId: "minecraft.zombie", mobName: "minecraft.zombie", displayName: "Zombie", modelPath: "entity-models/minecraft/zombie.json", previewImage: "minecraft/zombie.gif" })}\n`, "utf8");
  writeJson(join(root, "validation/export_report.json"), {
    schemaVersion: "nesqlpp/raw-export/alpha1/report",
    counts: { rawItems: 3, rawFluids: 1, rawRecipes: 1, rawGroups: 1, rawNeiOrderEntries: 3, rawTextures: 3, rawAnimations: 1, rawEntities: 1 },
    validation: { status: "ok", readinessStatus: "ready", gates: [{ name: "core-counts", status: "ready" }] },
  });
  writeJson(join(root, "..", "canonical", "repository.json"), {
    items: [{}, {}, {}],
    fluids: [{}],
    recipes: [{}],
  });
  writeJson(join(root, "..", "canonical", "browser-layout-index.json"), {
    groups: [{ groupKey: "nei:iron" }],
    defaultEntries: [{}, {}, {}],
  });
  writeJson(join(root, "..", "canonical", "render-assets.json"), {
    assets: [
      { assetId: "nesqlpp:item/i~minecraft~iron_ingot~0" },
      { assetId: "nesqlpp:item/i~botania~manaResource~4", frameCount: 8 },
      { assetId: "nesqlpp:item/i~minecraft~gold_ingot~0" },
    ],
  });
  writeFileSync(join(root, "static-atlas-0.webp"), "self-test-static", "utf8");
  writeFileSync(join(root, "animated-atlas-0.webp"), "self-test-animated", "utf8");
  writeFileSync(join(root, "generated-static-atlas-0.webp"), "self-test-generated", "utf8");
  mkdirSync(join(root, "special"), { recursive: true });
  mkdirSync(join(root, "special/gregtech"), { recursive: true });
  writeFileSync(join(root, "special/gregtech/recipes.jsonl"), `${JSON.stringify({ recipeId: "gt-test", family: "gregtech", machine: { machineId: "gregtech.assembler", displayName: "Assembler" } })}\n`, "utf8");
  writeFileSync(join(root, "special/gregtech/payloads.jsonl"), `${JSON.stringify({ domain: "gregtech", recipeId: "gt-test", machineId: "gregtech.assembler", facts: { duration: 20 } })}\n`, "utf8");
  writeJson(join(root, "special/gregtech/summary.json"), { domain: "gregtech", recipeCount: 1, machineIds: [{ value: "gregtech.assembler", count: 1 }] });
  writeJson(join(root, "special/gregtech/index.json"), { schemaVersion: "nesqlpp/raw-export/alpha1/special-domain", domain: "gregtech", recipeCount: 1, payloadCount: 1, recipes: "special/gregtech/recipes.jsonl", payloads: "special/gregtech/payloads.jsonl", summary: "special/gregtech/summary.json" });
  writeJson(join(root, "special/index.json"), { schemaVersion: "nesqlpp/raw-export/alpha1/special-index", domains: [{ domain: "gregtech", recipeCount: 1, payloadCount: 1, index: "special/gregtech/index.json", recipes: "special/gregtech/recipes.jsonl", payloads: "special/gregtech/payloads.jsonl", summary: "special/gregtech/summary.json" }] });
  writeJson(join(root, "assets/textures/browser_atlas_index.json"), { schemaVersion: "browser-atlas-index-self-test", itemCount: 2, items: [{ itemId: "i~minecraft~iron_ingot~0", assetId: "nesqlpp:item/i~minecraft~iron_ingot~0", hasStaticAtlas: true, staticAtlas: { atlasFile: "static-atlas-0.webp", atlasWidth: 16, atlasHeight: 16, x: 0, y: 0, width: 16, height: 16 } }, { itemId: "i~botania~manaResource~4", assetId: "nesqlpp:item/i~botania~manaResource~4", hasAnimatedAtlas: true, animatedAtlas: { atlasFile: "animated-atlas-0.webp", atlasWidth: 16, atlasHeight: 128, frameCount: 8, frameDurationMs: 100, frames: [[0, 0, 0, 16, 16], [1, 0, 16, 16, 16]], timeline: [[0, 100], [1, 100]] } }] });
}
let inputDir = inputArg ? resolve(inputArg) : null;
let outputDir = outputArg ? resolve(outputArg) : null;
if (selfTest) {
  inputDir = join(repoRoot, ".tmp-runtime", "raw-export-self-test");
  outputDir = join(repoRoot, ".tmp-runtime", "dist-data-v3-self-test");
  createSelfTestRawExport(inputDir);
}
if (!inputDir || !outputDir) {
  console.error("Usage: node scripts/compile-raw-export.mjs --input <raw-export> --output <dist-data> [--self-test]");
  process.exit(2);
}
const report = compileRawExport(inputDir, outputDir);
console.log(JSON.stringify({ outputDir, counts: report.counts, missing: report.missing, warnings: report.warnings, elapsedMs: report.elapsedMs }, null, 2));
if (selfTest && (report.counts.items !== 3 || report.counts.recipes !== 1 || report.counts.animations !== 1 || report.counts.browserAtlasItems !== 3 || report.counts.recipeItemIndexItems !== 3 || report.counts.recipeUiPayloads !== 1 || report.counts.specialDomains !== 1 || report.counts.specialRecipes !== 1 || report.counts.specialPayloads !== 1 || report.counts.specialPayloadMismatches !== 0 || report.counts.rawExportCountMismatches !== 0 || report.counts.canonicalCountMismatches !== 0 || report.counts.entities !== 1 || report.coverage.browserAtlasRatio !== 1 || report.missing.browserAtlasFiles !== 0 || report.counts.browserAtlasGeneratedFromResourceIndex !== 1 || report.migrationReadiness?.status !== "ready")) {
  throw new Error("Self-test compiler counts did not match expected values");
}
if (selfTest) {
  const validationText = readFileSync(join(outputDir, "validation", "report.json"), "utf8");
  const portablePathViolation = /[A-Za-z]:[\\/]|\.minecraft[\\/]versions|GT New Horizons|E:[\\/]GTNH|E:[\\/]codex/i.test(validationText);
  if (portablePathViolation) {
    throw new Error("Self-test validation report leaked a machine-specific filesystem path");
  }
}

