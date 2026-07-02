import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
  parseNativeBrowserBin,
  parseNativeGroupsBin,
  parseNativeSearchBin,
  parseNativeTexturesBin,
} from "./native-runtime-pack-reader.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDataDir = resolve(process.env.DIST_DATA_V3_DIR || join(repoRoot, "backend", "public", "dist-data"));
const reportDir = join(repoRoot, ".runtime-logs");
const reportPath = join(reportDir, "browser-page-v3-smoke.json");
const gate = process.argv.includes("--gate");
const pageSize = Math.max(1, Math.floor(Number(process.env.BROWSER_PAGE_SMOKE_PAGE_SIZE ?? 50)));
const pageSpec = `${process.env.BROWSER_PAGE_SMOKE_PAGES ?? "1,40,53,100,last"}`;
const searchSpec = `${process.env.BROWSER_PAGE_SMOKE_SEARCHES ?? "iron,wand,singularity"}`;
const maxPageSliceMs = Number(process.env.BROWSER_PAGE_SMOKE_MAX_SLICE_MS ?? 4);
const maxPageP95Ms = Number(process.env.BROWSER_PAGE_SMOKE_MAX_P95_MS ?? maxPageSliceMs);
const maxSearchMs = Number(process.env.BROWSER_PAGE_SMOKE_MAX_SEARCH_MS ?? 50);
const maxSearchP95Ms = Number(process.env.BROWSER_PAGE_SMOKE_MAX_SEARCH_P95_MS ?? maxSearchMs);
const groupSmokeLimit = Math.max(0, Math.floor(Number(process.env.BROWSER_GROUP_SMOKE_LIMIT ?? 8)));
const maxGroupExpandMs = Number(process.env.BROWSER_GROUP_SMOKE_MAX_EXPAND_MS ?? 8);
const maxGroupFacetFilterMs = Number(process.env.BROWSER_GROUP_SMOKE_MAX_FACET_FILTER_MS ?? 8);

function percentile(values, pct) {
  const numeric = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (numeric.length <= 0) return 0;
  const index = Math.min(numeric.length - 1, Math.max(0, Math.ceil((pct / 100) * numeric.length) - 1));
  return numeric[index];
}

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

function buildGroupIndex(entries) {
  const index = new Map();
  entries.forEach((entry, position) => {
    if (entry?.kind === "group-collapsed" && entry.groupKey && !index.has(entry.groupKey)) {
      index.set(entry.groupKey, position);
    }
  });
  return index;
}

function projectExpandedGroupWindow(defaultEntries, groupIndex, memberItemIds, page) {
  if (groupIndex < 0) {
    return { data: defaultEntries.slice((Math.max(1, page) - 1) * pageSize, Math.max(1, page) * pageSize), total: defaultEntries.length };
  }
  const members = Array.isArray(memberItemIds) ? memberItemIds : [];
  const start = (Math.max(1, page) - 1) * pageSize;
  const end = start + pageSize;
  const total = defaultEntries.length - 1 + members.length;
  const data = [];
  for (let projectedIndex = start; projectedIndex < Math.min(end, total); projectedIndex += 1) {
    if (projectedIndex < groupIndex) {
      data.push(defaultEntries[projectedIndex]);
      continue;
    }
    const memberIndex = projectedIndex - groupIndex;
    if (memberIndex < members.length) {
      const itemId = members[memberIndex];
      data.push({ key: itemId, kind: "item", itemId });
      continue;
    }
    const defaultIndex = projectedIndex - members.length + 1;
    if (defaultEntries[defaultIndex]) data.push(defaultEntries[defaultIndex]);
  }
  return { data, total };
}

function expandGroupEntries(defaultEntries, group, groupIndexByKey, page = 1) {
  const startedAt = performance.now();
  const groupKey = `${group?.groupKey ?? ""}`.trim();
  const members = Array.isArray(group?.memberItemIds) ? group.memberItemIds.filter(Boolean) : [];
  const groupIndex = groupIndexByKey.get(groupKey) ?? -1;
  const projected = projectExpandedGroupWindow(defaultEntries, groupIndex, members, page);
  return {
    data: projected.data,
    total: groupIndex >= 0 ? projected.total : defaultEntries.length,
    elapsedMs: performance.now() - startedAt,
  };
}

function groupMemberSearchText(itemId, searchByItemId, searchTextByItemId) {
  const precomputed = searchTextByItemId.get(itemId);
  if (precomputed !== undefined) return precomputed;
  const entry = searchByItemId.get(itemId);
  if (!entry) return normalize(itemId);
  return [
    entry.localizedName,
    entry.normalizedLocalizedName,
    entry.normalizedInternalName,
    entry.normalizedItemId,
    entry.normalizedSearchTerms,
    entry.facetSummary,
    entry.family,
    entry.classification,
    entry.groupLabel,
  ].map(normalize).filter(Boolean).join(" ");
}

