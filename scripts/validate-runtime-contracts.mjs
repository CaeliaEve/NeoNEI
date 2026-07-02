import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const gate = args.includes("--gate");

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const distDataDir = resolve(
  readArg("--dist-data")
    ?? process.env.DIST_DATA_V3_DIR
    ?? join(repoRoot, "backend", "public", "dist-data"),
);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function hasString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function fail(failures, code, message, details = {}) {
  failures.push({ code, message, details });
}

function firstArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(value) {
  return Array.from(new Set(firstArray(value).map((entry) => `${entry ?? ""}`.trim()).filter(Boolean)));
}

function stableRatio(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  return Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n / d : 0;
}

function normalizeRuleText(value) {
  return `${value ?? ""}`.trim().toLowerCase();
}

function decodeCatalogItemName(item) {
  const itemId = `${item?.itemId ?? ""}`;
  const parts = itemId.split("~");
  const modId = `${item?.modId ?? parts[1] ?? ""}`.trim();
  const internalName = `${parts[2] ?? item?.internalName ?? ""}`.trim();
  const damage = Number(parts[3] ?? item?.damage ?? 0);
  return {
    modId,
    internalName,
    damage: Number.isFinite(damage) ? damage : 0,
    qualifiedName: normalizeRuleText(modId && internalName ? `${modId}:${internalName}` : itemId),
  };
}

function compileDeterministicHiddenRule(rule) {
  const rawExpression = `${rule?.itemExpression ?? rule?.normalizedItemExpression ?? rule?.raw ?? ""}`
    .split("#")[0]
    .trim();
  if (!rawExpression || /[|]|tag\.|!tag|nbt/i.test(rawExpression)) {
    return null;
  }
  const [target, metaToken] = rawExpression.split(/\s+/).filter(Boolean);
  if (!target) return null;
  if (metaToken?.startsWith("!")) {
    return null;
  }
  const exactDamage = metaToken !== undefined && /^-?\d+$/.test(metaToken)
    ? Number(metaToken)
    : null;

  if (target.startsWith("r/") && target.lastIndexOf("/") > 1) {
    const lastSlash = target.lastIndexOf("/");
    const pattern = target.slice(2, lastSlash);
    const flags = target.slice(lastSlash + 1).replace(/[^dgimsuvy]/g, "");
    try {
      const regex = new RegExp(pattern, flags.includes("i") ? flags : `${flags}i`);
      return { raw: rawExpression, exactDamage, matches: (qualifiedName) => regex.test(qualifiedName) };
    } catch {
      return null;
    }
  }

  const normalizedTarget = normalizeRuleText(target);
  return { raw: rawExpression, exactDamage, matches: (qualifiedName) => qualifiedName === normalizedTarget };
}

function validateHiddenRulesAgainstBrowserCatalog(items) {
  const nativeRulesPath = manifest?.files?.nativeNeiRules;
  if (!hasString(nativeRulesPath) || !existsSync(join(distDataDir, nativeRulesPath))) {
    return { deterministicHiddenRules: 0, hiddenBrowserMatches: 0 };
  }
  const validationReportPath = manifest?.files?.validationReport;
  const compilerReport = hasString(validationReportPath) && existsSync(join(distDataDir, validationReportPath))
    ? readJson(join(distDataDir, validationReportPath))
    : null;
  const browserContractPath = manifest?.files?.neiBrowserContract;
  const browserContract = hasString(browserContractPath) && existsSync(join(distDataDir, browserContractPath))
    ? readJson(join(distDataDir, browserContractPath))
    : compilerReport?.browserContract ?? null;
  const authoritativeBrowserContract = browserContract?.status === "ok"
    && Number(compilerReport?.counts?.authoritativeBrowserContractMatches ?? 0) === 1;
  const nativeRules = readJson(join(distDataDir, nativeRulesPath));
  const deterministicRules = firstArray(nativeRules.hiddenItems)
    .map(compileDeterministicHiddenRule)
    .filter(Boolean);
  const hiddenMatches = [];
  for (const item of items) {
    const decoded = decodeCatalogItemName(item);
    for (const rule of deterministicRules) {
      if (rule.exactDamage !== null && decoded.damage !== rule.exactDamage) {
        continue;
      }
      if (rule.matches(decoded.qualifiedName)) {
        hiddenMatches.push({
          itemId: item.itemId,
          localizedName: item.localizedName,
          qualifiedName: decoded.qualifiedName,
          damage: decoded.damage,
          rule: rule.raw,
        });
        break;
      }
    }
    if (hiddenMatches.length >= 50) {
      break;
    }
  }
  if (hiddenMatches.length > 0 && !authoritativeBrowserContract) {
    fail(failures, "HIDDEN_ITEMS_IN_DEFAULT_BROWSER", "deterministic NEI hidden item rules must not appear in the default browser catalog", {
      samples: hiddenMatches,
    });
  }
  return {
    deterministicHiddenRules: deterministicRules.length,
    hiddenBrowserMatches: hiddenMatches.length,
    authoritativeBrowserContract,
  };
}

