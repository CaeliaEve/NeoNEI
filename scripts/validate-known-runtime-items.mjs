import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function readRuntimeBin(relativePath) {
  const filePath = join(distDataDir, relativePath);
  if (!existsSync(filePath)) throw new Error(`Missing native runtime pack: ${filePath}`);
  const bytes = readFileSync(filePath);
  if (bytes.subarray(0, 8).toString("utf8") !== "NNEIBIN\0") {
    throw new Error(`Invalid native runtime binary magic: ${filePath}`);
  }
  const schemaLength = bytes.readUInt32LE(12);
  const payloadLength = Number(bytes.readBigUInt64LE(16));
  const payloadOffset = 24 + schemaLength;
  return bytes.subarray(payloadOffset, payloadOffset + payloadLength);
}

function readCompactString(bytes, baseOffset, relativeOffset) {
  if (relativeOffset <= 0 && bytes[baseOffset] === 0) return "";
  let end = baseOffset + relativeOffset;
  while (end < bytes.length && bytes[end] !== 0) end += 1;
  return bytes.subarray(baseOffset + relativeOffset, end).toString("utf8");
}

function parseCompactStrings(bytes, offset, stringCount) {
  const offsets = [];
  for (let index = 0; index < stringCount; index += 1) offsets.push(bytes.readUInt32LE(offset + index * 4));
  return { offsets };
}

function parseBrowserBin(relativePath) {
  const bytes = readRuntimeBin(relativePath);
  if (bytes.subarray(0, 8).toString("utf8") !== "NEIBRW1\0") throw new Error(`Invalid browser.bin payload: ${relativePath}`);
  const rowCount = bytes.readUInt32LE(12);
  const stringCount = bytes.readUInt32LE(16);
  const rowStride = bytes.readUInt32LE(20);
  const { offsets } = parseCompactStrings(bytes, 24, stringCount);
  const rowOffset = 24 + stringCount * 4;
  const stringsDataBase = rowOffset + rowCount * rowStride * 4;
  const stringAt = (ref) => readCompactString(bytes, stringsDataBase, offsets[ref] ?? 0);
  const items = [];
  for (let row = 0; row < rowCount; row += 1) {
    const base = rowOffset + row * rowStride * 4;
    items.push({
      itemId: stringAt(bytes.readUInt32LE(base)),
      localizedName: stringAt(bytes.readUInt32LE(base + 4)),
      modId: stringAt(bytes.readUInt32LE(base + 8)),
      groupKey: stringAt(bytes.readUInt32LE(base + 12)),
      browserOrder: bytes.readUInt32LE(base + 16),
      flags: bytes.readUInt32LE(base + 20),
    });
  }
  return { items };
}

function parseGroupsBin(relativePath) {
  const bytes = readRuntimeBin(relativePath);
  if (bytes.subarray(0, 8).toString("utf8") !== "NEIGRP1\0") throw new Error(`Invalid groups.bin payload: ${relativePath}`);
  const rowCount = bytes.readUInt32LE(12);
  const stringCount = bytes.readUInt32LE(16);
  const memberCount = bytes.readUInt32LE(20);
  const rowStride = bytes.readUInt32LE(24);
  const { offsets } = parseCompactStrings(bytes, 28, stringCount);
  const rowOffset = 28 + stringCount * 4;
  const memberOffset = rowOffset + rowCount * rowStride * 4;
  const stringsDataBase = memberOffset + memberCount * 4;
  const stringAt = (ref) => readCompactString(bytes, stringsDataBase, offsets[ref] ?? 0);
  const groups = [];
  for (let row = 0; row < rowCount; row += 1) {
    const base = rowOffset + row * rowStride * 4;
    groups.push({
      groupKey: stringAt(bytes.readUInt32LE(base)),
      groupLabel: stringAt(bytes.readUInt32LE(base + 4)),
      representativeItemId: stringAt(bytes.readUInt32LE(base + 8)),
      groupSize: bytes.readUInt32LE(base + 20),
      groupSource: "native/groups.bin",
    });
  }
  return { groups };
}

