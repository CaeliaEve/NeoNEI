import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultDistDataDir = join(repoRoot, ".tmp-runtime", "dist-data-v3-self-test");
const distDataDir = resolve(process.env.DIST_DATA_V3_DIR || defaultDistDataDir);
const sampleConfigPath = resolve(process.env.RUNTIME_V3_REGRESSION_SAMPLES || join(repoRoot, "validation", "runtime-v3-regression-samples.json"));
const reportDir = join(repoRoot, ".runtime-logs");
const reportPath = join(reportDir, "runtime-v3-regression-report.json");
const gate = process.argv.includes("--gate");
const strict = process.argv.includes("--strict") || process.env.RUNTIME_V3_REGRESSION_STRICT === "1";

function readJson(filePath) {
  if (!existsSync(filePath)) throw new Error(`Missing file: ${filePath}`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readDistJson(relativePath) {
  return readJson(join(distDataDir, relativePath));
}

function lower(value) {
  return `${value ?? ""}`.toLowerCase();
}

function includesAny(value, needles) {
  if (!Array.isArray(needles) || needles.length === 0) return true;
  const haystack = lower(value);
  return needles.some((needle) => haystack.includes(lower(needle)));
}

function matchesItem(item, match = {}) {
  const itemId = `${item.itemId ?? ""}`;
  if (Array.isArray(match.itemIds) && match.itemIds.includes(itemId)) return true;
  const modOk = !Array.isArray(match.modIds) || match.modIds.length === 0 || match.modIds.some((modId) => lower(modId) === lower(item.modId));
  if (!modOk) return false;
  const localizedOk = includesAny(item.localizedName, match.localizedIncludes);
  const internalOk = includesAny(item.internalName ?? item.itemId, match.internalIncludes);
  return localizedOk && internalOk;
}

function hasAtlasDrawable(entry) {
  return Boolean(entry?.staticAtlas?.atlasFile || entry?.animatedAtlas?.atlasFile);
}

function hasAnimatedDrawable(entry) {
  return Boolean(entry?.animatedAtlas?.atlasFile);
}

function stableNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFirstNonEmptyMap(payload) {
  const map = new Map();
  for (const entry of payload.items ?? []) {
    if (entry?.itemId) map.set(entry.itemId, entry);
  }
  return map;
}

const manifest = readDistJson("manifest.json");
const files = manifest.files ?? {};
const catalogPayload = readDistJson(files.browserCatalog ?? "browser/item-catalog.json");
const atlasPayload = readDistJson(files.browserAtlasIndex ?? "textures/browser-atlas-index.json");
const animationPayload = readDistJson(files.animationTable ?? "textures/animation-table.json");
const recipeItemPayload = readDistJson(files.recipeItemIndex ?? "recipes/item-index.json");
const groupPayload = readDistJson(files.browserGroups ?? "browser/group-index.json");
const sampleConfig = readJson(sampleConfigPath);

const catalogItems = Array.isArray(catalogPayload.items) ? catalogPayload.items : [];
const atlasByItemId = getFirstNonEmptyMap(atlasPayload);
const animationByItemId = getFirstNonEmptyMap(animationPayload);
const recipeByItemId = getFirstNonEmptyMap(recipeItemPayload);
const groupsByRepresentative = new Map();
for (const group of groupPayload.groups ?? []) {
  if (group?.representativeItemId) groupsByRepresentative.set(group.representativeItemId, group);
  for (const member of group?.memberItemIds ?? []) groupsByRepresentative.set(member, group);
}

const catalogItemIds = catalogItems.map((item) => `${item?.itemId ?? ""}`.trim()).filter(Boolean);
const catalogItemIdSet = new Set(catalogItemIds);
const duplicateCatalogItemIds = catalogItemIds.filter((itemId, index) => catalogItemIds.indexOf(itemId) !== index);
const browserOrderBreaks = [];
for (let index = 1; index < catalogItems.length; index += 1) {
  const previous = catalogItems[index - 1];
  const current = catalogItems[index];
  const previousOrder = stableNumber(previous?.browserOrder, index - 1);
  const currentOrder = stableNumber(current?.browserOrder, index);
  if (currentOrder < previousOrder) {
    browserOrderBreaks.push({
      index,
      previousItemId: previous?.itemId ?? null,
      previousOrder,
      currentItemId: current?.itemId ?? null,
      currentOrder,
    });
    if (browserOrderBreaks.length >= 25) break;
  }
}
const rawGroups = Array.isArray(groupPayload.groups) ? groupPayload.groups : [];
const groupIntegrity = rawGroups.reduce((acc, group) => {
  const members = Array.isArray(group?.memberItemIds) ? group.memberItemIds : [];
  const representativeItemId = `${group?.representativeItemId ?? ""}`.trim();
  if (representativeItemId && !catalogItemIdSet.has(representativeItemId)) {
    acc.missingRepresentatives.push({ groupKey: group?.groupKey ?? null, representativeItemId });
  }
  const missingMembers = members.filter((itemId) => !catalogItemIdSet.has(itemId)).slice(0, 20);
  if (missingMembers.length > 0) {
    acc.groupsWithMissingMembers.push({ groupKey: group?.groupKey ?? null, missingMembers });
  }
  const declaredSize = stableNumber(group?.groupSize, members.length || 1);
  if (members.length > 0 && declaredSize !== members.length) {
    acc.sizeMismatches.push({ groupKey: group?.groupKey ?? null, declaredSize, actualSize: members.length });
  }
  if (members.length > 1) acc.collapsibleGroups += 1;
  return acc;
}, { groups: rawGroups.length, collapsibleGroups: 0, missingRepresentatives: [], groupsWithMissingMembers: [], sizeMismatches: [] });
const sampleResults = [];
for (const sample of sampleConfig.samples ?? []) {
  const matches = catalogItems.filter((item) => matchesItem(item, sample.match)).slice(0, 20);
  const primary = matches[0] ?? null;
  const itemId = primary?.itemId ?? null;
  const checks = sample.checks ?? {};
  const failures = [];
  const warnings = [];
  if (!primary) {
    const message = `sample item not found: ${sample.id}`;
    if (sample.required || strict) failures.push(message);
    else warnings.push(message);
  }

  const atlasEntry = itemId ? atlasByItemId.get(itemId) : null;
  if (primary && checks.atlas && !hasAtlasDrawable(atlasEntry)) failures.push(`missing atlas drawable for ${itemId}`);
  if (primary && checks.animation && (!hasAnimatedDrawable(atlasEntry) || !animationByItemId.has(itemId))) failures.push(`missing animation atlas/table for ${itemId}`);
  const recipeEntry = itemId ? recipeByItemId.get(itemId) : null;
  const recipeCount = (recipeEntry?.producedBy?.length ?? 0) + (recipeEntry?.usedIn?.length ?? 0);
  if (primary && checks.recipe && recipeCount <= 0) failures.push(`missing recipe index entry for ${itemId}`);
  const groupEntry = itemId ? groupsByRepresentative.get(itemId) : null;
  if (primary && checks.group && !(groupEntry?.groupKey && (groupEntry?.groupSize ?? 0) > 1)) failures.push(`missing collapsible group for ${itemId}`);

  sampleResults.push({
    id: sample.id,
    label: sample.label ?? sample.id,
    required: Boolean(sample.required),
    matchedItemId: itemId,
    matchedLocalizedName: primary?.localizedName ?? null,
    matchCount: matches.length,
    atlas: itemId ? hasAtlasDrawable(atlasEntry) : false,
    animated: itemId ? hasAnimatedDrawable(atlasEntry) && animationByItemId.has(itemId) : false,
    recipeCount,
    groupKey: groupEntry?.groupKey ?? null,
    groupSize: groupEntry?.groupSize ?? null,
    failures,
    warnings,
  });
}

const failures = sampleResults.flatMap((sample) => sample.failures.map((failure) => `${sample.id}: ${failure}`));
if (duplicateCatalogItemIds.length > 0) failures.push(`browser catalog has ${duplicateCatalogItemIds.length} duplicate item id(s)`);
if (browserOrderBreaks.length > 0) failures.push(`browser catalog order has ${browserOrderBreaks.length} monotonic break(s)`);
if (strict && groupIntegrity.missingRepresentatives.length > 0) failures.push(`browser groups have ${groupIntegrity.missingRepresentatives.length} missing representative(s)`);
if (strict && groupIntegrity.groupsWithMissingMembers.length > 0) failures.push(`browser groups have ${groupIntegrity.groupsWithMissingMembers.length} missing-member group(s)`);
const warnings = sampleResults.flatMap((sample) => sample.warnings.map((warning) => `${sample.id}: ${warning}`));
if (!strict && groupIntegrity.missingRepresentatives.length > 0) warnings.push(`browser groups have ${groupIntegrity.missingRepresentatives.length} missing representative(s)`);
if (!strict && groupIntegrity.groupsWithMissingMembers.length > 0) warnings.push(`browser groups have ${groupIntegrity.groupsWithMissingMembers.length} missing-member group(s)`);
if (groupIntegrity.sizeMismatches.length > 0) warnings.push(`browser groups have ${groupIntegrity.sizeMismatches.length} declared-size mismatch(es)`);
const report = {
  schemaVersion: "neonei/runtime-v3-regression-report/v1",
  generatedAt: new Date().toISOString(),
  distDataDir,
  sampleConfigPath,
  source: manifest.source ?? null,
  sourceRepository: manifest.sourceRepository ?? null,
  totals: {
    catalogItems: catalogItems.length,
    groups: groupIntegrity.groups,
    collapsibleGroups: groupIntegrity.collapsibleGroups,
    samples: sampleResults.length,
    passed: sampleResults.filter((sample) => sample.failures.length === 0).length,
    failed: sampleResults.filter((sample) => sample.failures.length > 0).length,
    warnings: warnings.length,
  },
  layoutIntegrity: {
    duplicateCatalogItemIds: Array.from(new Set(duplicateCatalogItemIds)).slice(0, 50),
    browserOrderBreaks,
    missingRepresentatives: groupIntegrity.missingRepresentatives.slice(0, 50),
    groupsWithMissingMembers: groupIntegrity.groupsWithMissingMembers.slice(0, 50),
    sizeMismatches: groupIntegrity.sizeMismatches.slice(0, 50),
  },
  samples: sampleResults,
  failures,
  warnings,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${reportPath}`);
if (gate && failures.length > 0) process.exit(1);
