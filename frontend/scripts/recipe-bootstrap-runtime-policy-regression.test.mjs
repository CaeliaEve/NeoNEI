import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSessionSource = fs.readFileSync(path.join(frontendRoot, 'src/services/api/runtimeSession.ts'), 'utf8').replace(/\r\n/g, '\n');
const clientSource = fs.readFileSync(path.join(frontendRoot, 'src/runtime/recipeBootstrapClient.ts'), 'utf8').replace(/\r\n/g, '\n');
const recipeClientSource = fs.readFileSync(path.join(frontendRoot, 'src/runtime/recipeClient.ts'), 'utf8').replace(/\r\n/g, '\n');
const artifactPolicySource = fs.readFileSync(path.join(frontendRoot, 'src/runtime/recipeBootstrapArtifactPolicyCatalog.ts'), 'utf8').replace(/\r\n/g, '\n');
const adminControlSource = fs.readFileSync(path.join(frontendRoot, 'src/control/adminControlClient.ts'), 'utf8').replace(/\r\n/g, '\n');

test('live recipe bootstrap preference module is retired from runtime hot paths', () => {
  assert.equal(fs.existsSync(path.join(frontendRoot, 'src/runtime/recipeBootstrapPreference.ts')), false);
  assert.doesNotMatch(runtimeSessionSource, /shouldPreferLiveRecipeBootstrap|VITE_PREFER_LIVE_RECIPE_BOOTSTRAP|prefer-live-recipe-bootstrap/);
  assert.doesNotMatch(clientSource, /preferLive|dev-compat-api/);
});

test('recipe bootstrap runtime path uses compiled artifacts only', () => {
  const distDataIndex = clientSource.indexOf('const distDataBootstrap = await getRuntimeRecipeBootstrap(itemId)');
  const bundleIndex = clientSource.indexOf('const itemRecipeBundlePath = resolvePublishedItemRecipeBundlePath(manifest, itemId)');
  const publishedIndex = clientSource.indexOf("const staticPath = resolvePublishedRecipeBootstrapPath(manifest, itemId, 'bootstrap')");
  const failClosedIndex = clientSource.indexOf('Runtime recipe bootstrap unavailable for');
  assert.notEqual(distDataIndex, -1, 'runtime dist-data bootstrap path must exist');
  assert.notEqual(bundleIndex, -1, 'item recipe bundle path must exist');
  assert.notEqual(publishedIndex, -1, 'published immutable bootstrap path must exist');
  assert.notEqual(failClosedIndex, -1, 'missing compiled payloads must fail closed');
  assert.equal(distDataIndex < bundleIndex, true, 'dist-data runtime path must be first');
  assert.equal(bundleIndex < publishedIndex, true, 'item bundle should precede older immutable bootstrap files');
  assert.equal(publishedIndex < failClosedIndex, true, 'compiled artifact attempts must precede fail-closed error');
});

test('recipe bootstrap published artifact policy is descriptor-owned', () => {
  assert.match(artifactPolicySource, /type RecipePublishedArtifactDescriptor/);
  assert.match(artifactPolicySource, /validateArtifactDescriptors/);
  assert.match(artifactPolicySource, /Duplicate recipe published artifact descriptor/);
  assert.match(artifactPolicySource, /RECIPE_BOOTSTRAP_ARTIFACT_POLICY_CATALOG/);
  assert.match(artifactPolicySource, /compiled-artifacts-fail-closed/);
  assert.match(artifactPolicySource, /recipe-group-index/);
  assert.match(artifactPolicySource, /recipe-group-window/);
  assert.match(artifactPolicySource, /recipe-search-pack/);
  assert.match(clientSource, /from '\.\/recipeBootstrapArtifactPolicyCatalog'/);
  assert.doesNotMatch(recipeClientSource, /resolvePublishedRecipe|canUsePublishedRecipe|recipeSearchBasePath/);
});

test('recipe bootstrap control-plane fallback is not reachable from runtime clients', () => {
  assert.match(adminControlSource, /CONTROL_PLANE_DISABLED/);
  assert.equal(fs.existsSync(path.join(frontendRoot, 'src/control/labControlClient.ts')), false);
  assert.doesNotMatch(clientSource, /getRecipeBootstrap[A-Za-z]*Compat|devCompatClient|getLabPayload|\/recipe-bootstrap\//);
  assert.doesNotMatch(recipeClientSource, /getRecipeBootstrap[A-Za-z]*Compat|getLabPayload|\/recipe-bootstrap\//);
  assert.doesNotMatch(clientSource, /fall back|fallback|live API/i);
});
