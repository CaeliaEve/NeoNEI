import type { BrowserSearchPackEntry } from "../services/api";

type SearchPackPayload = {
  version: number;
  total: number;
  items: BrowserSearchPackEntry[];
};

type InitMessage = {
  type: "init";
  payload: SearchPackPayload;
};

type AppendMessage = {
  type: "append";
  payload: SearchPackPayload;
};

type QueryMessage = {
  type: "query";
  id: number;
  payload: {
    query: string;
    modId?: string;
    page: number;
    pageSize: number;
  };
};

type RequestMessage = InitMessage | AppendMessage | QueryMessage;

type QueryResult = {
  id: number;
  total: number;
  totalPages: number;
  page: number;
  itemIds: string[];
  entries: BrowserSearchPackEntry[];
  elapsedMs: number;
  candidateCount: number;
  indexReady: boolean;
};

type RankedSearchEntry = {
  entry: BrowserSearchPackEntry;
  sourceIndex: number;
  rank: number;
};

type CachedSearchResultSet = {
  total: number;
  candidateCount: number;
  entries: BrowserSearchPackEntry[];
};

function getSearchDisplayItemId(entry: BrowserSearchPackEntry): string {
  const groupKey = `${entry.groupKey ?? ""}`.trim();
  const representativeItemId = `${entry.representativeItemId ?? ""}`.trim();
  const groupSize = Number(entry.groupSize ?? 1);
  if (groupKey && representativeItemId && Number.isFinite(groupSize) && groupSize > 1) {
    return representativeItemId;
  }
  return entry.itemId;
}

function resolveDisplayEntry(entry: BrowserSearchPackEntry): BrowserSearchPackEntry {
  const displayItemId = getSearchDisplayItemId(entry);
  if (displayItemId === entry.itemId) {
    return entry;
  }
  const displayIndex = sourceIndexByItemId.get(displayItemId);
  const displayEntry = typeof displayIndex === "number" ? searchPack[displayIndex] : null;
  if (displayEntry) {
    return displayEntry;
  }
  return {
    ...entry,
    itemId: displayItemId,
    normalizedItemId: normalizeKeyword(displayItemId),
  };
}

let searchPack: BrowserSearchPackEntry[] = [];
let sourceIndexByItemId = new Map<string, number>();
let exactIndex = new Map<string, number[]>();
let prefixIndex = new Map<string, number[]>();
let gramIndex = new Map<string, number[]>();
let indexedItemCount = 0;
let searchIndexVersion = 0;
const queryResultCache = new Map<string, Omit<QueryResult, "id" | "elapsedMs">>();
const queryResultSetCache = new Map<string, CachedSearchResultSet>();

const MAX_PREFIX_LENGTH = 32;
const MAX_FIELD_LENGTH_FOR_GRAMS = 96;
const MAX_TOKEN_PREFIX_LENGTH = 20;
const MAX_FIELD_TOKENS = 28;
const MAX_QUERY_RESULT_CACHE = 160;
const MAX_QUERY_RESULT_SET_CACHE = 48;

function appendIndexValue(index: Map<string, number[]>, key: string, sourceIndex: number): void {
  if (!key) return;
  const existing = index.get(key);
  if (existing) {
    const previous = existing[existing.length - 1];
    if (previous !== sourceIndex) {
      existing.push(sourceIndex);
    }
    return;
  }
  index.set(key, [sourceIndex]);
}

type SearchFieldConfig = {
  value: string;
  prefixLimit: number;
  grams: boolean;
};

