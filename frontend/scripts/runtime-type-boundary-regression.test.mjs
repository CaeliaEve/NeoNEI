import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiSource = fs.readFileSync('src/services/api.ts', 'utf8').replace(/\r\n/g, '\n');
const runtimeTypesSource = fs.readFileSync('src/runtime/types.ts', 'utf8').replace(/\r\n/g, '\n');
const manifestClientSource = fs.readFileSync('src/runtime/manifestClient.ts', 'utf8').replace(/\r\n/g, '\n');
const publishClientSource = fs.readFileSync('src/runtime/publishClient.ts', 'utf8').replace(/\r\n/g, '\n');
const recipeClientSource = fs.readFileSync('src/runtime/recipeClient.ts', 'utf8').replace(/\r\n/g, '\n');
const browserClientSource = fs.readFileSync('src/runtime/browserClient.ts', 'utf8').replace(/\r\n/g, '\n');
const searchClientSource = fs.readFileSync('src/runtime/searchClient.ts', 'utf8').replace(/\r\n/g, '\n');
const textureClientSource = fs.readFileSync('src/runtime/textureClient.ts', 'utf8').replace(/\r\n/g, '\n');
const browserProjectionSource = fs.readFileSync('src/runtime/browserProjection.ts', 'utf8').replace(/\r\n/g, '\n');
const browserSearchProjectionSource = fs.readFileSync('src/runtime/browserSearchProjection.ts', 'utf8').replace(/\r\n/g, '\n');
const patternClientSource = fs.readFileSync('src/runtime/patternClient.ts', 'utf8').replace(/\r\n/g, '\n');
const specialDataClientSource = fs.readFileSync('src/runtime/specialDataClient.ts', 'utf8').replace(/\r\n/g, '\n');
const renderContractClientSource = fs.readFileSync('src/runtime/renderContractClient.ts', 'utf8').replace(/\r\n/g, '\n');
const indexedRecipeClientSource = fs.readFileSync('src/runtime/indexedRecipeClient.ts', 'utf8').replace(/\r\n/g, '\n');
const itemClientSource = fs.readFileSync('src/runtime/itemClient.ts', 'utf8').replace(/\r\n/g, '\n');
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
  assert.equal(
    manifestClientSource.includes("import type { PublicRuntimeManifest } from './types';"),
    true,
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
  assert.equal(
    recipeClientSource.includes("from './devCompatClient';"),
    true,
    'recipe runtime client should keep lab compatibility access behind the runtime dev client',
  );
  for (const token of [
    'getRecipeBootstrapCompat(',
    'getRecipeBootstrapShardCompat(',
    'getRecipeBootstrapProducedByGroupCompat(',
    'getRecipeBootstrapUsedInGroupCompat(',
    'getRecipeBootstrapCategoryGroupCompat(',
    'getRecipeBootstrapSearchCompat(',
  ]) {
    assert.equal(recipeClientSource.includes(token), true, `missing recipe compat method: ${token}`);
  }
  for (const token of [
    "getLabPayload<RecipeBootstrapPayload>(`/recipe-bootstrap",
    "getLabPayload<RecipeBootstrapMachineGroupPayload>(`/recipe-bootstrap",
    "getLabPayload<RecipeBootstrapCategoryGroupPayload>(`/recipe-bootstrap",
    "getLabPayload<RecipeBootstrapSearchPayload>(`/recipe-bootstrap",
  ]) {
    assert.equal(apiSource.includes(token), false, `services/api.ts should not own recipe lab call: ${token}`);
  }
});

