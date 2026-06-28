import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSource = fs.readFileSync(path.join(frontendRoot, 'src/services/distDataBrowserRuntime.ts'), 'utf8').replace(/\r\n/g, '\n');
const distDataSource = fs.readFileSync(path.join(frontendRoot, 'src/services/distDataRuntime.ts'), 'utf8').replace(/\r\n/g, '\n');

test('dist-data browser runtime pre-sorts search packs once per browser runtime', () => {
  assert.match(runtimeSource, /sortedSearchEntries: BrowserSearchPackEntry\[]/);
  assert.match(runtimeSource, /export function buildSortedSearchEntries\(searchPackItems: BrowserSearchPackEntry\[]\)/);
  assert.match(runtimeSource, /for \(const searchEntry of runtime\.sortedSearchEntries\)/);
  assert.match(distDataSource, /sortedSearchEntries: buildSortedSearchEntries\(searchPack\?\.pack\.items \?\? \[]\)/);

  const buildSearchIndex = runtimeSource.indexOf('export function buildSearchCatalog');
  assert.notEqual(buildSearchIndex, -1, 'buildSearchCatalog must exist');
  const buildSearchBody = runtimeSource.slice(buildSearchIndex);
  assert.doesNotMatch(buildSearchBody, /\[\.\.\.searchPackItems\]\.sort/, 'search hot path must not sort the full pack per query');
  assert.doesNotMatch(buildSearchBody, /sortedSearchEntriesBySignature/, 'search hot path must not use weak signature cache keys');
  assert.doesNotMatch(buildSearchBody, /searchPackItems/, 'search hot path must not keep per-query pack input plumbing');
});
