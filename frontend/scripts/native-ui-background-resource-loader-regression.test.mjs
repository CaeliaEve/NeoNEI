import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nativeUiBackgroundAssetRef,
  nativeUiBackgroundImageRegion,
  nativeUiBackgroundState,
  nativeUiBackgroundTextureKey,
  nativeUiIsSemanticGtBackground,
  nativeUiNativeBackground,
  nativeUiNativeBackgroundAssetRef,
  nativeUiNativeBackgroundTargetRect,
  nativeUiNativeBackgroundTextureKey,
  nativeUiNativeBackgroundTextureSpec,
  nativeUiSemanticBackgroundTextureKey,
  prepareNativeUiBackgroundSource,
  resolveNativeUiBackgroundAssetUrl,
} from '../src/services/nativeUiBackgroundResourceLoader.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');

function fakeRenderer() {
  return {
    backend: 'webgl2',
    registerTexture() { return true; },
    textureCount() { return 0; },
    render() { return { drawCalls: 0, vertexCount: 0, spriteDrawCalls: 0, spriteVertexCount: 0 }; },
    dispose() {},
  };
}

function fakeTextureRegistry() {
  const calls = [];
  return {
    calls,
    register(renderer, key, source) {
      assert.equal(renderer.backend, 'webgl2');
      calls.push({ key, source });
      return true;
    },
  };
}

function fakeImage(width, height) {
  return { width, height };
}

function installCanvasDocument() {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {
        width: 0,
        height: 0,
        getContext(kind) {
          assert.equal(kind, '2d');
          return {
            scale() {},
            beginPath() {},
            moveTo() {},
            lineTo() {},
            quadraticCurveTo() {},
            closePath() {},
            fill() {},
            stroke() {},
            fillRect() {},
            strokeRect() {},
            createLinearGradient() { return { addColorStop() {} }; },
            set fillStyle(_value) {},
            set strokeStyle(_value) {},
            set lineWidth(_value) {},
            set imageSmoothingEnabled(_value) {},
          };
        },
      };
      return canvas;
    },
  };
  return {
    restore() {
      if (originalDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = originalDocument;
      }
    },
  };
}

test('native UI background resource loader normalizes layout facts and state', () => {
  const layout = {
    imageResource: ' ui/background.png ',
    imageRegion: { x: -5, y: 3, width: 120, height: 40 },
    nativeBackground: {
      kind: 'gt-modular-ui',
      status: 'captured',
      assetRef: ' ui/captured.png ',
      texture: { width: 64, height: 32, border: 4 },
      recipeBackgroundOffset: { x: 7, y: 8 },
      recipeBackgroundSize: { width: 80, height: 36 },
    },
  };
  const background = nativeUiNativeBackground(layout);

  assert.equal(nativeUiBackgroundAssetRef(layout), 'ui/background.png');
  assert.equal(nativeUiBackgroundTextureKey('ui/background.png'), 'ui-background:ui/background.png');
  assert.deepEqual(nativeUiBackgroundImageRegion(layout), { x: 0, y: 3, width: 120, height: 40 });
  assert.equal(nativeUiIsSemanticGtBackground(background), true);
  assert.equal(nativeUiNativeBackgroundAssetRef(background), 'ui/captured.png');
  assert.equal(nativeUiNativeBackgroundTextureKey(background), 'ui-background:ui/captured.png');
  assert.equal(nativeUiSemanticBackgroundTextureKey(background, 176, 90, 2), 'ui-background:gt-modular-ui:176x90:2');
  assert.deepEqual(nativeUiNativeBackgroundTextureSpec(background), { width: 64, height: 32, borderU: 4, borderV: 4 });
  assert.deepEqual(nativeUiNativeBackgroundTargetRect(background, 176, 90), { x: 7, y: 8, width: 80, height: 36 });
  assert.equal(resolveNativeUiBackgroundAssetUrl('manifest.json', 'ui/background.png', (_manifest, path) => `asset://${path}`), 'asset://ui/background.png');

  assert.equal(nativeUiBackgroundState({
    nativeAssetRef: 'ui/captured.png',
    nativeTextureKey: 'ui-background:ui/captured.png',
    semanticGtBackground: true,
    backgroundAssetRef: 'ui/background.png',
    source: { textureKey: 'ui-background:ui/captured.png', sourceX: 0, sourceY: 0, sourceWidth: 1, sourceHeight: 1, width: 1, height: 1 },
    error: null,
  }), 'captured');
});

test('native UI background resource loader prepares captured background texture sources', async () => {
  const registry = fakeTextureRegistry();
  const layout = {
    nativeBackground: {
      kind: 'gt-modular-ui',
      status: 'captured',
      assetRef: 'ui/captured.png',
      texture: { width: 64, height: 32, borderU: 5, borderV: 6 },
      recipeBackgroundOffset: { x: 2, y: 3 },
      recipeBackgroundSize: { width: 80, height: 40 },
      scaling: 'nine-slice',
    },
  };

  const result = await prepareNativeUiBackgroundSource({
    renderer: fakeRenderer(),
    textureRegistry: registry,
    layout,
    manifestUrl: 'manifest.json',
    layoutWidth: 176,
    layoutHeight: 90,
    dpr: 2,
    resolveUrl: (_manifest, path) => `asset://${path}`,
    loadImage: async (url) => {
      assert.equal(url, 'asset://ui/captured.png');
      return fakeImage(128, 64);
    },
  });

  assert.equal(result.error, null);
  assert.equal(result.aborted, false);
  assert.equal(result.source.textureKey, 'ui-background:ui/captured.png');
  assert.equal(result.source.sourceWidth, 64);
  assert.equal(result.source.sourceHeight, 32);
  assert.equal(result.source.destX, 2);
  assert.equal(result.source.destY, 3);
  assert.deepEqual(result.source.nineSlice, { borderU: 5, borderV: 6 });
  assert.deepEqual(registry.calls.map((call) => call.key), ['ui-background:ui/captured.png']);
});

