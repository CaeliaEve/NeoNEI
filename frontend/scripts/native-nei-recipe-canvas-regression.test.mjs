import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const read = (relativePath) => fs.readFileSync(path.resolve(frontendRoot, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.resolve(frontendRoot, relativePath));

test('retired NEI native frame canvas and frame resource are absent from the frontend source tree', () => {
  assert.equal(exists('src/components/NativeNeiRecipeCanvas.vue'), false);
  assert.equal(exists('src/services/nativeNeiFrameResource.ts'), false);
  assert.equal(exists('src/services/nativeUiBackgroundResourceLoader.ts'), false);
  assert.equal(exists('src/services/nativeUiCanvasRenderPipeline.ts'), false);
  assert.equal(exists('src/services/nativeUiRenderCommandBuilder.ts'), false);
  assert.equal(exists('src/services/nativeUiTextureRegistry.ts'), false);
});

test('recipe router cannot route to retired NEI screenshots or background PNG debug links', () => {
  const routerSource = read('src/components/RecipeDisplayRouter.vue');
  const registrySource = read('src/components/recipe-display/recipeComponentRegistry.ts');
  const presentationSource = read('src/composables/recipe-display/useRecipePresentation.ts');
  const policySource = read('src/composables/recipe-display/recipePresentationPolicyCatalog.ts');

  assert.doesNotMatch(routerSource, /NativeNeiRecipeCanvas/);
  assert.doesNotMatch(routerSource, /nativeNeiFrame/);
  assert.doesNotMatch(routerSource, /nativeFrameReferenceUrl/);
  assert.doesNotMatch(routerSource, /open PNG/);
  assert.doesNotMatch(routerSource, /shouldUseNativeLayoutRenderer/);
  assert.match(routerSource, /const shouldUseRouterScale = computed\(\(\) => props\.scaleToFit\)/);

  assert.doesNotMatch(registrySource, /NativeNeiRecipeCanvas/);
  assert.doesNotMatch(registrySource, /NativeNeiRecipeCanvas\.vue/);
  assert.doesNotMatch(presentationSource, /shouldUseNativeLayoutRenderer/);
  assert.doesNotMatch(policySource, /kind: 'native-layout'/);
  assert.doesNotMatch(policySource, /recipeUiPayloadNativeFrame/);
  assert.match(policySource, /presentationAuthority: 'ui-binding-v2-renderer-id-only'/);
  assert.match(policySource, /retiredNativeArtifacts: Object\.freeze\(\['nei-frame-png', 'nei-background-png'\]\)/);
});

test('native layout facts remain reference data for hand-written recipe components', () => {
  const runtimeRegistrySource = read('src/services/nativeUiRuntimeRegistry.ts');
  const interactionProjectionSource = read('src/services/nativeUiInteractionProjection.ts');
  const renderableProjectionSource = read('src/services/nativeUiRecipeRenderableProjection.ts');

  assert.match(runtimeRegistrySource, /export function resolveNativeUiRuntimeSurface/);
  assert.match(runtimeRegistrySource, /export function buildNativeUiSlotCells/);
  assert.match(interactionProjectionSource, /export function projectNativeUiHitCells/);
  assert.match(renderableProjectionSource, /export function projectNativeUiRecipeRenderables/);
});
