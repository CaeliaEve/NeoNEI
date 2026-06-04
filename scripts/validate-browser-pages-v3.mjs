import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDataDir = resolve(process.env.DIST_DATA_V3_DIR || join(repoRoot, "backend", "public", "dist-data"));
const reportDir = join(repoRoot, ".runtime-logs");
const reportPath = join(reportDir, "browser-page-v3-smoke.json");
const gate = process.argv.includes("--gate");
const pageSize = Math.max(1, Math.floor(Number(process.env.BROWSER_PAGE_SMOKE_PAGE_SIZE ?? 50)));
const pageSpec = `${process.env.BROWSER_PAGE_SMOKE_PAGES ?? "1,40,53,100,last"}`;
const searchSpec = `${process.env.BROWSER_PAGE_SMOKE_SEARCHES ?? "iron,wand,singularity"}`;
const maxPageSliceMs = Number(process.env.BROWSER_PAGE_SMOKE_MAX_SLICE_MS ?? 4);
const maxSearchMs = Number(process.env.BROWSER_PAGE_SMOKE_MAX_SEARCH_MS ?? 50);
const groupSmokeLimit = Math.max(0, Math.floor(Number(process.env.BROWSER_GROUP_SMOKE_LIMIT ?? 8)));
const maxGroupExpandMs = Number(process.env.BROWSER_GROUP_SMOKE_MAX_EXPAND_MS ?? 8);

