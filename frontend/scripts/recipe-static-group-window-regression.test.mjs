import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const frontendTypeSource = fs.readFileSync(path.join(frontendRoot, 'src/runtime/types.ts'), 'utf8');
const frontendRecipeClientSource = fs.readFileSync(path.join(frontendRoot, 'src/runtime/recipeClient.ts'), 'utf8');
const frontendRecipeBootstrapClientSource = fs.readFileSync(path.join(frontendRoot, 'src/runtime/recipeBootstrapClient.ts'), 'utf8');
const backendManifestSource = fs.readFileSync(path.join(repoRoot, 'backend/src/services/publish-payload.service.ts'), 'utf8');
const backendMaterializerSource = fs.readFileSync(
  path.join(repoRoot, 'backend/src/services/publish-payload-materializer.service.ts'),
  'utf8',
);

test('published manifest exposes static recipe group window shards', () => {
  assert.match(
    backendManifestSource,
    /recipeCoverage:\s*\{/,
    'publish manifest should expose recipe coverage counters for static runtime audits',
  );
  assert.match(
    backendManifestSource,
    /missingRecipeWindowItems:\s*number/,
    'publish manifest should count recipe items that still lack static group windows',
  );
  assert.match(
    backendManifestSource,
    /recipeGroupWindowBasePath:\s*string\s*\|\s*null/,
    'publish manifest should advertise the base path for static recipe group windows',
  );
  assert.match(
    backendManifestSource,
    /buildPublishRecipeGroupWindowBaseRelativePath\(\):\s*string\s*\{[\s\S]*recipes\/groups\/windows/,
    'backend should use a stable static recipe group window base directory',
  );
  assert.match(
    backendManifestSource,
    /buildPublishRecipeMachineGroupWindowRelativePath[\s\S]*\/machine\/[\s\S]*\$\{offset\}-\$\{limit\}\.json/,
    'machine recipe group windows should be addressable by item, relation, machine key, offset, and limit',
  );
  assert.match(
    backendManifestSource,
    /buildPublishRecipeCategoryGroupWindowRelativePath[\s\S]*\/category\/[\s\S]*\$\{offset\}-\$\{limit\}\.json/,
    'category recipe group windows should be addressable by item, relation, category key, offset, and limit',
  );
});

test('publish materializer writes bounded static recipe group windows', () => {
  assert.match(
    backendMaterializerSource,
    /function summarizeRecipePublishCoverage\(rows:\s*PublishPayloadRecord\[\],\s*bootstrapItems:\s*string\[\]\):\s*RecipePublishCoverage/,
    'materializer should summarize recipe bootstrap/group-window coverage into the manifest',
  );
  assert.match(
    backendMaterializerSource,
    /bundleManifest\.recipeCoverage\s*=\s*summarizeRecipePublishCoverage\(rows,\s*bundleManifest\.files\.recipeBootstrapItems\)/,
    'static bundle manifest should be stamped with recipe coverage counters before it is written',
  );
  assert.match(
    backendMaterializerSource,
    /RECIPE_GROUP_WINDOW_SIZE\s*=\s*8/,
    'materialized static group windows should stay aligned with the frontend recipe page size',
  );
  assert.match(
    backendMaterializerSource,
    /payload_type:\s*'recipe-machine-group-window'/,
    'materializer should register machine group window bundle entries',
  );
  assert.match(
    backendMaterializerSource,
    /payload_type:\s*'recipe-category-group-window'/,
    'materializer should register category group window bundle entries',
  );
  assert.match(
    backendMaterializerSource,
    /buildPublishRecipeMachineGroupWindowRelativePath\(\{[\s\S]*offset,[\s\S]*limit:\s*RECIPE_GROUP_WINDOW_SIZE/,
    'machine group windows should be written for each bounded recipe offset',
  );
  assert.match(
    backendMaterializerSource,
    /buildPublishRecipeCategoryGroupWindowRelativePath\(\{[\s\S]*offset,[\s\S]*limit:\s*RECIPE_GROUP_WINDOW_SIZE/,
    'category group windows should be written for each bounded recipe offset',
  );
});

test('frontend recipe group fetches prefer static windows before live API fallback', () => {
  assert.match(
    frontendTypeSource,
    /recipeCoverage\?:\s*\{/,
    'frontend manifest type should accept recipe coverage counters from published bundles',
  );
  assert.match(
    frontendTypeSource,
    /recipeGroupWindowBasePath\?:\s*string\s*\|\s*null/,
    'frontend manifest type should understand static recipe group window paths',
  );
  assert.match(
    frontendRecipeClientSource,
    /function canUsePublishedRecipeGroupWindow\(/,
    'frontend should gate static recipe group windows separately from ids-only indexes',
  );
  assert.match(
    frontendRecipeClientSource,
    /function resolvePublishedRecipeGroupWindowPath\(/,
    'frontend should resolve static window paths without building live API URLs',
  );
  assert.match(
    frontendRecipeBootstrapClientSource,
    /getRecipeBootstrapProducedByGroup[\s\S]*canUsePublishedRecipeGroupWindow[\s\S]*fetchPublishedJson<RecipeBootstrapMachineGroupPayload>/,
    'produced-by machine groups should try static recipe windows before live API fallback',
  );
  assert.match(
    frontendRecipeBootstrapClientSource,
    /getRecipeBootstrapUsedInGroup[\s\S]*canUsePublishedRecipeGroupWindow[\s\S]*fetchPublishedJson<RecipeBootstrapMachineGroupPayload>/,
    'used-in machine groups should try static recipe windows before live API fallback',
  );
  assert.match(
    frontendRecipeBootstrapClientSource,
    /getRecipeBootstrapCategoryGroup[\s\S]*canUsePublishedRecipeGroupWindow[\s\S]*fetchPublishedJson<RecipeBootstrapCategoryGroupPayload>/,
    'category groups should try static recipe windows before live API fallback',
  );
});