test('native UI background resource loader fails captured assets visibly and supports semantic procedural sources', async () => {
  const captured = await prepareNativeUiBackgroundSource({
    renderer: fakeRenderer(),
    textureRegistry: fakeTextureRegistry(),
    layout: { nativeBackground: { kind: 'gt-modular-ui', status: 'captured', assetRef: 'ui/missing.png' } },
    manifestUrl: 'manifest.json',
    layoutWidth: 176,
    layoutHeight: 90,
    dpr: 1,
    resolveUrl: (_manifest, path) => `asset://${path}`,
    loadImage: async () => { throw new Error('missing captured asset'); },
  });
  assert.equal(captured.source, null);
  assert.equal(captured.error, 'missing captured asset');

  const dom = installCanvasDocument();
  try {
    const registry = fakeTextureRegistry();
    const semantic = await prepareNativeUiBackgroundSource({
      renderer: fakeRenderer(),
      textureRegistry: registry,
      layout: { nativeBackground: { kind: 'gt-modular-ui', status: 'semantic' } },
      manifestUrl: 'manifest.json',
      layoutWidth: 176,
      layoutHeight: 90,
      dpr: 2,
      resolveUrl: (_manifest, path) => `asset://${path}`,
    });
    assert.equal(semantic.error, null);
    assert.equal(semantic.source.textureKey, 'ui-background:gt-modular-ui:176x90:2');
    assert.equal(semantic.source.sourceWidth, 352);
    assert.equal(semantic.source.sourceHeight, 180);
    assert.equal(semantic.source.width, 176);
    assert.equal(semantic.source.height, 90);
    assert.deepEqual(registry.calls.map((call) => call.key), ['ui-background:gt-modular-ui:176x90:2']);
  } finally {
    dom.restore();
  }
});

test('native UI background resource loader prepares image-region backgrounds and aborts stale loads', async () => {
  const registry = fakeTextureRegistry();
  const result = await prepareNativeUiBackgroundSource({
    renderer: fakeRenderer(),
    textureRegistry: registry,
    layout: { imageResource: 'ui/background.png', imageRegion: { x: 4, y: 6, width: 32, height: 16 } },
    manifestUrl: 'manifest.json',
    layoutWidth: 176,
    layoutHeight: 90,
    dpr: 1,
    resolveUrl: (_manifest, path) => `asset://${path}`,
    loadImage: async () => fakeImage(64, 32),
  });

  assert.equal(result.error, null);
  assert.equal(result.source.textureKey, 'ui-background:ui/background.png');
  assert.equal(result.source.sourceX, 4);
  assert.equal(result.source.sourceY, 6);
  assert.equal(result.source.sourceWidth, 32);
  assert.equal(result.source.sourceHeight, 16);

  const aborted = await prepareNativeUiBackgroundSource({
    renderer: fakeRenderer(),
    textureRegistry: fakeTextureRegistry(),
    layout: { imageResource: 'ui/background.png' },
    manifestUrl: 'manifest.json',
    layoutWidth: 176,
    layoutHeight: 90,
    dpr: 1,
    resolveUrl: (_manifest, path) => `asset://${path}`,
    loadImage: async () => fakeImage(64, 32),
    isActive: () => false,
  });
  assert.equal(aborted.aborted, true);
  assert.equal(aborted.source, null);
});

test('native UI background resource loader owns component background resource boundary', () => {
  const componentSource = readFileSync(resolve(frontendRoot, 'src/components/NativeNeiRecipeCanvas.vue'), 'utf8').replace(/\r\n/g, '\n');
  const loaderSource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiBackgroundResourceLoader.ts'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(componentSource, /nativeUiBackgroundResourceLoader/);
  assert.match(componentSource, /prepareNativeUiBackgroundSource/);
  assert.doesNotMatch(componentSource, /function resolveBackgroundAssetUrl/);
  assert.doesNotMatch(componentSource, /function resolveNativeBackgroundAssetUrl/);
  assert.doesNotMatch(componentSource, /function nativeBackgroundTextureSpec/);
  assert.doesNotMatch(componentSource, /function nativeBackgroundTargetRect/);
  assert.doesNotMatch(componentSource, /loadImageAsset/);
  assert.doesNotMatch(componentSource, /resolveManifestRelativeUrl/);
  assert.doesNotMatch(componentSource, /createNativeUiGtModularBackgroundTexture/);

  assert.match(loaderSource, /export async function prepareNativeUiBackgroundSource/);
  assert.match(loaderSource, /export function nativeUiBackgroundState/);
  assert.match(loaderSource, /resolveManifestRelativeUrl/);
  assert.match(loaderSource, /createNativeUiGtModularBackgroundTexture/);
});
