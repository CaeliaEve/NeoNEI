import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const gate = args.includes("--gate");
const distDataDir = resolve(
  readArg("--dist-data")
  ?? process.env.DIST_DATA_V3_DIR
  ?? join(repoRoot, "backend", "public", "dist-data"),
);
const reportDir = join(repoRoot, ".runtime-logs");
const reportPath = join(reportDir, "semantic-runtime-smoke.json");

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

function stableString(value) {
  return `${value ?? ""}`.trim();
}

function stableNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fail(failures, code, message, details = {}) {
  failures.push({ code, message, details });
}

function samplePush(samples, key, value, limit = 30) {
  const bucket = samples[key] ?? [];
  if (bucket.length < limit) bucket.push(value);
  samples[key] = bucket;
}

function assertRuntimeFile(manifest, logicalName, failures) {
  const declaredPath = stableString(manifest?.files?.[logicalName]);
  if (!declaredPath) {
    fail(failures, "MISSING_MANIFEST_FILE", `dist manifest must declare ${logicalName}`);
    return null;
  }
  if (!existsSync(join(distDataDir, declaredPath))) {
    fail(failures, "MISSING_RUNTIME_FILE", `dist manifest declares missing file ${logicalName}`, {
      logicalName,
      path: declaredPath,
    });
    return null;
  }
  return declaredPath;
}

