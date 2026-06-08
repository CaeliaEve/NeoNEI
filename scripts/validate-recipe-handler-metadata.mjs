import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDataDir = resolve(process.env.DIST_DATA_V3_DIR || join(repoRoot, "backend", "public", "dist-data"));
const gate = process.argv.includes("--gate");
const requireGtMachineIconRules =
  process.argv.includes("--require-gt-machine-icon-rules") || process.env.REQUIRE_GT_MACHINE_ICON_RULES === "1";
const outputDir = join(repoRoot, ".runtime-logs");
const outputPath = join(outputDir, "recipe-handler-metadata-gate.json");

const expectedGtMachineIcons = new Map(Object.entries({
  "gt.recipe.alloysmelter": "gregtech:gt.blockmachines:31023",
  "gt.recipe.arcfurnace": "gregtech:gt.blockmachines:862",
  "gt.recipe.fluidsolidifier": "gregtech:gt.blockmachines:10890",
  "gt.recipe.macerator": "gregtech:gt.blockmachines:797",
}));

function readJson(relativePath) {
  const filePath = join(distDataDir, relativePath);
  if (!existsSync(filePath)) throw new Error(`Missing dist-data file: ${filePath}`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function tryReadJson(relativePath) {
  const filePath = join(distDataDir, relativePath);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function text(value) {
  return `${value ?? ""}`.trim();
}

function hasText(value) {
  return text(value).length > 0;
}

function sample(entries) {
  return entries.slice(0, 25).map((entry) => ({
    handlerKey: entry?.handlerKey ?? null,
    handlerClass: entry?.handlerClass ?? null,
    displayName: entry?.displayName ?? null,
    localizedName: entry?.localizedName ?? null,
    canonicalMachineFamily: entry?.canonicalMachineFamily ?? null,
    catalystItemName: entry?.catalystItemName ?? null,
    preferredMachineItemName: entry?.preferredMachineItemName ?? null,
  }));
}

const rustReport = tryReadJson("rust/recipe-handler-metadata-report.json");

if (rustReport) {
  const counts = rustReport?.counts ?? {};
  const failures = [];
  const handlers = Number(counts.handlers ?? 0) || 0;
  const layouts = Number(counts.layouts ?? 0) || 0;
  const missingMachineRefRatio = Number(counts.missingMachineRefRatio ?? 1) || 0;

  if (handlers === 0) failures.push("handler index is empty");
  if (layouts === 0) failures.push("handler layout index is empty");
  if ((Number(counts.missingHandlerKey ?? 0) || 0) > 0) failures.push(`${counts.missingHandlerKey} handler(s) are missing handlerKey`);
  if ((Number(counts.missingDisplayName ?? 0) || 0) > 0) failures.push(`${counts.missingDisplayName} handler(s) are missing display/localized name`);
  if ((Number(counts.missingFamily ?? 0) || 0) > 0) failures.push(`${counts.missingFamily} handler(s) are missing canonical machine family`);
  if ((Number(counts.missingLayout ?? 0) || 0) > 0) failures.push(`${counts.missingLayout} handler(s) are missing layout rows`);
  if ((Number(counts.layoutWithoutSlots ?? 0) || 0) > 0) failures.push(`${counts.layoutWithoutSlots} handler layout(s) are missing slot facts`);
  if ((Number(counts.gtMultiblockWithoutPreferred ?? 0) || 0) > 0) failures.push(`${counts.gtMultiblockWithoutPreferred} GT multiblock handler(s) are missing preferred machine icons`);
  if (requireGtMachineIconRules && (Number(counts.gtMachineIconMismatches ?? 0) || 0) > 0) {
    failures.push(`${counts.gtMachineIconMismatches} GT machine handler(s) do not match preferred large-machine icon rules`);
  }
  if (missingMachineRefRatio > 0.02) {
    failures.push(`handler catalyst/preferred machine refs missing ratio ${missingMachineRefRatio.toFixed(4)} exceeds 0.02`);
  }

  const result = {
    schemaVersion: "neonei/recipe-handler-metadata-gate/v1",
    generatedAt: new Date().toISOString(),
    authority: "rust",
    distDataDir,
    counts: {
      ...counts,
      gtMachineIconRulesRequired: requireGtMachineIconRules,
      missingMachineRefRatio: Number(missingMachineRefRatio.toFixed(6)),
    },
    samples: rustReport?.samples ?? {},
    failures,
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (gate && failures.length > 0) process.exitCode = 1;
  process.exit();
}

const handlerIndex = readJson("recipes/handler-index.json");
const handlerLayoutIndex = readJson("recipes/handler-layout-index.json");
const recipeCategoryIndex = readJson("recipes/recipe-category-index.json");
const handlers = Array.isArray(handlerIndex.handlers) ? handlerIndex.handlers : [];
const layouts = Array.isArray(handlerLayoutIndex.layouts) ? handlerLayoutIndex.layouts : [];
const categories = Array.isArray(recipeCategoryIndex.categories) ? recipeCategoryIndex.categories : [];

const layoutByHandlerKey = new Map(layouts.filter((entry) => hasText(entry?.handlerKey)).map((entry) => [entry.handlerKey, entry]));
const missingHandlerKey = handlers.filter((entry) => !hasText(entry?.handlerKey));
const missingDisplayName = handlers.filter((entry) => !hasText(entry?.displayName) && !hasText(entry?.localizedName));
const missingFamily = handlers.filter((entry) => !hasText(entry?.canonicalMachineFamily));
const missingLayout = handlers.filter((entry) => hasText(entry?.handlerKey) && !layoutByHandlerKey.has(entry.handlerKey));
const layoutWithoutSlots = layouts.filter((entry) => !Array.isArray(entry?.slots) || entry.slots.length === 0);
const missingMachineRefs = handlers.filter((entry) => !hasText(entry?.catalystItemName) && !hasText(entry?.preferredMachineItemName));
const gtMultiblockWithoutPreferred = handlers.filter((entry) => entry?.gtMultiblockPreferred === true && !hasText(entry?.preferredMachineItemName));
const gtMachineIconMismatches = handlers
  .map((entry) => {
    const handlerKey = text(entry?.handlerKey);
    const handlerClass = text(entry?.handlerClass);
    const expected =
      expectedGtMachineIcons.get(handlerKey)
      ?? expectedGtMachineIcons.get(handlerClass)
      ?? null;
    if (!expected) return null;
    const actual = text(entry?.preferredMachineItemName);
    return actual === expected
      ? null
      : {
          handlerKey: handlerKey || null,
          handlerClass: handlerClass || null,
          localizedName: entry?.localizedName ?? entry?.displayName ?? null,
          expectedPreferredMachineItemName: expected,
          actualPreferredMachineItemName: actual || null,
          catalystItemName: entry?.catalystItemName ?? null,
        };
  })
  .filter(Boolean);
const categoriesWithHandler = categories.filter((entry) => entry?.handler);
const categoriesWithNativeLayout = categories.filter((entry) => entry?.nativeLayout);

const failures = [];
if (handlers.length === 0) failures.push("handler index is empty");
if (layouts.length === 0) failures.push("handler layout index is empty");
if (missingHandlerKey.length > 0) failures.push(`${missingHandlerKey.length} handler(s) are missing handlerKey`);
if (missingDisplayName.length > 0) failures.push(`${missingDisplayName.length} handler(s) are missing display/localized name`);
if (missingFamily.length > 0) failures.push(`${missingFamily.length} handler(s) are missing canonical machine family`);
if (missingLayout.length > 0) failures.push(`${missingLayout.length} handler(s) are missing layout rows`);
if (layoutWithoutSlots.length > 0) failures.push(`${layoutWithoutSlots.length} handler layout(s) are missing slot facts`);
if (gtMultiblockWithoutPreferred.length > 0) failures.push(`${gtMultiblockWithoutPreferred.length} GT multiblock handler(s) are missing preferred machine icons`);
if (requireGtMachineIconRules && gtMachineIconMismatches.length > 0) {
  failures.push(`${gtMachineIconMismatches.length} GT machine handler(s) do not match preferred large-machine icon rules`);
}

const missingMachineRefRatio = handlers.length > 0 ? missingMachineRefs.length / handlers.length : 1;
if (missingMachineRefRatio > 0.02) {
  failures.push(`handler catalyst/preferred machine refs missing ratio ${missingMachineRefRatio.toFixed(4)} exceeds 0.02`);
}

const result = {
  schemaVersion: "neonei/recipe-handler-metadata-gate/v1",
  generatedAt: new Date().toISOString(),
  distDataDir,
  counts: {
    handlers: handlers.length,
    layouts: layouts.length,
    categories: categories.length,
    categoriesWithHandler: categoriesWithHandler.length,
    categoriesWithNativeLayout: categoriesWithNativeLayout.length,
    missingHandlerKey: missingHandlerKey.length,
    missingDisplayName: missingDisplayName.length,
    missingFamily: missingFamily.length,
    missingLayout: missingLayout.length,
    layoutWithoutSlots: layoutWithoutSlots.length,
    missingMachineRefs: missingMachineRefs.length,
    gtMultiblockWithoutPreferred: gtMultiblockWithoutPreferred.length,
    gtMachineIconMismatches: gtMachineIconMismatches.length,
    gtMachineIconRulesRequired: requireGtMachineIconRules,
    missingMachineRefRatio: Number(missingMachineRefRatio.toFixed(6)),
  },
  samples: {
    missingMachineRefs: sample(missingMachineRefs),
    gtMultiblockWithoutPreferred: sample(gtMultiblockWithoutPreferred),
    gtMachineIconMismatches: gtMachineIconMismatches.slice(0, 25),
    missingLayout: sample(missingLayout),
  },
  failures,
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
if (gate && failures.length > 0) process.exitCode = 1;
