import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const gate = args.includes("--gate");
const strictAnimation = args.includes("--strict-animation") || process.env.REQUIRE_KNOWN_ANIMATION === "1";
const strictSemanticGroups = args.includes("--strict-semantic-groups") || process.env.REQUIRE_NATIVE_GROUP_SOURCES === "1";
const distDataDir = resolve(
  readArg("--dist-data")
  ?? process.env.DIST_DATA_V3_DIR
  ?? join(repoRoot, "backend", "public", "dist-data"),
);
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

function text(value) {
  return `${value ?? ""}`.trim();
}

function normalize(value) {
  return text(value).toLowerCase().replace(/\s+/g, "");
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasDrawable(entry) {
  return Boolean(entry?.staticAtlas?.atlasFile || entry?.animatedAtlas?.atlasFile);
}

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
    entry?.aliases,
    entry?.normalizedInternalName,
    entry?.normalizedItemId,
    entry?.normalizedSearchTerms,
    entry?.facetSummary,
    entry?.family,
    entry?.classification,
    entry?.groupLabel,
    entry?.itemId,
  ].map(normalize).filter(Boolean);
}

function matchesQuery(entry, query) {
  const needle = normalize(query);
  return fields(entry).some((field) => field.includes(needle));
}

function sample(entries, limit = 20) {
  return entries.slice(0, limit).map((entry) => JSON.parse(JSON.stringify(entry)));
}

const manifest = readJson("manifest.json");
const files = manifest.files ?? {};
const searchPayload = readJson(files.searchAll ?? "search/all.json");
const atlasPayload = readJson(files.browserAtlasIndex ?? "textures/browser-atlas-index.json");
const groupsPayload = readJson(files.browserGroups ?? "browser/group-index.json");
const handlersPayload = readJson(files.recipeHandlers ?? "recipes/handler-index.json", false);
const thaumcraftPayloads = readJson("special/thaumcraft/payloads.json", false);
const animationExpectations = files.animationExpectationReport
  ? readJson(files.animationExpectationReport, false)
  : null;

const searchItems = Array.isArray(searchPayload.items) ? searchPayload.items : [];
const atlasByItemId = new Map((atlasPayload.items ?? [])
  .filter((entry) => text(entry?.itemId))
  .map((entry) => [entry.itemId, entry]));
const groups = Array.isArray(groupsPayload.groups) ? groupsPayload.groups : [];
const handlers = Array.isArray(handlersPayload?.handlers) ? handlersPayload.handlers : [];

const failures = [];
const warnings = [];
const checks = {};

function addFailure(message, details = {}) {
  failures.push({ message, details });
}

function addWarning(message, details = {}) {
  warnings.push({ message, details });
}

function checkSearchDrawable(spec) {
  const hits = searchItems
    .filter((entry) => matchesQuery(entry, spec.query))
    .slice(0, spec.sampleLimit ?? 25);
  const missingAtlas = hits
    .filter((entry) => !hasDrawable(atlasByItemId.get(entry.itemId)))
    .map((entry) => ({ itemId: entry.itemId, localizedName: entry.localizedName }));
  const missingName = hits
    .filter((entry) => !isLocalizedName(entry))
    .map((entry) => ({ itemId: entry.itemId, localizedName: entry.localizedName }));
  checks[`search:${spec.name}`] = {
    query: spec.query,
    hitCount: hits.length,
    minHits: spec.minHits,
    sample: sample(hits.map((entry) => ({ itemId: entry.itemId, localizedName: entry.localizedName })), 8),
    missingAtlas: sample(missingAtlas),
    missingName: sample(missingName),
  };
  if (hits.length < spec.minHits) {
    addFailure(`known search '${spec.name}' returned too few hits`, {
      query: spec.query,
      hitCount: hits.length,
      minHits: spec.minHits,
    });
  }
  if (missingAtlas.length > 0) {
    addFailure(`known search '${spec.name}' has visible entries without atlas drawable`, {
      query: spec.query,
      missingAtlas: sample(missingAtlas),
    });
  }
  if (missingName.length > 0) {
    addFailure(`known search '${spec.name}' has non-localized item names`, {
      query: spec.query,
      missingName: sample(missingName),
    });
  }
}

