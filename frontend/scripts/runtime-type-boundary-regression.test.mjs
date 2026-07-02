import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiSource = fs.readFileSync('src/services/api.ts', 'utf8').replace(/\r\n/g, '\n');
const runtimeTypesSource = fs.readFileSync('src/runtime/types.ts', 'utf8').replace(/\r\n/g, '\n');
const manifestClientSource = fs.readFileSync('src/runtime/manifestClient.ts', 'utf8').replace(/\r\n/g, '\n');
const publishClientSource = fs.readFileSync('src/runtime/publishClient.ts', 'utf8').replace(/\r\n/g, '\n');
const recipeClientSource = fs.readFileSync('src/runtime/recipeClient.ts', 'utf8').replace(/\r\n/g, '\n');
const browserClientSource = fs.readFileSync('src/runtime/browserClient.ts', 'utf8').replace(/\r\n/g, '\n');
const browserCatalogClientSource = fs.readFileSync('src/runtime/browserCatalogClient.ts', 'utf8').replace(/\r\n/g, '\n');
const searchClientSource = fs.readFileSync('src/runtime/searchClient.ts', 'utf8').replace(/\r\n/g, '\n');
const textureClientSource = fs.readFileSync('src/runtime/textureClient.ts', 'utf8').replace(/\r\n/g, '\n');
const browserProjectionSource = fs.readFileSync('src/runtime/browserProjection.ts', 'utf8').replace(/\r\n/g, '\n');
const browserSearchProjectionSource = fs.readFileSync('src/runtime/browserSearchProjection.ts', 'utf8').replace(/\r\n/g, '\n');
const patternRuntimeClientExists = fs.existsSync('src/runtime/patternClient.ts');
const devCompatRuntimeClientExists = fs.existsSync('src/runtime/devCompatClient.ts');
const adminControlClientSource = fs.readFileSync('src/control/adminControlClient.ts', 'utf8').replace(/\r\n/g, '\n');
const labControlClientExists = fs.existsSync('src/control/labControlClient.ts');
const patternControlClientSource = fs.readFileSync('src/control/patternControlClient.ts', 'utf8').replace(/\r\n/g, '\n');
const specialDataClientSource = fs.readFileSync('src/runtime/specialDataClient.ts', 'utf8').replace(/\r\n/g, '\n');
const indexedRecipeClientSource = fs.readFileSync('src/runtime/indexedRecipeClient.ts', 'utf8').replace(/\r\n/g, '\n');
const itemClientExists = fs.existsSync('src/runtime/itemClient.ts');
const itemClientSource = itemClientExists ? fs.readFileSync('src/runtime/itemClient.ts', 'utf8').replace(/\r\n/g, '\n') : '';
const itemTooltipSource = fs.readFileSync('src/components/ItemTooltip.vue', 'utf8').replace(/\r\n/g, '\n');
const recipeViewSource = fs.readFileSync('src/views/RecipeView.vue', 'utf8').replace(/\r\n/g, '\n');
const homePageSource = fs.readFileSync('src/views/HomePage.vue', 'utf8').replace(/\r\n/g, '\n');
const homeSettingsPanelSource = fs.readFileSync('src/components/home/HomeSettingsPanel.vue', 'utf8').replace(/\r\n/g, '\n');
const patternGroupSource = fs.readFileSync('src/components/PatternGroup.vue', 'utf8').replace(/\r\n/g, '\n');
const animationBudgetSource = fs.readFileSync('src/services/animationBudget.ts', 'utf8').replace(/\r\n/g, '\n');
const gatecFinalSource = fs.readFileSync('scripts/gatec-final.spec.ts', 'utf8').replace(/\r\n/g, '\n');
const distDataRuntimeSource = fs.readFileSync('src/services/distDataRuntime.ts', 'utf8').replace(/\\r\\n/g, '\\n');
const runtimeSessionSource = fs.readFileSync('src/services/api/runtimeSession.ts', 'utf8').replace(/\\r\\n/g, '\\n');
const runtimeFacadeSource = fs.readFileSync('src/services/api/runtimeFacade.ts', 'utf8').replace(/\\r\\n/g, '\\n');
const apiCompatibilityFacadeSource = apiSource + '\n' + runtimeFacadeSource;