const localPathPatterns = [
  { code: "WINDOWS_BACKSLASH_ABSOLUTE_PATH", pattern: /(^|[\s"'`([{:=,])[A-Za-z]:\\[A-Za-z0-9._ -]/ },
  { code: "WINDOWS_SLASH_ABSOLUTE_PATH", pattern: /(^|[\s"'`([{:=,])[A-Za-z]:\/[A-Za-z0-9._ -]/ },
  { code: "MINECRAFT_VERSION_PATH", pattern: /\.minecraft[\\/]versions/i },
  { code: "LOCAL_GTNH_PATH", pattern: /[A-Za-z]:[\\/]GTNH/i },
  { code: "LOCAL_CODEX_PATH", pattern: /[A-Za-z]:[\\/]codex/i },
  { code: "LINUX_MACHINE_ABSOLUTE_PATH", pattern: /(^|[\s"'`([{:=,])\/(?:home|Users|mnt|opt|srv)\// },
];

function toPosix(pathText) {
  return `${pathText ?? ""}`.replace(/\\/g, "/");
}

function isUrlSafeRuntimePath(value) {
  const text = `${value ?? ""}`.trim();
  if (!text) return false;
  if (isAbsolute(text) || /^[A-Za-z]:[\\/]/.test(text)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false;
  if (text.includes("\\") || text.includes("\0")) return false;
  const segments = text.split("/").filter(Boolean);
  return !segments.some((segment) => segment === "." || segment === "..");
}

function validateRuntimePathDeclarations() {
  for (const [key, declaredPath] of Object.entries(manifest?.files ?? {})) {
    if (!isUrlSafeRuntimePath(declaredPath)) {
      fail(failures, "DIST_MANIFEST_PATH_NOT_URL_SAFE", `manifest.files.${key} must be a URL-safe relative path`, {
        path: declaredPath,
      });
    }
  }
}

function* walkRuntimeJsonFiles(rootDir) {
  if (!existsSync(rootDir)) return;
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      yield* walkRuntimeJsonFiles(fullPath);
      continue;
    }
    if (entry.isFile() && [".json", ".jsonl"].includes(extname(entry.name).toLowerCase())) {
      yield fullPath;
    }
  }
}

function inspectPortableArtifactText(rootDir, filePath) {
  const text = readFileSync(filePath, "utf8");
  const rel = toPosix(relative(rootDir, filePath));
  for (const rule of localPathPatterns) {
    if (rule.pattern.test(text)) {
      fail(failures, "RUNTIME_ARTIFACT_LOCAL_PATH_LEAK", `Runtime artifact contains machine-specific path text: ${rel}`, {
        path: rel,
        rule: rule.code,
      });
    }
  }
}

function validatePortableArtifacts() {
  const inspected = {
    distDataDeclaredFiles: 0,
    contractJsonFiles: 0,
  };

  const distDataFiles = new Set([manifestPath]);
  for (const declaredPath of Object.values(manifest?.files ?? {})) {
    if (isUrlSafeRuntimePath(declaredPath)) {
      distDataFiles.add(join(distDataDir, declaredPath));
    }
  }
  for (const filePath of distDataFiles) {
    if (!existsSync(filePath) || ![".json", ".jsonl"].includes(extname(filePath).toLowerCase())) {
      continue;
    }
    inspected.distDataDeclaredFiles += 1;
    inspectPortableArtifactText(distDataDir, filePath);
  }

  for (const filePath of walkRuntimeJsonFiles(contractDir)) {
    inspected.contractJsonFiles += 1;
    inspectPortableArtifactText(contractDir, filePath);
  }

  return inspected;
}

const failures = [];
const warnings = [];
const contractDir = join(repoRoot, "contracts", "runtime");
const requiredContractFiles = [
  "manifest.schema.json",
  "browser.schema.json",
  "search.schema.json",
  "recipe.schema.json",
  "texture.schema.json",
  "error.schema.json",
  "api.schema.json",
];

for (const fileName of requiredContractFiles) {
  const filePath = join(contractDir, fileName);
  if (!existsSync(filePath)) {
    fail(failures, "CONTRACT_SCHEMA_MISSING", `Missing runtime contract schema: ${fileName}`);
    continue;
  }
  try {
    const schema = readJson(filePath);
    if (!hasString(schema.$id) || !hasString(schema.title) || schema.type !== "object") {
      fail(failures, "CONTRACT_SCHEMA_INVALID", `Invalid runtime contract schema header: ${fileName}`);
    }
  } catch (error) {
    fail(failures, "CONTRACT_SCHEMA_PARSE_FAILED", `Cannot parse runtime contract schema: ${fileName}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const manifestPath = join(distDataDir, "manifest.json");
if (!existsSync(manifestPath)) {
  fail(failures, "DIST_MANIFEST_MISSING", `dist-data manifest not found: ${manifestPath}`);
}

let manifest = null;
if (existsSync(manifestPath)) {
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    fail(failures, "DIST_MANIFEST_PARSE_FAILED", "dist-data manifest is not valid JSON", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const requiredManifestFields = ["schemaVersion", "generatedAt", "source", "sourceRepository", "runtime", "files"];
const requiredFiles = [
  "searchAliasIndex",
  "semanticItems",
  "semanticFacets",
  "itemVariants",
  "itemVariantsByPublicItem",
  "itemIdentityMap",
  "browserCatalog",
  "browserGroups",
  "nativeNeiRules",
  "recipeCategories",
  "recipeItemIndex",
  "recipeUiPayloadIndex",
  "textureManifest",
  "animationTable",
  "animationExpectationReport",
  "browserAtlasIndex",
  "validationReport",
  "migrationReadiness",
  "recipeFragmentation",
];

if (manifest) {
  for (const field of requiredManifestFields) {
    if (field === "files") {
      if (!manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files)) {
        fail(failures, "DIST_MANIFEST_FIELD_MISSING", "manifest.files is required");
      }
      continue;
    }
    if (field === "runtime") {
      if (!manifest.runtime || typeof manifest.runtime !== "object" || Array.isArray(manifest.runtime)) {
        fail(failures, "DIST_MANIFEST_FIELD_MISSING", "manifest.runtime is required");
      }
      continue;
    }
    if (!hasString(manifest[field])) {
      fail(failures, "DIST_MANIFEST_FIELD_MISSING", `manifest.${field} is required`);
    }
  }

  for (const runtimeField of [
    "exportGeneratedAt",
    "exporterSchemaVersion",
    "exportHealthStatus",
    "migrationReadinessStatus",
  ]) {
    if (!hasString(manifest.runtime?.[runtimeField])) {
      fail(failures, "DIST_MANIFEST_RUNTIME_FIELD_MISSING", `manifest.runtime.${runtimeField} is required`);
    }
  }

  validateRuntimePathDeclarations();

  for (const fileKey of requiredFiles) {
    const relativePath = manifest.files?.[fileKey];
    if (!hasString(relativePath)) {
      fail(failures, "DIST_MANIFEST_FILE_KEY_MISSING", `manifest.files.${fileKey} is required`);
      continue;
    }
    const absolutePath = join(distDataDir, relativePath);
    if (!existsSync(absolutePath)) {
      fail(failures, "DIST_MANIFEST_FILE_MISSING", `Manifest file target missing: ${fileKey}`, {
        path: relativePath,
      });
    }
  }
}

function validateBrowserCatalog() {
  const relativePath = manifest?.files?.browserCatalog;
  if (!hasString(relativePath)) return null;
  const payload = readJson(join(distDataDir, relativePath));
  if (!hasString(payload.schemaVersion)) {
    fail(failures, "BROWSER_SCHEMA_VERSION_MISSING", "browser catalog schemaVersion is required");
  }
  const items = firstArray(payload.items);
  if (items.length === 0) {
    fail(failures, "BROWSER_ITEMS_EMPTY", "browser catalog must contain items");
  }
  for (const [index, item] of items.slice(0, 200).entries()) {
    for (const field of ["itemId", "localizedName", "modId", "renderAssetRef"]) {
      if (!hasString(item?.[field])) {
        fail(failures, "BROWSER_ITEM_FIELD_MISSING", `browser item missing ${field}`, { index });
      }
    }
    if (typeof item?.browserOrder !== "number") {
      fail(failures, "BROWSER_ITEM_ORDER_INVALID", "browser item browserOrder must be numeric", { index });
    }
  }
  return {
    itemCount: items.length,
    hiddenRules: validateHiddenRulesAgainstBrowserCatalog(items),
  };
}

function validateSearchPack() {
  const binaryRelativePath = manifest?.files?.rustSearchBin;
  const relativePath = manifest?.files?.rustSearchPack;
  const aliasRelativePath = manifest?.files?.searchAliasIndex;
  const result = {};
  if (hasString(binaryRelativePath)) {
    result.source = "rustSearchBin";
    result.path = binaryRelativePath;
    return result;
  }
  if (!hasString(relativePath)) return null;
  const payload = readJson(join(distDataDir, relativePath));
  if (!hasString(payload.schemaVersion)) {
    fail(failures, "SEARCH_SCHEMA_VERSION_MISSING", "search pack schemaVersion is required");
  }
  const items = firstArray(payload.items);
  if (items.length === 0) {
    fail(failures, "SEARCH_ITEMS_EMPTY", "search pack must contain items");
  }
  for (const [index, item] of items.slice(0, 200).entries()) {
    if (!hasString(item?.itemId)) {
      fail(failures, "SEARCH_ITEM_ID_MISSING", "search item itemId is required", { index });
    }
  }
  result.itemCount = items.length;
  if (hasString(aliasRelativePath)) {
    const aliasPayload = readJson(join(distDataDir, aliasRelativePath));
    if (!hasString(aliasPayload.schemaVersion)) {
      fail(failures, "SEARCH_ALIAS_SCHEMA_VERSION_MISSING", "search alias index schemaVersion is required");
    }
    const terms = firstArray(aliasPayload.terms);
    result.aliasTerms = terms.length;
    if (items.length > 0 && terms.length === 0) {
      fail(failures, "SEARCH_ALIAS_INDEX_EMPTY", "search alias index must contain terms when search pack has items");
    }
  }
  return result;
}

function validateTexturePayloads() {
  const textureManifestPath = manifest?.files?.textureManifest;
  const browserAtlasPath = manifest?.files?.browserAtlasIndex;
  const animationTablePath = manifest?.files?.animationTable;
  const animationExpectationPath = manifest?.files?.animationExpectationReport;
  const result = {};
  if (hasString(textureManifestPath)) {
    const payload = readJson(join(distDataDir, textureManifestPath));
    if (!hasString(payload.schemaVersion)) {
      fail(failures, "TEXTURE_MANIFEST_SCHEMA_VERSION_MISSING", "texture manifest schemaVersion is required");
    }
    result.textureAtlasCount = firstArray(payload.atlases).length;
  }
  if (hasString(browserAtlasPath)) {
    const payload = readJson(join(distDataDir, browserAtlasPath));
    if (!hasString(payload.schemaVersion)) {
      fail(failures, "BROWSER_ATLAS_SCHEMA_VERSION_MISSING", "browser atlas schemaVersion is required");
    }
    const items = firstArray(payload.items);
    if (items.length === 0) {
      fail(failures, "BROWSER_ATLAS_EMPTY", "browser atlas index must contain item entries");
    }
    result.browserAtlasItems = items.length;
  }
  if (hasString(animationTablePath)) {
    const payload = readJson(join(distDataDir, animationTablePath));
    if (!hasString(payload.schemaVersion)) {
      fail(failures, "ANIMATION_TABLE_SCHEMA_VERSION_MISSING", "animation table schemaVersion is required");
    }
    result.animationEntries = firstArray(payload.items ?? payload.entries).length;
  }
  if (hasString(animationExpectationPath)) {
    const payload = readJson(join(distDataDir, animationExpectationPath));
    if (!hasString(payload.schemaVersion)) {
      fail(failures, "ANIMATION_EXPECTATION_SCHEMA_VERSION_MISSING", "animation expectation report schemaVersion is required");
    }
    result.expectedAnimatedItems = payload.counts?.expectedAnimatedItems ?? 0;
    result.staticWhenExpectedAnimated = payload.counts?.staticWhenExpectedAnimated ?? 0;
  }
  return result;
}

function validateRecipePayloads() {
  const result = {};
  for (const [key, code] of [
    ["recipeCategories", "RECIPE_CATEGORIES_SCHEMA_VERSION_MISSING"],
    ["recipeItemIndex", "RECIPE_ITEM_INDEX_SCHEMA_VERSION_MISSING"],
    ["recipeUiPayloadIndex", "RECIPE_UI_PAYLOAD_INDEX_SCHEMA_VERSION_MISSING"],
  ]) {
    const relativePath = manifest?.files?.[key];
    if (!hasString(relativePath)) continue;
    const payload = readJson(join(distDataDir, relativePath));
    if (!hasString(payload.schemaVersion)) {
      fail(failures, code, `${key} schemaVersion is required`);
    }
    result[key] = true;
  }
  return result;
}

function validateSemanticRuntimePacks() {
  const result = {};
  const reportPath = manifest?.files?.validationReport;
  const readinessPath = manifest?.files?.migrationReadiness;
  const browserContractPath = manifest?.files?.neiBrowserContract;
  const recipeFragmentationPath = manifest?.files?.recipeFragmentation;
  const compilerReport = hasString(reportPath) && existsSync(join(distDataDir, reportPath))
    ? readJson(join(distDataDir, reportPath))
    : null;
  const migrationReadiness = hasString(readinessPath) && existsSync(join(distDataDir, readinessPath))
    ? readJson(join(distDataDir, readinessPath))
    : compilerReport?.migrationReadiness ?? null;
  const browserContract = hasString(browserContractPath) && existsSync(join(distDataDir, browserContractPath))
    ? readJson(join(distDataDir, browserContractPath))
    : compilerReport?.browserContract ?? null;
  const recipeFragmentation = hasString(recipeFragmentationPath) && existsSync(join(distDataDir, recipeFragmentationPath))
    ? readJson(join(distDataDir, recipeFragmentationPath))
    : compilerReport?.recipeFragmentationReport ?? null;
  const counts = compilerReport?.counts ?? {};

  const semanticItemsPath = manifest?.files?.semanticItems;
  const semanticFacetsPath = manifest?.files?.semanticFacets;
  const itemVariantsPath = manifest?.files?.itemVariants;
  const variantsByPublicPath = manifest?.files?.itemVariantsByPublicItem;
  const identityMapPath = manifest?.files?.itemIdentityMap;
  const nativeRulesPath = manifest?.files?.nativeNeiRules;
  const browserGroupsPath = manifest?.files?.browserGroups;

  const semanticItems = hasString(semanticItemsPath) ? firstArray(readJson(join(distDataDir, semanticItemsPath)).items) : [];
  const semanticFacets = hasString(semanticFacetsPath) ? firstArray(readJson(join(distDataDir, semanticFacetsPath)).facets) : [];
  const itemVariantsPayload = hasString(itemVariantsPath) ? readJson(join(distDataDir, itemVariantsPath)) : {};
  const itemVariants = firstArray(itemVariantsPayload.variants ?? itemVariantsPayload.items);
  const variantsByPublicItem = hasString(variantsByPublicPath) ? firstArray(readJson(join(distDataDir, variantsByPublicPath)).items) : [];
  const identityMap = hasString(identityMapPath) ? firstArray(readJson(join(distDataDir, identityMapPath)).items) : [];
  const nativeRules = hasString(nativeRulesPath) ? readJson(join(distDataDir, nativeRulesPath)) : {};
  const browserGroups = hasString(browserGroupsPath) ? firstArray(readJson(join(distDataDir, browserGroupsPath)).groups) : [];

  result.semanticItems = semanticItems.length;
  result.semanticFacets = semanticFacets.length;
  result.itemVariants = itemVariants.length;
  result.variantsByPublicItem = variantsByPublicItem.length;
  result.identityMapRows = identityMap.length;
  result.nativeGuidFilterRules = firstArray(nativeRules.guidFilters).length;
  result.nativeHiddenItemRules = firstArray(nativeRules.hiddenItems).length;
  result.browserGroups = browserGroups.length;
  result.migrationReadinessStatus = migrationReadiness?.status ?? null;
  result.neiBrowserContractStatus = browserContract?.status ?? null;
  result.recipeFragmentationStatus = recipeFragmentation?.status ?? null;
  result.semanticTaggedItems = counts.semanticTaggedItems ?? counts.semanticTotalItems ?? null;
  result.semanticClassifiedTaggedItems = counts.semanticClassifiedTaggedItems ?? null;
  result.semanticCoverageRatio = typeof result.semanticTaggedItems === "number" && result.semanticTaggedItems > 0
    ? Number((stableRatio(result.semanticClassifiedTaggedItems, result.semanticTaggedItems)).toFixed(4))
    : null;
  result.semanticAnimationTimingMissing = counts.semanticAnimationTimingMissing ?? 0;

  if (!compilerReport) {
    fail(failures, "VALIDATION_REPORT_MISSING", "runtime validation report is required");
  }
  if (!migrationReadiness) {
    fail(failures, "MIGRATION_READINESS_MISSING", "migration readiness report is required");
  } else if (migrationReadiness.status !== "ready") {
    fail(failures, "MIGRATION_READINESS_BLOCKED", "migration readiness must be ready before runtime release", {
      status: migrationReadiness.status,
      blockedGates: migrationReadiness.blockedGates ?? [],
    });
  }
  if (!browserContract) {
    fail(failures, "NEI_BROWSER_CONTRACT_MISSING", "NEI browser contract report is required");
  } else if (browserContract.status !== "ok") {
    fail(failures, "NEI_BROWSER_CONTRACT_NOT_OK", "NEI browser contract must be ok before runtime release", {
      status: browserContract.status,
      summary: browserContract.summary ?? null,
    });
  }
  if (!recipeFragmentation) {
    fail(failures, "RECIPE_FRAGMENTATION_REPORT_MISSING", "recipe fragmentation report is required");
  } else {
    const trueDisplaySplits = firstArray(recipeFragmentation?.samples?.suspiciousDisplaySplits)
      .map((entry) => ({ ...entry, categoryIds: uniqueStrings(entry?.categoryIds) }))
      .filter((entry) => entry.categoryIds.length > 1);
    const trueHandlerSplits = firstArray(recipeFragmentation?.samples?.suspiciousHandlerSplits)
      .map((entry) => ({
        ...entry,
        categoryIds: uniqueStrings(entry?.categoryIds),
        displayNames: uniqueStrings(entry?.displayNames),
      }))
      .filter((entry) => entry.categoryIds.length > 1 || entry.displayNames.length > 1);
    result.recipeFragmentationTrueDisplaySplits = trueDisplaySplits.length;
    result.recipeFragmentationTrueHandlerSplits = trueHandlerSplits.length;
    if (trueDisplaySplits.length > 0 || trueHandlerSplits.length > 0) {
      fail(failures, "RECIPE_CATEGORY_FRAGMENTATION", "recipe handlers must not fragment into multiple frontend categories", {
        trueDisplaySplits: trueDisplaySplits.slice(0, 25),
        trueHandlerSplits: trueHandlerSplits.slice(0, 25),
      });
    }
  }

  for (const [key, actual] of [
    ["semanticItems", semanticItems.length],
    ["semanticFacets", semanticFacets.length],
    ["itemVariants", itemVariants.length],
    ["itemIdentityMap", identityMap.length],
    ["variantsByPublicItem", variantsByPublicItem.length],
    ["neiGuidFilterRules", result.nativeGuidFilterRules],
    ["neiHiddenItemRules", result.nativeHiddenItemRules],
  ]) {
    const expected = counts[key];
    if (typeof expected === "number" && expected !== actual) {
      fail(failures, "SEMANTIC_RUNTIME_COUNT_MISMATCH", `semantic runtime count mismatch: ${key}`, {
        key,
        expected,
        actual,
      });
    }
  }

  if (semanticItems.length === 0 || identityMap.length === 0) {
    fail(failures, "SEMANTIC_RUNTIME_PACK_EMPTY", "semantic runtime packs must not be empty");
  }
  if (itemVariants.length > 0 && semanticFacets.length === 0) {
    fail(failures, "SEMANTIC_FACETS_EMPTY", "variant rows exist but semantic facets are empty");
  }
  if (typeof result.semanticCoverageRatio === "number" && result.semanticCoverageRatio < 0.8) {
    fail(failures, "SEMANTIC_CLASSIFICATION_COVERAGE_REGRESSED", "classified tagged semantic coverage must stay above the current GTNH baseline", {
      classifiedTaggedItems: result.semanticClassifiedTaggedItems,
      taggedItems: result.semanticTaggedItems,
      coverageRatio: result.semanticCoverageRatio,
      minimumRatio: 0.8,
    });
  }
  if (result.semanticAnimationTimingMissing > 0) {
    fail(failures, "SEMANTIC_ANIMATION_TIMING_MISSING", "animated semantic representatives and variants must preserve animation timing", {
      missing: result.semanticAnimationTimingMissing,
    });
  }

  const assignedMembers = new Map();
  const duplicateAssignments = [];
  for (const group of browserGroups) {
    const groupKey = `${group?.groupKey ?? ""}`;
    const uniqueMembers = new Set(firstArray(group?.memberItemIds).filter(Boolean));
    if (typeof group?.groupSize === "number" && group.groupSize !== uniqueMembers.size) {
      fail(failures, "BROWSER_GROUP_SIZE_MISMATCH", "browser group size must match unique member count", {
        groupKey,
        groupSize: group.groupSize,
        uniqueMembers: uniqueMembers.size,
      });
    }
    for (const itemId of uniqueMembers) {
      const previous = assignedMembers.get(itemId);
      if (previous) {
        if (duplicateAssignments.length < 50) {
          duplicateAssignments.push({ itemId, firstGroupKey: previous, secondGroupKey: groupKey });
        }
      } else {
        assignedMembers.set(itemId, groupKey);
      }
    }
  }
  result.groupedUniqueMembers = assignedMembers.size;
  result.duplicateFinalMemberAssignments = duplicateAssignments.length;
  if (duplicateAssignments.length > 0) {
    fail(failures, "BROWSER_DUPLICATE_FINAL_GROUP_ASSIGNMENT", "browser items must not be assigned to multiple final groups", {
      samples: duplicateAssignments,
    });
  }

  return result;
}

const checked = {};
if (manifest && failures.length === 0) {
  try {
    checked.browser = validateBrowserCatalog();
    checked.search = validateSearchPack();
    checked.semantic = validateSemanticRuntimePacks();
    checked.textures = validateTexturePayloads();
    checked.recipes = validateRecipePayloads();
    checked.portability = validatePortableArtifacts();
  } catch (error) {
    fail(failures, "DIST_PAYLOAD_VALIDATE_FAILED", "Runtime payload validation threw", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const report = {
  schemaVersion: "neonei/runtime-contract-validation-report/v1",
  generatedAt: new Date().toISOString(),
  distDataDir,
  sourceRepository: manifest?.sourceRepository ?? null,
  source: manifest?.source ?? null,
  checked,
  failures,
  warnings,
};

const outputDir = join(repoRoot, ".runtime-logs");
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "runtime-contract-validation-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

if (gate && failures.length > 0) {
  process.exit(1);
}
