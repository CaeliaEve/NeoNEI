import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preferenceSource = fs.readFileSync(path.join(frontendRoot, 'src/runtime/recipeBootstrapPreference.ts'), 'utf8').replace(/\r\n/g, '\n');
const clientSource = fs.readFileSync(path.join(frontendRoot, 'src/runtime/recipeBootstrapClient.ts'), 'utf8').replace(/\r\n/g, '\n');
const devCompatSource = fs.readFileSync(path.join(frontendRoot, 'src/runtime/devCompatClient.ts'), 'utf8').replace(/\r\n/g, '\n');

test('live recipe bootstrap preference is disabled by public runtime policy', () => {
  assert.match(preferenceSource, /import \{ isRuntimeDevCompatDisabled \} from '\.\/runtimeMode';/);
  assert.match(preferenceSource, /if \(isRuntimeDevCompatDisabled\(\)\) \{\n\s*return false;\n\s*\}/);
  assert.match(preferenceSource, /VITE_PREFER_LIVE_RECIPE_BOOTSTRAP === '1'/);
  assert.match(preferenceSource, /neonei:prefer-live-recipe-bootstrap/);
});

test('recipe bootstrap production path tries compiled artifacts before lab compatibility', () => {
  const distDataIndex = clientSource.indexOf('const distDataBootstrap = await getRuntimeRecipeBootstrap(itemId)');
  const publishedIndex = clientSource.indexOf('const staticPath = resolvePublishedRecipeBootstrapPath(manifest, itemId, \'bootstrap\')');
  const bundleIndex = clientSource.indexOf('const itemRecipeBundlePath = resolvePublishedItemRecipeBundlePath(manifest, itemId)');
  const compatIndex = clientSource.indexOf('const payload = await getRecipeBootstrapCompat(itemId)');
  assert.notEqual(distDataIndex, -1, 'runtime dist-data bootstrap path must exist');
  assert.notEqual(publishedIndex, -1, 'published bootstrap path must exist');
  assert.notEqual(bundleIndex, -1, 'item recipe bundle path must exist');
  assert.notEqual(compatIndex, -1, 'lab compatibility path must remain explicit for dev diagnostics');
  assert.equal(distDataIndex < publishedIndex, true, 'dist-data runtime path must be first');
  assert.equal(publishedIndex < bundleIndex, true, 'published bootstrap should precede item bundle');
  assert.equal(bundleIndex < compatIndex, true, 'lab compatibility must be the last resort');
});

test('lab recipe bootstrap fallback fails closed when runtime dev compatibility is disabled', () => {
  assert.match(devCompatSource, /isRuntimeDevCompatDisabled\(\)/);
  assert.match(devCompatSource, /LAB_DEV_COMPAT_BLOCKED/);
  assert.match(devCompatSource, /throw new Error\(`Lab compatibility API is disabled/);
  assert.match(clientSource, /getRecipeBootstrapCompat\(itemId\)/);
});