test('public runtime manifest types live outside the legacy api facade', () => {
  assert.equal(
    runtimeTypesSource.includes('export interface PublicRuntimeManifest'),
    true,
    'runtime/types.ts should own the public runtime manifest contract',
  );
  assert.equal(
    runtimeTypesSource.includes('export interface PublishStaticBundleManifest'),
    true,
    'runtime/types.ts should own publish bundle metadata contracts',
  );
  assert.doesNotMatch(
    apiSource,
    /export interface PublicRuntimeManifest \{/,
    'services/api.ts should not re-own the runtime manifest interface',
  );
  assert.equal(
    apiSource.includes('export type {\n  AnimatedAtlasAssetEntry'),
    true,
    'services/api.ts should only re-export runtime types for compatibility',
  );
});

test('runtime clients consume runtime manifest types directly', () => {
  assert.match(
    manifestClientSource,
    /import type \{[^}]*PublicRuntimeManifest[^}]*\} from '\.\/types';/s,
    'manifest client should import runtime manifest type from runtime/types',
  );
  assert.match(
    recipeClientSource,
    /import type \{[^}]*PublicRuntimeManifest[^}]*\} from '\.\/types';/s,
    'recipe runtime client should import runtime manifest type from runtime/types',
  );
  assert.doesNotMatch(
    recipeClientSource,
    /import type \{[^}]*PublicRuntimeManifest[^}]*\} from '\.\.\/services\/api'/,
    'recipe runtime client should not import PublicRuntimeManifest from the legacy api facade',
  );
  assert.doesNotMatch(
    recipeClientSource,
    /from '\.\.\/services\/api'/,
    'recipe runtime client should not import contract types from the legacy api facade',
  );
  assert.match(
    recipeClientSource,
    /import type \{[^}]*RecipeBootstrapPayload[^}]*RecipeUiPayload[^}]*\} from '\.\/types';/s,
    'recipe runtime client should import recipe payload types from runtime/types',
  );
  assert.doesNotMatch(
    recipeClientSource,
    /from '\.\/devCompatClient'|getRecipeBootstrap[A-Za-z]*Compat|getLabPayload<RecipeBootstrap|\/recipe-bootstrap\//,
    'recipe runtime client should expose compiled runtime path helpers only',
  );
  assert.doesNotMatch(
    runtimeSessionSource,
    /preferLive|shouldPreferLiveRecipeBootstrap|VITE_PREFER_LIVE_RECIPE_BOOTSTRAP/,
    'runtime session should not keep a live lab bootstrap preference switch',
  );
});

test('publish runtime client is static-asset only for public runtime bootstrap', () => {
  assert.equal(
    publishClientSource.includes('createPublishedJsonClient'),
    true,
    'publish client should own static published JSON reads',
  );
  assert.doesNotMatch(
    publishClientSource,
    /from '\.\/devCompatClient'|getHomeBootstrapCompat|\/publish\/home-bootstrap/,
    'publish client should not expose a home-bootstrap lab fallback',
  );
  assert.doesNotMatch(
    runtimeSessionSource,
    /getHomeBootstrapCompat|\/publish\/home-bootstrap/,
    'runtime session should not route home bootstrap misses to lab compatibility',
  );
});

test('browser runtime contracts live outside the legacy api facade', () => {
  for (const token of [
    'export type BrowserGridEntry',
    'export interface BrowserPagePackResponse',
    'export interface BrowserSearchPackResponse',
    'export interface BrowserAtlasIndexResponse',
    'export interface PaginatedResponse<T>',
  ]) {
    assert.equal(runtimeTypesSource.includes(token), true, `missing runtime browser type: ${token}`);
  }
  for (const token of [
    'export interface BrowserVariantGroup {',
    'export interface BrowserSearchPackEntry {',
    'export interface BrowserAtlasIndexResponse {',
  ]) {
    assert.equal(apiSource.includes(token), false, `services/api.ts should not re-own ${token}`);
  }
});