test('publish runtime client owns home bootstrap lab compatibility read', () => {
  assert.equal(
    publishClientSource.includes("from './types';"),
    true,
    'publish client should consume contracts from runtime/types',
  );
  assert.equal(
    publishClientSource.includes("from './devCompatClient';"),
    true,
    'publish client should keep lab compatibility access behind the runtime dev client',
  );
  assert.equal(
    publishClientSource.includes('getHomeBootstrapCompat('),
    true,
    'publish client should expose home bootstrap compatibility read',
  );
  assert.equal(
    apiSource.includes("getLabPayload<HomeBootstrapResponse>('/publish/home-bootstrap'"),
    false,
    'services/api.ts should not own home bootstrap HTTP calls',
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

test('browser runtime client owns browser lab compatibility reads', () => {
  for (const token of [
    'getItemsPageCompat(',
    'getDefaultCatalogCompat(',
    'getGroupItemsCompat(',
    'getPagePackCompat(',
    'getSearchPackCompat(',
    'getByIdsPackCompat(',
  ]) {
    assert.equal(browserClientSource.includes(token), true, `missing browser compat method: ${token}`);
  }
  for (const token of [
    "getLabPayload<PaginatedResponse<BrowserGridEntry>>('/items/browser'",
    "getLabPayload<BrowserDefaultCatalogResponse>('/items/browser/default-catalog'",
    "getLabPayload<BrowserPagePackResponse>('/items/browser/page-pack'",
    "getLabPayload<BrowserSearchPackResponse>('/items/search/pack'",
    "postLabPayload<BrowserByIdsPackResponse",
  ]) {
    assert.equal(apiSource.includes(token), false, `services/api.ts should not own browser lab call: ${token}`);
  }
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

test('special data and render contracts live outside the legacy api facade', () => {
  for (const token of [
    'export interface GTDiagramsOverview {',
    'export interface ForestryGeneticsOverview {',
    'export interface MultiblockBlueprint {',
    'export interface PatternExportData {',
    'export interface EcosystemOverview {',
    'export interface RenderContractAssetEntry {',
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

test('pattern management client lives outside the legacy api facade', () => {
  assert.equal(
    patternClientSource.includes("from './types';"),
    true,
    'pattern client should consume contracts from runtime/types',
  );
  assert.equal(
    patternClientSource.includes("from './devCompatClient';"),
    true,
    'pattern client should keep lab compatibility access behind the runtime dev client',
  );
  assert.doesNotMatch(
    patternClientSource,
    /from '\.\.\/services\/api'/,
    'pattern client should not import the legacy api facade',
  );
  for (const token of [
    'patternRuntimeClient',
    'CreatePatternPayload',
    'UpdatePatternPayload',
  ]) {
    assert.equal(patternClientSource.includes(token), true, `missing pattern client token: ${token}`);
  }
  assert.equal(
    apiCompatibilityFacadeSource.includes('patternRuntimeClient.getGroups()'),
    true,
    'api compatibility facade should delegate pattern group reads to the runtime pattern client',
  );
  assert.equal(
    apiSource.includes("postLabPayload<Pattern>('/patterns'"),
    false,
    'services/api.ts should not own pattern mutation HTTP calls',
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
    true,
    'special data client should keep lab compatibility access behind the runtime dev client',
  );
  assert.doesNotMatch(
    specialDataClientSource,
    /from '\.\.\/services\/api'/,
    'special data client should not import the legacy api facade',
  );
  for (const token of [
    'getEcosystemOverview',
    'getMultiblockBlueprint',
    'getGTDiagramsOverview',
    'getForestryGeneticsOverview',
  ]) {
    assert.equal(specialDataClientSource.includes(token), true, `missing special data client method: ${token}`);
  }
  assert.equal(
    apiCompatibilityFacadeSource.includes('specialDataRuntimeClient.getEcosystemOverview()'),
    true,
    'api compatibility facade should delegate ecosystem overview reads to the runtime special data client',
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
test('render contract client lives outside the legacy api facade', () => {
  assert.equal(
    renderContractClientSource.includes("from './types';"),
    true,
    'render contract client should consume contracts from runtime/types',
  );
  assert.equal(
    renderContractClientSource.includes("from './devCompatClient';"),
    true,
    'render contract client should keep lab compatibility access behind the runtime dev client',
  );
  assert.doesNotMatch(
    renderContractClientSource,
    /from '\.\.\/services\/api'/,
    'render contract client should not import the legacy api facade',
  );
  for (const token of [
    'getAnimatedAtlasEntry',
    'getAsset',
    'getRecipeUiPayload',
  ]) {
    assert.equal(renderContractClientSource.includes(token), true, `missing render contract client method: ${token}`);
  }
  assert.equal(
    apiCompatibilityFacadeSource.includes('renderContractRuntimeClient.getAnimatedAtlasEntry(assetId)'),
    true,
    'api compatibility facade should delegate animated atlas reads to the runtime render contract client',
  );
  assert.equal(
    apiSource.includes("getLabPayload<RecipeUiPayload>('/render-contract/ui-payload'"),
    false,
    'services/api.ts should not own recipe UI payload HTTP calls',
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
    true,
    'indexed recipe client should keep lab compatibility access behind the runtime dev client',
  );
  assert.doesNotMatch(
    indexedRecipeClientSource,
    /from '\.\.\/services\/api'/,
    'indexed recipe client should not import the legacy api facade',
  );
  for (const token of [
    'getItemSummary',
    'getRecipe',
    'getRecipesByIds',
    'getCraftingRecipes',
    'getUsageRecipes',
    'getMachinesForItem',
    'getMachineTypes',
    'getRecipesByMachine',
  ]) {
    assert.equal(indexedRecipeClientSource.includes(token), true, `missing indexed recipe client method: ${token}`);
  }
  assert.equal(
    apiCompatibilityFacadeSource.includes('indexedRecipeRuntimeClient.getCraftingRecipes(itemId)'),
    true,
    'api compatibility facade should delegate crafting recipe reads to the runtime indexed recipe client',
  );
  assert.equal(
    apiSource.includes('getLabPayload<indexedRecipe'),
    false,
    'services/api.ts should not own indexed recipe HTTP calls',
  );
});

test('item client keeps item HTTP and detail cache outside the legacy api facade', () => {
  assert.equal(
    itemClientSource.includes("from './types';"),
    true,
    'item client should consume contracts from runtime/types',
  );
  assert.equal(
    itemClientSource.includes("from './devCompatClient';"),
    true,
    'item client should keep lab compatibility access behind the runtime dev client',
  );
  assert.doesNotMatch(
    itemClientSource,
    /from '\.\.\/services\/api'/,
    'item client should not import the legacy api facade',
  );
  for (const token of [
    'getItems(',
    'getItem(',
    'getItemsByIds(',
    'getItemMachines(',
    'getModsCompat(',
    'searchItemsFast(',
    'clearCaches()',
  ]) {
    assert.equal(itemClientSource.includes(token), true, `missing item client method: ${token}`);
  }
  assert.equal(
    apiCompatibilityFacadeSource.includes('itemRuntimeClient.getItem(itemId)'),
    true,
    'api compatibility facade should delegate item detail reads to the runtime item client',
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
  assert.equal(
    apiSource.includes("getLabPayload<Mod[]>('/items/mods'"),
    false,
    'services/api.ts should not own mods-list HTTP calls',
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