function pickFacetFilterNeedle(group, searchByItemId) {
  const members = Array.isArray(group?.memberItemIds) ? group.memberItemIds.filter(Boolean) : [];
  for (const itemId of members.slice(0, 256)) {
    const entry = searchByItemId.get(itemId);
    const sourceText = `${entry?.facetSummary ?? ""} ${entry?.normalizedSearchTerms ?? ""} ${entry?.localizedName ?? ""}`;
    const token = sourceText
      .split(/[^0-9A-Za-z\u4e00-\u9fff]+/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3 && !/^semantic$/i.test(part) && !/^classified$/i.test(part))
      .sort((left, right) => left.length - right.length)[0];
    if (token) return token;
  }
  return "";
}

function candidateIndexesForNeedle(indexes, needle) {
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
  return Array.from(new Set([...direct, ...gramCandidates])).sort((left, right) => left - right);
}

function intersectSortedLimited(left, right, limit = Number.POSITIVE_INFINITY) {
  const result = [];
  let count = 0;
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      count += 1;
      if (result.length < limit) result.push(left[i]);
      i += 1;
      j += 1;
    } else if (left[i] < right[j]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return { result, count };
}

function appendSortedUnique(map, key, value) {
  if (!key || !Number.isInteger(value)) return;
  const existing = map.get(key);
  if (existing) {
    if (existing[existing.length - 1] !== value) existing.push(value);
    return;
  }
  map.set(key, [value]);
}

function buildGroupFacetTokenIndex(groupSmokeGroups, searchIndexByItemId, searchByItemId, searchTextByItemId) {
  return new Map(groupSmokeGroups.map((group) => {
    const tokenIndex = new Map();
    for (const itemId of Array.isArray(group.memberItemIds) ? group.memberItemIds : []) {
      const searchIndex = searchIndexByItemId.get(itemId);
      if (!Number.isInteger(searchIndex)) continue;
      const entry = searchByItemId.get(itemId);
      const text = [
        entry?.facetSummary,
        entry?.normalizedSearchTerms,
        entry?.localizedName,
        searchTextByItemId.get(itemId),
      ].map(normalize).filter(Boolean).join(" ");
      for (const token of text.split(/[^0-9A-Za-z\u4e00-\u9fff]+/u).filter(Boolean)) {
        appendSortedUnique(tokenIndex, token, searchIndex);
        for (const gram of queryGrams(token)) {
          appendSortedUnique(tokenIndex, gram, searchIndex);
        }
      }
    }
    return [group.groupKey, tokenIndex];
  }));
}

