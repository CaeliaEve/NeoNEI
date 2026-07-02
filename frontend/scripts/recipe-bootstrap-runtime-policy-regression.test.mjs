import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSessionSource = fs.readFileSync(path.join(frontendRoot, 'src/services/api/runtimeSession.ts'), 'utf8').replace(/\r\n/g, '\n');
const clientSource = fs.readFileSync(path.join(frontendRoot, 'src/runtime/recipeBootstrapClient.ts'), 'utf8').replace(/\r\n/g, '\n');
const recipeClientSource = fs.readFileSync(path.join(frontendRoot, 'src/runtime/recipeClient.ts'), 'utf8').replace(/\r\n/g, '\n');
const labControlSource = fs.readFileSync(path.join(frontendRoot, 'src/control/labControlClient.ts'), 'utf8').replace(/\r\n/g, '\n');

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

test('recipe bootstrap lab compatibility fallback is not reachable from runtime clients', () => {
  assert.match(labControlSource, /LAB_CONTROL_DISABLED/);
  assert.doesNotMatch(clientSource, /getRecipeBootstrap[A-Za-z]*Compat|devCompatClient|getLabPayload|\/recipe-bootstrap\//);
  assert.doesNotMatch(recipeClientSource, /getRecipeBootstrap[A-Za-z]*Compat|getLabPayload|\/recipe-bootstrap\//);
});
