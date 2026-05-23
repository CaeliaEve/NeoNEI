import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const frontendApiSource = fs.readFileSync('frontend/src/services/api.ts', 'utf8');
const backendManifestSource = fs.readFileSync('backend/src/services/publish-payload.service.ts', 'utf8');
const backendMaterializerSource = fs.readFileSync(
  'backend/src/services/publish-payload-materializer.service.ts',
  'utf8',
);

test('published manifest exposes static recipe group window shards', () => {
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
    frontendApiSource,
    /recipeGroupWindowBasePath\?:\s*string\s*\|\s*null/,
    'frontend manifest type should understand static recipe group window paths',
  );
  assert.match(
    frontendApiSource,
    /function canUsePublishedRecipeGroupWindow\(/,
    'frontend should gate static recipe group windows separately from ids-only indexes',
  );
  assert.match(
    frontendApiSource,
    /function resolvePublishedRecipeGroupWindowPath\(/,
    'frontend should resolve static window paths without building live API URLs',
  );
  assert.match(
    frontendApiSource,
    /getRecipeBootstrapProducedByGroup[\s\S]*canUsePublishedRecipeGroupWindow[\s\S]*fetchPublishedJson<RecipeBootstrapMachineGroupPayload>/,
    'produced-by machine groups should try static recipe windows before live API fallback',
  );
  assert.match(
    frontendApiSource,
    /getRecipeBootstrapUsedInGroup[\s\S]*canUsePublishedRecipeGroupWindow[\s\S]*fetchPublishedJson<RecipeBootstrapMachineGroupPayload>/,
    'used-in machine groups should try static recipe windows before live API fallback',
  );
  assert.match(
    frontendApiSource,
    /getRecipeBootstrapCategoryGroup[\s\S]*canUsePublishedRecipeGroupWindow[\s\S]*fetchPublishedJson<RecipeBootstrapCategoryGroupPayload>/,
    'category groups should try static recipe windows before live API fallback',
  );
});
