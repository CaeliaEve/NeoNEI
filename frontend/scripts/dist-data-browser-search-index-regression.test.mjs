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

test('dist-data browser runtime owns by-id browser pack cache', () => {
  assert.match(runtimeSource, /byIdsPackByScope: Map<string, BrowserByIdsPackResponse>/);
  assert.match(runtimeSource, /export function normalizeBrowserByIdsItemIds\(/);
  assert.match(runtimeSource, /export function getBrowserByIdsPackScopeKey\(/);
  assert.match(runtimeSource, /export function buildBrowserByIdsPack\(/);
  assert.match(runtimeSource, /runtime\.byIdsPackByScope\.get\(scopeKey\)/);
  assert.match(runtimeSource, /runtime\.byIdsPackByScope\.set\(scopeKey, byIdsPack\)/);
  assert.match(distDataSource, /byIdsPackByScope: new Map\(\)/);
  assert.match(distDataSource, /return buildBrowserByIdsPack\(runtime, itemIds\)/);

  const byIdsIndex = distDataSource.indexOf('export async function getDistDataBrowserPagePackByIds');
  assert.notEqual(byIdsIndex, -1, 'getDistDataBrowserPagePackByIds must exist');
  const byIdsBody = distDataSource.slice(byIdsIndex, distDataSource.indexOf('export async function getDistDataGroupItems'));
  assert.doesNotMatch(byIdsBody, /new Set<string>\(\)/, 'by-id route must not own dedupe state');
  assert.doesNotMatch(byIdsBody, /runtime\.itemById\.get/, 'by-id route must not map item ids outside runtime cache');
  assert.doesNotMatch(byIdsBody, /buildResourceManifest\(/, 'by-id route must not derive resource manifests outside runtime cache');
});

test('dist-data browser runtime owns group item member window cache', () => {
  assert.match(runtimeSource, /groupItemsByScope: Map<string, BrowserGroupItemsResponse \| null>/);
  assert.match(runtimeSource, /export function getBrowserGroupItemsScopeKey\(/);
  assert.match(runtimeSource, /export function buildBrowserGroupItems\(/);
  assert.match(runtimeSource, /runtime\.groupItemsByScope\.has\(scopeKey\)/);
  assert.match(runtimeSource, /runtime\.groupItemsByScope\.set\(scopeKey, response\)/);
  assert.match(distDataSource, /groupItemsByScope: new Map\(\)/);
  assert.match(distDataSource, /return buildBrowserGroupItems\(runtime, groupKey, modId, includeHidden\)/);

  const groupItemsIndex = distDataSource.indexOf('export async function getDistDataGroupItems');
  assert.notEqual(groupItemsIndex, -1, 'getDistDataGroupItems must exist');
  const groupItemsBody = distDataSource.slice(groupItemsIndex, distDataSource.indexOf('async function getRustRuntimeManifest'));
  assert.doesNotMatch(groupItemsBody, /memberItemsByGroupKey/, 'group route must not directly read group member indexes');
  assert.doesNotMatch(groupItemsBody, /hiddenItemIds/, 'group route must not directly filter hidden items');
  assert.doesNotMatch(groupItemsBody, /filterByModId\(/, 'group route must not own mod filtering');
});