test('browser/search/texture runtime clients consume browser contracts from runtime/types', () => {
  assert.equal(browserClientSource.includes("} from './types';"), true);
  assert.equal(searchClientSource.includes("from './types';"), true);
  assert.equal(textureClientSource.includes("from './types';"), true);
  assert.doesNotMatch(browserClientSource, /from '\.\.\/services\/api'/);
  assert.doesNotMatch(searchClientSource, /from '\.\.\/services\/api'/);
  assert.doesNotMatch(textureClientSource, /from '\.\.\/services\/api'/);
});

test('browser runtime hot path has no lab compatibility reads', () => {
  for (const token of [
    'getItemsPageCompat(',
    'getDefaultCatalogCompat(',
    'getGroupItemsCompat(',
    'getPagePackCompat(',
    'getSearchPackCompat(',
    'getByIdsPackCompat(',
    "from './devCompatClient';",
    '/items/browser',
    '/items/search/pack',
  ]) {
    assert.equal(browserClientSource.includes(token), false, `browser client should not expose lab compat token: ${token}`);
  }
  assert.doesNotMatch(
    browserCatalogClientSource,
    /get[A-Za-z]*Compat\(|\/items\/browser|\/items\/search\/pack|readPersistent|options\.persist/,
    'browser catalog client should fail closed on missing compiled packs instead of calling lab or stale persistent caches',
  );
  assert.equal(
    runtimeSessionSource.includes('createBrowserCatalogClient({') && apiCompatibilityFacadeSource.includes('browserCatalogClient.getBrowserPagePack(params)'),
    true,
    'api compatibility facade should delegate browser page-pack reads to browserCatalogClient configured in runtimeSession',
  );
});

test('core recipe and item runtime contracts live outside the legacy api facade', () => {
  for (const token of [
    'export interface Item {',
    'export interface Recipe {',
    'export interface RecipeBootstrapPayload {',
    'export interface RecipeUiPayload {',
    'export interface indexedRecipe {',
  ]) {
    assert.equal(runtimeTypesSource.includes(token), true, `missing core runtime contract: ${token}`);
    assert.equal(apiSource.includes(token), false, `services/api.ts should not re-own ${token}`);
  }

  assert.equal(
    runtimeTypesSource.includes("from '../services/api'"),
    false,
    'runtime/types.ts must not depend on the legacy api facade',
  );
});

test('special data contracts live outside the legacy api facade', () => {
  for (const token of [
    'export interface GTDiagramsOverview {',
    'export interface ForestryGeneticsOverview {',
    'export interface MultiblockBlueprint {',
    'export interface PatternExportData {',
    'export interface EcosystemOverview {',
  ]) {
    assert.equal(runtimeTypesSource.includes(token), true, `missing special runtime contract: ${token}`);
    assert.equal(apiSource.includes(token), false, `services/api.ts should not re-own ${token}`);
  }
});

test('pattern management contracts live outside the legacy api facade', () => {
  for (const token of [
    'export interface PatternGroup {',
    'export interface Pattern {',
    'export interface PatternWithDetails extends Pattern {',
    'export interface PatternGroupWithPatterns extends PatternGroup {',
  ]) {
    assert.equal(runtimeTypesSource.includes(token), true, `missing pattern runtime contract: ${token}`);
    assert.equal(apiSource.includes(token), false, `services/api.ts should not re-own ${token}`);
  }
});

test('pattern management is isolated as an explicit admin control surface', () => {
  assert.equal(
    patternRuntimeClientExists,
    false,
    'frontend runtime should not keep a pattern lab client after pattern management is isolated to admin control/',
  );
  assert.equal(
    devCompatRuntimeClientExists,
    false,
    'frontend runtime should not keep the retired generic devCompat HTTP client',
  );
  assert.equal(
    patternControlClientSource.includes("from '../runtime/types';"),
    true,
    'pattern control client should consume contracts from runtime/types without re-owning DTOs',
  );
  assert.doesNotMatch(
    patternControlClientSource,
    /from '\.\.\/services\/api'/,
    'pattern control client should not import the legacy api facade',
  );
  for (const token of [
    'patternControlClient',
    'CreatePatternPayload',
    'UpdatePatternPayload',
  ]) {
    assert.equal(patternControlClientSource.includes(token), true, `missing pattern control client token: ${token}`);
  }
  assert.equal(
    labControlClientExists,
    false,
    'frontend control should not keep the retired lab HTTP client',
  );
  assert.match(adminControlClientSource, /CONTROL_PLANE_DISABLED/);
  assert.match(adminControlClientSource, /CONTROL_PLANE_ADMIN_TOKEN_MISSING/);
  assert.match(adminControlClientSource, /assertControlPlaneEnabled\('post', path\)/);
  assert.match(adminControlClientSource, /x-neonei-admin-token/);
  assert.match(patternGroupSource, /patternControlClient\.(getGroups|getGroupWithPatterns|createGroup|updateGroup|deleteGroup|exportGroup|updatePattern|deletePattern)/);
  assert.equal(
    apiCompatibilityFacadeSource.includes('patternRuntimeClient'),
    false,
    'runtime facade should not expose pattern lab control through the production runtime API facade',
  );
  assert.doesNotMatch(
    apiCompatibilityFacadeSource,
    /getPatternGroups|getPatternGroupWithPatterns|createPatternGroup|updatePatternGroup|deletePatternGroup|exportPatternGroup|createPattern\(|updatePattern\(|deletePattern\(/,
    'api facade should not expose pattern control methods',
  );
  assert.match(
    homePageSource,
    /patternControlEnabled = computed\(\(\) => !isControlPlaneDisabled\(\)\)/,
    'HomePage should gate the pattern control view outside public runtime/control-plane mode',
  );
  assert.match(
    homeSettingsPanelSource,
    /patternControlEnabled/,
    'settings panel should disable the pattern control switch when lab control is unavailable',
  );
});


test('special data client lives outside the legacy api facade', () => {
  assert.equal(
    specialDataClientSource.includes("from './types';"),
    true,
    'special data client should consume contracts from runtime/types',
  );
  assert.equal(
    specialDataClientSource.includes("from './devCompatClient';"),
    false,
    'special data client should read production special data from current runtime datafs, not lab compatibility',
  );
  assert.doesNotMatch(
    specialDataClientSource,
    /from '\.\.\/services\/api'/,
    'special data client should not import the legacy api facade',
  );
  for (const token of [
    'getMultiblockBlueprint',
    'getGTDiagramsOverview',
    'getForestryGeneticsOverview',
  ]) {
    assert.equal(specialDataClientSource.includes(token), true, `missing special data client method: ${token}`);
  }
  assert.equal(
    specialDataClientSource.includes('/runtime/current/data/'),
    true,
    'special data client should use the current runtime datafs namespace',
  );
  assert.doesNotMatch(
    apiCompatibilityFacadeSource,
    /getEcosystemOverview|specialDataRuntimeClient\.getEcosystemOverview/,
    'ecosystem overview is a dev-local machine-path diagnostic and should not remain in the production runtime facade',
  );
  assert.doesNotMatch(
    recipeViewSource,
    /api\.getEcosystemOverview|getLabPayload<EcosystemOverview>|ecosystemOverview/,
    'RecipeView should not idle-prefetch dev-local ecosystem diagnostics from lab',
  );
  assert.equal(
    apiSource.includes("getLabPayload<GTDiagramsOverview>('/gt-diagrams/overview')"),
    false,
    'services/api.ts should not own GT diagram overview HTTP calls',
  );
  assert.equal(
    apiSource.includes("getLabPayload<ForestryGeneticsOverview>('/forestry-genetics/overview')"),
    false,
    'services/api.ts should not own forestry genetics overview HTTP calls',
  );
});
test('render contract lab client is retired from frontend runtime', () => {
  assert.equal(
    fs.existsSync('src/runtime/renderContractClient.ts'),
    false,
    'frontend runtime should not keep a render-contract lab client',
  );
  assert.doesNotMatch(
    runtimeTypesSource,
    /RenderContractAssetEntry/,
    'render-contract asset DTO should not remain in public runtime types after the lab client is retired',
  );
  assert.doesNotMatch(
    apiCompatibilityFacadeSource,
    /renderContractRuntimeClient|getAnimatedAtlasEntry|getRenderContractAsset|\/render-contract\/(asset|animated-atlas|ui-payload)/,
    'api facade should not expose render-contract lab asset reads',
  );
  assert.doesNotMatch(
    animationBudgetSource,
    /api\.getAnimatedAtlasEntry|api\.getRenderContractAsset|fetchRenderContractAsset|renderContractCache|renderContractInFlight/,
    'animation probing should use native runtime facts, captures, sprite metadata, or primed manifests only',
  );
});
test('indexed recipe client lives outside the legacy api facade', () => {
  assert.equal(
    indexedRecipeClientSource.includes("from './types';"),
    true,
    'indexed recipe client should consume contracts from runtime/types',
  );
  assert.equal(
    indexedRecipeClientSource.includes("from './devCompatClient';"),
    false,
    'indexed recipe client should not use lab compatibility access after current recipe API migration',
  );
  assert.doesNotMatch(
    indexedRecipeClientSource,
    /from '\.\.\/services\/api'/,
    'indexed recipe client should not import the legacy api facade',
  );
  assert.equal(indexedRecipeClientSource.includes('getCurrentRecipePage'), true, 'indexed recipe client should expose current recipe page reads');
  assert.equal(indexedRecipeClientSource.includes('getRecipesByIds'), true, 'indexed recipe client should expose batch hydration through current recipe pages');
  assert.equal(
    apiCompatibilityFacadeSource.includes('indexedRecipeRuntimeClient.getRecipesByIds(uniqueIds, options)'),
    true,
    'api compatibility facade should delegate recipe batch hydration to the current recipe client',
  );
  assert.doesNotMatch(
    indexedRecipeClientSource,
    /getLabPayload|postLabPayload|\/recipes\/batch|\/recipes\/item\/|\/recipes\/\$\{itemId\}\/(?:crafting|usage|machines)|\/recipes\/machines\//,
    'indexed recipe client should not call lab recipe endpoints',
  );
  assert.doesNotMatch(
    apiCompatibilityFacadeSource,
    /getIndexedItemRecipeSummary|getIndexedRecipe\(|getIndexedCraftingRecipes|getIndexedUsageRecipes|getIndexedMachinesForItem|getIndexedMachineTypes|getIndexedRecipesByMachine/,
    'api compatibility facade should not expose unused indexed recipe lab helpers',
  );
});

test('item lab client is retired from frontend runtime hot paths', () => {
  assert.equal(
    itemClientExists,
    false,
    'frontend runtime should not keep an item lab client after browser/runtime packs own item reads',
  );
  assert.doesNotMatch(
    apiCompatibilityFacadeSource,
    /itemRuntimeClient|getItemsByIds\(|getItemMachines\(|async getItem\(|async getItems\(/,
    'api compatibility facade should not expose item lab reads',
  );
  assert.doesNotMatch(
    itemTooltipSource,
    /api\s*\.\s*getItem\(|\/items\/\$\{itemId\}|getLabPayload<Item>/,
    'item tooltip should resolve details through compiled browser by-id packs, not item lab HTTP',
  );
  assert.match(
    itemTooltipSource,
    /getBrowserPagePackByIds\(\{ itemIds: \[props\.item\.itemId\], slotSize: 32 \}\)/,
    'item tooltip should read optional details from compiled browser by-id packs',
  );
  assert.equal(
    apiSource.includes("getLabPayload<Item>(`/items/${itemId}`)"),
    false,
    'services/api.ts should not own item detail HTTP calls',
  );
  assert.equal(
    apiSource.includes("postLabPayload<Item[], { itemIds: string[] }>('/items/batch'"),
    false,
    'services/api.ts should not own item batch HTTP calls',
  );
  assert.equal(
    apiSource.includes("getLabPayload<ItemSearchBasic[]>('/items/search/fast'"),
    false,
    'services/api.ts should not own fast item search HTTP calls',
  );
  assert.doesNotMatch(
    itemClientSource,
    /searchItemsFast|getLabPayload<ItemSearchBasic\[\]>\('\/items\/search\/fast'|\/items\/search\/fast/,
    'fast item search must not live on the item lab client',
  );
  assert.equal(
    apiCompatibilityFacadeSource.includes('browserCatalogClient.searchItemsFast(keyword, limit, options)'),
    true,
    'api compatibility facade should route fast item search to the compiled browser/search pack client',
  );
  assert.equal(
    apiCompatibilityFacadeSource.includes('itemRuntimeClient.searchItemsFast(keyword, limit, options)'),
    false,
    'api compatibility facade should not route fast item search to the item lab client',
  );
  assert.match(
    browserCatalogClientSource,
    /searchItemsFast\([^)]*keyword[^)]*limit[^)]*SearchItemsFastOptions[^)]*\)[\s\S]*getBrowserSearchPackShard\('hot'\)[\s\S]*getBrowserSearchPackShard\('tail'\)[\s\S]*getBrowserSearchPack\(\)/,
    'browser catalog client should own fast item search through compiled search shards/full pack',
  );
  assert.match(
    browserCatalogClientSource,
    /searchBrowserSearchPackEntries/,
    'browser catalog client should rank fast search via browser search pack projection',
  );
  assert.doesNotMatch(
    gatecFinalSource,
    /\/api\/items\/search\/fast|items-search-fast/,
    'release/e2e gates should not keep the retired dynamic item fast-search API as an accepted contract',
  );
  assert.doesNotMatch(
    itemClientSource,
    /getModsCompat|Mod\[\]|\/items\/mods/,
    'mods list must come from compiled publish/runtime artifacts, not the item lab client',
  );
});
test('browser page projection logic lives outside the legacy api facade', () => {
  for (const token of [
    'function deriveBrowserPagePackFromWindow',
    'function buildPersistentBrowserPageKey',
    'function resolvePublishedWindowPath',
    'function browserEntryMatchesLocalSearch',
  ]) {
    assert.equal(browserProjectionSource.includes(token), true, `missing browser projection helper: ${token}`);
    assert.equal(apiSource.includes(token), false, `services/api.ts should not own ${token}`);
  }
  assert.doesNotMatch(
    browserProjectionSource,
    /from '\.\.\/services\/api'/,
    'browser projection helpers should not import the legacy api facade',
  );
});


test('dist-data runtime consumes contracts without importing the legacy api facade', () => {
  assert.match(
    distDataRuntimeSource,
    /from ["']\.\.\/runtime\/types["'];/,
    'dist-data runtime should import contracts from runtime/types',
  );
  assert.doesNotMatch(
    distDataRuntimeSource,
    /from ["']\.\/api["']/,
    'dist-data runtime should not import contracts from services/api.ts',
  );
});


test('browser search ranking logic lives outside the legacy api facade', () => {
  for (const token of [
    'function rankBrowserSearchPackEntry',
    'function searchBrowserSearchPackEntries',
    'function mergeBrowserSearchPackEntries',
  ]) {
    assert.equal(browserSearchProjectionSource.includes(token), true, `missing browser search projection helper: ${token}`);
    assert.equal(apiSource.includes(token), false, `services/api.ts should not own ${token}`);
  }
  assert.doesNotMatch(browserSearchProjectionSource, /from '\.\.\/services\/api'/);
});




