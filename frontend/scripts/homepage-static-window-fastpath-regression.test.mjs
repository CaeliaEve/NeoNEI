import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const apiSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/api.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('published browser windows are cached in-memory so overlapping hot-window flips do not refetch the same static bundle asset', () => {
  assert.equal(
    apiSource.includes('const publishedJsonValueCache = new Map<string, unknown>();'),
    true,
    'api should keep a memory cache for published static JSON assets',
  );
  assert.equal(
    apiSource.includes('const publishedJsonInFlight = new Map<string, Promise<unknown>>();'),
    true,
    'api should deduplicate concurrent published static asset fetches',
  );
  assert.equal(
    apiSource.includes('if (publishedJsonValueCache.has(url)) {\n    return publishedJsonValueCache.get(url) as T;\n  }'),
    true,
    'published static asset reads should short-circuit to the in-memory cache on repeat hits',
  );
  assert.equal(
    apiSource.includes("setCacheWithLimit(publishedJsonValueCache, url, payload, CACHE_LIMITS.publishedJson);"),
    true,
    'published static asset responses should be retained inside a bounded LRU-style cache',
  );
});

test('browser window resolution prefers already-warm published windows before considering colder overlapping candidates', () => {
  assert.equal(
    apiSource.includes('function isPublishedJsonWarm(assetPath: string | null | undefined): boolean {'),
    true,
    'api should expose a warmness probe for published static windows',
  );
  assert.equal(
    apiSource.includes('const warmDelta = Number(isPublishedJsonWarm(right.path)) - Number(isPublishedJsonWarm(left.path));'),
    true,
    'window selection should bias toward already warmed published static windows',
  );
  assert.equal(
    apiSource.includes('const trailingSlackDelta = rightTrailingSlack - leftTrailingSlack;'),
    true,
    'when multiple windows cover the same request, selection should prefer the one with more forward coverage for upcoming flips',
  );
});
