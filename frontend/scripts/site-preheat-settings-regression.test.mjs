import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const homePageSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/views/HomePage.vue',
  'utf8',
).replace(/\r\n/g, '\n');

const preheaterSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useSitePreheater.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const apiSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/api.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('homepage settings expose staged site-preheat controls and cache maintenance actions', () => {
  assert.equal(
    homePageSource.includes("useSitePreheater"),
    true,
    'homepage should wire in the dedicated site preheater composable',
  );
  assert.equal(
    homePageSource.includes("startPreheat('quick')"),
    true,
    'settings should expose a quick preheat action',
  );
  assert.equal(
    homePageSource.includes("startPreheat('deep')"),
    true,
    'settings should expose a deep preheat action',
  );
  assert.equal(
    homePageSource.includes("startPreheat('full')"),
    true,
    'settings should expose a full-site preheat action',
  );
  assert.equal(
    homePageSource.includes('stopPreheat'),
    true,
    'settings should allow users to stop a running preheat pass',
  );
  assert.equal(
    homePageSource.includes('clearPreheatCaches'),
    true,
    'settings should allow users to clear persisted preheat caches',
  );
});

test('site preheater differentiates quick, deep, and full warm plans instead of one monolithic mode', () => {
  assert.equal(
    preheaterSource.includes('const MODE_SPECS: Record<SitePreheatMode, SitePreheatModeSpec> = {'),
    true,
    'site preheater should centralize its mode definitions',
  );
  assert.equal(
    preheaterSource.includes('browserPageLimit: "all"'),
    true,
    'full mode should be able to preheat the entire browser page universe',
  );
  assert.equal(
    preheaterSource.includes('warmRecipeShards: true'),
    true,
    'full mode should escalate into deeper recipe warm coverage',
  );
  assert.equal(
    preheaterSource.includes('recipeCoverageHint'),
    true,
    'site preheater should explain the practical coverage of the current export bundle to the user',
  );
});

test('site preheater and recipe router tolerate recipes that do not have a dedicated UI payload route', () => {
  assert.equal(
    apiSource.includes('const missingUiPayloadCache = new Set<string>();'),
    true,
    'api layer should negative-cache missing recipe UI payloads so unsupported recipes do not keep throwing 404s',
  );
  assert.equal(
    apiSource.includes('async getOptionalRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload | null> {'),
    true,
    'api layer should expose a nullable recipe UI payload accessor for optional render-contract families',
  );
  assert.equal(
    preheaterSource.includes('await api.getOptionalRecipeUiPayload(recipeId);'),
    true,
    'site preheater should skip over recipes that do not publish a dedicated UI payload instead of failing the whole warmup pass',
  );
});

test('full-site preheat stays memory-bounded by batching work and trimming heavyweight runtime caches between chunks', () => {
  assert.equal(
    preheaterSource.includes('async function runConcurrentBatched<T>('),
    true,
    'site preheater should process the biggest warm stages in bounded batches instead of one giant pass',
  );
  assert.equal(
    preheaterSource.includes('await flushPreheatMemory('),
    true,
    'site preheater should explicitly release heavy in-memory state between warmup chunks',
  );
  assert.equal(
    apiSource.includes('trimPreheatRuntimeCaches(): void {'),
    true,
    'api layer should expose a targeted runtime-cache trim for long-running preheat passes',
  );
  assert.equal(
    apiSource.includes('recipeBootstrapSearchPack: 96'),
    true,
    'recipe bootstrap search-pack cache should be bounded so a full preheat cannot grow without limit',
  );
});
