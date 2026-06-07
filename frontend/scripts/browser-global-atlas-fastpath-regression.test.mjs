import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');

const globalAtlasSource = read('frontend/src/services/globalBrowserAtlas.ts');
const itemBrowserSource = read('frontend/src/composables/useItemBrowser.ts');
const canvasGridSource = read('frontend/src/components/HomeCanvasGrid.vue');

test('global browser atlas resolves safe itemId aliases before falling back to raw images', () => {
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
    'aliasing should include a safe meta-0 fallback for damaged/tool variants',
  );
  assert.match(
    globalAtlasSource,
    /export function getGlobalBrowserAtlasEntry\(itemId: string\): BrowserAtlasItemEntry \| null \{\s*return getAtlasEntryForItemId\(itemId\);\s*\}/,
    'all canvas callers should resolve atlas entries through the alias-aware helper',
  );
});

test('homepage browser fast path does not rehydrate page packs once global atlas is available', () => {
  assert.match(
    itemBrowserSource,
    /if \(hasGlobalBrowserAtlas\(\)\) \{\s*return null;\s*\}/,
    'locally projected pages should skip /items/browser/by-ids-pack hydration when global atlas is active',
  );
  assert.match(
    canvasGridSource,
    /if \(hasGlobalBrowserAtlas\(\) && getGlobalBrowserAtlasEntry\(item\.itemId\)\) \{\s*return null;\s*\}/,
    'canvas grid should not preload per-item fallback images for items represented by the global atlas',
  );
  assert.match(
    canvasGridSource,
    /if \(hasGlobalBrowserAtlas\(\) && getGlobalBrowserAtlasEntry\(item\.itemId\)\) \{\s*return;\s*\}/,
    'static image warmup should skip atlas-covered entries',
  );
});

test('global atlas is the homepage animation source of truth for indexed entries', () => {
  assert.match(
    globalAtlasSource,
    /export function shouldUseLegacyBrowserAnimationProbe\(itemId: string\): boolean \{[\s\S]*return false;[\s\S]*\}/,
    'indexed browser atlas entries should not trigger legacy sprite/render-contract probes during page flips',
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

test('native renderer uploads all global atlas textures instead of the current page only', () => {
  const nativeSurfaceSource = read('frontend/src/components/native-surface/NativeBrowserSurface.vue');
  assert.match(
    globalAtlasSource,
    /export async function getAllGlobalBrowserAtlasTextureDescriptors\(\)/,
    'global atlas should expose the complete atlas texture descriptor set',
  );
  assert.match(
    nativeSurfaceSource,
    /const textures = await getAllGlobalBrowserAtlasTextureDescriptors\(\);/,
    'native surface should load the resident global atlas texture set',
  );
  assert.doesNotMatch(
    nativeSurfaceSource,
    /getGlobalBrowserAtlasTextureDescriptorsForItems/,
    'native surface must not upload textures based only on the currently visible page',
  );
});
