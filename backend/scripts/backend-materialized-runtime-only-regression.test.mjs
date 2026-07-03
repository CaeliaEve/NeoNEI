import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

const runtimeServiceFiles = [
  'src/services/items-search.service.ts',
  'src/services/items.service.ts',
  'src/services/recipe-bootstrap.service.ts',
  'src/services/recipes-indexed.service.ts',
];

const forbiddenRuntimeFallbackTokens = [
  'splitExportFallback',
  'getNesqlSplitExportService',
  'splitExportService',
  'ensureSplitItemsAvailable',
  'ensureSplitRecipesAvailable',
  'transformSplitItem',
  'transformAndCacheSplitRecipe',
  'transformSplitRecipe',
  'injectBotaniaFallbacks',
  'buildTerrasteelFallbackRecipe',
  'BOTANIA_TERRASTEEL_ITEM_ID',
  'fallback~botania',
  'Fallback: synthetic',
  'searchRecipeIdsByTypeFallback',
  'searchRecipeIdsByTextFallback',
  'searchRecipeIdsByItemsFallback',
];

function readRuntimeService(relativePath) {
  return fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
}

test('backend item/recipe runtime services do not retain split-export fallback paths', () => {
  for (const relativePath of runtimeServiceFiles) {
    const source = readRuntimeService(relativePath);
    for (const token of forbiddenRuntimeFallbackTokens) {
      assert.equal(
        source.includes(token),
        false,
        `${relativePath} must not contain legacy runtime fallback token ${token}`,
      );
    }
  }
});

test('backend runtime services are anchored on materialized acceleration tables', () => {
  const itemsSearchSource = readRuntimeService('src/services/items-search.service.ts');
  assert.match(itemsSearchSource, /canUseAccelerationItems\(db\)/);
  assert.match(itemsSearchSource, /return \[\];/);

  const itemsSource = readRuntimeService('src/services/items.service.ts');
  assert.match(itemsSource, /Acceleration item tables are unavailable/);
  assert.match(itemsSource, /canUseAccelerationItems\(db\)/);

  const bootstrapSource = readRuntimeService('src/services/recipe-bootstrap.service.ts');
  assert.match(bootstrapSource, /FROM recipe_bootstrap/);
  assert.match(bootstrapSource, /getMaterializedPrewarmCandidates/);
  assert.match(bootstrapSource, /materialized-unavailable:/);

  const recipesSource = readRuntimeService('src/services/recipes-indexed.service.ts');
  assert.match(recipesSource, /canUseMaterializedRecipeEdges\(db\)/);
  assert.match(recipesSource, /canUseMaterializedRecipesCore\(db\)/);
  assert.match(recipesSource, /getMaterializedItemName/);
});
