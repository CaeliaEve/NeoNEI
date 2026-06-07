import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import zlib from "node:zlib";

const repoRoot = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const publishRoot = join(repoRoot, "backend", "data", "publish");
const distDataDir = process.env.DIST_DATA_V3_DIR ? process.env.DIST_DATA_V3_DIR : null;
const explicitSearchPackPath = process.env.SEARCH_V3_PACK_PATH ? process.env.SEARCH_V3_PACK_PATH : null;
const reportDir = join(repoRoot, ".runtime-logs");
const reportPath = join(reportDir, "search-v3-benchmark.json");
const gateMode = process.argv.includes("--gate");

const limits = {
  avgQueryMs: Number(process.env.SEARCH_V3_MAX_AVG_MS ?? 8),
  p95QueryMs: Number(process.env.SEARCH_V3_MAX_P95_MS ?? 20),
  maxQueryMs: Number(process.env.SEARCH_V3_MAX_QUERY_MS ?? 50),
  maxIndexBuildMs: Number(process.env.SEARCH_V3_MAX_INDEX_BUILD_MS ?? 15000),
};

const defaultQueries = [
  { query: "iron", expectHits: true },
  { query: "tieding", expectHits: true },
  { query: "tailagang", expectHits: true },
  { query: "terra", expectHits: true },
  { query: "wand", expectHits: true },
  { query: "法杖", expectHits: true },
  { query: "thaum", expectHits: true },
  { query: "gregtech", expectHits: true },
  { query: "singularity", expectHits: true },
  { query: "rocket", expectHits: true },
];
const queries = process.env.SEARCH_V3_QUERIES
  ? process.env.SEARCH_V3_QUERIES.split(",").map((query) => ({ query: query.trim(), expectHits: true })).filter((entry) => entry.query)
  : defaultQueries;
const minItems = Number(process.env.SEARCH_V3_MIN_ITEMS ?? 10000);

const MAX_PREFIX_LENGTH = 32;
const MAX_FIELD_LENGTH_FOR_GRAMS = 96;
const MAX_TOKEN_PREFIX_LENGTH = 20;
const MAX_FIELD_TOKENS = 28;

function latestPublishDir() {
  if (explicitSearchPackPath && existsSync(explicitSearchPackPath)) {
    return distDataDir ?? repoRoot;
  }
  if (distDataDir && existsSync(distDataDir)) {
    return distDataDir;
  }
  if (!existsSync(publishRoot)) {
    throw new Error(`Publish root not found: ${publishRoot}`);
  }
  const dirs = readdirSync(publishRoot)
    .map((name) => join(publishRoot, name))
    .filter((path) => statSync(path).isDirectory())
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (dirs.length === 0) {
    throw new Error(`No publish bundles found in ${publishRoot}`);
  }
  for (const dir of dirs) {
    try {
      const packPath = findSearchPack(dir);
      const pack = loadJsonMaybeGzip(packPath);
      if (Array.isArray(pack.items) && pack.items.length > 0) {
        return dir;
      }
    } catch {
      // Keep looking for the newest usable Runtime V3 bundle.
    }
  }
  return dirs[0];
}

function loadJsonMaybeGzip(path) {
  const raw = readFileSync(path);
  const content = path.endsWith(".gz") ? zlib.gunzipSync(raw) : raw;
  return JSON.parse(content.toString("utf8"));
}