function checkGroup(spec) {
  const matched = groups
    .filter((group) => {
      const key = normalize(group?.groupKey);
      const label = normalize(group?.groupLabel);
      return spec.includes.every((needle) => key.includes(normalize(needle)) || label.includes(normalize(needle)));
    })
    .sort((left, right) => number(right.groupSize, 0) - number(left.groupSize, 0));
  const best = matched[0] ?? null;
  checks[`group:${spec.name}`] = {
    matchCount: matched.length,
    best: best ? {
      groupKey: best.groupKey,
      groupLabel: best.groupLabel,
      groupSize: best.groupSize,
      groupSource: best.groupSource,
      representativeItemId: best.representativeItemId,
    } : null,
    minSize: spec.minSize,
    requiresSemanticSource: spec.requiresSemanticSource,
  };
  if (!best) {
    const issue = { includes: spec.includes };
    if (spec.warnOnly) {
      addWarning(`known browser group '${spec.name}' is missing`, issue);
    } else {
      addFailure(`known browser group '${spec.name}' is missing`, issue);
    }
    return;
  }
  if (number(best.groupSize, 0) < spec.minSize) {
    addFailure(`known browser group '${spec.name}' is too small`, {
      groupKey: best.groupKey,
      groupSize: best.groupSize,
      minSize: spec.minSize,
    });
  }
  if (spec.requiresSemanticSource && text(best.groupSource) !== "semanticIdentity") {
    const issue = {
      groupKey: best.groupKey,
      groupSource: best.groupSource,
      expected: "semanticIdentity",
    };
    if (strictSemanticGroups) {
      addFailure(`known browser group '${spec.name}' is still not exported from semantic identity`, issue);
    } else {
      addWarning(`known browser group '${spec.name}' is still not exported from semantic identity`, issue);
    }
  }
  const representativeAtlas = atlasByItemId.get(best.representativeItemId);
  if (!hasDrawable(representativeAtlas)) {
    addFailure(`known browser group '${spec.name}' representative has no atlas drawable`, {
      groupKey: best.groupKey,
      representativeItemId: best.representativeItemId,
    });
  }
}

function checkThaumcraftAspects() {
  const payloads = Array.isArray(thaumcraftPayloads?.payloads) ? thaumcraftPayloads.payloads : [];
  const aspectIds = Array.from(new Set(payloads.flatMap((payload) => Object.keys(payload?.domainFacts?.aspects ?? {}))));
  const sampled = aspectIds.slice(0, 64);
  const missingAtlas = sampled.filter((itemId) => !hasDrawable(atlasByItemId.get(itemId)));
  checks["thaumcraft:aspects"] = {
    recipePayloads: payloads.length,
    aspectItemIds: aspectIds.length,
    sampled: sampled.length,
    missingAtlas: sample(missingAtlas.map((itemId) => ({ itemId }))),
  };
  if (payloads.length <= 0) addFailure("Thaumcraft special payloads are missing");
  if (aspectIds.length <= 0) addFailure("Thaumcraft aspect item facts are missing");
  if (missingAtlas.length > 0) {
    addFailure("Thaumcraft aspect items have no atlas drawable", { missingAtlas: sample(missingAtlas.map((itemId) => ({ itemId }))) });
  }
}