function getEntrySearchFields(entry: BrowserSearchPackEntry): SearchFieldConfig[] {
  const directFields = [
    { value: entry.normalizedLocalizedName, prefixLimit: MAX_PREFIX_LENGTH, grams: true },
    { value: entry.pinyinFull, prefixLimit: MAX_PREFIX_LENGTH, grams: true },
    { value: entry.pinyinAcronym, prefixLimit: MAX_PREFIX_LENGTH, grams: false },
    { value: entry.normalizedInternalName, prefixLimit: MAX_PREFIX_LENGTH, grams: true },
    { value: entry.normalizedItemId, prefixLimit: 16, grams: false },
  ]
    .map((field) => ({ ...field, value: normalizeKeyword(`${field.value ?? ""}`) }))
    .filter((field) => Boolean(field.value));
  const tokenizedFields = [
    ...tokenizeSearchField(entry.aliases),
    ...tokenizeSearchField(entry.normalizedSearchTerms),
  ].map((value) => ({ value, prefixLimit: MAX_TOKEN_PREFIX_LENGTH, grams: value.length <= 32 }));
  const byValue = new Map<string, SearchFieldConfig>();
  for (const field of [...directFields, ...tokenizedFields]) {
    const existing = byValue.get(field.value);
    if (!existing || field.prefixLimit > existing.prefixLimit || field.grams) {
      byValue.set(field.value, {
        value: field.value,
        prefixLimit: Math.max(existing?.prefixLimit ?? 0, field.prefixLimit),
        grams: Boolean(existing?.grams || field.grams),
      });
    }
  }
  return Array.from(byValue.values());
}

function addEntryToIndex(entry: BrowserSearchPackEntry, sourceIndex: number): void {
  sourceIndexByItemId.set(entry.itemId, sourceIndex);
  const seenKeys = new Set<string>();

  for (const fieldConfig of getEntrySearchFields(entry)) {
    const field = fieldConfig.value;
    if (!field || seenKeys.has(`exact:${field}`)) {
      continue;
    }
    seenKeys.add(`exact:${field}`);
    appendIndexValue(exactIndex, field, sourceIndex);

    const maxPrefixLength = Math.min(fieldConfig.prefixLimit, field.length);
    for (let length = 1; length <= maxPrefixLength; length += 1) {
      const prefix = field.slice(0, length);
      const key = `prefix:${prefix}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      appendIndexValue(prefixIndex, prefix, sourceIndex);
    }

    if (!fieldConfig.grams) continue;
    const gramSource = field.slice(0, MAX_FIELD_LENGTH_FOR_GRAMS);
    const gramLengths = field.length <= 2 ? [field.length] : [1, 2, 3];
    for (const gramLength of gramLengths) {
      if (gramLength <= 0 || gramSource.length < gramLength) continue;
      for (let offset = 0; offset <= gramSource.length - gramLength; offset += 1) {
        const gram = gramSource.slice(offset, offset + gramLength);
        const key = `gram:${gram}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        appendIndexValue(gramIndex, gram, sourceIndex);
      }
    }
  }
}

function rebuildIndexes(): void {
  sourceIndexByItemId = new Map<string, number>();
  exactIndex = new Map<string, number[]>();
  prefixIndex = new Map<string, number[]>();
  gramIndex = new Map<string, number[]>();
  searchPack.forEach((entry, sourceIndex) => addEntryToIndex(entry, sourceIndex));
  indexedItemCount = searchPack.length;
  searchIndexVersion += 1;
  queryResultCache.clear();
  queryResultSetCache.clear();
}

function ensureIndexReady(): void {
  if (indexedItemCount !== searchPack.length) {
    rebuildIndexes();
  }
}

