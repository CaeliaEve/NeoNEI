import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const read = (relativePath) => fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');

const globalAtlasSource = read('src/services/globalBrowserAtlas.ts');
const itemBrowserSource = read('src/composables/useItemBrowser.ts');
const browserPageProjectionLoaderSource = read('src/composables/browser/browserPageProjectionLoader.ts');
const browserHotPathSource = `${itemBrowserSource}
${browserPageProjectionLoaderSource}`;
test('global browser atlas resolves safe itemId aliases before raw image projection', () => {
  assert.match(
    globalAtlasSource,
    /const itemEntryAliases = new Map<string, BrowserAtlasItemEntry>\(\);/,
    'global atlas runtime should keep an alias map for NBT/damage variants that share an atlas sprite',
  );
  assert.match(
    globalAtlasSource,
    /function getItemIdAliases\(itemId: string\): string\[\]/,
    'global atlas runtime should derive safe aliases from item ids',
  );
  assert.match(
    globalAtlasSource,
    /const base = parts\.slice\(0, 4\)\.join\("~"\);[\s\S]*aliases\.push\(base\);/,
    'aliasing should include i~mod~name~meta for NBT variants',
  );
  assert.match(
    globalAtlasSource,
    /aliases\.push\(\[parts\[0\], parts\[1\], parts\[2\], "0"\]\.join\("~"\)\);/,
    'aliasing should include a safe meta-0 default for damaged/tool variants',
  );
  assert.match(
    globalAtlasSource,
    /export function getGlobalBrowserAtlasEntry\(\s*itemId: string,\s*renderAssetRef\?: string \| null,\s*\): BrowserAtlasItemEntry \| null \{\s*return getAtlasEntryForItemId\(itemId, renderAssetRef\);\s*\}/,
    'all canvas callers should resolve atlas entries through the alias-aware helper',
  );
});

test('global browser atlas resolves renderAssetRef and assetId before bare itemId', () => {
  assert.match(
    globalAtlasSource,
    /function itemIdFromRenderAssetRef\(renderAssetRef\?: string \| null\): string \| null/,
    'global atlas runtime should normalize nesqlpp:item/* render asset references',
  );
  assert.match(
    globalAtlasSource,
    /function getAtlasLookupKeys\(itemId\?: string \| null, renderAssetRef\?: string \| null\): string\[\]/,
    'global atlas runtime should build renderAssetRef-first lookup keys',
  );
  assert.match(
    globalAtlasSource,
    /entry\.assetId,[\s\S]*entry\.variantKey,[\s\S]*itemIdFromRenderAssetRef\(entry\.assetId\)/,
    'mergeAtlasEntries should register assetId and renderAssetRef aliases',
  );
  assert.match(
    globalAtlasSource,
    /export function getGlobalBrowserAtlasEntry\(\s*itemId: string,\s*renderAssetRef\?: string \| null,/,
    'atlas entry lookup API should accept renderAssetRef as the higher-fidelity render identity',
  );
});

test('homepage browser fast path does not rehydrate page packs once global atlas is available', () => {
  assert.match(
    browserHotPathSource,
    /source: 'native-runtime-render-worker'/,
    'locally projected pages should warm only the native resident runtime instead of page-pack media',
  );
  assert.doesNotMatch(
    browserHotPathSource,
    /getBrowserPagePackByIds|peekBrowserPagePackByIds/,
    'homepage item browser must not rehydrate projected pages through per-item page packs',
  );
});

test('global atlas is the homepage animation source of truth for indexed entries', () => {
  assert.doesNotMatch(
    globalAtlasSource,
    /shouldUseLegacyBrowserAnimationProbe/,
    'indexed browser atlas entries must not expose legacy sprite/render-contract probe hooks during page flips',
  );
});

test('global atlas runtime never performs page-scoped atlas entry hydration', () => {
  assert.equal(
    globalAtlasSource.includes('api.getBrowserAtlasEntries('),
    false,
    'global atlas coverage/warm checks should load the full resident index, not POST page-scoped atlas entries',
  );
  assert.match(
    globalAtlasSource,
    /return ensureGlobalBrowserAtlasIndex\(\);/,
    'per-page coverage probes should resolve against the full resident browser atlas index',
  );
});

test('native renderer uploads current frame textures first and warms the resident atlas in background', () => {
  const nativeSurfaceSource = read('src/components/native-surface/NativeBrowserSurface.vue');
  assert.match(
    globalAtlasSource,
    /export async function getAllGlobalBrowserAtlasTextureDescriptors\(\)/,
    'global atlas should expose the complete atlas texture descriptor set',
  );
  assert.match(
    nativeSurfaceSource,
    /getGlobalBrowserAtlasTextureDescriptorsForKeys\(textureKeys\)/,
    'native surface should upload current-frame atlas textures before rendering the first frame',
  );
  assert.match(
    nativeSurfaceSource,
    /queueResidentAtlasBackgroundUpload[\s\S]*getAllGlobalBrowserAtlasTextureDescriptors\(\)/,
    'native surface should warm the resident global atlas texture set after the first frame',
  );
  assert.doesNotMatch(
    nativeSurfaceSource,
    /getGlobalBrowserAtlasTextureDescriptorsForItems/,
    'native surface must not upload textures based only on the currently visible page',
  );
});


test('worker search projection does not hydrate per-item page packs on the homepage hot path', () => {
  const searchProjectionBlock = browserPageProjectionLoaderSource.slice(
    browserPageProjectionLoaderSource.indexOf('const buildProjectedBrowserPage'),
    browserPageProjectionLoaderSource.indexOf('const tryProjectExpandedGroupsFromLocalCaches'),
  );
  assert.notEqual(searchProjectionBlock.length, 0, 'catalog projection block should be found');
  assert.doesNotMatch(
    searchProjectionBlock,
    /getBrowserPagePackByIds|getBrowserPagePack\(/,
    'catalog projection should use resident catalog entries plus native atlas, not per-item/page-pack HTTP hydration',
  );
  assert.match(
    searchProjectionBlock,
    /mediaManifest: null,/,
    'catalog projection should leave HTTP media hydration to the resident global atlas/native renderer',
  );
});

test('homepage item browser does not fetch page packs on production paging or search defaults', () => {
  assert.doesNotMatch(
    browserHotPathSource,
    /getBrowserPagePack\(|getBrowserPagePackByIds|peekBrowserPagePackByIds/,
    'homepage paging/search should project from resident catalogs and native atlas instead of HTTP page packs',
  );
  assert.match(
    browserPageProjectionLoaderSource,
    /const loadProjectedPagePack = async/,
    'homepage should keep a catalog-projection loader for non-worker paging paths',
  );
});