function checkAnimationExpectations() {
  const counts = animationExpectations?.counts ?? {};
  const staticWhenExpectedAnimated = number(counts.staticWhenExpectedAnimated, 0);
  checks["animation:expectations"] = {
    status: animationExpectations?.status ?? null,
    expectedAnimatedItems: number(counts.expectedAnimatedItems, 0),
    staticWhenExpectedAnimated,
    samples: sample(animationExpectations?.samples?.staticWhenExpectedAnimated ?? [], 12),
  };
  if (strictAnimation && staticWhenExpectedAnimated > 0) {
    addFailure("expected animated items still compiled as static", {
      staticWhenExpectedAnimated,
      samples: sample(animationExpectations?.samples?.staticWhenExpectedAnimated ?? [], 12),
    });
  } else if (staticWhenExpectedAnimated > 0) {
    addWarning("expected animated items still compiled as static; keep this visible until next native render export closes it", {
      staticWhenExpectedAnimated,
      samples: sample(animationExpectations?.samples?.staticWhenExpectedAnimated ?? [], 12),
    });
  }
}

function checkGtMachineRules() {
  const expected = new Map(Object.entries({
    "gt.recipe.alloysmelter": "gregtech:gt.blockmachines:31023",
    "gt.recipe.arcfurnace": "gregtech:gt.blockmachines:862",
    "gt.recipe.fluidsolidifier": "gregtech:gt.blockmachines:10890",
    "gt.recipe.macerator": "gregtech:gt.blockmachines:797",
  }));
  const mismatches = handlers
    .map((handler) => {
      const handlerKey = text(handler?.handlerKey);
      const expectedItem = expected.get(handlerKey);
      if (!expectedItem) return null;
      const actual = text(handler?.preferredMachineItemName);
      return actual === expectedItem
        ? null
        : {
            handlerKey,
            localizedName: handler?.localizedName ?? handler?.displayName ?? null,
            expectedPreferredMachineItemName: expectedItem,
            actualPreferredMachineItemName: actual || null,
            catalystItemName: handler?.catalystItemName ?? null,
          };
    })
    .filter(Boolean);
  checks["gregtech:large-machine-icons"] = {
    checkedHandlers: expected.size,
    mismatches: sample(mismatches),
  };
  if (mismatches.length > 0) {
    addWarning("GT large-machine icon rules are not reflected in the currently compiled export yet", {
      mismatches: sample(mismatches),
    });
  }
}

[
  { name: "NASA workbench and schematics", query: "NASA工作台", minHits: 5 },
  { name: "rockets", query: "火箭", minHits: 8 },
  { name: "Avaritia singularities", query: "奇点", minHits: 10 },
  { name: "Thaumcraft wands", query: "法杖", minHits: 10 },
  { name: "fluids", query: "流体", minHits: 10 },
].forEach(checkSearchDrawable);

[
  { name: "BuildCraft facades", includes: ["facade.buildcraft"], minSize: 1000, requiresSemanticSource: true },
  { name: "Thaumcraft casting wands", includes: ["thaumcraft.wand"], minSize: 100, requiresSemanticSource: true },
  { name: "Forestry bees", includes: ["genetics.forestry"], minSize: 100, requiresSemanticSource: true },
  { name: "TConstruct tools", includes: ["tool.tconstruct"], minSize: 100, requiresSemanticSource: true },
  { name: "GT tools", includes: ["tool.gregtech"], minSize: 50, requiresSemanticSource: true },
  { name: "Avaritia singularity family", includes: ["singularity"], minSize: 10, requiresSemanticSource: true, warnOnly: true },
].forEach(checkGroup);

checkThaumcraftAspects();
checkAnimationExpectations();
checkGtMachineRules();

const report = {
  schemaVersion: "neonei/known-runtime-items/v1",
  generatedAt: new Date().toISOString(),
  distDataDir,
  strict: {
    animation: strictAnimation,
    semanticGroups: strictSemanticGroups,
  },
  counts: {
    searchItems: searchItems.length,
    atlasItems: atlasByItemId.size,
    browserGroups: groups.length,
    recipeHandlers: handlers.length,
  },
  checks,
  failures,
  warnings,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${reportPath}`);
if (gate && failures.length > 0) process.exit(1);
