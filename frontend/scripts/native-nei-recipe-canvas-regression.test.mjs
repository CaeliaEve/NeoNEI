import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const read = (relativePath) => fs.readFileSync(path.resolve(frontendRoot, relativePath), 'utf8');

test('captured NEI native layouts render through NativeNeiRecipeCanvas', () => {
  const routerSource = read('src/components/RecipeDisplayRouter.vue');
  const registrySource = read('src/components/recipe-display/recipeComponentRegistry.ts');

  assert.equal(routerSource.includes('NativeNeiRecipeCanvas'), true);
  assert.equal(registrySource.includes("import('../NativeNeiRecipeCanvas.vue')"), true);
  assert.equal(routerSource.includes('NeiNativeLayoutRenderer'), false);
  assert.equal(registrySource.includes('NeiNativeLayoutRenderer.vue'), false);
});

test('NativeNeiRecipeCanvas stays on the single WebGL atlas render path', () => {
  const canvasSource = read('src/components/NativeNeiRecipeCanvas.vue');

  assert.equal(canvasSource.includes('WebGl2NativeRenderer.create(canvas)'), true);
  assert.equal(canvasSource.includes('warmGlobalBrowserAtlasForItemsDetailed'), true);
  assert.equal(canvasSource.includes('getLoadedGlobalAtlasImage'), true);
  assert.equal(canvasSource.includes('RecipeItemTooltip'), true, 'tooltips may remain in the interaction overlay');
  assert.equal(canvasSource.includes('<AnimatedItemIcon'), false, 'recipe canvas must not rebuild item visuals as DOM icon components');
});

test('native renderer accepts visible canvas and atlas image sources', () => {
  const backendSource = read('src/renderers/native/NativeRendererBackend.ts');
  const rendererSource = read('src/renderers/native/WebGl2NativeRenderer.ts');

  assert.equal(backendSource.includes('TexImageSource'), true);
  assert.equal(rendererSource.includes('HTMLCanvasElement | OffscreenCanvas'), true);
  assert.equal(rendererSource.includes('registerTexture(key: string, bitmap: TexImageSource)'), true);
});
