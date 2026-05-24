# NeoNEI Runtime V3 Contracts

Branch: `rebuild/neonei-runtime-v3`

This file is the implementation anchor for the approved major rebuild plan. It defines the first contracts that NeoNEI will consume while NESQL++ and the future compiler move toward raw-export and compiled runtime bundles.

## 1. Search Core V3 Hot Path

Search must follow this path after runtime warmup:

```text
search input
  -> SearchWorkerV3 / browserSearch.worker
  -> resident in-memory index lookup
  -> itemIds + compact item metadata
  -> local page projection
  -> HomeCanvasGrid
  -> global atlas draw
```

Forbidden in the search hot path:

- `/items/browser/search-catalog`
- `/items/browser/page-pack`
- per-item PNG/GIF fetches
- full `searchPack.filter().map().sort()` scans
- silent fallback to low-performance network paths

## 2. Current Transitional Search Payload

Until the compiler emits binary indexes, the worker consumes the existing published search pack:

```ts
type BrowserSearchPackEntry = {
  itemId: string;
  localizedName: string;
  modId: string;
  normalizedLocalizedName: string;
  normalizedInternalName: string;
  normalizedItemId: string;
  normalizedSearchTerms: string;
  pinyinFull: string;
  pinyinAcronym: string;
  aliases: string;
  popularityScore: number;
  searchRank: number;
};
```

The worker now builds resident indexes from this payload:

- exact index
- prefix index
- gram candidate index

The next compiler-backed version should replace this JSON payload with compact arrays/binary files while preserving the same query semantics.

## 3. Search Result Contract

Worker query result must include:

```ts
type SearchResult = {
  total: number;
  totalPages: number;
  page: number;
  itemIds: string[];
  entries: BrowserSearchPackEntry[];
  elapsedMs: number;
  candidateCount: number;
  indexReady: boolean;
};
```

`entries` intentionally carries enough compact metadata for the homepage browser to render immediately without a page-pack request.

## 4. Runtime Telemetry

Every search query should emit perf marks:

- `search-worker-ready`
- `search-worker-full-hydrated`
- `browser-search-worker-query`
- `browser-search-worker-query-full`
- `browser-search-local-page`

Acceptance targets:

- Search p50 < 60ms after full worker hydration.
- Search p95 < 120ms after full worker hydration.
- No backend search/page-pack request in the hot path.

## 5. Next Compiler Output Targets

The future compiler should produce:

```text
search/
  manifest.json
  item-metadata.bin
  exact-index.bin
  prefix-index.bin
  gram-index.bin
  pinyin-index.bin
  acronym-index.bin
  mod-buckets.bin
  rank-table.bin
```

The frontend should then replace the transitional JSON indexing stage with zero-copy/typed-array backed lookup.