function mergeEntries(base: BrowserSearchPackEntry[], incoming: BrowserSearchPackEntry[]): BrowserSearchPackEntry[] {
  if (base.length === 0) return [...incoming];
  if (incoming.length === 0) return [...base];

  const seen = new Set(base.map((entry) => entry.itemId));
  const merged = [...base];
  for (const entry of incoming) {
    if (seen.has(entry.itemId)) continue;
    seen.add(entry.itemId);
    merged.push(entry);
  }
  return merged;
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function tokenizeSearchField(value: unknown): string[] {
  return `${value ?? ""}`
    .trim()
    .toLowerCase()
    .split(/[\s,;|/\\()[\]{}<>:"'`，。；、（）【】《》]+/u)
    .map((token) => normalizeKeyword(token))
    .filter(isUsefulSearchToken)
    .slice(0, MAX_FIELD_TOKENS);
}

function isUsefulSearchToken(value: string): boolean {
  if (!value) return false;
  if (value.length > 64) return false;
  if (value.includes("==")) return false;
  if (value.startsWith("fallback:")) return false;
  if (value.startsWith("item:i~")) return false;
  if ((value.match(/~/g) ?? []).length > 2) return false;
  if (/^[a-z0-9_-]{22,}$/i.test(value) && /[0-9_-]/.test(value)) return false;
  return true;
}

function rankEntry(entry: BrowserSearchPackEntry, normalized: string): number | null {
  if (!normalized) return null;

  const aliases = entry.aliases || "";
  if (entry.normalizedLocalizedName === normalized) return 0;
  if (entry.pinyinFull === normalized) return 1;
  if (entry.pinyinAcronym === normalized) return 2;
  if (aliases === normalized) return 3;
  if (entry.normalizedInternalName === normalized) return 4;
  if (entry.normalizedItemId === normalized) return 5;
  if (entry.normalizedSearchTerms === normalized) return 6;

  if (entry.normalizedLocalizedName.startsWith(normalized)) return 10;
  if (entry.pinyinFull.startsWith(normalized)) return 11;
  if (entry.pinyinAcronym.startsWith(normalized)) return 12;
  if (aliases.startsWith(normalized)) return 13;
  if (entry.normalizedInternalName.startsWith(normalized)) return 14;
  if (entry.normalizedSearchTerms.startsWith(normalized)) return 15;
  if (entry.normalizedItemId.startsWith(normalized)) return 16;

  if (entry.normalizedLocalizedName.includes(normalized)) return 20;
  if (entry.pinyinFull.includes(normalized)) return 21;
  if (entry.pinyinAcronym.includes(normalized)) return 22;
  if (aliases.includes(normalized)) return 23;
  if (entry.normalizedInternalName.includes(normalized)) return 24;
  if (entry.normalizedSearchTerms.includes(normalized)) return 25;
  if (entry.normalizedItemId.includes(normalized)) return 26;

  return null;
}

function compareRankedEntry(left: RankedSearchEntry, right: RankedSearchEntry): number {
  return left.rank - right.rank
    || left.entry.searchRank - right.entry.searchRank
    || right.entry.popularityScore - left.entry.popularityScore
    || left.sourceIndex - right.sourceIndex;
}

function queryPack(message: QueryMessage): QueryResult {
  const startedAt = performance.now();
  ensureIndexReady();
  const normalized = normalizeKeyword(message.payload.query);
  const normalizedModId = `${message.payload.modId ?? ""}`.trim();
  const pageSize = Math.min(Math.max(1, Math.floor(message.payload.pageSize || 50)), 500);
  const requestedPage = Math.max(1, Math.floor(message.payload.page || 1));
  const cacheKey = `${searchIndexVersion}\u0001${normalized}\u0001${normalizedModId || "all"}\u0001${requestedPage}\u0001${pageSize}`;
  const cached = queryResultCache.get(cacheKey);
  if (cached) {
    queryResultCache.delete(cacheKey);
    queryResultCache.set(cacheKey, cached);
    return {
      ...cached,
      id: message.id,
      elapsedMs: performance.now() - startedAt,
    };
  }

  const resultSet = getCachedSearchResultSet(normalized, normalizedModId);
  const total = resultSet.total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const pageEntries = resultSet.entries.slice(offset, offset + pageSize);
  const itemIds = pageEntries.map((entry) => entry.itemId);

  const resultWithoutTiming: Omit<QueryResult, "id" | "elapsedMs"> = {
    total,
    totalPages,
    page,
    itemIds,
    entries: pageEntries,
    candidateCount: resultSet.candidateCount,
    indexReady: indexedItemCount === searchPack.length,
  };
  queryResultCache.set(cacheKey, resultWithoutTiming);
  while (queryResultCache.size > MAX_QUERY_RESULT_CACHE) {
    const oldestKey = queryResultCache.keys().next().value;
    if (!oldestKey) break;
    queryResultCache.delete(oldestKey);
  }

  return {
    ...resultWithoutTiming,
    id: message.id,
    elapsedMs: performance.now() - startedAt,
  };
}

function getCachedSearchResultSet(normalized: string, normalizedModId: string): CachedSearchResultSet {
  const cacheKey = `${searchIndexVersion}\u0001${normalized}\u0001${normalizedModId || "all"}`;
  const cached = queryResultSetCache.get(cacheKey);
  if (cached) {
    queryResultSetCache.delete(cacheKey);
    queryResultSetCache.set(cacheKey, cached);
    return cached;
  }

  const candidateIndexes = collectCandidateIndexes(normalized);
  const bestByDisplayItemId = new Map<string, RankedSearchEntry>();
  for (const sourceIndex of candidateIndexes) {
    const entry = searchPack[sourceIndex];
    if (!entry) continue;
    if (normalizedModId && normalizedModId !== "all" && entry.modId !== normalizedModId) continue;
    const rank = rankEntry(entry, normalized);
    if (rank === null) continue;
    const displayEntry = resolveDisplayEntry(entry);
    const displayItemId = getSearchDisplayItemId(entry);
    const displaySourceIndex = sourceIndexByItemId.get(displayEntry.itemId) ?? sourceIndex;
    const ranked = { entry: displayEntry, sourceIndex: displaySourceIndex, rank };
    const previous = bestByDisplayItemId.get(displayItemId);
    if (!previous || compareRankedEntry(ranked, previous) < 0) {
      bestByDisplayItemId.set(displayItemId, ranked);
    }
  }

  const rankedEntries = Array.from(bestByDisplayItemId.values()).sort(compareRankedEntry);
  const resultSet: CachedSearchResultSet = {
    total: rankedEntries.length,
    candidateCount: candidateIndexes.length,
    entries: rankedEntries.map((entry) => entry.entry),
  };

  queryResultSetCache.set(cacheKey, resultSet);
  while (queryResultSetCache.size > MAX_QUERY_RESULT_SET_CACHE) {
    const oldestKey = queryResultSetCache.keys().next().value;
    if (!oldestKey) break;
    queryResultSetCache.delete(oldestKey);
  }
  return resultSet;
}

function toUniqueSortedIndexes(values: Iterable<number>): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function intersectSortedIndexes(left: number[], right: number[]): number[] {
  const result: number[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftValue = left[leftIndex];
    const rightValue = right[rightIndex];
    if (leftValue === rightValue) {
      result.push(leftValue);
      leftIndex += 1;
      rightIndex += 1;
    } else if (leftValue < rightValue) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }
  return result;
}

function collectQueryGrams(normalized: string): string[] {
  if (!normalized) return [];
  if (normalized.length <= 2) return [normalized];
  const grams = new Set<string>();
  for (let offset = 0; offset <= normalized.length - 3; offset += 1) {
    grams.add(normalized.slice(offset, offset + 3));
  }
  return Array.from(grams);
}

function collectCandidateIndexes(normalized: string): number[] {
  if (!normalized) {
    return [];
  }

  const directCandidates = [
    ...(exactIndex.get(normalized) ?? []),
    ...(prefixIndex.get(normalized) ?? []),
  ];

  const grams = collectQueryGrams(normalized);
  let gramCandidates: number[] = [];
  for (const gram of grams) {
    const indexed = gramIndex.get(gram) ?? [];
    if (indexed.length === 0) {
      gramCandidates = [];
      break;
    }
    gramCandidates = gramCandidates.length === 0
      ? indexed
      : intersectSortedIndexes(gramCandidates, indexed);
    if (gramCandidates.length === 0) {
      break;
    }
  }

  return toUniqueSortedIndexes([
    ...directCandidates,
    ...gramCandidates,
  ]);
}

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    searchPack = message.payload.items || [];
    rebuildIndexes();
    return;
  }

  if (message.type === "append") {
    searchPack = mergeEntries(searchPack, message.payload.items || []);
    rebuildIndexes();
    return;
  }

  if (message.type === "query") {
    const result = queryPack(message);
    self.postMessage(result);
  }
};
