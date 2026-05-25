import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const repoRoot = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const reportDir = join(repoRoot, ".runtime-logs");
const reportPath = join(reportDir, "browser-v3-benchmark.json");
const gateMode = process.argv.includes("--gate");

const limits = {
  maxPageMs: Number(process.env.BROWSER_V3_MAX_PAGE_MS ?? 8),
  maxSearchPageMs: Number(process.env.BROWSER_V3_MAX_SEARCH_PAGE_MS ?? 90),
  maxBuildMs: Number(process.env.BROWSER_V3_MAX_BUILD_MS ?? 350),
};

const ITEM_COUNT = Number(process.env.BROWSER_V3_SYNTHETIC_ITEMS ?? 120000);
const PAGE_SIZE = Number(process.env.BROWSER_V3_PAGE_SIZE ?? 80);

function makeItem(index) {
  const grouped = index % 11 === 0;
  const groupKey = grouped ? `group:${Math.floor(index / 11)}` : null;
  return {
    itemId: `i~mod${index % 90}~item_${index}~0`,
    modId: `mod${index % 90}`,
    internalName: `item_${index}`,
    localizedName: index % 97 === 0 ? `Terrasteel Sample ${index}` : `Synthetic Item ${index}`,
    renderAssetRef: `nesqlpp:item/i~mod${index % 90}~item_${index}~0`,
    browserOrder: index,
    groupKey,
    groupLabel: groupKey ? `Grouped Item ${Math.floor(index / 11)}` : null,
    groupSize: groupKey ? 11 : 1,
    representativeItemId: groupKey ? `i~mod${(Math.floor(index / 11) * 11) % 90}~item_${Math.floor(index / 11) * 11}~0` : null,
  };
}

function normalize(value) {
  return `${value ?? ""}`.trim().toLowerCase().replace(/\s+/g, "");
}

function buildRuntime(count) {
  const startedAt = performance.now();
  const catalog = Array.from({ length: count }, (_, index) => makeItem(index));
  const itemById = new Map();
  const groupByKey = new Map();
  const emittedGroups = new Set();
  const defaultCatalog = [];

  for (const entry of catalog) {
    const item = {
      itemId: entry.itemId,
      modId: entry.modId,
      internalName: entry.internalName,
      localizedName: entry.localizedName,
      renderAssetRef: entry.renderAssetRef,
      browserGroupKey: entry.groupKey,
      browserGroupLabel: entry.groupLabel,
      browserGroupSize: entry.groupSize,
    };
    itemById.set(item.itemId, item);
    if (entry.groupKey && entry.groupSize > 1) {
      if (!groupByKey.has(entry.groupKey)) {
        groupByKey.set(entry.groupKey, { groupKey: entry.groupKey, memberItemIds: [] });
      }
      groupByKey.get(entry.groupKey).memberItemIds.push(item.itemId);
      if (entry.representativeItemId !== item.itemId || emittedGroups.has(entry.groupKey)) {
        continue;
      }
      emittedGroups.add(entry.groupKey);
      defaultCatalog.push({
        key: `collapsed:${entry.groupKey}`,
        kind: "group-collapsed",
        group: {
          key: entry.groupKey,
          representative: item,
          size: entry.groupSize,
          visibleCount: 1,
          expandable: true,
          label: entry.groupLabel,
        },
      });
      continue;
    }
    defaultCatalog.push({ key: item.itemId, kind: "item", item });
  }

  return {
    elapsedMs: performance.now() - startedAt,
    catalog,
    itemById,
    groupByKey,
    defaultCatalog,
  };
}

function page(entries, pageNumber) {
  const startedAt = performance.now();
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, pageNumber));
  const start = (page - 1) * PAGE_SIZE;
  const data = entries.slice(start, start + PAGE_SIZE);
  return {
    page,
    totalPages,
    total: entries.length,
    data,
    elapsedMs: performance.now() - startedAt,
  };
}

function search(entries, query) {
  const startedAt = performance.now();
  const needle = normalize(query);
  const filtered = entries.filter((entry) => {
    const item = entry.kind === "item" ? entry.item : entry.group.representative;
    return normalize(item.localizedName).includes(needle)
      || normalize(item.internalName).includes(needle)
      || normalize(item.itemId).includes(needle);
  });
  return {
    data: filtered,
    elapsedMs: performance.now() - startedAt,
  };
}

const runtime = buildRuntime(ITEM_COUNT);
const pageProbes = [1, 2, 10, 50, 100, 250, 500, 1000]
  .filter((pageNumber) => pageNumber <= Math.ceil(runtime.defaultCatalog.length / PAGE_SIZE))
  .map((pageNumber) => page(runtime.defaultCatalog, pageNumber));
const searchProjection = search(runtime.defaultCatalog, "terrasteel");
const searchPage = page(searchProjection.data, 1);

const summary = {
  itemCount: ITEM_COUNT,
  projectedEntryCount: runtime.defaultCatalog.length,
  buildElapsedMs: runtime.elapsedMs,
  maxPageElapsedMs: Math.max(...pageProbes.map((entry) => entry.elapsedMs)),
  avgPageElapsedMs: pageProbes.reduce((sum, entry) => sum + entry.elapsedMs, 0) / Math.max(1, pageProbes.length),
  searchProjectionElapsedMs: searchProjection.elapsedMs,
  searchPageElapsedMs: searchPage.elapsedMs,
  pageProbes: pageProbes.map((entry) => ({ page: entry.page, elapsedMs: entry.elapsedMs, itemCount: entry.data.length })),
  warnings: [],
  failures: [],
};

if (summary.buildElapsedMs > limits.maxBuildMs) {
  summary.failures.push(`browser catalog projection ${summary.buildElapsedMs.toFixed(2)}ms exceeds ${limits.maxBuildMs}ms`);
}
if (summary.maxPageElapsedMs > limits.maxPageMs) {
  summary.failures.push(`browser page slice ${summary.maxPageElapsedMs.toFixed(2)}ms exceeds ${limits.maxPageMs}ms`);
}
if ((summary.searchProjectionElapsedMs + summary.searchPageElapsedMs) > limits.maxSearchPageMs) {
  summary.failures.push(`browser search projection ${(summary.searchProjectionElapsedMs + summary.searchPageElapsedMs).toFixed(2)}ms exceeds ${limits.maxSearchPageMs}ms`);
}

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote ${reportPath}`);

if (gateMode && summary.failures.length > 0) {
  process.exit(1);
}
