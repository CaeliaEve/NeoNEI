import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseNativeBrowserBin,
  parseNativeGroupsBin,
  parseNativeSearchBin,
  parseNativeTexturesBin,
} from "./native-runtime-pack-reader.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const gate = args.includes("--gate");
const strictAnimation = args.includes("--strict-animation") || process.env.REQUIRE_KNOWN_ANIMATION === "1";
const strictSemanticGroups = args.includes("--strict-semantic-groups") || process.env.REQUIRE_NATIVE_GROUP_SOURCES === "1";
const strictCatalogTextures = args.includes("--strict-catalog-textures") || process.env.REQUIRE_FULL_BROWSER_TEXTURE_COVERAGE === "1";
const distDataDir = resolve(readArg("--dist-data") ?? process.env.DIST_DATA_V3_DIR ?? join(repoRoot, "backend", "public", "dist-data"));
const reportDir = join(repoRoot, ".runtime-logs");
const reportPath = join(reportDir, "known-runtime-items.json");

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readJson(relativePath, required = true) {
  const filePath = join(distDataDir, relativePath);
  if (!existsSync(filePath)) {
    if (!required) return null;
    throw new Error(`Missing dist-data file: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function text(value) { return `${value ?? ""}`.trim(); }
function normalize(value) { return text(value).toLowerCase().replace(/\s+/g, ""); }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function hasDrawable(entry) { return Boolean(entry?.staticAtlas?.atlasFile || entry?.animatedAtlas?.atlasFile); }
function isLocalizedName(entry) {
  const name = text(entry?.localizedName);
  if (!name) return false;
  if (name === text(entry?.itemId)) return false;
  if (/^i~[^~]+~[^~]+~/i.test(name)) return false;
  return true;
}
function matchesQuery(entry, query) {
  const needle = normalize(query);
  if (!needle) return false;
  const directFields = [
    entry?.localizedName,
    entry?.normalizedLocalizedName,
    entry?.normalizedInternalName,
    entry?.normalizedItemId,
    entry?.itemId,
    entry?.publicItemId,
    entry?.modId,
    entry?.family,
    entry?.groupKey,
  ].map(normalize).filter(Boolean);
  return directFields.some((field) => field.includes(needle))
    || normalize(entry?.pinyinFull).startsWith(needle)
    || normalize(entry?.pinyinAcronym).startsWith(needle)
    || normalize(entry?.normalizedSearchTerms).includes(needle)
    || normalize(entry?.aliases).includes(needle);
}
function sample(entries, limit = 20) { return entries.slice(0, limit).map((entry) => JSON.parse(JSON.stringify(entry))); }

const manifest = readJson("rust/runtime-manifest.json");
const entrypoints = manifest.entrypoints ?? {};
const packLoadFailures = [];
function requireNativePack(name, pack, member, expectedPath) {
  if (Array.isArray(pack?.[member]) && pack[member].length > 0) return pack;
  packLoadFailures.push({
    message: `native runtime pack is missing or empty: ${name}`,
    details: { name, path: expectedPath },
  });
  return member === "groups" ? { groups: [] } : { items: [] };
}
const browserPath = entrypoints.browser ?? "rust/browser.bin";
const groupsPath = entrypoints.groups ?? "rust/groups.bin";
const searchPath = entrypoints.search ?? "rust/search.bin";
const texturesPath = entrypoints.textures ?? "rust/textures.bin";
const browserPack = requireNativePack("browser", parseNativeBrowserBin(distDataDir, browserPath, { optional: true }), "items", browserPath);
const groupsPack = requireNativePack("groups", parseNativeGroupsBin(distDataDir, groupsPath, { optional: true }), "groups", groupsPath);
const searchPack = requireNativePack("search", parseNativeSearchBin(distDataDir, searchPath, { optional: true }), "items", searchPath);
const texturesPack = requireNativePack("textures", parseNativeTexturesBin(distDataDir, texturesPath, { optional: true }), "items", texturesPath);
const missingTextureReport = readJson("rust/missing-texture-report.json", false);
const semanticReport = readJson("rust/semantic-validation-report.json", false);
const handlerReport = readJson("rust/recipe-handler-metadata-report.json", false);
const fragmentationReport = readJson("rust/recipe-fragmentation-report.json", false);

const browserItems = Array.isArray(browserPack.items) ? browserPack.items : [];
const searchItems = Array.isArray(searchPack.items) ? searchPack.items : [];
const textureByItemId = new Map((texturesPack.items ?? []).filter((entry) => text(entry?.itemId)).map((entry) => [entry.itemId, entry]));
const groups = Array.isArray(groupsPack.groups) ? groupsPack.groups : [];

const failures = [...packLoadFailures];
const warnings = [];
const checks = {};
function addFailure(message, details = {}) { failures.push({ message, details }); }
function addWarning(message, details = {}) { warnings.push({ message, details }); }

function checkSearchDrawable(spec) {
  const hits = searchItems.filter((entry) => matchesQuery(entry, spec.query)).slice(0, spec.sampleLimit ?? 25);
  const missingAtlas = hits.filter((entry) => !hasDrawable(textureByItemId.get(entry.itemId))).map((entry) => ({ itemId: entry.itemId, localizedName: entry.localizedName }));
  const missingName = hits.filter((entry) => !isLocalizedName(entry)).map((entry) => ({ itemId: entry.itemId, localizedName: entry.localizedName }));
  checks[`search:${spec.name}`] = { query: spec.query, hitCount: hits.length, minHits: spec.minHits, sample: sample(hits.map((entry) => ({ itemId: entry.itemId, localizedName: entry.localizedName })), 8), missingAtlas: sample(missingAtlas), missingName: sample(missingName) };
  if (hits.length < spec.minHits) addFailure(`known search '${spec.name}' returned too few hits`, { query: spec.query, hitCount: hits.length, minHits: spec.minHits });
  if (missingAtlas.length > 0) addFailure(`known search '${spec.name}' has visible entries without atlas drawable`, { query: spec.query, missingAtlas: sample(missingAtlas) });
  if (missingName.length > 0) {
    const issue = { query: spec.query, missingName: sample(missingName) };
    if (spec.strictNames) addFailure(`known search '${spec.name}' has non-localized item names`, issue);
    else addWarning(`known search '${spec.name}' has non-localized item names`, issue);
  }
}

function checkGroup(spec) {
  const matched = groups.filter((group) => {
    const key = normalize(group?.groupKey);
    const label = normalize(group?.groupLabel);
    return spec.includes.every((needle) => key.includes(normalize(needle)) || label.includes(normalize(needle)));
  }).sort((left, right) => number(right.groupSize, 0) - number(left.groupSize, 0));
  const best = matched[0] ?? null;
  checks[`group:${spec.name}`] = { matchCount: matched.length, best: best ? { groupKey: best.groupKey, groupLabel: best.groupLabel, groupSize: best.groupSize, groupSource: best.groupSource, representativeItemId: best.representativeItemId } : null, minSize: spec.minSize, requiresSemanticSource: spec.requiresSemanticSource };
  if (!best) {
    const issue = { includes: spec.includes };
    if (spec.warnOnly) addWarning(`known browser group '${spec.name}' is missing`, issue); else addFailure(`known browser group '${spec.name}' is missing`, issue);
    return;
  }
  if (number(best.groupSize, 0) < spec.minSize) addFailure(`known browser group '${spec.name}' is too small`, { groupKey: best.groupKey, groupSize: best.groupSize, minSize: spec.minSize });
  if (spec.requiresSemanticSource && !text(best.groupKey).startsWith("semantic:")) {
    const issue = { groupKey: best.groupKey, groupSource: best.groupSource, expected: "semantic:* group key" };
    if (strictSemanticGroups) addFailure(`known browser group '${spec.name}' is still not exported from semantic identity`, issue); else addWarning(`known browser group '${spec.name}' is still not exported from semantic identity`, issue);
  }
  if (!hasDrawable(textureByItemId.get(best.representativeItemId))) addFailure(`known browser group '${spec.name}' representative has no atlas drawable`, { groupKey: best.groupKey, representativeItemId: best.representativeItemId });
}

function checkReportHealth() {
  checks["runtime:manifest"] = {
    runtimeId: manifest.runtimeId ?? null,
    capabilities: manifest.capabilities ?? [],
    packFiles: Object.keys(entrypoints).length,
    files: Array.isArray(manifest.files) ? manifest.files.length : 0,
  };
  for (const capability of ["atlas.static", "atlas.animated", "groups.collapse", "recipes.lookup", "search.zh-cn", "strings.zh-cn"]) {
    if (!(manifest.capabilities ?? []).includes(capability)) addFailure("native runtime manifest is missing required capability", { capability });
  }
  checks["textures:report"] = missingTextureReport?.counts ?? null;
  if (number(missingTextureReport?.counts?.actionableIssues, 0) > 0) addFailure("native texture report has actionable issues", missingTextureReport?.counts ?? {});
  if (number(missingTextureReport?.counts?.missingAtlasAssetFiles, 0) > 0) addFailure("native texture report has missing atlas assets", missingTextureReport?.counts ?? {});
  checks["semantic:report"] = semanticReport?.counts ?? null;
  const blocking = semanticReport?.blocking ?? {};
  if (number(blocking.missingRepresentativeCount, 0) > 0 || number(blocking.representativeMismatchCount, 0) > 0) addFailure("native semantic report has blocking representative issues", blocking);
  checks["recipes:fragmentation"] = fragmentationReport?.counts ?? null;
  if (fragmentationReport?.status && fragmentationReport.status !== "ok") addFailure("recipe fragmentation report is not ok", { status: fragmentationReport.status });
  if (number(fragmentationReport?.counts?.trueHandlerSplits, 0) > 0 || number(fragmentationReport?.counts?.trueDisplaySplits, 0) > 0) addFailure("recipe handlers are fragmented", fragmentationReport?.counts ?? {});
  checks["recipes:handlerMetadata"] = handlerReport?.counts ?? null;
  if (number(handlerReport?.counts?.missingLayout, 0) > 0 || number(handlerReport?.counts?.layoutWithoutSlots, 0) > 0) addFailure("recipe handler metadata has missing native layouts", handlerReport?.counts ?? {});
  if (number(handlerReport?.counts?.gtMachineIconMismatches, 0) > 0) addWarning("GT large-machine icon rules still have mismatches in current export", handlerReport?.counts ?? {});
}

function checkAnimationExpectations() {
  const animated = texturesPack.items.filter((entry) => entry.animatedAtlas?.atlasFile);
  checks["animation:nativeTextures"] = { animatedAtlasItems: animated.length, samples: sample(animated.map((entry) => ({ itemId: entry.itemId, atlasFile: entry.animatedAtlas.atlasFile, frameCount: entry.animatedAtlas.frameCount })), 12) };
  if (strictAnimation && animated.length <= 0) addFailure("native runtime has no animated texture entries");
}

function checkCatalogDrawable() {
  const browserMissingAtlas = browserItems.filter((entry) => !hasDrawable(textureByItemId.get(entry.itemId))).slice(0, 32);
  checks["browser:catalog"] = { browserItems: browserItems.length, searchItems: searchItems.length, textureItems: textureByItemId.size, groups: groups.length, sampledMissingAtlas: sample(browserMissingAtlas.map((entry) => ({ itemId: entry.itemId, localizedName: entry.localizedName }))) };
  if (browserItems.length <= 0 || searchItems.length <= 0 || textureByItemId.size <= 0) addFailure("native runtime packs are empty", checks["browser:catalog"]);
  if (browserMissingAtlas.length > 0) {
    const issue = { missingAtlas: checks["browser:catalog"].sampledMissingAtlas };
    if (strictCatalogTextures) addFailure("browser catalog has visible entries without native texture atlas", issue);
    else addWarning("browser catalog has visible entries without native texture atlas; current export data needs NESQL texture coverage follow-up", issue);
  }
}

[
  { name: "NASA workbench and schematics", query: "nasa", minHits: 5 },
  { name: "rockets", query: "rocket", minHits: 8 },
  { name: "Avaritia singularities", query: "singularity", minHits: 10 },
  { name: "Thaumcraft wands", query: "wand", minHits: 10 },
  { name: "fluids", query: "fluid", minHits: 10 },
].forEach(checkSearchDrawable);

[
  { name: "BuildCraft facades", includes: ["facade"], minSize: 1000, requiresSemanticSource: true, warnOnly: true },
  { name: "Thaumcraft casting wands", includes: ["wand"], minSize: 100, requiresSemanticSource: true, warnOnly: true },
  { name: "Avaritia singularity family", includes: ["singularity"], minSize: 10, requiresSemanticSource: true, warnOnly: true },
].forEach(checkGroup);

checkReportHealth();
checkAnimationExpectations();
checkCatalogDrawable();

const report = {
  schemaVersion: "neonei/known-runtime-items/current",
  generatedAt: new Date().toISOString(),
  distDataDir,
  source: "native-runtime-binary-packs",
  strict: { animation: strictAnimation, semanticGroups: strictSemanticGroups, catalogTextures: strictCatalogTextures },
  counts: { browserItems: browserItems.length, searchItems: searchItems.length, textureItems: textureByItemId.size, browserGroups: groups.length },
  checks,
  failures,
  warnings,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${reportPath}`);
if (gate && failures.length > 0) process.exit(1);