function findSearchPack(bundleDir) {
  if (explicitSearchPackPath && existsSync(explicitSearchPackPath)) {
    return explicitSearchPackPath;
  }
  const candidates = [
    join(bundleDir, "search", "all.json"),
    join(bundleDir, "search", "all.json.gz"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`No search/all.json(.gz) found in ${bundleDir}`);
}

function normalizeKeyword(value) {
  return `${value ?? ""}`.trim().toLowerCase().replace(/\s+/g, "");
}

function tokenizeSearchField(value) {
  return `${value ?? ""}`
    .trim()
    .toLowerCase()
    .split(/[\s,;|/\\()[\]{}<>:"'`，。；、（）【】《》]+/u)
    .map(normalizeKeyword)
    .filter(isUsefulSearchToken)
    .slice(0, MAX_FIELD_TOKENS);
}

function fields(entry) {
  const direct = [
    { value: entry.normalizedLocalizedName, prefixLimit: MAX_PREFIX_LENGTH, grams: true },
    { value: entry.pinyinFull, prefixLimit: MAX_PREFIX_LENGTH, grams: true },
    { value: entry.pinyinAcronym, prefixLimit: MAX_PREFIX_LENGTH, grams: false },
    { value: entry.normalizedInternalName, prefixLimit: MAX_PREFIX_LENGTH, grams: true },
    { value: entry.normalizedItemId, prefixLimit: 16, grams: false },
  ].map((field) => ({ ...field, value: normalizeKeyword(field.value) })).filter((field) => field.value);
  const tokenized = [
    ...tokenizeSearchField(entry.aliases),
    ...tokenizeSearchField(entry.normalizedSearchTerms),
  ].map((value) => ({ value, prefixLimit: MAX_TOKEN_PREFIX_LENGTH, grams: value.length <= 32 }));
  const byValue = new Map();
  for (const field of [...direct, ...tokenized]) {
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

function isUsefulSearchToken(value) {
  if (!value) return false;
  if (value.length > 64) return false;
  if (value.includes("==")) return false;
  if (value.startsWith("fallback:")) return false;
  if (value.startsWith("item:i~")) return false;
  if ((value.match(/~/g) ?? []).length > 2) return false;
  if (/^[a-z0-9_-]{22,}$/i.test(value) && /[0-9_-]/.test(value)) return false;
  return true;
}

function append(index, key, sourceIndex) {
  if (!key) return;
  const existing = index.get(key);
  if (existing) {
    if (existing[existing.length - 1] !== sourceIndex) existing.push(sourceIndex);
    return;
  }
  index.set(key, [sourceIndex]);
}

function buildIndexes(pack) {
  const startedAt = performance.now();
  const exact = new Map();
  const prefix = new Map();
  const gram = new Map();
  for (let sourceIndex = 0; sourceIndex < pack.length; sourceIndex += 1) {
    const seen = new Set();
    for (const fieldConfig of fields(pack[sourceIndex])) {
      const field = fieldConfig.value;
      const exactKey = `exact:${field}`;
      if (!seen.has(exactKey)) {
        seen.add(exactKey);
        append(exact, field, sourceIndex);
      }
      const maxPrefix = Math.min(fieldConfig.prefixLimit, field.length);
      for (let length = 1; length <= maxPrefix; length += 1) {
        const key = `prefix:${field.slice(0, length)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        append(prefix, field.slice(0, length), sourceIndex);
      }
      if (!fieldConfig.grams) continue;
      const gramSource = field.slice(0, MAX_FIELD_LENGTH_FOR_GRAMS);
      const gramLengths = field.length <= 2 ? [field.length] : [1, 2, 3];
      for (const gramLength of gramLengths) {
        if (gramLength <= 0 || gramSource.length < gramLength) continue;
        for (let offset = 0; offset <= gramSource.length - gramLength; offset += 1) {
          const value = gramSource.slice(offset, offset + gramLength);
          const key = `gram:${value}`;
          if (seen.has(key)) continue;
          seen.add(key);
          append(gram, value, sourceIndex);
        }
      }
    }
  }
  return {
    exact,
    prefix,
    gram,
    elapsedMs: performance.now() - startedAt,
  };
}

function rank(entry, normalized) {
  const aliases = entry.aliases || "";
  if (entry.normalizedLocalizedName === normalized) return 0;
  if (entry.pinyinFull === normalized) return 1;
  if (entry.pinyinAcronym === normalized) return 2;
  if (aliases === normalized) return 3;
  if (entry.normalizedInternalName === normalized) return 4;
  if (entry.normalizedItemId === normalized) return 5;
  if (entry.normalizedSearchTerms === normalized) return 6;
  if (entry.normalizedLocalizedName?.startsWith(normalized)) return 10;
  if (entry.pinyinFull?.startsWith(normalized)) return 11;
  if (entry.pinyinAcronym?.startsWith(normalized)) return 12;
  if (aliases.startsWith(normalized)) return 13;
  if (entry.normalizedInternalName?.startsWith(normalized)) return 14;
  if (entry.normalizedSearchTerms?.startsWith(normalized)) return 15;
  if (entry.normalizedItemId?.startsWith(normalized)) return 16;
  if (entry.normalizedLocalizedName?.includes(normalized)) return 20;
  if (entry.pinyinFull?.includes(normalized)) return 21;
  if (entry.pinyinAcronym?.includes(normalized)) return 22;
  if (aliases.includes(normalized)) return 23;
  if (entry.normalizedInternalName?.includes(normalized)) return 24;
  if (entry.normalizedSearchTerms?.includes(normalized)) return 25;
  if (entry.normalizedItemId?.includes(normalized)) return 26;
  return null;
}

function percentile(values, pct) {
  const numeric = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (numeric.length <= 0) return 0;
  const index = Math.min(numeric.length - 1, Math.max(0, Math.ceil((pct / 100) * numeric.length) - 1));
  return numeric[index];
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function intersect(left, right) {
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

function queryGrams(normalized) {
  if (!normalized) return [];
  if (normalized.length <= 2) return [normalized];
  const grams = new Set();
  for (let offset = 0; offset <= normalized.length - 3; offset += 1) {
    grams.add(normalized.slice(offset, offset + 3));
  }
  return Array.from(grams);
}

function queryIndexed(pack, indexes, query, pageSize = 80) {
  const startedAt = performance.now();
  const normalized = normalizeKeyword(query);
  const direct = [
    ...(indexes.exact.get(normalized) ?? []),
    ...(indexes.prefix.get(normalized) ?? []),
  ];
  let gramCandidates = [];
  for (const gram of queryGrams(normalized)) {
    const indexed = indexes.gram.get(gram) ?? [];
    if (indexed.length === 0) {
      gramCandidates = [];
      break;
    }
    gramCandidates = gramCandidates.length === 0 ? indexed : intersect(gramCandidates, indexed);
    if (gramCandidates.length === 0) break;
  }
  const candidateIndexes = uniqueSorted([...direct, ...gramCandidates]);
  const ranked = candidateIndexes
    .map((sourceIndex) => ({ entry: pack[sourceIndex], sourceIndex, rank: rank(pack[sourceIndex], normalized) }))
    .filter((entry) => entry.rank !== null)
    .sort((left, right) => (
      left.rank - right.rank
      || left.entry.searchRank - right.entry.searchRank
      || right.entry.popularityScore - left.entry.popularityScore
      || left.sourceIndex - right.sourceIndex
    ));
  return {
    query,
    elapsedMs: performance.now() - startedAt,
    candidates: candidateIndexes.length,
    total: ranked.length,
    firstIds: ranked.slice(0, pageSize).map(({ entry }) => entry.itemId),
  };
}

const bundleDir = latestPublishDir();
const searchPackPath = findSearchPack(bundleDir);
const payload = loadJsonMaybeGzip(searchPackPath);
const pack = payload.items ?? [];
const indexes = buildIndexes(pack);
const results = queries.map(({ query }) => queryIndexed(pack, indexes, query));
const failures = [];
const warnings = [];

for (const queryConfig of queries) {
  const result = results.find((entry) => entry.query === queryConfig.query);
  if (!result) continue;
  if (queryConfig.expectHits && result.total <= 0) {
    failures.push(`Expected query "${queryConfig.query}" to return hits`);
  }
  if (!queryConfig.expectHits && result.total <= 0) {
    warnings.push(`Probe query "${queryConfig.query}" returned no hits (${queryConfig.note ?? "non-blocking"})`);
  }
}

const queryTimings = results.map((entry) => entry.elapsedMs);
const summary = {
  p50QueryElapsedMs: percentile(queryTimings, 50),
  p95QueryElapsedMs: percentile(queryTimings, 95),
  maxQueryElapsedMs: Math.max(...queryTimings),
  avgQueryElapsedMs: queryTimings.reduce((sum, entry) => sum + entry, 0) / Math.max(1, queryTimings.length),
};

if (gateMode) {
  if (summary.avgQueryElapsedMs > limits.avgQueryMs) {
    failures.push(`Average query time ${summary.avgQueryElapsedMs.toFixed(2)}ms exceeds ${limits.avgQueryMs}ms`);
  }
  if (summary.p95QueryElapsedMs > limits.p95QueryMs) {
    failures.push(`P95 query time ${summary.p95QueryElapsedMs.toFixed(2)}ms exceeds ${limits.p95QueryMs}ms`);
  }
  if (summary.maxQueryElapsedMs > limits.maxQueryMs) {
    failures.push(`Max query time ${summary.maxQueryElapsedMs.toFixed(2)}ms exceeds ${limits.maxQueryMs}ms`);
  }
  if (indexes.elapsedMs > limits.maxIndexBuildMs) {
    failures.push(`Index build time ${indexes.elapsedMs.toFixed(2)}ms exceeds ${limits.maxIndexBuildMs}ms`);
  }
  if (pack.length < minItems) {
    failures.push(`Search pack has only ${pack.length} items`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  gateMode,
  limits,
  minItems,
  bundleDir,
  searchPackPath,
  itemCount: pack.length,
  indexBuildElapsedMs: indexes.elapsedMs,
  indexSizes: {
    exact: indexes.exact.size,
    prefix: indexes.prefix.size,
    gram: indexes.gram.size,
  },
  results,
  summary,
  warnings,
  failures,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...summary, warnings, failures }, null, 2));
console.log(`Wrote ${reportPath}`);

if (gateMode && failures.length > 0) {
  process.exitCode = 1;
}
