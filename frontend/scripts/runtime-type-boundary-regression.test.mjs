import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiSource = fs.readFileSync('src/services/api.ts', 'utf8').replace(/\r\n/g, '\n');
const runtimeTypesSource = fs.readFileSync('src/runtime/types.ts', 'utf8').replace(/\r\n/g, '\n');
const manifestClientSource = fs.readFileSync('src/runtime/manifestClient.ts', 'utf8').replace(/\r\n/g, '\n');
const recipeClientSource = fs.readFileSync('src/runtime/recipeClient.ts', 'utf8').replace(/\r\n/g, '\n');
const browserClientSource = fs.readFileSync('src/runtime/browserClient.ts', 'utf8').replace(/\r\n/g, '\n');
const searchClientSource = fs.readFileSync('src/runtime/searchClient.ts', 'utf8').replace(/\r\n/g, '\n');
const textureClientSource = fs.readFileSync('src/runtime/textureClient.ts', 'utf8').replace(/\r\n/g, '\n');

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
  assert.equal(
    recipeClientSource.includes("import type { PublicRuntimeManifest } from './types';"),
    true,
    'recipe runtime client should import runtime manifest type from runtime/types',
  );
  assert.doesNotMatch(
    recipeClientSource,
    /import type \{[^}]*PublicRuntimeManifest[^}]*\} from '\.\.\/services\/api'/,
    'recipe runtime client should not import PublicRuntimeManifest from the legacy api facade',
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
