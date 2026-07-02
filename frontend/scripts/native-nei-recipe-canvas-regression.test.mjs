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

test('NativeNeiRecipeCanvas is not double-scaled by the outer recipe router', () => {
  const routerSource = read('src/components/RecipeDisplayRouter.vue');

  assert.equal(routerSource.includes('props.scaleToFit && !shouldUseNativeLayoutRenderer.value'), true);
  assert.equal(routerSource.includes('const shouldUseRouterScale = computed(() => props.scaleToFit);'), false);
});

test('NativeNeiRecipeCanvas stays on the single WebGL atlas render path', () => {
  const canvasSource = read('src/components/NativeNeiRecipeCanvas.vue');
  const pipelineSource = read('src/services/nativeUiCanvasRenderPipeline.ts');
  const sessionSource = read('src/services/nativeUiRendererSession.ts');

  assert.equal(canvasSource.includes('NativeUiCanvasRenderPipeline'), true);
  assert.equal(sessionSource.includes('WebGl2NativeRenderer.create(canvas)'), true);
  assert.equal(pipelineSource.includes('registerNativeUiAtlasSources'), true);
  assert.equal(pipelineSource.includes('buildNativeUiSpriteCommands'), true);
  assert.equal(canvasSource.includes('RecipeItemTooltip'), true, 'tooltips may remain in the interaction overlay');
  assert.equal(canvasSource.includes('<AnimatedItemIcon'), false, 'recipe canvas must not rebuild item visuals as DOM icon components');
});

test('NativeNeiRecipeCanvas consumes explicit GT dynamic primitives as WebGL sprite commands', () => {
  const canvasSource = read('src/components/NativeNeiRecipeCanvas.vue');
  const registrySource = read('src/services/nativeUiRuntimeRegistry.ts');
  const pipelineSource = read('src/services/nativeUiCanvasRenderPipeline.ts');
  const builderSource = read('src/services/nativeUiRenderCommandBuilder.ts');

  assert.equal(canvasSource.includes('dynamicPrimitives'), true);
  assert.equal(registrySource.includes('append(layout?.progressBars, "progress-bar")'), true);
  assert.equal(registrySource.includes('append(layout?.fluidBars, "fluid-bar")'), true);
  assert.equal(registrySource.includes('append(layout?.energyBars, "energy-bar")'), true);
  assert.equal(pipelineSource.includes('registerDynamicPrimitiveTextures'), true);
  assert.equal(builderSource.includes('pushNativeUiDynamicPrimitiveCommands'), true);
  assert.equal(builderSource.includes('pushSolidSpriteRect'), true);
  assert.equal(pipelineSource.includes('NativeTextureSpriteCommand[]'), true);
});

