import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const read = (relativePath) => fs.readFileSync(path.resolve(frontendRoot, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.resolve(frontendRoot, relativePath));

test('recipe presentation is routed through web-authored UI policy catalogs only', () => {
  const presentationPolicySource = read('src/composables/recipe-display/recipePresentationPolicyCatalog.ts');
  const presentationSource = read('src/composables/recipe-display/useRecipePresentation.ts');
  const routerSource = read('src/components/RecipeDisplayRouter.vue');

  assert.equal(exists('src/composables/recipe-display/nativeLayoutRendering.ts'), false);
  assert.match(presentationPolicySource, /RECIPE_PRESENTATION_ROUTE_DESCRIPTORS/);
  assert.match(presentationPolicySource, /presentationAuthority: 'ui-binding-v2-renderer-id-only'/);
  assert.match(presentationPolicySource, /retiredNativeArtifacts/);
  assert.match(presentationPolicySource, /resolveRecipePresentationDecision/);
  assert.match(presentationPolicySource, /resolveRecipePresentationRoute/);
  assert.match(presentationPolicySource, /missingBindingPolicy: 'fail-closed'/);
  assert.match(presentationSource, /resolveRecipePresentationDecision/);
  assert.match(presentationSource, /resolveRecipePresentationRoute/);
  assert.doesNotMatch(presentationSource, /isNativeLayoutRendererEligible/);
  assert.doesNotMatch(presentationSource, /shouldUseNativeLayoutRenderer/);
  assert.doesNotMatch(routerSource, /NativeNeiRecipeCanvas/);
});
