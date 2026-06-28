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

test('dist-data browser runtime indexes catalogs by mod id before scoped catalog queries', () => {
  assert.match(runtimeSource, /catalogByModId: Map<string, DistDataBrowserItem\[]>/);
  assert.match(runtimeSource, /advancedCatalogByModId: Map<string, DistDataBrowserItem\[]>/);
  assert.match(runtimeSource, /export function buildCatalogByModId\(/);
  assert.match(runtimeSource, /return \(includeHidden \? runtime\.advancedCatalogByModId : runtime\.catalogByModId\)\.get\(scope\) \?\? \[]/);
  assert.match(distDataSource, /catalogByModId: buildCatalogByModId\(catalog, itemById\)/);
  assert.match(distDataSource, /advancedCatalogByModId: buildCatalogByModId\(advancedCatalog, itemById\)/);

  const buildDefaultIndex = runtimeSource.indexOf('export function buildDefaultCatalog');
  assert.notEqual(buildDefaultIndex, -1, 'buildDefaultCatalog must exist');
  const buildDefaultBody = runtimeSource.slice(buildDefaultIndex, runtimeSource.indexOf('export function expandCatalogGroups'));
  assert.doesNotMatch(buildDefaultBody, /filterByModId\(item, modId\)/, 'scoped default catalog must not scan all mods then filter each item');
});

test('dist-data browser runtime precomputes mods for home bootstrap', () => {
  assert.match(runtimeSource, /mods: Mod\[]/);
  assert.match(distDataSource, /runtime\.mods = buildModsFromRuntime\(runtime\)/);
  assert.match(distDataSource, /mods: runtime\.mods/);

  const homeBootstrapIndex = distDataSource.indexOf('export async function getDistDataHomeBootstrap');
  assert.notEqual(homeBootstrapIndex, -1, 'getDistDataHomeBootstrap must exist');
  const homeBootstrapBody = distDataSource.slice(homeBootstrapIndex, distDataSource.indexOf('export async function getDistDataBrowserPagePack'));
  assert.doesNotMatch(homeBootstrapBody, /buildModsFromRuntime\(runtime\)/, 'home bootstrap must use runtime-owned precomputed mods');
});

test('dist-data browser runtime owns browser page pack cache by normalized scope', () => {
  assert.match(runtimeSource, /pagePackByScope: Map<string, BrowserPagePackResponse>/);
  assert.match(runtimeSource, /export function getBrowserPagePackScopeKey\(/);
  assert.match(runtimeSource, /export function buildBrowserPagePack\(/);
  assert.match(runtimeSource, /runtime\.pagePackByScope\.get\(scopeKey\)/);
  assert.match(runtimeSource, /runtime\.pagePackByScope\.set\(scopeKey, pagePack\)/);
  assert.match(distDataSource, /pagePackByScope: new Map\(\)/);
  assert.match(distDataSource, /return buildBrowserPagePack\(runtime, params\)/);

  const pagePackIndex = distDataSource.indexOf('export async function getDistDataBrowserPagePack');
  assert.notEqual(pagePackIndex, -1, 'getDistDataBrowserPagePack must exist');
  const pagePackBody = distDataSource.slice(pagePackIndex, distDataSource.indexOf('export async function getDistDataBrowserPagePackByIds'));
  assert.doesNotMatch(pagePackBody, /expandCatalogGroups\(/, 'page route must not expand groups outside runtime page-pack cache');
  assert.doesNotMatch(pagePackBody, /paginateBrowserEntries\(/, 'page route must not paginate outside runtime page-pack cache');
  assert.doesNotMatch(pagePackBody, /buildResourceManifest\(/, 'page route must not derive resource manifests outside runtime page-pack cache');
});