function filterExpandedGroupEntries(defaultEntries, group, groupIndexByKey, groupSearchIndexByKey, groupFacetTokenIndexByKey, searchItems, searchIndexes, searchByItemId, searchTextByItemId, query, page = 1) {
  const startedAt = performance.now();
  const groupKey = `${group?.groupKey ?? ""}`.trim();
  const members = Array.isArray(group?.memberItemIds) ? group.memberItemIds.filter(Boolean) : [];
  const needles = normalize(query).split(/\s+/).filter(Boolean);
  const end = Math.max(1, page) * pageSize;
  const filteredPageMembers = [];
  let filteredMembersCount = 0;
  if (needles.length === 0) {
    filteredMembersCount = members.length;
    filteredPageMembers.push(...members);
  } else if (needles.length === 1 && groupSearchIndexByKey.has(groupKey)) {
    const needle = needles[0];
    const memberIndexes = groupSearchIndexByKey.get(groupKey);
    const candidates = groupFacetTokenIndexByKey.get(groupKey)?.get(needle)
      ?? candidateIndexesForNeedle(searchIndexes, needle);
    const filtered = intersectSortedLimited(memberIndexes, candidates, end);
    filteredMembersCount = filtered.count;
    filteredPageMembers.push(...filtered.result.map((index) => searchItems[index]?.itemId).filter(Boolean));
  } else {
    for (const itemId of members) {
      const text = groupMemberSearchText(itemId, searchByItemId, searchTextByItemId);
      let matched = true;
      for (const needle of needles) {
        if (!text.includes(needle)) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;
      filteredPageMembers.push(itemId);
      filteredMembersCount += 1;
    }
  }
  const groupIndex = groupIndexByKey.get(groupKey) ?? -1;
  const projected = projectExpandedGroupWindow(defaultEntries, groupIndex, filteredPageMembers, page);
  return {
    query,
    filteredMembers: filteredMembersCount,
    data: projected.data,
    total: groupIndex >= 0 ? projected.total : defaultEntries.length,
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
    entry.facetSummary,
    entry.family,
    entry.classification,
    entry.groupLabel,
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
  const candidateIndexes = candidateIndexesForNeedle(indexes, needle);
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
const rustBrowserPack = parseNativeBrowserBin(distDataDir, files.rustBrowserBin, { optional: true });
const rustGroupPack = parseNativeGroupsBin(distDataDir, files.rustGroupsBin, { optional: true });
const rustTexturePack = parseNativeTexturesBin(distDataDir, files.rustTextureBin, { optional: true });
const rustSearchPack = parseNativeSearchBin(distDataDir, files.rustSearchBin, { optional: true });
const nativeRuntimeSourceFailures = [];
function requireNativePayload(name, pack, member, expectedPath) {
  if (Array.isArray(pack?.[member]) && pack[member].length > 0) return pack;
  nativeRuntimeSourceFailures.push(`${name} missing ${expectedPath}`);
  return member === "groups" ? { groups: [] } : { items: [] };
}
const catalogPayload = requireNativePayload("browser", rustBrowserPack, "items", files.rustBrowserBin ?? "rust/browser.bin");
const groupsPayload = requireNativePayload("groups", rustGroupPack, "groups", files.rustGroupsBin ?? "rust/groups.bin");
const atlasPayload = requireNativePayload("atlas", rustTexturePack, "items", files.rustTextureBin ?? "rust/textures.bin");
const searchPayload = requireNativePayload("search", rustSearchPack, "items", files.rustSearchBin ?? "rust/search.bin");
const runtimeSources = {
  browser: files.rustBrowserBin ?? "rust/browser.bin",
  groups: files.rustGroupsBin ?? "rust/groups.bin",
  atlas: files.rustTextureBin ?? "rust/textures.bin",
  search: files.rustSearchBin ?? "rust/search.bin",
};

const catalogItems = Array.isArray(catalogPayload.items) ? catalogPayload.items : [];
const groups = Array.isArray(groupsPayload.groups) ? groupsPayload.groups : [];
const searchItems = Array.isArray(searchPayload.items) ? searchPayload.items : [];
const searchByItemId = new Map(searchItems
  .filter((entry) => entry?.itemId)
  .map((entry) => [entry.itemId, entry]));
const searchTextByItemId = new Map(searchItems
  .filter((entry) => entry?.itemId)
  .map((entry) => [entry.itemId, [
    entry.localizedName,
    entry.normalizedLocalizedName,
    entry.normalizedInternalName,
    entry.normalizedItemId,
    entry.normalizedSearchTerms,
    entry.facetSummary,
    entry.family,
    entry.classification,
    entry.groupLabel,
  ].map(normalize).filter(Boolean).join(" ")]));
const atlasByItemId = new Map((atlasPayload.items ?? [])
  .filter((entry) => entry?.itemId)
  .map((entry) => [entry.itemId, entry]));
const groupsByKey = new Map(groups
  .filter((group) => group?.groupKey)
  .map((group) => [group.groupKey, group]));

const defaultCatalog = buildDefaultCatalog(catalogItems, groupsByKey);
const groupIndexByKey = buildGroupIndex(defaultCatalog);
const totalPages = Math.max(1, Math.ceil(defaultCatalog.length / pageSize));
const pages = resolvePages(totalPages);
const failures = [];
const warnings = [];
if (gate && nativeRuntimeSourceFailures.length > 0) {
  failures.push(`browser page smoke must use native rust runtime packs in gate mode: ${nativeRuntimeSourceFailures.join(", ")}`);
}

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
const searchIndexByItemId = new Map(searchItems.map((entry, index) => [entry.itemId, index]));
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
const groupSearchIndexByKey = new Map(groupSmokeGroups.map((group) => [
  group.groupKey,
  (Array.isArray(group.memberItemIds) ? group.memberItemIds : [])
    .map((itemId) => searchIndexByItemId.get(itemId))
    .filter((index) => Number.isInteger(index))
    .sort((left, right) => left - right),
]));
const groupFacetTokenIndexByKey = buildGroupFacetTokenIndex(
  groupSmokeGroups,
  searchIndexByItemId,
  searchByItemId,
  searchTextByItemId,
);

const groupResults = groupSmokeGroups.map((group) => {
  const result = expandGroupEntries(defaultCatalog, group, groupIndexByKey, 1);
  const missingAtlas = result.data
    .map((entry) => entry.itemId)
    .filter((itemId) => !hasDrawable(atlasByItemId.get(itemId)));
  if (result.data.length === 0) failures.push(`group '${group.groupKey}' expansion returned no visible entries`);
  if (missingAtlas.length > 0) failures.push(`group '${group.groupKey}' expansion has ${missingAtlas.length} first-page item(s) without atlas drawable`);
  if (result.elapsedMs > maxGroupExpandMs) failures.push(`group '${group.groupKey}' expansion ${result.elapsedMs.toFixed(3)}ms exceeds ${maxGroupExpandMs}ms`);
  const facetNeedle = pickFacetFilterNeedle(group, searchByItemId);
  const facetFilter = facetNeedle
    ? filterExpandedGroupEntries(defaultCatalog, group, groupIndexByKey, groupSearchIndexByKey, groupFacetTokenIndexByKey, searchItems, searchIndexes, searchByItemId, searchTextByItemId, facetNeedle, 1)
    : null;
  const facetMissingAtlas = facetFilter
    ? facetFilter.data
      .map((entry) => entry.itemId)
      .filter((itemId) => !hasDrawable(atlasByItemId.get(itemId)))
    : [];
  if (!facetNeedle) {
    warnings.push(`group '${group.groupKey}' has no usable facet filter smoke token`);
  } else {
    if (facetFilter.filteredMembers <= 0) failures.push(`group '${group.groupKey}' facet filter '${facetNeedle}' returned no members`);
    if (facetMissingAtlas.length > 0) failures.push(`group '${group.groupKey}' facet filter '${facetNeedle}' has ${facetMissingAtlas.length} first-page item(s) without atlas drawable`);
    if (facetFilter.elapsedMs > maxGroupFacetFilterMs) failures.push(`group '${group.groupKey}' facet filter ${facetFilter.elapsedMs.toFixed(3)}ms exceeds ${maxGroupFacetFilterMs}ms`);
  }
  return {
    groupKey: group.groupKey,
    groupSize: stableNumber(group.groupSize, 0),
    firstPageCount: result.data.length,
    projectedTotal: result.total,
    elapsedMs: result.elapsedMs,
    missingAtlas: missingAtlas.slice(0, 25),
    facetFilter: facetFilter ? {
      query: facetFilter.query,
      filteredMembers: facetFilter.filteredMembers,
      firstPageCount: facetFilter.data.length,
      projectedTotal: facetFilter.total,
      elapsedMs: facetFilter.elapsedMs,
      missingAtlas: facetMissingAtlas.slice(0, 25),
    } : null,
  };
});

if (defaultCatalog.length <= 0) failures.push("default browser catalog projection is empty");
if (groups.length <= 0) warnings.push("browser group index is empty");
if (searchItems.length <= 0) failures.push("search pack is empty");

const pageTimings = pageResults.map((entry) => entry.elapsedMs);
const searchTimings = searchResults.map((entry) => entry.elapsedMs);
const timingSummary = {
  pageP50Ms: percentile(pageTimings, 50),
  pageP95Ms: percentile(pageTimings, 95),
  pageMaxMs: pageTimings.length ? Math.max(...pageTimings) : 0,
  searchP50Ms: percentile(searchTimings, 50),
  searchP95Ms: percentile(searchTimings, 95),
  searchMaxMs: searchTimings.length ? Math.max(...searchTimings) : 0,
};
if (timingSummary.pageP95Ms > maxPageP95Ms) failures.push(`browser page p95 ${timingSummary.pageP95Ms.toFixed(3)}ms exceeds ${maxPageP95Ms}ms`);
if (timingSummary.searchP95Ms > maxSearchP95Ms) failures.push(`browser search p95 ${timingSummary.searchP95Ms.toFixed(3)}ms exceeds ${maxSearchP95Ms}ms`);

const report = {
  schemaVersion: "neonei/browser-page-v3-smoke/v1",
  generatedAt: new Date().toISOString(),
  distDataDir,
  source: manifest.source ?? null,
  sourceRepository: manifest.sourceRepository ?? null,
  pageSize,
  runtimeSources,
  timingSummary,
  totals: {
    rawCatalogItems: catalogItems.length,
    projectedDefaultEntries: defaultCatalog.length,
    totalPages,
    groups: groups.length,
    atlasItems: atlasByItemId.size,
    searchItems: searchItems.length,
  },
  limits: { maxPageSliceMs, maxPageP95Ms, maxSearchMs, maxSearchP95Ms, maxGroupExpandMs, maxGroupFacetFilterMs, groupSmokeLimit },
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