function parseSearchBin(relativePath) {
  const bytes = readRuntimeBin(relativePath);
  if (bytes.subarray(0, 8).toString("utf8") !== "NEISRC2\0") throw new Error(`Invalid search.bin payload: ${relativePath}`);
  const rowCount = bytes.readUInt32LE(12);
  const stringCount = bytes.readUInt32LE(16);
  const rowStride = bytes.readUInt32LE(20);
  const { offsets } = parseCompactStrings(bytes, 24, stringCount);
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
      normalizedLocalizedName: stringAt(bytes.readUInt32LE(base + 16)),
      normalizedInternalName: stringAt(bytes.readUInt32LE(base + 20)),
      normalizedItemId: stringAt(bytes.readUInt32LE(base + 24)),
      normalizedSearchTerms: stringAt(bytes.readUInt32LE(base + 28)),
      pinyinFull: stringAt(bytes.readUInt32LE(base + 32)),
      pinyinAcronym: stringAt(bytes.readUInt32LE(base + 36)),
      browserIndex: bytes.readUInt32LE(base + 48),
    });
  }
  return { items };
}

function parseTexturesBin(relativePath) {
  const bytes = readRuntimeBin(relativePath);
  if (bytes.subarray(0, 8).toString("utf8") !== "NEITEX1\0") throw new Error(`Invalid textures.bin payload: ${relativePath}`);
  const rowCount = bytes.readUInt32LE(12);
  const stringCount = bytes.readUInt32LE(16);
  const frameCount = bytes.readUInt32LE(20);
  const rowStride = bytes.readUInt32LE(24);
  const frameStride = bytes.readUInt32LE(28);
  const { offsets } = parseCompactStrings(bytes, 32, stringCount);
  const rowOffset = 32 + stringCount * 4;
  const frameOffset = rowOffset + rowCount * rowStride * 4;
  const stringsDataBase = frameOffset + frameCount * frameStride * 4;
  const stringAt = (ref) => readCompactString(bytes, stringsDataBase, offsets[ref] ?? 0);
  const items = [];
  for (let row = 0; row < rowCount; row += 1) {
    const base = rowOffset + row * rowStride * 4;
    const staticAtlasFile = stringAt(bytes.readUInt32LE(base + 4));
    const animatedAtlasFile = stringAt(bytes.readUInt32LE(base + 24));
    items.push({
      itemId: stringAt(bytes.readUInt32LE(base)),
      staticAtlas: staticAtlasFile ? { atlasFile: staticAtlasFile } : null,
      animatedAtlas: animatedAtlasFile ? { atlasFile: animatedAtlasFile, frameCount: bytes.readUInt32LE(base + 32) } : null,
    });
  }
  return { items };
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
function fields(entry) {
  return [
    entry?.localizedName,
    entry?.normalizedLocalizedName,
    entry?.pinyinFull,
    entry?.pinyinAcronym,
    entry?.normalizedInternalName,
    entry?.normalizedItemId,
    entry?.normalizedSearchTerms,
    entry?.itemId,
    entry?.publicItemId,
    entry?.modId,
  ].map(normalize).filter(Boolean);
}
function matchesQuery(entry, query) {
  const needle = normalize(query);
  return fields(entry).some((field) => field.includes(needle));
}
function sample(entries, limit = 20) { return entries.slice(0, limit).map((entry) => JSON.parse(JSON.stringify(entry))); }

const manifest = readJson("rust/runtime-manifest.json");
const entrypoints = manifest.entrypoints ?? {};
const browserPack = parseBrowserBin(entrypoints.browser ?? "rust/browser.bin");
const groupsPack = parseGroupsBin(entrypoints.groups ?? "rust/groups.bin");
const searchPack = parseSearchBin(entrypoints.search ?? "rust/search.bin");
const texturesPack = parseTexturesBin(entrypoints.textures ?? "rust/textures.bin");
const missingTextureReport = readJson("rust/missing-texture-report.json", false);
const semanticReport = readJson("rust/semantic-validation-report.json", false);
const handlerReport = readJson("rust/recipe-handler-metadata-report.json", false);
const fragmentationReport = readJson("rust/recipe-fragmentation-report.json", false);

const browserItems = Array.isArray(browserPack.items) ? browserPack.items : [];
const searchItems = Array.isArray(searchPack.items) ? searchPack.items : [];
const textureByItemId = new Map((texturesPack.items ?? []).filter((entry) => text(entry?.itemId)).map((entry) => [entry.itemId, entry]));
const groups = Array.isArray(groupsPack.groups) ? groupsPack.groups : [];

const failures = [];
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
