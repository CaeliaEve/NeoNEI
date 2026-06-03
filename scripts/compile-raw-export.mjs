import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

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
  if (filePath.endsWith(".gz")) {
    return parseJsonlText(gunzipSync(readFileSync(filePath)).toString("utf8"), filePath);
  }
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

function parseJsonlText(text, filePath) {
  const rows = [];
  let lineNumber = 0;
  for (const rawLine of `${text ?? ""}`.split(/\r?\n/)) {
    lineNumber += 1;
    const line = rawLine.replace(/^\uFEFF/, "").trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Invalid JSONL at ${filePath}:${lineNumber}: ${error.message}`);
    }
  }
  return rows;
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
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
  return [];
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
    ["neiGuidFilterRules", "neiGuidFilterRules", "neiGuidFilterRules"],
    ["neiHiddenItemRules", "neiHiddenItemRules", "neiHiddenItemRules"],
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

function buildMigrationReadiness(validation, exportReport, specialDomains, atlasAuthorityReport) {
  const gate = (name, ok, summary, details = {}) => ({
    name,
    status: ok ? "ready" : "blocked",
    summary,
    ...details,
  });
  const specialPayloadMismatches = stableNumber(validation.counts.specialPayloadMismatches, 0);
  const rawExportMismatches = stableNumber(validation.counts.rawExportCountMismatches, 0);
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
  const specialExpectedMissing = stableNumber(validation.counts.specialExpectedFactKeysMissing, 0);
  const manifestBlocked = stableNumber(validation.counts.manifestBlocked, 0);
  const gates = [
    gate(
      "raw-manifest-contract",
      manifestBlocked === 0,
      manifestBlocked === 0
        ? "Raw Export manifest declared streams are present for enabled capabilities."
        : `${manifestBlocked} required manifest stream(s) are missing or empty for enabled capabilities.`,
      { blockedFiles: validation.manifestValidation?.blocked ?? [] },
    ),
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
      "special-facts-coverage",
      specialExpectedMissing === 0,
      specialExpectedMissing === 0 ? "Expected special-domain fact keys are machine-checkable and present." : `${specialExpectedMissing} expected special-domain fact key(s) are missing.`,
      {
        expectedFactKeys: stableNumber(validation.counts.specialExpectedFactKeys, 0),
        presentFactKeys: stableNumber(validation.counts.specialExpectedFactKeysPresent, 0),
        missingFactKeys: specialExpectedMissing,
      },
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
  const knownCapabilities = new Set(["facts", "assets", "models", "special", "validation", "semanticIdentity", "nativeNeiRules"]);
  const warnings = [];
  const missing = [];
  const empty = [];
  const unknownCapabilities = [];
  if (!manifest) {
    warnings.push("raw-export manifest.json is missing; compiler requires authoritative raw-export declarations.");
    return { warnings, missing, empty, unknownCapabilities };
  }

  for (const capability of manifest.capabilities ?? []) {
    if (!knownCapabilities.has(capability)) unknownCapabilities.push(capability);
  }
  if (unknownCapabilities.length > 0) {
    warnings.push(`Raw Export manifest declares unknown capabilities: ${unknownCapabilities.join(", ")}.`);
  }

  const requiredFiles = ["items", "fluids", "recipeIndex", "groups", "neiOrder", "textures", "browserAtlasIndex"];
  if ((manifest.capabilities ?? []).includes("semanticIdentity")) {
    requiredFiles.push("semanticItems", "itemVariants", "itemPayloads", "itemIdentityMap");
  }
  if ((manifest.capabilities ?? []).includes("nativeNeiRules")) {
    requiredFiles.push("neiGuidFilters", "neiHiddenItems");
  }
  for (const logicalName of requiredFiles) {
    const filePath = resolveRawFile(inputDir, manifest, logicalName, null);
    if (!filePath || !existsSync(filePath)) {
      missing.push(logicalName);
      continue;
    }
    const allowEmpty = new Set(["groups", "neiOrder", "neiGuidFilters", "neiHiddenItems"]);
    if (fileSizeIfPresent(filePath) === 0 && !allowEmpty.has(logicalName)) {
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
  const blocked = [...missing, ...empty].filter((name) =>
    ["semanticItems", "itemVariants", "itemPayloads", "itemIdentityMap"].includes(name),
  );
  if (blocked.length > 0) {
    warnings.push(`Raw Export semanticIdentity capability is declared but required semantic stream(s) are unavailable: ${blocked.join(", ")}.`);
  }
  return { warnings, missing, empty, unknownCapabilities, missingRecipeShards, blocked };
}

const deniedExportPathPatterns = [
  { name: "windows-backslash-absolute", pattern: /(^|[\s"'`([{:=,])[A-Za-z]:\\[A-Za-z0-9._ -]/ },
  { name: "windows-slash-absolute", pattern: /(^|[\s"'`([{:=,])[A-Za-z]:\/[A-Za-z0-9._ -]/ },
  { name: "minecraft-version-path", pattern: /\.minecraft[\\/]versions/i },
  { name: "local-gtnh-path", pattern: /[A-Za-z]:[\\/]GTNH/i },
  { name: "local-codex-path", pattern: /[A-Za-z]:[\\/]codex/i },
  { name: "linux-home-absolute", pattern: /(^|[\s"'`([{:=,])\/(?:home|Users|mnt|opt|srv)\// },
];
const runtimeExportExtensions = new Set([".json", ".jsonl", ".gz"]);
const diagnosticPathPattern = /(^|[\\/])(?:validation|diagnostics?|logs?)([\\/]|$)|(?:report|diagnostic|log)\.(?:jsonl?|jsonl\.gz)$/i;

function toPosixPath(pathText) {
  return `${pathText ?? ""}`.replace(/\\/g, "/");
}

function isDiagnosticExportPath(filePath, inputDir) {
  return diagnosticPathPattern.test(toPosixPath(relative(inputDir, filePath))) || diagnosticPathPattern.test(toPosixPath(filePath));
}

function* walkRuntimeExportFiles(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkRuntimeExportFiles(full);
    } else if (entry.isFile() && runtimeExportExtensions.has(extname(entry.name))) {
      yield full;
    }
  }
}

function resolveDeclaredExportFile(inputDir, relativePath) {
  const text = `${relativePath ?? ""}`.trim();
  if (!text) return null;
  if (isAbsolute(text) || /^[A-Za-z]:[\\/]/.test(text)) {
    return { filePath: resolve(text), declarationViolation: text };
  }
  return { filePath: resolve(inputDir, text), declarationViolation: null };
}

function collectPathHygieneFiles(inputDir, manifest) {
  const files = new Set([resolve(inputDir, "manifest.json")]);
  const declarationViolations = [];
  for (const [logicalName, declaredPath] of Object.entries(manifest?.files ?? {})) {
    const resolved = resolveDeclaredExportFile(inputDir, declaredPath);
    if (!resolved) continue;
    if (resolved.declarationViolation && !/report|diagnostic|log|validation/i.test(logicalName)) {
      declarationViolations.push({
        file: "manifest.json",
        line: 0,
        rule: "absolute-runtime-file-declaration",
        text: `${logicalName}: ${resolved.declarationViolation}`,
      });
    }
    if (!/report|diagnostic|log|validation/i.test(logicalName)) {
      files.add(resolved.filePath);
    }
  }
  for (const relRoot of ["facts", "assets", "special", "models"]) {
    for (const filePath of walkRuntimeExportFiles(resolve(inputDir, relRoot))) {
      files.add(filePath);
    }
  }
  return { files: Array.from(files), declarationViolations };
}

function buildExportPathHygieneReport(inputDir, manifest) {
  const { files, declarationViolations } = collectPathHygieneFiles(inputDir, manifest);
  const violations = [...declarationViolations];
  let auditedFiles = 0;
  for (const filePath of files) {
    if (!existsSync(filePath) || isDiagnosticExportPath(filePath, inputDir)) continue;
    if (!statSync(filePath).isFile()) continue;
    auditedFiles += 1;
    const text = filePath.endsWith(".gz")
      ? gunzipSync(readFileSync(filePath)).toString("utf8")
      : readFileSync(filePath, "utf8");
    for (const denied of deniedExportPathPatterns) {
      if (denied.pattern.test(text)) {
        violations.push({
          file: toPosixPath(relative(inputDir, filePath)),
          line: 0,
          rule: denied.name,
          text: text.slice(0, 260).replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  return {
    schemaVersion: "neonei/export-path-hygiene-report/v1",
    inputDir: "<raw-export>",
    auditedFiles,
    status: violations.length === 0 ? "ok" : "failed",
    violations,
  };
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

function writeGzipText(filePath, text) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, gzipSync(Buffer.from(`${text ?? ""}`, "utf8")));
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

function getRecipePayloadShard(recipeId) {
  return createHash("sha1").update(`${recipeId ?? ""}`).digest("hex").slice(0, 2);
}

function getRecipeUiPayloadRelativePath(recipeId) {
  const shard = getRecipePayloadShard(recipeId);
  return `recipes/ui-payload-shards/${shard}.json`;
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

function buildSemanticItemSummary({ semanticItems, itemVariants, itemPayloads, itemIdentityMap, searchItems }) {
  const byFamily = new Map();
  const bump = (family, key) => {
    const normalized = `${family ?? "unknown"}`.trim() || "unknown";
    const existing = byFamily.get(normalized) ?? {
      family: normalized,
      semanticItems: 0,
      variants: 0,
      identityRows: 0,
    };
    existing[key] += 1;
    byFamily.set(normalized, existing);
  };
  for (const item of semanticItems ?? []) bump(item?.family, "semanticItems");
  for (const variant of itemVariants ?? []) bump(variant?.family, "variants");
  for (const entry of itemIdentityMap ?? []) bump(entry?.family, "identityRows");
  const classifiedIdentityRows = (itemIdentityMap ?? []).filter((entry) => entry?.classification === "classified").length;
  const browserRowsWithSemanticIdentity = (searchItems ?? []).filter((entry) => entry?.publicItemId).length;
  return {
    schemaVersion: "neonei/semantic-item-summary/v1",
    status: itemIdentityMap?.length > 0 ? "present" : "missing",
    semanticItems: semanticItems?.length ?? 0,
    variants: itemVariants?.length ?? 0,
    payloads: itemPayloads?.length ?? 0,
    identityRows: itemIdentityMap?.length ?? 0,
    classifiedIdentityRows,
    browserRowsWithSemanticIdentity,
    topFamilies: Array.from(byFamily.values())
      .sort((left, right) => right.identityRows - left.identityRows || right.variants - left.variants || left.family.localeCompare(right.family))
      .slice(0, 80),
  };
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

function safeRelativePathSegments(relativePath) {
  const normalized = normalizeAtlasFileRef(relativePath);
  if (!normalized || /^[A-Za-z]:[\\/]/.test(normalized) || normalized.startsWith("../") || normalized.includes("/../")) {
    return null;
  }
  return normalized.split("/").filter((segment) => segment && segment !== "." && segment !== "..");
}

function materializeBrowserAtlasAssets(inputDir, outputDir, browserAtlasIndex) {
  if (!browserAtlasIndex || !Array.isArray(browserAtlasIndex.items)) {
    return browserAtlasIndex;
  }

  const exportRoot = resolve(inputDir, "..");
  const copied = new Map();

  const rewriteAtlasFile = (atlasFile) => {
    const normalized = normalizeAtlasFileRef(atlasFile);
    const segments = safeRelativePathSegments(normalized);
    if (!normalized || !segments) {
      return normalized;
    }
    if (/^https?:\/\//i.test(normalized) || normalized.startsWith("textures/atlas-assets/")) {
      return normalized;
    }

    const withoutCanonical = normalized.startsWith("canonical/")
      ? normalized.slice("canonical/".length)
      : normalized.startsWith("assets/textures/atlas-assets/")
        ? normalized.slice("assets/textures/atlas-assets/".length)
        : normalized;
    const outputSegments = safeRelativePathSegments(`textures/atlas-assets/${withoutCanonical}`);
    if (!outputSegments) {
      return normalized;
    }
    const outputRelative = outputSegments.join("/");

    if (copied.has(normalized)) {
      return copied.get(normalized);
    }

    const sourceCandidates = [
      resolve(inputDir, ...segments),
      resolve(exportRoot, ...segments),
    ];
    const sourcePath = sourceCandidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
    if (!sourcePath) {
      copied.set(normalized, normalized);
      return normalized;
    }

    const outputPath = resolve(outputDir, ...outputSegments);
    mkdirSync(dirname(outputPath), { recursive: true });
    copyFileSync(sourcePath, outputPath);
    copied.set(normalized, outputRelative);
    return outputRelative;
  };

  const rewritePlacement = (placement) => {
    if (!placement || typeof placement !== "object" || !placement.atlasFile) {
      return placement ?? null;
    }
    return {
      ...placement,
      atlasFile: rewriteAtlasFile(placement.atlasFile),
    };
  };

  const items = browserAtlasIndex.items.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    return {
      ...entry,
      staticAtlas: rewritePlacement(entry.staticAtlas),
      animatedAtlas: rewritePlacement(entry.animatedAtlas),
    };
  });

  return {
    ...browserAtlasIndex,
    materializedAtlasAssets: Array.from(new Set(copied.values())).filter((value) => value && value.startsWith("textures/atlas-assets/")).length,
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
      const representative = members.includes(group.representativeItemId)
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

function groupPrecedence(group) {
  const key = `${group?.groupKey ?? ""}`;
  const source = `${group?.groupSource ?? ""}`;
  if (key.startsWith("nei:") || source === "nativeNei" || source === "collapsibleItems") return 10;
  if (source === "guidfilters" || key.startsWith("guidfilter:")) return 20;
  if (source === "semanticIdentity" || key.startsWith("semantic:")) return 30;
  if (key.startsWith("fallback:")) return 40;
  return 35;
}

function mergeBrowserGroupsByPrecedence(rawBrowserGroups, semanticBrowserGroups) {
  const assigned = new Set();
  const merged = [];
  const dropped = [];
  const candidates = [
    ...(rawBrowserGroups ?? []).map((group) => ({ ...group, groupSource: group.groupSource ?? "rawExport" })),
    ...(semanticBrowserGroups ?? []),
  ].sort((left, right) => groupPrecedence(left) - groupPrecedence(right) || stableNumber(left.groupSortOrder, 0) - stableNumber(right.groupSortOrder, 0) || `${left.groupKey ?? ""}`.localeCompare(`${right.groupKey ?? ""}`));

  for (const group of candidates) {
    const originalMembers = Array.from(new Set((group.memberItemIds ?? []).filter(Boolean)));
    const memberItemIds = originalMembers.filter((itemId) => !assigned.has(itemId));
    const isAuthoritativeRawGroup = group.groupSource === "rawExport" || groupPrecedence(group) <= 20;
    if (memberItemIds.length <= 1) {
      if (isAuthoritativeRawGroup && originalMembers.length > 0) {
        merged.push({
          ...group,
          memberItemIds: originalMembers,
          groupSize: originalMembers.length,
          representativeItemId: originalMembers.includes(group.representativeItemId)
            ? group.representativeItemId
            : originalMembers[0],
        });
        continue;
      }
      if (originalMembers.length > 1) {
        dropped.push({
          groupKey: group.groupKey ?? null,
          groupSource: group.groupSource ?? null,
          originalSize: originalMembers.length,
          retainedSize: memberItemIds.length,
          reason: "members-already-assigned-by-higher-precedence-group",
        });
      }
      continue;
    }
    for (const itemId of memberItemIds) assigned.add(itemId);
    merged.push({
      ...group,
      memberItemIds,
      groupSize: memberItemIds.length,
      representativeItemId: memberItemIds.includes(group.representativeItemId)
        ? group.representativeItemId
        : memberItemIds[0],
    });
  }
  return { groups: merged, dropped };
}

function buildSemanticBrowserGroups({ itemIdentityMap, semanticItems, availableItemIds, layoutByItemId }) {
  const semanticByPublicId = new Map();
  for (const item of semanticItems ?? []) {
    const publicItemId = `${item?.publicItemId ?? ""}`.trim();
    if (publicItemId) semanticByPublicId.set(publicItemId, item);
  }

  const membersByPublicId = new Map();
  for (const entry of itemIdentityMap ?? []) {
    const publicItemId = `${entry?.publicItemId ?? ""}`.trim();
    const legacyItemId = `${entry?.legacyItemId ?? ""}`.trim();
    if (!publicItemId || !legacyItemId || !availableItemIds.has(legacyItemId)) continue;
    const existing = membersByPublicId.get(publicItemId) ?? [];
    existing.push({
      legacyItemId,
      variantId: entry?.variantId ?? null,
      payloadHash: entry?.payloadHash ?? null,
      family: entry?.family ?? null,
      classification: entry?.classification ?? null,
      browserOrder: stableNumber(layoutByItemId.get(legacyItemId)?.browserOrder, stableNumber(layoutByItemId.get(legacyItemId)?.entryOrder, Number.MAX_SAFE_INTEGER)),
    });
    membersByPublicId.set(publicItemId, existing);
  }

  const groups = [];
  for (const [publicItemId, rawMembers] of membersByPublicId.entries()) {
    const members = rawMembers
      .sort((left, right) => left.browserOrder - right.browserOrder || left.legacyItemId.localeCompare(right.legacyItemId));
    const uniqueMemberItemIds = Array.from(new Set(members.map((member) => member.legacyItemId)));
    if (uniqueMemberItemIds.length <= 1) continue;

    const semanticItem = semanticByPublicId.get(publicItemId) ?? null;
    const declaredRepresentative = `${semanticItem?.representativeLegacyItemId ?? ""}`.trim();
    const representativeItemId = declaredRepresentative && uniqueMemberItemIds.includes(declaredRepresentative)
      ? declaredRepresentative
      : uniqueMemberItemIds[0];
    const firstOrder = stableNumber(members[0]?.browserOrder, 0);
    const safePublicKey = publicItemId.replace(/\s+/g, "");
    groups.push({
      groupKey: safePublicKey,
      groupLabel: semanticItem?.localizedName ?? semanticItem?.internalName ?? safePublicKey,
      groupSize: uniqueMemberItemIds.length,
      representativeItemId,
      memberItemIds: uniqueMemberItemIds,
      groupSortOrder: firstOrder,
      groupSource: "semanticIdentity",
      publicItemId,
      semanticFamily: semanticItem?.family ?? members[0]?.family ?? null,
      semanticClassification: semanticItem?.classification ?? members[0]?.classification ?? null,
    });
  }
  return groups.sort((left, right) => stableNumber(left.groupSortOrder, 0) - stableNumber(right.groupSortOrder, 0) || left.groupKey.localeCompare(right.groupKey));
}

function buildVariantsByPublicItem({ itemVariants, itemIdentityMap }) {
  const variantsByPublicId = new Map();
  const append = (publicItemId, variant) => {
    const key = `${publicItemId ?? ""}`.trim();
    if (!key) return;
    const existing = variantsByPublicId.get(key) ?? [];
    existing.push(variant);
    variantsByPublicId.set(key, existing);
  };

  for (const variant of itemVariants ?? []) {
    append(variant?.publicItemId, {
      variantId: variant?.variantId ?? null,
      legacyItemId: variant?.legacyItemId ?? null,
      payloadHash: variant?.payloadHash ?? null,
      family: variant?.family ?? null,
      classification: variant?.classification ?? null,
      variantLabel: variant?.variantLabel ?? null,
      facetSummary: variant?.facetSummary ?? null,
      sortKey: variant?.sortKey ?? null,
      facets: variant?.facets ?? null,
    });
  }

  if (variantsByPublicId.size === 0) {
    for (const entry of itemIdentityMap ?? []) {
      append(entry?.publicItemId, {
        variantId: entry?.variantId ?? null,
        legacyItemId: entry?.legacyItemId ?? null,
        payloadHash: entry?.payloadHash ?? null,
        family: entry?.family ?? null,
        classification: entry?.classification ?? null,
        facetSummary: entry?.facetSummary ?? null,
        sortKey: entry?.sortKey ?? null,
      });
    }
  }

  return Array.from(variantsByPublicId.entries())
    .map(([publicItemId, variants]) => ({
      publicItemId,
      variants: variants
        .filter((variant) => variant.legacyItemId || variant.variantId || variant.payloadHash)
        .sort((left, right) => `${left.sortKey ?? left.legacyItemId ?? left.variantId ?? ""}`.localeCompare(`${right.sortKey ?? right.legacyItemId ?? right.variantId ?? ""}`)),
    }))
    .filter((entry) => entry.variants.length > 0)
    .sort((left, right) => left.publicItemId.localeCompare(right.publicItemId));
}

function buildSemanticResourceReport({ semanticBrowserGroups, browserAtlasItems, animationTable }) {
  const atlasByItemId = new Map();
  for (const entry of browserAtlasItems ?? []) {
    const itemId = `${entry?.itemId ?? ""}`.trim();
    if (!itemId || atlasByItemId.has(itemId)) continue;
    atlasByItemId.set(itemId, entry);
  }
  const animationByItemId = new Set((animationTable ?? [])
    .map((entry) => `${entry?.itemId ?? ""}`.trim())
    .filter(Boolean));

  const missingRepresentativeAtlas = [];
  const missingMemberAtlas = [];
  const missingAnimationTiming = [];
  const groupsWithMissingMembers = [];
  let representativeMissingAtlasCount = 0;
  let memberMissingAtlasCount = 0;
  let animationTimingMissingCount = 0;

  const hasDrawableAtlas = (itemId) => {
    const atlas = atlasByItemId.get(itemId);
    return Boolean(atlas?.staticAtlas?.atlasFile || atlas?.animatedAtlas?.atlasFile);
  };
  const needsAnimationTiming = (itemId) => Boolean(atlasByItemId.get(itemId)?.animatedAtlas);

  for (const group of semanticBrowserGroups ?? []) {
    const groupKey = `${group?.groupKey ?? ""}`.trim();
    const representativeItemId = `${group?.representativeItemId ?? ""}`.trim();
    if (representativeItemId && !hasDrawableAtlas(representativeItemId)) {
      representativeMissingAtlasCount += 1;
      if (missingRepresentativeAtlas.length < 50) {
        missingRepresentativeAtlas.push({ groupKey, representativeItemId });
      }
    }
    if (representativeItemId && needsAnimationTiming(representativeItemId) && !animationByItemId.has(representativeItemId)) {
      animationTimingMissingCount += 1;
      if (missingAnimationTiming.length < 50) {
        missingAnimationTiming.push({ groupKey, itemId: representativeItemId, role: "representative" });
      }
    }

    const missingMembers = [];
    for (const memberItemId of group?.memberItemIds ?? []) {
      const itemId = `${memberItemId ?? ""}`.trim();
      if (!itemId) continue;
      if (!hasDrawableAtlas(itemId)) {
        memberMissingAtlasCount += 1;
        if (missingMemberAtlas.length < 100) {
          missingMemberAtlas.push({ groupKey, itemId });
        }
        if (missingMembers.length < 20) missingMembers.push(itemId);
      }
      if (needsAnimationTiming(itemId) && !animationByItemId.has(itemId)) {
        animationTimingMissingCount += 1;
        if (missingAnimationTiming.length < 50) {
          missingAnimationTiming.push({ groupKey, itemId, role: "member" });
        }
      }
    }
    if (missingMembers.length > 0 && groupsWithMissingMembers.length < 50) {
      groupsWithMissingMembers.push({ groupKey, missingMembers });
    }
  }

  const status = representativeMissingAtlasCount === 0
    && memberMissingAtlasCount === 0
    && animationTimingMissingCount === 0
    ? "ok"
    : "warning";
  return {
    schemaVersion: "neonei/semantic-resource-report/v1",
    status,
    checked: {
      semanticGroups: (semanticBrowserGroups ?? []).length,
      atlasItems: atlasByItemId.size,
      animationTableItems: animationByItemId.size,
    },
    counts: {
      representativeMissingAtlas: representativeMissingAtlasCount,
      memberMissingAtlas: memberMissingAtlasCount,
      animationTimingMissing: animationTimingMissingCount,
      groupsWithMissingMembers: groupsWithMissingMembers.length,
    },
    samples: {
      missingRepresentativeAtlas,
      missingMemberAtlas,
      missingAnimationTiming,
      groupsWithMissingMembers,
    },
  };
}

function buildBrowserContractReport({ groups, browserItems, neiOrder, exportReport, compilerAddedGroupCount = 0 }) {
  const groupMap = new Map(groups.map((group) => [group.groupKey, group]));
  let orderBreaks = 0;
  let missingGroupRefs = 0;
  let groupSizeMismatches = 0;
  let duplicateMemberGroups = 0;
  let representativeMismatches = 0;
  let nativeGroups = 0;
  let fallbackGroups = 0;
  let syntheticGroups = 0;
  let groupedMemberCount = 0;
  const representativeMismatchSamples = [];

  for (let index = 1; index < browserItems.length; index += 1) {
    if (stableNumber(browserItems[index - 1].browserOrder, 0) > stableNumber(browserItems[index].browserOrder, 0)) {
      orderBreaks += 1;
    }
  }

  for (const item of browserItems) {
    if (item.groupKey && !groupMap.has(item.groupKey)) {
      missingGroupRefs += 1;
    }
  }

  for (const group of groups) {
    const groupKey = `${group.groupKey ?? ""}`;
    if (groupKey.startsWith("nei:")) nativeGroups += 1;
    else if (groupKey.startsWith("fallback:")) fallbackGroups += 1;
    else syntheticGroups += 1;

    const members = group.memberItemIds ?? [];
    const uniqueMembers = new Set(members);
    groupedMemberCount += members.length;
    if (uniqueMembers.size !== members.length) duplicateMemberGroups += 1;
    if (stableNumber(group.groupSize, 0) !== uniqueMembers.size) groupSizeMismatches += 1;
    if (group.representativeItemId && !uniqueMembers.has(group.representativeItemId)) {
      representativeMismatches += 1;
      if (representativeMismatchSamples.length < 50) {
        representativeMismatchSamples.push({
          groupKey: group.groupKey,
          groupLabel: group.groupLabel ?? null,
          groupSize: group.groupSize ?? members.length,
          representativeItemId: group.representativeItemId,
          firstMemberItemIds: members.slice(0, 5),
        });
      }
    }
  }

  const exporterContract = exportReport?.neiBrowserContract ?? null;
  const exporterCounts = exportReport?.counts ?? {};
  const runtimePanelItemCount = stableNumber(
    exporterContract?.neiRuntimePanelItemCount,
    stableNumber(exporterCounts.neiRuntimePanelItems, 0),
  );
  const exportOnlyItemCount = stableNumber(
    exporterContract?.exportOnlyItemCount,
    stableNumber(exporterCounts.neiExportOnlyItems, 0),
  );
  const exporterBrowserItemCount = stableNumber(
    exporterContract?.browserItemCount,
    stableNumber(exporterCounts.neiBrowserItems, browserItems.length),
  );
  const exporterGroupCount = stableNumber(
    exporterContract?.groupCount,
    stableNumber(exporterCounts.rawGroups, groups.length),
  );
  const expectedCompilerGroupCount = exporterGroupCount + stableNumber(compilerAddedGroupCount, 0);
  const exporterDefaultEntryCount = stableNumber(
    exporterContract?.defaultEntryCount,
    stableNumber(exporterCounts.neiDefaultEntries, neiOrder.length),
  );

  const countMismatches = [];
  if (exporterBrowserItemCount !== browserItems.length) {
    countMismatches.push({ key: "browserItems", exporter: exporterBrowserItemCount, compiler: browserItems.length });
  }
  if (expectedCompilerGroupCount !== groups.length) {
    countMismatches.push({ key: "groups", exporter: exporterGroupCount, compiler: groups.length, compilerAdded: compilerAddedGroupCount });
  }
  if (exporterDefaultEntryCount !== neiOrder.length) {
    countMismatches.push({ key: "defaultEntries", exporter: exporterDefaultEntryCount, compiler: neiOrder.length });
  }

  const status = orderBreaks === 0
    && missingGroupRefs === 0
    && groupSizeMismatches === 0
    && duplicateMemberGroups === 0
    && representativeMismatches === 0
    && countMismatches.length === 0
    ? "ok"
    : "warning";

  return {
    schemaVersion: "neonei/nei-browser-contract/v1",
    generatedAt: new Date().toISOString(),
    status,
    summary: `NEI panel items=${runtimePanelItemCount}, NeoNEI browser items=${browserItems.length}, groups=${groups.length}, fallbackGroups=${fallbackGroups}, representativeMismatches=${representativeMismatches}.`,
    exporter: {
      status: exporterContract?.status ?? null,
      summary: exporterContract?.summary ?? null,
      neiRuntimeSnapshot: exporterContract?.neiRuntimeSnapshot ?? null,
      orderSource: exporterContract?.orderSource ?? null,
      groupingSource: exporterContract?.groupingSource ?? null,
      runtimePanelItemCount,
      exportOnlyItemCount,
      browserItemCount: exporterBrowserItemCount,
      groupCount: exporterGroupCount,
      expectedCompilerGroupCount,
      defaultEntryCount: exporterDefaultEntryCount,
    },
    compiler: {
      browserItemCount: browserItems.length,
      groupCount: groups.length,
      defaultEntryCount: neiOrder.length,
      nativeGroupCount: nativeGroups,
      fallbackGroupCount: fallbackGroups,
      syntheticGroupCount: syntheticGroups,
      groupedMemberCount,
      ungroupedBrowserItemCount: Math.max(0, browserItems.length - groupedMemberCount),
    },
    checks: {
      orderBreaks,
      missingGroupRefs,
      groupSizeMismatches,
      duplicateMemberGroups,
      representativeMismatches,
      countMismatches,
    },
    samples: {
      representativeMismatchSamples,
      exporterRepresentativeMismatchSamples: exporterContract?.representativeMismatchSamples ?? [],
    },
  };
}

function sanitizePathSegment(value) {
  return `${value ?? "unknown"}`.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

const EXPECTED_SPECIAL_FACT_KEYS = {
  gregtech: ["duration", "voltage", "amperage", "totalEU", "voltageTier", "requiresCleanroom", "requiresLowGravity"],
  thaumcraft: ["research", "centralItemId", "centerInputSlotIndex", { key: "aspects", aliases: ["aspects", "aspect", "aspectCosts", "inputAspects"] }, "instability"],
  botania: [{ key: "mana", aliases: ["mana", "manaCost"] }, "ticks", "catalyst", { key: "recipeKind", aliases: ["recipeKind", "brewKey", "correctedMachineType"] }],
  bloodmagic: ["bloodCost", "lpCost", { key: "requiredLP", aliases: ["requiredLP", "lpCost", "bloodCost"] }, "tier", { key: "altarTier", aliases: ["altarTier", "tier"] }, "consumptionRate", "drainRate"],
  forestry: [
    "chance",
    { key: "species", aliases: ["species", "beeSpecies", "mutations", "primaryRefs.itemInputIds", "primaryRefs.itemOutputIds"] },
    { key: "allele", aliases: ["allele", "alleles", "primaryRefs.itemInputIds", "primaryRefs.itemOutputIds"], severity: "advisory" },
    { key: "temperature", aliases: ["temperature"], severity: "advisory" },
    { key: "humidity", aliases: ["humidity"], severity: "advisory" },
  ],
  eec: [
    "mobName",
    { key: "entityId", aliases: ["entityId", "mobName", "entityName"] },
    { key: "health", aliases: ["health", "maxHealth", "entityHealth"] },
    { key: "drops", aliases: ["drops", "normalOutputsCount", "rareOutputsCount", "additionalOutputsCount", "infernalOutputsCount", "outputCount", "primaryRefs.itemOutputIds", "primaryRefs.fluidOutputIds"] },
    { key: "dropChance", aliases: ["dropChance", "eliteChance", "ultraChance", "infernoChance"], severity: "advisory" },
  ],
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

function readDottedValue(source, dottedPath) {
  if (!isPlainObject(source) || !dottedPath) return undefined;
  let current = source;
  for (const segment of `${dottedPath}`.split(".")) {
    if (!isPlainObject(current) && !Array.isArray(current)) return undefined;
    current = current?.[segment];
  }
  return current;
}

function hasCoverageValue(value) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function countAnyFactKey(payload, keys) {
  let count = 0;
  for (const payloadRow of payload ?? []) {
    const sources = [payloadRow?.domainFacts, payloadRow?.facts, payloadRow?.metadata, payloadRow?.extensions, payloadRow?.machine, payloadRow?.layout, payloadRow?.primaryRefs, payloadRow?.slotStats, payloadRow];
    if (keys.some((key) => sources.some((source) => hasCoverageValue(readDottedValue(source, key))))) {
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
    countFactKeys(payload?.facts, domainFactCounter);
    countFactKeys(payload?.metadata, metadataCounter);
    countFactKeys(payload?.extensions, extensionCounter);
  }
  const totalPayloads = payloads?.length ?? 0;
  const expected = EXPECTED_SPECIAL_FACT_KEYS[domainId] ?? [];
  const expectedEntries = expected.map((entry) => (
    typeof entry === "string"
      ? { key: entry, aliases: [entry] }
      : { key: `${entry?.key ?? ""}`.trim(), aliases: Array.isArray(entry?.aliases) ? entry.aliases : [`${entry?.key ?? ""}`.trim()], severity: entry?.severity === "advisory" ? "advisory" : "required" }
  )).filter((entry) => entry.key);
  return {
    domain: domainId,
    payloadCount: totalPayloads,
    domainFactKeys: summarizeCounter(domainFactCounter, totalPayloads),
    metadataKeys: summarizeCounter(metadataCounter, totalPayloads),
    extensionKeys: summarizeCounter(extensionCounter, totalPayloads),
    expectedCoverage: expectedEntries.map(({ key, aliases, severity = "required" }) => {
      const count = countAnyFactKey(payloads, aliases);
      return {
        key,
        aliases,
        severity,
        count,
        ratio: totalPayloads > 0 ? Number((count / totalPayloads).toFixed(4)) : 0,
        status: count > 0 ? "present" : (severity === "advisory" ? "missing-advisory" : "missing"),
      };
    }),
  };
}

function readSpecialDomains(inputDir, specialIndex) {
  const domains = [];
  for (const domain of specialIndex?.domains ?? []) {
    const domainId = sanitizePathSegment(domain?.domain);
    const payloadsPath = `${domain?.payloads ?? ""}`.trim();
    const indexPath = `${domain?.index ?? ""}`.trim();
    const summaryPath = `${domain?.summary ?? ""}`.trim();
    const payloads = payloadsPath ? readJsonl(join(inputDir, payloadsPath)) : [];
    const index = indexPath ? readJson(join(inputDir, indexPath)) : null;
    const summary = summaryPath ? readJson(join(inputDir, summaryPath)) : (domain?.stats ?? index?.stats ?? null);
    const declaredRecipeCount = stableNumber(domain?.recipeCount ?? index?.recipeCount, payloads.length);
    const factsCoverage = buildSpecialFactsCoverage(domainId, payloads);
    domains.push({
      domain: domainId,
      recipeCount: declaredRecipeCount,
      declaredRecipeCount,
      payloadCount: payloads.length,
      declaredPayloadCount: stableNumber(domain?.payloadCount ?? index?.payloadCount, payloads.length),
      payloadsPath,
      indexPath,
      summaryPath,
      outputPayloads: `special/${domainId}/payloads.json`,
      outputSummary: `special/${domainId}/summary.json`,
      summary: { ...(summary ?? { domain: domainId, recipeCount: declaredRecipeCount }), factsCoverage },
      factsCoverage,
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
  const exportPathHygiene = buildExportPathHygieneReport(inputDir, manifest);
  const exportReport = readRawJson(inputDir, manifest, "exportReport", "validation/export_report.json");
  const items = readRawJsonl(inputDir, manifest, "items", "facts/items.jsonl.gz");
  const semanticItems = readRawJsonl(inputDir, manifest, "semanticItems", "facts/items/semantic-items.jsonl.gz");
  const itemVariants = readRawJsonl(inputDir, manifest, "itemVariants", "facts/items/variants.jsonl.gz");
  const itemPayloads = readRawJsonl(inputDir, manifest, "itemPayloads", "facts/items/payloads.jsonl.gz");
  const itemIdentityMap = readRawJsonl(inputDir, manifest, "itemIdentityMap", "facts/items/identity-map.jsonl.gz");
  const fluids = readRawJsonl(inputDir, manifest, "fluids", "facts/fluids.jsonl.gz");
  const recipes = readRawRecipes(inputDir, manifest);
  const rawGroups = readRawJsonl(inputDir, manifest, "groups", "facts/nei/groups.jsonl.gz");
  const neiOrder = readRawJsonl(inputDir, manifest, "neiOrder", "facts/nei/order.jsonl.gz");
  const neiGuidFilters = readRawJsonl(inputDir, manifest, "neiGuidFilters", "facts/nei/guidfilters.jsonl.gz");
  const neiHiddenItems = readRawJsonl(inputDir, manifest, "neiHiddenItems", "facts/nei/hiddenitems.jsonl.gz");
  const textures = readRawJsonl(inputDir, manifest, "textures", "assets/textures/index.jsonl.gz");
  const animations = readRawJsonl(inputDir, manifest, "animations", "assets/animations/index.jsonl.gz");
  const nativeSprites = readRawJsonl(inputDir, manifest, "nativeSprites", "assets/animations/native-sprites.jsonl.gz");
  const renderedGifs = readRawJsonl(inputDir, manifest, "renderedGifs", "assets/animations/rendered-gifs.jsonl.gz");
  const entities = readRawJsonl(inputDir, manifest, "entities", "models/entities/index.jsonl.gz");
  const browserAtlasIndex = readRawJson(inputDir, manifest, "browserAtlasIndex", "assets/textures/browser_atlas_index.json");
  const specialIndex = readRawJson(inputDir, manifest, "specialIndex", "special/index.json");
  const specialDomains = readSpecialDomains(inputDir, specialIndex);
  const animationFacts = mergeAnimationFacts(animations, nativeSprites, renderedGifs);
  const itemIds = new Set(items.map((item) => item?.itemId).filter(Boolean));
  const semanticIdentityByLegacyItemId = new Map();
  for (const entry of itemIdentityMap) {
    if (entry?.legacyItemId) semanticIdentityByLegacyItemId.set(entry.legacyItemId, entry);
  }

  const renderByAssetId = new Map();
  for (const texture of textures) {
    if (texture.assetId) renderByAssetId.set(texture.assetId, texture);
  }

  const layoutByItemId = new Map();
  for (const entry of neiOrder) {
    if (entry.itemId) layoutByItemId.set(entry.itemId, entry);
  }
  const rawBrowserGroups = normalizeBrowserGroups(rawGroups, itemIds);
  const semanticBrowserGroups = buildSemanticBrowserGroups({
    itemIdentityMap,
    semanticItems,
    availableItemIds: itemIds,
    layoutByItemId,
  });
  const mergedBrowserGroups = mergeBrowserGroupsByPrecedence(rawBrowserGroups, semanticBrowserGroups);
  const groups = mergedBrowserGroups.groups;
  const compilerAddedSemanticGroups = groups.filter((group) => group.groupSource === "semanticIdentity").length;
  for (const group of groups) {
    for (const itemId of group.memberItemIds ?? []) {
      layoutByItemId.set(itemId, {
        ...(layoutByItemId.get(itemId) ?? {}),
        groupKey: group.groupKey,
        groupLabel: group.groupLabel,
        groupSize: group.groupSize,
        representativeItemId: group.representativeItemId,
        groupSortOrder: group.groupSortOrder,
        groupSource: group.groupSource ?? null,
      });
    }
  }
  const variantsByPublicItem = buildVariantsByPublicItem({ itemVariants, itemIdentityMap });
  const semanticFacets = itemVariants
    .filter((variant) => variant?.variantId && variant?.facets)
    .map((variant) => ({
      publicItemId: variant.publicItemId ?? null,
      variantId: variant.variantId,
      legacyItemId: variant.legacyItemId ?? null,
      family: variant.family ?? null,
      variantLabel: variant.variantLabel ?? null,
      facetSummary: variant.facetSummary ?? null,
      sortKey: variant.sortKey ?? null,
      facets: variant.facets,
    }));
  const semanticFacetFamilies = Array.from(semanticFacets.reduce((acc, facet) => {
    const family = `${facet.family ?? ""}`.trim() || "unknown";
    const existing = acc.get(family) ?? { family, variantCount: 0 };
    existing.variantCount += 1;
    acc.set(family, existing);
    return acc;
  }, new Map()).values()).sort((left, right) => right.variantCount - left.variantCount || left.family.localeCompare(right.family));

  const searchItems = items
    .filter((item) => item && item.itemId)
    .map((item, index) => {
      const base = buildSearchEntry(item, index, renderByAssetId, layoutByItemId);
      const semantic = semanticIdentityByLegacyItemId.get(item.itemId) ?? {};
      const semanticSearchTerms = [
        semantic.publicItemId,
        semantic.family,
        semantic.classification,
        semantic.facetSummary,
      ].filter(Boolean).join(" ");
      return {
        ...base,
        ...semantic,
        normalizedSearchTerms: normalizeLoose([base.normalizedSearchTerms, semanticSearchTerms].filter(Boolean).join(" ")),
      };
    });

  const missingAnimationTimingAssetIds = animationFacts
    .filter((entry) => entry?.assetId && stableNumber(entry.frameCount, 0) > 1 && !entry.timeline && !entry.frameDurationMs)
    .map((entry) => entry.assetId);

  const browserItems = searchItems.map((entry, index) => {
    const layout = layoutByItemId.get(entry.itemId) ?? {};
    return {
      itemId: entry.itemId,
      publicItemId: entry.publicItemId ?? null,
      variantId: entry.variantId ?? null,
      payloadHash: entry.payloadHash ?? null,
      semanticFamily: entry.family ?? entry.semanticFamily ?? null,
      semanticClassification: entry.classification ?? entry.semanticClassification ?? null,
      localizedName: entry.localizedName,
      modId: entry.modId,
      renderAssetRef: entry.renderAssetRef,
      browserOrder: stableNumber(layout.browserOrder, stableNumber(layout.entryOrder, index)),
      groupKey: layout.groupKey ?? null,
      groupLabel: layout.groupLabel ?? null,
      groupSize: stableNumber(layout.groupSize, 1),
      representativeItemId: layout.representativeItemId ?? entry.itemId,
      groupSource: layout.groupSource ?? null,
    };
  }).sort((left, right) => left.browserOrder - right.browserOrder || left.itemId.localeCompare(right.itemId));
  const browserContract = buildBrowserContractReport({
    groups,
    browserItems,
    neiOrder,
    exportReport,
    compilerAddedGroupCount: compilerAddedSemanticGroups,
  });

  const generatedBrowserAtlasIndex = buildBrowserAtlasIndexFromResources(browserAtlasIndex, browserItems, textures, animationFacts);
  const materializedBrowserAtlasIndex = materializeBrowserAtlasAssets(inputDir, outputDir, generatedBrowserAtlasIndex);
  const browserAtlasItems = Array.isArray(generatedBrowserAtlasIndex?.items) ? generatedBrowserAtlasIndex.items : [];
  const animationTable = buildAnimationTable(searchItems, textures, animationFacts, generatedBrowserAtlasIndex);
  const semanticResourceReport = buildSemanticResourceReport({
    semanticBrowserGroups,
    browserAtlasItems,
    animationTable,
  });
  const atlasAuthorityReport = buildAtlasAuthorityReport(inputDir, browserItems, browserAtlasItems, renderByAssetId);
  const missingBrowserAtlasItemIds = atlasAuthorityReport.samples.missingBrowserAtlasItemIds;
  const staticBrowserAtlasItems = browserAtlasItems.filter((entry) => entry?.staticAtlas?.atlasFile).length;
  const animatedBrowserAtlasItems = browserAtlasItems.filter((entry) => entry?.animatedAtlas?.atlasFile).length;

  const recipeItemIndex = buildRecipeItemIndex(recipes);
  const semanticItemSummary = buildSemanticItemSummary({
    semanticItems,
    itemVariants,
    itemPayloads,
    itemIdentityMap,
    searchItems,
  });
  const recipeUiPayloads = recipes
    .map(buildRecipeUiPayload)
    .filter(Boolean);
  const recipeUiPayloadIndex = recipeUiPayloads.map((payload) => ({
    recipeId: payload.recipeId,
    path: getRecipeUiPayloadRelativePath(payload.recipeId),
    payloadKey: payload.recipeId,
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
    neiGuidFilterRules: neiGuidFilters.length,
    neiHiddenItemRules: neiHiddenItems.length,
  });
  const specialFactsCoverage = {
    schemaVersion: "neonei/special-facts-coverage/v1",
    domains: specialDomains.map((domain) => domain.factsCoverage),
  };
  const specialExpectedFactKeys = specialFactsCoverage.domains
    .flatMap((domain) => domain.expectedCoverage ?? []);
  const specialExpectedFactKeysPresent = specialExpectedFactKeys.filter((entry) => entry.status === "present").length;
  const specialExpectedFactKeysMissingRequired = specialExpectedFactKeys.filter((entry) => entry.status === "missing").length;
  const specialExpectedFactKeysMissingAdvisory = specialExpectedFactKeys.filter((entry) => entry.status === "missing-advisory").length;
  const validation = {
    schemaVersion: "neonei/compiler-validation/v3-alpha1",
    generatedAt: new Date().toISOString(),
    inputDir: "<raw-export>",
    outputDir: "<dist-data>",
    counts: {
      items: items.length,
      semanticItems: semanticItems.length,
      itemVariants: itemVariants.length,
      itemPayloads: itemPayloads.length,
      itemIdentityMap: itemIdentityMap.length,
      semanticBrowserGroups: semanticBrowserGroups.length,
      activeSemanticBrowserGroups: compilerAddedSemanticGroups,
      droppedBrowserGroupsByPrecedence: mergedBrowserGroups.dropped.length,
      variantsByPublicItem: variantsByPublicItem.length,
      semanticFacets: semanticFacets.length,
      semanticFacetFamilies: semanticFacetFamilies.length,
      neiGuidFilterRules: neiGuidFilters.length,
      neiHiddenItemRules: neiHiddenItems.length,
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
      specialExpectedFactKeysMissing: specialExpectedFactKeysMissingRequired,
      specialExpectedFactKeysMissingAdvisory,
      manifestBlocked: manifestValidation.blocked.length,
      rawExportCountMismatches: rawExportCountMismatches.length,
      recipeCategories: recipeCategories.size,
      recipeItemIndexItems: recipeItemIndex.length,
      recipeUiPayloads: recipeUiPayloads.length,
      recipeCategorySplits: recipeCategorySplits.length,
      browserContractRepresentativeMismatches: browserContract.checks.representativeMismatches,
      browserContractCountMismatches: browserContract.checks.countMismatches.length,
      browserContractFallbackGroups: browserContract.compiler.fallbackGroupCount,
      semanticRepresentativeMissingAtlas: semanticResourceReport.counts.representativeMissingAtlas,
      semanticMemberMissingAtlas: semanticResourceReport.counts.memberMissingAtlas,
      semanticAnimationTimingMissing: semanticResourceReport.counts.animationTimingMissing,
    },
    manifestValidation,
    exportPathHygiene,
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
      missingAnimationTimingAssetIds: missingAnimationTimingAssetIds.slice(0, 100),
      semanticResourceSamples: semanticResourceReport.samples,
      droppedBrowserGroupsByPrecedence: mergedBrowserGroups.dropped.slice(0, 100),
      semanticFacetFamilies: semanticFacetFamilies.slice(0, 50),
    },
    coverage: {
      browserAtlasRatio: atlasAuthorityReport.coverageRatio,
      semanticIdentityMapRatio: items.length === 0 ? 1 : itemIdentityMap.length / items.length,
    },
    semanticItemSummary,
    semanticResourceReport,
    atlasAuthorityReport,
    browserContract,
    warnings: [],
    elapsedMs: Date.now() - startedAt,
  };
  validation.warnings.push(...manifestValidation.warnings);
  if (exportPathHygiene.status !== "ok") {
    validation.warnings.push(`Raw Export path hygiene found ${exportPathHygiene.violations.length} machine-specific path leak(s).`);
  }
  if (manifestValidation.missing.length > 0) validation.warnings.push(`Raw Export manifest is missing declared core file(s): ${manifestValidation.missing.join(", ")}.`);
  if (manifestValidation.empty.length > 0) validation.warnings.push(`Raw Export manifest declares empty core file(s): ${manifestValidation.empty.join(", ")}.`);
  if (manifestValidation.blocked.length > 0) validation.warnings.push(`Raw Export semantic streams are blocked: ${manifestValidation.blocked.join(", ")}.`);
  if (items.length === 0) validation.warnings.push("facts/items.jsonl.gz is empty; compiler output is structural only.");
  if (recipes.length === 0) validation.warnings.push("Recipe shards are empty; recipe indexes cannot be complete.");
  if (atlasAuthorityReport.indexedBrowserItems < atlasAuthorityReport.totalBrowserItems) validation.warnings.push(`Browser atlas is missing indexed entries for ${atlasAuthorityReport.totalBrowserItems - atlasAuthorityReport.indexedBrowserItems} browser item(s).`);
  if (atlasAuthorityReport.missingDrawableItemIds > 0) validation.warnings.push(`Browser atlas has ${atlasAuthorityReport.missingDrawableItemIds} indexed item(s) without drawable atlas files.`);
  if (atlasAuthorityReport.missingAtlasFiles > 0) validation.warnings.push(`Browser atlas references ${atlasAuthorityReport.missingAtlasFiles} atlas file(s) that are not present beside the Raw Export.`);
  if (atlasAuthorityReport.mismatchedAssetRefs > 0) validation.warnings.push(`Browser atlas has ${atlasAuthorityReport.mismatchedAssetRefs} item(s) whose atlas assetId differs from item renderAssetRef.`);
  if (atlasAuthorityReport.duplicateItemIds > 0) validation.warnings.push(`Browser atlas contains ${atlasAuthorityReport.duplicateItemIds} duplicate itemId row(s).`);
  if (missingAnimationTimingAssetIds.length > 0) validation.warnings.push(`Animation timing metadata is missing for ${missingAnimationTimingAssetIds.length} animated asset(s).`);
  if (semanticResourceReport.status !== "ok") {
    validation.warnings.push(`Semantic browser groups have resource gaps: representatives missing atlas=${semanticResourceReport.counts.representativeMissingAtlas}, members missing atlas=${semanticResourceReport.counts.memberMissingAtlas}, animation timing missing=${semanticResourceReport.counts.animationTimingMissing}.`);
  }
  if (recipeCategorySplits.length > 0) validation.warnings.push(`Recipe categories have ${recipeCategorySplits.length} duplicate display-name split(s).`);
  if (rawExportCountMismatches.length > 0) validation.warnings.push(`Raw Export compiler counts differ from exporter report in ${rawExportCountMismatches.length} area(s).`);
  if (browserContract.status !== "ok") validation.warnings.push(`NEI browser contract is ${browserContract.status}: ${browserContract.summary}`);
  for (const domain of specialDomains) {
    if (domain.recipeCount !== domain.payloads.length) {
      validation.warnings.push(`Special domain ${domain.domain} has ${domain.recipeCount} recipe row(s) but ${domain.payloads.length} payload row(s).`);
    }
    if (domain.declaredPayloadCount !== domain.payloads.length) {
      validation.warnings.push(`Special domain ${domain.domain} declares ${domain.declaredPayloadCount} payload row(s) but compiler read ${domain.payloads.length}.`);
    }
  }
  validation.migrationReadiness = buildMigrationReadiness(validation, exportReport, specialDomains, atlasAuthorityReport);

  writeJson(outputDir + "/manifest.json", {
    schemaVersion: "neonei/dist-data/v3-alpha1",
    generatedAt: new Date().toISOString(),
    source: manifest?.schemaVersion ?? "unknown",
    sourceRepository: manifest?.repositoryName ?? null,
    files: {
      searchAll: "search/all.json",
      semanticItems: "items/semantic-items.json",
      semanticFacets: "items/semantic-facets.json",
      itemVariants: "items/variants.json",
      itemVariantsByPublicItem: "items/variants-by-public-item.json",
      itemIdentityMap: "items/identity-map.json",
      itemPayloadIndex: "items/payload-index.json",
      browserCatalog: "browser/item-catalog.json",
      browserGroups: "browser/group-index.json",
      nativeNeiRules: "browser/native-nei-rules.json",
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
      exportPathHygiene: "validation/export-path-hygiene.json",
      neiBrowserContract: "validation/nei-browser-contract.json",
    },
  });
  writeJsonCompact(join(outputDir, "search", "all.json"), { schemaVersion: "neonei/search-v3-json/v1", items: searchItems });
  writeJsonCompact(join(outputDir, "items", "semantic-items.json"), { schemaVersion: "neonei/semantic-items/v1", items: semanticItems });
  writeJsonCompact(join(outputDir, "items", "semantic-facets.json"), { schemaVersion: "neonei/semantic-facets/v1", facets: semanticFacets });
  writeJsonCompact(join(outputDir, "items", "variants.json"), { schemaVersion: "neonei/item-variants/v1", variants: itemVariants });
  writeJsonCompact(join(outputDir, "items", "variants-by-public-item.json"), { schemaVersion: "neonei/item-variants-by-public-item/v1", items: variantsByPublicItem });
  writeJsonCompact(join(outputDir, "items", "identity-map.json"), { schemaVersion: "neonei/item-identity-map/v1", items: itemIdentityMap });
  writeJsonCompact(join(outputDir, "items", "payload-index.json"), { schemaVersion: "neonei/item-payload-index/v1", payloads: itemPayloads.map((payload) => ({
    payloadHash: payload?.payloadHash ?? null,
    legacyItemId: payload?.legacyItemId ?? null,
    encoding: payload?.encoding ?? null,
  })).filter((payload) => payload.payloadHash) });
  writeJsonCompact(join(outputDir, "browser", "item-catalog.json"), { schemaVersion: "neonei/browser-catalog/v1", items: browserItems });
  writeJsonCompact(join(outputDir, "browser", "group-index.json"), { schemaVersion: "neonei/group-index/v1", groups });
  writeJsonCompact(join(outputDir, "browser", "native-nei-rules.json"), { schemaVersion: "neonei/native-nei-rules/v1", guidFilters: neiGuidFilters, hiddenItems: neiHiddenItems });
  writeJsonCompact(join(outputDir, "recipes", "recipe-category-index.json"), { schemaVersion: "neonei/recipe-category-index/v1", categories: Array.from(recipeCategories.values()) });
  writeJsonCompact(join(outputDir, "recipes", "item-index.json"), { schemaVersion: "neonei/recipe-item-index/v1", items: recipeItemIndex });
  writeJsonCompact(join(outputDir, "recipes", "ui-payload-index.json"), { schemaVersion: "neonei/recipe-ui-payload-index/v1", recipes: recipeUiPayloadIndex });
  const recipePayloadShards = new Map();
  for (const payload of recipeUiPayloads) {
    const shardPath = getRecipeUiPayloadRelativePath(payload.recipeId);
    const shardPayloads = recipePayloadShards.get(shardPath) ?? {};
    shardPayloads[payload.recipeId] = {
        schemaVersion: "neonei/recipe-ui-payload/v1",
        ...payload,
      };
    recipePayloadShards.set(shardPath, shardPayloads);
  }
  for (const [shardPath, payloads] of recipePayloadShards) {
    writeJsonCompact(join(outputDir, shardPath), {
      schemaVersion: "neonei/recipe-ui-payload-shard/v1",
      payloads,
    });
  }
  writeJsonCompact(join(outputDir, "textures", "atlas-manifest.json"), { schemaVersion: "neonei/texture-manifest/v1", textures, animations: animationFacts, nativeSprites, renderedGifs });
  writeJsonCompact(join(outputDir, "textures", "animation-table.json"), { schemaVersion: "neonei/animation-table/v1", items: animationTable });
  writeJsonCompact(join(outputDir, "textures", "browser-atlas-index.json"), materializedBrowserAtlasIndex ?? { schemaVersion: "neonei/browser-atlas-index/v1", items: [] });
  writeJsonCompact(join(outputDir, "models", "entities", "index.json"), { schemaVersion: "neonei/entity-model-index/v1", entities });
  const distSpecialIndex = {
    schemaVersion: "neonei/special-index/v1",
    sourceSchemaVersion: specialIndex?.schemaVersion ?? null,
    domains: specialDomains.map(({ recipes, payloads, summary, factsCoverage, ...domain }) => domain),
  };
  writeJsonCompact(join(outputDir, "special", "index.json"), distSpecialIndex);
  writeJsonCompact(join(outputDir, "special", "facts-coverage.json"), specialFactsCoverage);
  for (const domain of specialDomains) {
    writeJsonCompact(join(outputDir, domain.outputPayloads), { schemaVersion: "neonei/special-domain-payloads/v1", domain: domain.domain, payloads: domain.payloads });
    writeJsonCompact(join(outputDir, domain.outputSummary), { schemaVersion: "neonei/special-domain-summary/v1", ...domain.summary });
  }
  writeJson(join(outputDir, "validation", "report.json"), validation);
  writeJson(join(outputDir, "validation", "migration-readiness.json"), validation.migrationReadiness);
  writeJson(join(outputDir, "validation", "export-path-hygiene.json"), exportPathHygiene);
  writeJson(join(outputDir, "validation", "nei-browser-contract.json"), browserContract);
  if (manifestValidation.blocked.length > 0) {
    throw new Error(`Raw Export manifest contract blocked: ${manifestValidation.blocked.join(", ")}`);
  }
  return validation;
}

function createSelfTestRawExport(root) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  for (const relativeDir of [
    "facts",
    "facts/items",
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
    capabilities: ["facts", "assets", "validation", "semanticIdentity"],
    files: {
      items: "facts/items.jsonl.gz",
      semanticItems: "facts/items/semantic-items.jsonl.gz",
      itemVariants: "facts/items/variants.jsonl.gz",
      itemPayloads: "facts/items/payloads.jsonl.gz",
      itemIdentityMap: "facts/items/identity-map.jsonl.gz",
      fluids: "facts/fluids.jsonl.gz",
      recipeIndex: "facts/recipes/index.json",
      groups: "facts/nei/groups.jsonl.gz",
      neiOrder: "facts/nei/order.jsonl.gz",
      neiGuidFilters: "facts/nei/guidfilters.jsonl.gz",
      neiHiddenItems: "facts/nei/hiddenitems.jsonl.gz",
      textures: "assets/textures/index.jsonl.gz",
      animations: "assets/animations/index.jsonl.gz",
      nativeSprites: "assets/animations/native-sprites.jsonl.gz",
      renderedGifs: "assets/animations/rendered-gifs.jsonl.gz",
      browserAtlasIndex: "assets/textures/browser_atlas_index.json",
      entities: "models/entities/index.jsonl.gz",
      specialIndex: "special/index.json",
      exportReport: "validation/export_report.json",
    },
  });
  writeGzipText(join(root, "facts/items.jsonl.gz"), [
    JSON.stringify({ itemId: "i~minecraft~iron_ingot~0", modId: "minecraft", internalName: "iron_ingot", localizedName: "Iron Ingot", renderAssetRef: "nesqlpp:item/i~minecraft~iron_ingot~0", searchTerms: "iron ingot" }),
    JSON.stringify({ itemId: "i~botania~manaResource~4", modId: "botania", internalName: "manaResource", localizedName: "Terrasteel Ingot", renderAssetRef: "nesqlpp:item/i~botania~manaResource~4", searchTerms: "terrasteel" }),
    JSON.stringify({ itemId: "i~minecraft~gold_ingot~0", modId: "minecraft", internalName: "gold_ingot", localizedName: "Gold Ingot", renderAssetRef: "nesqlpp:item/i~minecraft~gold_ingot~0", searchTerms: "gold ingot" }),
  ].join("\n") + "\n");
  writeGzipText(join(root, "facts/items/semantic-items.jsonl.gz"), [
    JSON.stringify({ publicItemId: "item:i~minecraft~iron_ingot~0", family: "legacy.item", classification: "untagged-legacy", representativeLegacyItemId: "i~minecraft~iron_ingot~0" }),
    JSON.stringify({ publicItemId: "semantic:facade.ae2:appeng~item.facade~0", family: "facade.ae2", classification: "classified", representativeLegacyItemId: "i~appeng~item.facade~0~nbt1" }),
  ].join("\n") + "\n");
  writeGzipText(join(root, "facts/items/variants.jsonl.gz"), `${JSON.stringify({ variantId: "semantic:facade.ae2:appeng~item.facade~0:variant:abc123", publicItemId: "semantic:facade.ae2:appeng~item.facade~0", family: "facade.ae2", legacyItemId: "i~appeng~item.facade~0~nbt1", payloadHash: "abc123", variantLabel: "Stone Facade", facetSummary: "block=minecraft:stone", sortKey: "facade|minecraft:stone", facets: { block: "minecraft:stone" } })}\n`);
  writeGzipText(join(root, "facts/items/payloads.jsonl.gz"), `${JSON.stringify({ payloadHash: "abc123", legacyItemId: "i~appeng~item.facade~0~nbt1", encoding: "minecraft-nbt-toString", nbt: "{modid:\"minecraft\",itemname:\"stone\"}" })}\n`);
  writeGzipText(join(root, "facts/items/identity-map.jsonl.gz"), [
    JSON.stringify({ legacyItemId: "i~minecraft~iron_ingot~0", publicItemId: "item:i~minecraft~iron_ingot~0", family: "legacy.item", classification: "untagged-legacy" }),
    JSON.stringify({ legacyItemId: "i~botania~manaResource~4", publicItemId: "item:i~botania~manaresource~4", family: "legacy.item", classification: "untagged-legacy" }),
    JSON.stringify({ legacyItemId: "i~minecraft~gold_ingot~0", publicItemId: "item:i~minecraft~gold_ingot~0", family: "legacy.item", classification: "untagged-legacy" }),
  ].join("\n") + "\n");
  writeGzipText(join(root, "facts/fluids.jsonl.gz"), `${JSON.stringify({ fluidId: "f~gregtech~molten.iron", localizedName: "Molten Iron" })}\n`);
  writeGzipText(join(root, "facts/recipes/furnace.jsonl.gz"), `${JSON.stringify({ recipeId: "r1", family: "minecraft", machine: { machineId: "furnace", displayName: "Furnace" }, inputs: [{ itemId: "i~minecraft~iron_ore~0" }], outputs: [{ itemId: "i~minecraft~iron_ingot~0" }, { itemId: "i~botania~manaResource~4" }] })}\n`);
  writeJson(join(root, "facts/recipes/index.json"), { schemaVersion: "nesqlpp/raw-export/alpha1/recipe-index", strategy: "by-handler", recipeCount: 1, shards: [{ handlerId: "furnace", path: "facts/recipes/furnace.jsonl.gz", recipeCount: 1 }] });
  writeGzipText(join(root, "facts/nei/groups.jsonl.gz"), `${JSON.stringify({ groupKey: "nei:iron", groupLabel: "Iron", groupSize: 1, representativeItemId: "i~minecraft~iron_ingot~0", memberItemIds: ["i~minecraft~iron_ingot~0"] })}\n`);
  writeGzipText(join(root, "facts/nei/order.jsonl.gz"), `${JSON.stringify({ entryOrder: 0, entryKind: "item", itemId: "i~minecraft~iron_ingot~0" })}\n${JSON.stringify({ entryOrder: 1, entryKind: "item", itemId: "i~botania~manaResource~4" })}\n${JSON.stringify({ entryOrder: 2, entryKind: "item", itemId: "i~minecraft~gold_ingot~0" })}\n`);
  writeGzipText(join(root, "facts/nei/guidfilters.jsonl.gz"), `${JSON.stringify({ itemExpression: "BuildCraft|Transport:pipeFacade", nbtPath: "tag.block" })}\n`);
  writeGzipText(join(root, "facts/nei/hiddenitems.jsonl.gz"), `${JSON.stringify({ itemExpression: "IC2:itemCropSeed" })}\n`);
  writeGzipText(join(root, "assets/textures/index.jsonl.gz"), `${JSON.stringify({ assetId: "nesqlpp:item/i~minecraft~iron_ingot~0", atlasFile: "static-atlas-0.webp" })}\n${JSON.stringify({ assetId: "nesqlpp:item/i~botania~manaResource~4", atlasFile: "animated-atlas-0.webp", frameCount: 8, frameDurationMs: 100 })}\n${JSON.stringify({ assetId: "nesqlpp:item/i~minecraft~gold_ingot~0", atlasFile: "generated-static-atlas-0.webp", rect: { x: 0, y: 0, width: 16, height: 16 } })}\n`);
  writeGzipText(join(root, "assets/animations/index.jsonl.gz"), `${JSON.stringify({ assetId: "nesqlpp:item/i~botania~manaResource~4", frameCount: 8, frameDurationMs: 100 })}\n`);
  writeGzipText(join(root, "assets/animations/native-sprites.jsonl.gz"), `${JSON.stringify({ assetId: "nesqlpp:item/i~botania~manaResource~4", animationMode: "native_sprite", frameCount: 8, frameDurationMs: 100, spriteMetadataFile: "textures/items/terrasteel.png.mcmeta" })}\n`);
  writeGzipText(join(root, "assets/animations/rendered-gifs.jsonl.gz"), "");
  writeGzipText(join(root, "models/entities/index.jsonl.gz"), `${JSON.stringify({ entityId: "minecraft.zombie", mobName: "minecraft.zombie", displayName: "Zombie", modelPath: "entity-models/minecraft/zombie.json", previewImage: "minecraft/zombie.gif" })}\n`);
  writeJson(join(root, "validation/export_report.json"), {
    schemaVersion: "nesqlpp/raw-export/alpha1/report",
    counts: { rawItems: 3, rawFluids: 1, rawRecipes: 1, rawGroups: 1, rawNeiOrderEntries: 3, rawTextures: 3, rawAnimations: 1, rawEntities: 1 },
    validation: { status: "ok", readinessStatus: "ready", gates: [{ name: "core-counts", status: "ready" }] },
  });
  writeFileSync(join(root, "static-atlas-0.webp"), "self-test-static", "utf8");
  writeFileSync(join(root, "animated-atlas-0.webp"), "self-test-animated", "utf8");
  writeFileSync(join(root, "generated-static-atlas-0.webp"), "self-test-generated", "utf8");
  mkdirSync(join(root, "special"), { recursive: true });
  mkdirSync(join(root, "special/gregtech"), { recursive: true });
  writeGzipText(join(root, "special/gregtech/payloads.jsonl.gz"), `${JSON.stringify({ domain: "gregtech", recipeId: "gt-test", machineId: "gregtech.assembler", facts: { duration: 20, voltage: 30, amperage: 1, totalEU: 600, voltageTier: "LV", requiresCleanroom: false, requiresLowGravity: false } })}\n`);
  writeJson(join(root, "special/gregtech/summary.json"), { domain: "gregtech", recipeCount: 1, machineIds: [{ value: "gregtech.assembler", count: 1 }] });
  writeJson(join(root, "special/gregtech/index.json"), { schemaVersion: "nesqlpp/raw-export/alpha1/special-domain", domain: "gregtech", recipeCount: 1, payloadCount: 1, payloads: "special/gregtech/payloads.jsonl.gz", summary: "special/gregtech/summary.json" });
  writeJson(join(root, "special/index.json"), { schemaVersion: "nesqlpp/raw-export/alpha1/special-index", domains: [{ domain: "gregtech", recipeCount: 1, payloadCount: 1, index: "special/gregtech/index.json", payloads: "special/gregtech/payloads.jsonl.gz", summary: "special/gregtech/summary.json" }] });
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
if (selfTest && (report.counts.items !== 3 || report.counts.semanticItems !== 2 || report.counts.itemVariants !== 1 || report.counts.itemPayloads !== 1 || report.counts.itemIdentityMap !== 3 || report.counts.recipes !== 1 || report.counts.animations !== 1 || report.counts.browserAtlasItems !== 3 || report.counts.recipeItemIndexItems !== 3 || report.counts.recipeUiPayloads !== 1 || report.counts.specialDomains !== 1 || report.counts.specialRecipes !== 1 || report.counts.specialPayloads !== 1 || report.counts.specialPayloadMismatches !== 0 || report.counts.specialExpectedFactKeys !== 7 || report.counts.specialExpectedFactKeysMissing !== 0 || report.counts.rawExportCountMismatches !== 0 || report.counts.entities !== 1 || report.coverage.browserAtlasRatio !== 1 || report.coverage.semanticIdentityMapRatio !== 1 || report.missing.browserAtlasFiles !== 0 || report.counts.browserAtlasGeneratedFromResourceIndex !== 1 || report.migrationReadiness?.status !== "ready")) {
  throw new Error("Self-test compiler counts did not match expected values");
}
if (selfTest) {
  const validationText = readFileSync(join(outputDir, "validation", "report.json"), "utf8");
  const portablePathViolation = /[A-Za-z]:[\\/]|\.minecraft[\\/]versions|GT New Horizons|E:[\\/]GTNH|E:[\\/]codex/i.test(validationText);
  if (portablePathViolation) {
    throw new Error("Self-test validation report leaked a machine-specific filesystem path");
  }
  const pathHygiene = readJson(join(outputDir, "validation", "export-path-hygiene.json"));
  if (pathHygiene?.status !== "ok" || report.exportPathHygiene?.status !== "ok") {
    throw new Error("Self-test export path hygiene report did not pass");
  }
}