function readJson(relativePath) {
  const filePath = join(distDataDir, relativePath);
  if (!existsSync(filePath)) throw new Error(`Missing dist-data file: ${filePath}`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalize(value) {
  return `${value ?? ""}`.trim().toLowerCase().replace(/\s+/g, "");
}

function stableNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasDrawable(atlasEntry) {
  return Boolean(atlasEntry?.staticAtlas?.atlasFile || atlasEntry?.animatedAtlas?.atlasFile);
}

function buildDefaultCatalog(catalogItems, groupsByKey) {
  const emittedGroups = new Set();
  const entries = [];
  for (const item of catalogItems) {
    const itemId = `${item?.itemId ?? ""}`.trim();
    if (!itemId) continue;
    const groupKey = `${item?.groupKey ?? ""}`.trim();
    const groupSize = stableNumber(item?.groupSize, 1);
    const representativeItemId = `${item?.representativeItemId ?? itemId}`.trim();
    if (groupKey && groupSize > 1) {
      if (representativeItemId !== itemId || emittedGroups.has(groupKey)) continue;
      emittedGroups.add(groupKey);
      const group = groupsByKey.get(groupKey);
      entries.push({
        key: `collapsed:${groupKey}`,
        kind: "group-collapsed",
        itemId,
        groupKey,
        groupSize: stableNumber(group?.groupSize, groupSize),
        representativeItemId,
        groupSource: group?.groupSource ?? item?.groupSource ?? null,
      });
      continue;
    }
    entries.push({ key: itemId, kind: "item", itemId });
  }
  return entries;
}

function resolvePages(totalPages) {
  return Array.from(new Set(pageSpec.split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => raw === "last" ? totalPages : Math.floor(Number(raw)))
    .filter((page) => Number.isFinite(page) && page >= 1)
    .map((page) => Math.min(totalPages, page))))
    .sort((left, right) => left - right);
}

function pageEntries(entries, page) {
  const startedAt = performance.now();
  const start = (page - 1) * pageSize;
  const data = entries.slice(start, start + pageSize);
  return { data, elapsedMs: performance.now() - startedAt };
}

function expandGroupEntries(defaultEntries, group, page = 1) {
  const startedAt = performance.now();
  const groupKey = `${group?.groupKey ?? ""}`.trim();
  const members = Array.isArray(group?.memberItemIds) ? group.memberItemIds.filter(Boolean) : [];
  const expandedEntries = [];
  for (const entry of defaultEntries) {
    if (entry.kind !== "group-collapsed" || entry.groupKey !== groupKey) {
      expandedEntries.push(entry);
      continue;
    }
    for (const memberItemId of members) {
      expandedEntries.push({ key: memberItemId, kind: "item", itemId: memberItemId });
    }
  }
  const start = (Math.max(1, page) - 1) * pageSize;
  return {
    data: expandedEntries.slice(start, start + pageSize),
    total: expandedEntries.length,
    elapsedMs: performance.now() - startedAt,
  };
}

function searchFields(entry) {
  return [
    entry.normalizedLocalizedName ?? entry.localizedName,
    entry.pinyinFull,
    entry.pinyinAcronym,
    entry.aliases,
    entry.normalizedInternalName,
    entry.normalizedItemId ?? entry.itemId,
    entry.normalizedSearchTerms,
  ].map(normalize).filter(Boolean);
}

function appendIndex(index, key, sourceIndex) {
  if (!key) return;
  const existing = index.get(key);
  if (existing) {
    if (existing[existing.length - 1] !== sourceIndex) existing.push(sourceIndex);
    return;
  }
  index.set(key, [sourceIndex]);
}

function buildSearchIndexes(searchItems) {
  const exact = new Map();
  const prefix = new Map();
  const gram = new Map();
  for (let sourceIndex = 0; sourceIndex < searchItems.length; sourceIndex += 1) {
    const seen = new Set();
    for (const field of searchFields(searchItems[sourceIndex])) {
      const exactKey = `exact:${field}`;
      if (!seen.has(exactKey)) {
        seen.add(exactKey);
        appendIndex(exact, field, sourceIndex);
      }
      const maxPrefix = Math.min(32, field.length);
      for (let length = 1; length <= maxPrefix; length += 1) {
        const value = field.slice(0, length);
        const key = `prefix:${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        appendIndex(prefix, value, sourceIndex);
      }
      const gramSource = field.slice(0, 96);
      const gramLengths = field.length <= 2 ? [field.length] : [1, 2, 3];
      for (const gramLength of gramLengths) {
        if (gramLength <= 0 || gramSource.length < gramLength) continue;
        for (let offset = 0; offset <= gramSource.length - gramLength; offset += 1) {
          const value = gramSource.slice(offset, offset + gramLength);
          const key = `gram:${value}`;
          if (seen.has(key)) continue;
          seen.add(key);
          appendIndex(gram, value, sourceIndex);
        }
      }
    }
  }
  return { exact, prefix, gram };
}

function intersectSorted(left, right) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      result.push(left[i]);
      i += 1;
      j += 1;
    } else if (left[i] < right[j]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return result;
}

function queryGrams(needle) {
  if (!needle) return [];
  if (needle.length <= 2) return [needle];
  const grams = new Set();
  for (let offset = 0; offset <= needle.length - 3; offset += 1) grams.add(needle.slice(offset, offset + 3));
  return Array.from(grams);
}

function rankSearchEntry(entry, needle) {
  const fields = searchFields(entry);
  if (fields.some((field) => field === needle)) return 0;
  if (fields.some((field) => field.startsWith(needle))) return 10;
  if (fields.some((field) => field.includes(needle))) return 20;
  return 100;
}

function searchEntries(searchItems, indexes, query) {
  const startedAt = performance.now();
  const needle = normalize(query);
  const direct = [
    ...(indexes.exact.get(needle) ?? []),
    ...(indexes.prefix.get(needle) ?? []),
  ];
  let gramCandidates = [];
  for (const gramValue of queryGrams(needle)) {
    const indexed = indexes.gram.get(gramValue) ?? [];
    if (indexed.length === 0) {
      gramCandidates = [];
      break;
    }
    gramCandidates = gramCandidates.length === 0 ? indexed : intersectSorted(gramCandidates, indexed);
    if (gramCandidates.length === 0) break;
  }
  const candidateIndexes = Array.from(new Set([...direct, ...gramCandidates]));
  const data = candidateIndexes
    .map((index) => {
      const entry = searchItems[index];
      return entry ? { entry, rank: rankSearchEntry(entry, needle) } : null;
    })
    .filter((entry) => entry && entry.rank < 100)
    .sort((left, right) => left.rank - right.rank
      || stableNumber(left.entry.searchRank, 0) - stableNumber(right.entry.searchRank, 0)
      || stableNumber(right.entry.popularityScore, 0) - stableNumber(left.entry.popularityScore, 0))
    .map((entry) => entry.entry)
    .slice(0, pageSize);
  return { data, elapsedMs: performance.now() - startedAt, candidateCount: candidateIndexes.length };
}

const manifest = readJson("manifest.json");
const files = manifest.files ?? {};
const catalogPayload = readJson(files.browserCatalog ?? "browser/item-catalog.json");
const groupsPayload = readJson(files.browserGroups ?? "browser/group-index.json");
const atlasPayload = readJson(files.browserAtlasIndex ?? "textures/browser-atlas-index.json");
const searchPayload = readJson(files.searchAll ?? "search/all.json");

const catalogItems = Array.isArray(catalogPayload.items) ? catalogPayload.items : [];
const groups = Array.isArray(groupsPayload.groups) ? groupsPayload.groups : [];
const searchItems = Array.isArray(searchPayload.items) ? searchPayload.items : [];
const atlasByItemId = new Map((atlasPayload.items ?? [])
  .filter((entry) => entry?.itemId)
  .map((entry) => [entry.itemId, entry]));
const groupsByKey = new Map(groups
  .filter((group) => group?.groupKey)
  .map((group) => [group.groupKey, group]));

const defaultCatalog = buildDefaultCatalog(catalogItems, groupsByKey);
const totalPages = Math.max(1, Math.ceil(defaultCatalog.length / pageSize));
const pages = resolvePages(totalPages);
const failures = [];
const warnings = [];

const pageResults = pages.map((page) => {
  const result = pageEntries(defaultCatalog, page);
  const missingAtlas = result.data
    .map((entry) => entry.itemId)
    .filter((itemId) => !hasDrawable(atlasByItemId.get(itemId)));
  if (missingAtlas.length > 0) failures.push(`page ${page} has ${missingAtlas.length} visible item(s) without atlas drawable`);
  if (result.elapsedMs > maxPageSliceMs) failures.push(`page ${page} slice ${result.elapsedMs.toFixed(3)}ms exceeds ${maxPageSliceMs}ms`);
  return {
    page,
    itemCount: result.data.length,
    elapsedMs: result.elapsedMs,
    missingAtlas: missingAtlas.slice(0, 25),
  };
});

const searchIndexes = buildSearchIndexes(searchItems);
const searchResults = searchSpec.split(",")
  .map((query) => query.trim())
  .filter(Boolean)
  .map((query) => {
    const result = searchEntries(searchItems, searchIndexes, query);
    const missingAtlas = result.data
      .map((entry) => entry.itemId)
      .filter((itemId) => !hasDrawable(atlasByItemId.get(itemId)));
    if (result.data.length === 0) failures.push(`search '${query}' returned no entries`);
    if (missingAtlas.length > 0) failures.push(`search '${query}' has ${missingAtlas.length} first-page item(s) without atlas drawable`);
    if (result.elapsedMs > maxSearchMs) failures.push(`search '${query}' scan ${result.elapsedMs.toFixed(3)}ms exceeds ${maxSearchMs}ms`);
    return {
      query,
      hitCountFirstPage: result.data.length,
      elapsedMs: result.elapsedMs,
      candidateCount: result.candidateCount,
      missingAtlas: missingAtlas.slice(0, 25),
    };
  });

const groupSmokeGroups = groups
  .filter((group) => `${group?.groupKey ?? ""}`.trim() && stableNumber(group?.groupSize, 1) > 1)
  .sort((left, right) => stableNumber(right.groupSize, 0) - stableNumber(left.groupSize, 0))
  .slice(0, groupSmokeLimit);

const groupResults = groupSmokeGroups.map((group) => {
  const result = expandGroupEntries(defaultCatalog, group, 1);
  const missingAtlas = result.data
    .map((entry) => entry.itemId)
    .filter((itemId) => !hasDrawable(atlasByItemId.get(itemId)));
  if (result.data.length === 0) failures.push(`group '${group.groupKey}' expansion returned no visible entries`);
  if (missingAtlas.length > 0) failures.push(`group '${group.groupKey}' expansion has ${missingAtlas.length} first-page item(s) without atlas drawable`);
  if (result.elapsedMs > maxGroupExpandMs) failures.push(`group '${group.groupKey}' expansion ${result.elapsedMs.toFixed(3)}ms exceeds ${maxGroupExpandMs}ms`);
  return {
    groupKey: group.groupKey,
    groupSize: stableNumber(group.groupSize, 0),
    firstPageCount: result.data.length,
    projectedTotal: result.total,
    elapsedMs: result.elapsedMs,
    missingAtlas: missingAtlas.slice(0, 25),
  };
});

if (defaultCatalog.length <= 0) failures.push("default browser catalog projection is empty");
if (groups.length <= 0) warnings.push("browser group index is empty");
if (searchItems.length <= 0) failures.push("search pack is empty");

const report = {
  schemaVersion: "neonei/browser-page-v3-smoke/v1",
  generatedAt: new Date().toISOString(),
  distDataDir,
  source: manifest.source ?? null,
  sourceRepository: manifest.sourceRepository ?? null,
  pageSize,
  totals: {
    rawCatalogItems: catalogItems.length,
    projectedDefaultEntries: defaultCatalog.length,
    totalPages,
    groups: groups.length,
    atlasItems: atlasByItemId.size,
    searchItems: searchItems.length,
  },
  limits: { maxPageSliceMs, maxSearchMs, maxGroupExpandMs, groupSmokeLimit },
  pages: pageResults,
  searches: searchResults,
  groups: groupResults,
  failures,
  warnings,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${reportPath}`);
if (gate && failures.length > 0) process.exit(1);