test('NativeNeiRecipeCanvas preserves captured hotspots and viewport regions in source-space overlays', () => {
  const canvasSource = read('src/components/NativeNeiRecipeCanvas.vue');
  const registrySource = read('src/services/nativeUiRuntimeRegistry.ts');
  const uiPackRuntimeSource = read('src/services/uiPackRuntime.ts');
  const productionManifestGateSource = fs.readFileSync(path.resolve(frontendRoot, '..', 'scripts/validate-rust-production-manifest.mjs'), 'utf8');
  const nativeUiLayoutGateSource = fs.readFileSync(path.resolve(frontendRoot, '..', 'scripts/validate-native-ui-layouts.mjs'), 'utf8');

  assert.equal(canvasSource.includes('type NativeUiRect'), true);
  assert.equal(registrySource.includes('hotspots: inlineLayout?.hotspots ?? template.hotspots'), true);
  assert.equal(registrySource.includes('viewports: inlineLayout?.viewports ?? template.viewports'), true);
  assert.equal(canvasSource.includes('const hotspots = computed'), true);
  assert.equal(canvasSource.includes('const viewports = computed'), true);
  assert.equal(canvasSource.includes('native-nei-hotspot-cell'), true);
  assert.equal(canvasSource.includes('native-nei-viewport-region'), true);
  assert.equal(canvasSource.includes('nativeUiRectStyle'), true);
  assert.equal(canvasSource.includes('nativeUiRectLabel'), true);
  assert.equal(uiPackRuntimeSource.includes('export interface UiPackRect'), true);
  assert.equal(uiPackRuntimeSource.includes('const UI_TEMPLATE_PAYLOAD_VERSION = 7'), true);
  assert.equal(uiPackRuntimeSource.includes('hotspotCount'), true);
  assert.equal(uiPackRuntimeSource.includes('viewportCount'), true);
  assert.equal(uiPackRuntimeSource.includes('rectStride'), true);
  assert.equal(uiPackRuntimeSource.includes('action: string'), false);
  assert.equal(uiPackRuntimeSource.includes('payloadKey: string'), true);
  assert.equal(uiPackRuntimeSource.includes('interactionKind: string'), true);
  assert.equal(uiPackRuntimeSource.includes('interactionPayloadSchema: string'), true);
  assert.equal(uiPackRuntimeSource.includes('coordinateSpace: resolveString'), true);
  assert.equal(canvasSource.includes('function handleHotspotClick'), true);
  assert.equal(canvasSource.includes('nativeUiHotspotItemId(rect)'), true);
  assert.equal(canvasSource.includes('@click="handleHotspotClick(hotspot)"'), true);
  assert.equal(productionManifestGateSource.includes('UI_TEMPLATE_PACK_FORMAT_NOT_V7_INTERACTION_ONLY_RECT_ABI'), true);
  assert.equal(productionManifestGateSource.includes('UI_PACK_REPORT_MISSING_V7_INTERACTION_ONLY_RECT_ABI'), true);
  assert.equal(nativeUiLayoutGateSource.includes('rust UI pack report does not declare v7 interaction-only rect/background ABI'), true);
  assert.equal(nativeUiLayoutGateSource.includes('rust UI template binary pack is not v7 interaction-only rect ABI format'), true);
});

test('NativeNeiRecipeCanvas consumes explicit Native UI background ABI before scaling', () => {
  const canvasSource = read('src/components/NativeNeiRecipeCanvas.vue');

  assert.equal(canvasSource.includes('nativeUiNativeBackground(resolvedNativeLayout.value)'), true);
  assert.equal(canvasSource.includes('nativeBackground: nativeBackground.value'), true);
  assert.equal(canvasSource.includes('backgroundImageRegion'), false);
  assert.equal(read('src/services/nativeUiBackgroundAbi.ts').includes('recipeBackgroundOffset'), true);
  assert.equal(read('src/services/nativeUiBackgroundResourceLoader.ts').includes('resolveNativeUiBackgroundContract'), true);
});

test('NativeNeiRecipeCanvas owns uniform source-space scale-fit and letterbox transform', () => {
  const canvasSource = read('src/components/NativeNeiRecipeCanvas.vue');

  assert.equal(canvasSource.includes('const shellRef = ref<HTMLElement | null>(null)'), true);
  assert.equal(canvasSource.includes('ResizeObserver'), true);
  assert.equal(canvasSource.includes('const fitScale = computed'), true);
  assert.equal(canvasSource.includes('createNativeUiFitMatrix'), true);
  assert.equal(canvasSource.includes('const sourceSurfaceStyle = computed'), true);
  assert.equal(canvasSource.includes('transform: `translate(-50%, -50%) scale(${fitScale.value})`'), true);
  assert.equal(canvasSource.includes('class="native-nei-source-surface"'), true);
  assert.equal(canvasSource.includes('transform-origin: center center'), true);
});

test('native renderer accepts visible canvas and atlas image sources', () => {
  const backendSource = read('src/renderers/native/NativeRendererBackend.ts');
  const rendererSource = read('src/renderers/native/WebGl2NativeRenderer.ts');

  assert.equal(backendSource.includes('TexImageSource'), true);
  assert.equal(rendererSource.includes('HTMLCanvasElement | OffscreenCanvas'), true);
  assert.equal(rendererSource.includes('registerTexture(key: string, bitmap: TexImageSource)'), true);
});