function main() {
  const startedAt = Date.now();
  const failures = [];
  const warnings = [];
  const samples = {};
  const manifest = readJson("manifest.json");

  const requiredFiles = [
    "semanticItems",
    "itemVariants",
    "itemIdentityMap",
    "browserCatalog",
    "browserGroups",
    "validationReport",
    "neiBrowserContract",
  ];
  const declared = {};
  for (const logicalName of requiredFiles) {
    declared[logicalName] = assertRuntimeFile(manifest, logicalName, failures);
  }

  const semanticItems = readJson(declared.semanticItems ?? "items/semantic-items.json").items ?? [];
  const variants = readJson(declared.itemVariants ?? "items/variants.json").variants ?? [];
  const identityMap = readJson(declared.itemIdentityMap ?? "items/identity-map.json").items ?? [];
  const browserItems = readJson(declared.browserCatalog ?? "browser/item-catalog.json").items ?? [];
  const browserGroups = readJson(declared.browserGroups ?? "browser/group-index.json").groups ?? [];
  const validationReport = readJson(declared.validationReport ?? "validation/report.json");
  const browserContract = readJson(declared.neiBrowserContract ?? "validation/nei-browser-contract.json");
  const animationExpectations = manifest?.files?.animationExpectationReport
    ? readJson(manifest.files.animationExpectationReport, false)
    : null;

  const semanticPublicIds = new Set();
  const representativeLegacyIds = new Set();
  for (const item of semanticItems) {
    const publicItemId = stableString(item?.publicItemId);
    if (!publicItemId) {
      samplePush(samples, "semanticItemsMissingPublicId", item);
      continue;
    }
    semanticPublicIds.add(publicItemId);
    const representative = stableString(item?.representativeLegacyItemId);
    if (representative) representativeLegacyIds.add(representative);
  }

  const identityByLegacyId = new Map();
  const duplicateIdentityLegacyIds = new Set();
  for (const entry of identityMap) {
    const legacyItemId = stableString(entry?.legacyItemId);
    const publicItemId = stableString(entry?.publicItemId);
    if (!legacyItemId || !publicItemId) {
      samplePush(samples, "identityRowsMissingKeys", entry);
      continue;
    }
    if (identityByLegacyId.has(legacyItemId)) duplicateIdentityLegacyIds.add(legacyItemId);
    identityByLegacyId.set(legacyItemId, entry);
    if (!semanticPublicIds.has(publicItemId)) {
      samplePush(samples, "identityRowsMissingSemanticPublicItem", { legacyItemId, publicItemId });
    }
  }
  if (duplicateIdentityLegacyIds.size > 0) {
    fail(failures, "DUPLICATE_IDENTITY_MAP_ROW", "each legacy item must have exactly one semantic identity-map row", {
      duplicateLegacyItemIds: Array.from(duplicateIdentityLegacyIds).slice(0, 50),
      count: duplicateIdentityLegacyIds.size,
    });
  }

  for (const item of browserItems) {
    const itemId = stableString(item?.itemId);
    const publicItemId = stableString(item?.publicItemId);
    if (!itemId) {
      samplePush(samples, "browserItemsMissingItemId", item);
      continue;
    }
    if (!publicItemId) {
      samplePush(samples, "browserItemsMissingPublicItemId", item);
      continue;
    }
    const identity = identityByLegacyId.get(itemId);
    if (!identity) {
      samplePush(samples, "browserItemsMissingIdentityRow", { itemId, publicItemId });
    } else if (stableString(identity.publicItemId) !== publicItemId) {
      samplePush(samples, "browserItemsMismatchedPublicItemId", {
        itemId,
        browserPublicItemId: publicItemId,
        identityPublicItemId: identity.publicItemId,
      });
    }
  }

  const groupsByKey = new Map();
  const finalGroupByMember = new Map();
  const duplicateFinalAssignments = [];
  for (const group of browserGroups) {
    const groupKey = stableString(group?.groupKey);
    if (!groupKey) {
      samplePush(samples, "groupsMissingGroupKey", group);
      continue;
    }
    if (groupsByKey.has(groupKey)) samplePush(samples, "duplicateGroupKeys", { groupKey });
    groupsByKey.set(groupKey, group);
    const members = Array.from(new Set((Array.isArray(group?.memberItemIds) ? group.memberItemIds : []).map(stableString).filter(Boolean)));
    const declaredSize = stableNumber(group?.groupSize, members.length);
    if (declaredSize !== members.length) {
      samplePush(samples, "groupSizeMismatches", { groupKey, declaredSize, actualSize: members.length });
    }
    const representative = stableString(group?.representativeItemId);
    if (representative && !members.includes(representative)) {
      samplePush(samples, "groupRepresentativeMissingFromMembers", { groupKey, representative });
    }
    for (const memberItemId of members) {
      const previous = finalGroupByMember.get(memberItemId);
      if (previous && previous !== groupKey) {
        duplicateFinalAssignments.push({ memberItemId, firstGroupKey: previous, secondGroupKey: groupKey });
      } else {
        finalGroupByMember.set(memberItemId, groupKey);
      }
    }
  }

  for (const item of browserItems) {
    const groupKey = stableString(item?.groupKey);
    const groupSize = stableNumber(item?.groupSize, 1);
    if (!groupKey && groupSize > 1) {
      samplePush(samples, "groupedBrowserItemsMissingGroupKey", {
        itemId: item.itemId,
        publicItemId: item.publicItemId,
        groupSize,
      });
      continue;
    }
    if (groupKey && !groupsByKey.has(groupKey)) {
      samplePush(samples, "browserItemsMissingGroupRef", { itemId: item.itemId, groupKey });
    }
  }

  for (const variant of variants) {
    const publicItemId = stableString(variant?.publicItemId);
    const legacyItemId = stableString(variant?.legacyItemId);
    if (publicItemId && !semanticPublicIds.has(publicItemId)) {
      samplePush(samples, "variantsMissingSemanticPublicItem", { variantId: variant?.variantId, publicItemId });
    }
    if (legacyItemId && !identityByLegacyId.has(legacyItemId)) {
      samplePush(samples, "variantsMissingIdentityRow", { variantId: variant?.variantId, legacyItemId });
    }
  }

  const sampleFailureKeys = [
    "semanticItemsMissingPublicId",
    "identityRowsMissingKeys",
    "identityRowsMissingSemanticPublicItem",
    "browserItemsMissingItemId",
    "browserItemsMissingPublicItemId",
    "browserItemsMissingIdentityRow",
    "browserItemsMismatchedPublicItemId",
    "duplicateGroupKeys",
    "groupSizeMismatches",
    "groupRepresentativeMissingFromMembers",
    "groupedBrowserItemsMissingGroupKey",
    "browserItemsMissingGroupRef",
    "variantsMissingSemanticPublicItem",
    "variantsMissingIdentityRow",
  ];
  for (const key of sampleFailureKeys) {
    if ((samples[key] ?? []).length > 0) {
      fail(failures, key.toUpperCase(), `semantic runtime invariant failed: ${key}`, { samples: samples[key] });
    }
  }
  if (duplicateFinalAssignments.length > 0) {
    fail(failures, "DUPLICATE_FINAL_BROWSER_GROUP_ASSIGNMENT", "each browser item must have at most one final group assignment", {
      count: duplicateFinalAssignments.length,
      samples: duplicateFinalAssignments.slice(0, 50),
    });
  }

  const validationCounts = validationReport?.counts ?? {};
  if (stableNumber(validationCounts.browserContractDuplicateFinalMemberAssignments, 0) !== 0) {
    fail(failures, "VALIDATION_REPORTED_DUPLICATE_FINAL_ASSIGNMENTS", "compiler validation reported duplicate browser group assignments", {
      value: validationCounts.browserContractDuplicateFinalMemberAssignments,
    });
  }
  if (stableNumber(validationCounts.browserContractMissingGroupRefs, 0) !== 0) {
    fail(failures, "VALIDATION_REPORTED_MISSING_GROUP_REFS", "compiler validation reported missing browser group refs", {
      value: validationCounts.browserContractMissingGroupRefs,
    });
  }
  if (browserContract?.status === "blocked") {
    fail(failures, "BROWSER_CONTRACT_NOT_OK", "compiled NEI browser contract must be ok", {
      status: browserContract.status,
      summary: browserContract.summary,
    });
  } else if (browserContract?.status && browserContract.status !== "ok") {
    warnings.push({
      code: "BROWSER_CONTRACT_WARNING",
      message: "compiled NEI browser contract is warning-only; hard invariants are checked separately",
      status: browserContract.status,
      summary: browserContract.summary,
    });
  }
  if (animationExpectations?.status === "warning") {
    warnings.push({
      code: "ANIMATION_EXPECTATION_WARNING",
      message: "some expected animated families were compiled without animated atlas/timing; fix exporter facts before release gating this as blocking",
      schemaVersion: animationExpectations.schemaVersion ?? null,
      counts: animationExpectations.counts,
      breakdown: animationExpectations.breakdown ?? null,
      samples: animationExpectations.samples?.staticWhenExpectedAnimated?.slice?.(0, 20) ?? [],
    });
  }

  const report = {
    schemaVersion: "neonei/semantic-runtime-smoke/v1",
    status: failures.length === 0 ? "ok" : "blocked",
    distDataDir: "<dist-data>",
    elapsedMs: Date.now() - startedAt,
    counts: {
      semanticItems: semanticItems.length,
      variants: variants.length,
      identityRows: identityMap.length,
      browserItems: browserItems.length,
      browserGroups: browserGroups.length,
      finalGroupedMembers: finalGroupByMember.size,
      duplicateFinalAssignments: duplicateFinalAssignments.length,
      expectedAnimatedItems: stableNumber(animationExpectations?.counts?.expectedAnimatedItems, 0),
      staticWhenExpectedAnimated: stableNumber(animationExpectations?.counts?.staticWhenExpectedAnimated, 0),
    },
    failures,
    warnings,
  };

  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (gate && failures.length > 0) process.exit(1);
}

main();
