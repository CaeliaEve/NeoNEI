import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createNativeUiGtModularBackgroundTexture,
  createNativeUiSlotTexture,
  createNativeUiSolidColorTexture,
  nativeUiSlotTextureKey,
  nativeUiTextureKindForRole,
  NativeUiTextureRegistry,
} from '../src/services/nativeUiTextureRegistry.ts';
import {
  NATIVE_UI_DYNAMIC_PRIMITIVE_DESCRIPTOR_LIST,
  NATIVE_UI_RENDER_RESOURCE_CATALOG_ABI,
  NATIVE_UI_SLOT_TEXTURE_DESCRIPTOR_LIST,
  NATIVE_UI_SOLID_TEXTURE_DESCRIPTOR,
} from '../src/services/nativeUiRenderResourceCatalog.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');

function installCanvasDocument() {
  const created = [];
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const operations = [];
      const ctx = {
        operations,
        scale: (...args) => operations.push(['scale', ...args]),
        beginPath: () => operations.push(['beginPath']),
        moveTo: (...args) => operations.push(['moveTo', ...args]),
        lineTo: (...args) => operations.push(['lineTo', ...args]),
        quadraticCurveTo: (...args) => operations.push(['quadraticCurveTo', ...args]),
        closePath: () => operations.push(['closePath']),
        fill: () => operations.push(['fill']),
        stroke: () => operations.push(['stroke']),
        fillRect: (...args) => operations.push(['fillRect', ...args]),
        strokeRect: (...args) => operations.push(['strokeRect', ...args]),
        createLinearGradient: (...args) => {
          const stops = [];
          operations.push(['createLinearGradient', ...args, stops]);
          return { addColorStop: (...stopArgs) => stops.push(stopArgs) };
        },
        set fillStyle(value) { operations.push(['fillStyle', value]); },
        set strokeStyle(value) { operations.push(['strokeStyle', value]); },
        set lineWidth(value) { operations.push(['lineWidth', value]); },
        set imageSmoothingEnabled(value) { operations.push(['imageSmoothingEnabled', value]); },
      };
      const canvas = {
        width: 0,
        height: 0,
        operations,
        getContext(kind) {
          assert.equal(kind, '2d');
          return ctx;
        },
      };
      created.push(canvas);
      return canvas;
    },
  };
  return {
    created,
    restore() {
      if (originalDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = originalDocument;
      }
    },
  };
}

function fakeRenderer(rejectedKey = 'reject') {
  const calls = [];
  return {
    backend: 'webgl2',
    calls,
    registerTexture(key, source) {
      calls.push({ key, source });
      return key !== rejectedKey;
    },
    textureCount() { return calls.length; },
    render() { return { drawCalls: 0, vertexCount: 0, spriteDrawCalls: 0, spriteVertexCount: 0 }; },
    dispose() {},
  };
}

test('native UI texture registry classifies slot roles and keys deterministically', () => {
  assert.equal(NATIVE_UI_RENDER_RESOURCE_CATALOG_ABI.schema, 'neonei/native-ui-render-resource-catalog/current');
  assert.equal(NATIVE_UI_RENDER_RESOURCE_CATALOG_ABI.buildPolicy, 'descriptor-table-render-resource-projection');
  assert.equal(NATIVE_UI_RENDER_RESOURCE_CATALOG_ABI.failurePolicy, 'fail-closed-native-ui-resource-binding');
  assert.deepEqual(NATIVE_UI_SLOT_TEXTURE_DESCRIPTOR_LIST.map((descriptor) => descriptor.kind), [
    'fluid-output',
    'fluid-input',
    'item-output',
    'item-input',
  ]);
  assert.deepEqual(NATIVE_UI_DYNAMIC_PRIMITIVE_DESCRIPTOR_LIST.map((descriptor) => descriptor.kind), [
    'fluid-bar',
    'energy-bar',
    'progress-bar',
    'indicator',
  ]);
  assert.equal(NATIVE_UI_SOLID_TEXTURE_DESCRIPTOR.keyPrefix, 'native-dynamic-solid');

  assert.equal(nativeUiTextureKindForRole('item-input'), 'item-input');
  assert.equal(nativeUiTextureKindForRole('item-output'), 'item-output');
  assert.equal(nativeUiTextureKindForRole('fluid-input'), 'fluid-input');
  assert.equal(nativeUiTextureKindForRole('fluid-output'), 'fluid-output');
  assert.equal(nativeUiTextureKindForRole('steam-fluid-output'), 'fluid-output');
  assert.equal(nativeUiSlotTextureKey('fluid-output', 2, 20, 18), 'recipe-slot:fluid-output:2:20x18');
});

test('native UI texture registry creates slot, solid, and GT background canvases', () => {
  const dom = installCanvasDocument();
  try {
    const slot = createNativeUiSlotTexture('fluid-output', 2, 20, 18);
    assert.equal(slot.width, 40);
    assert.equal(slot.height, 36);
    assert.deepEqual(slot.operations[0], ['scale', 2, 2]);
    assert.ok(slot.operations.some((op) => op[0] === 'createLinearGradient'));

    const solid = createNativeUiSolidColorTexture('rgba(1, 2, 3, 0.5)');
    assert.equal(solid.width, 1);
    assert.equal(solid.height, 1);
    assert.ok(solid.operations.some((op) => op[0] === 'fillRect'));

    const background = createNativeUiGtModularBackgroundTexture(176, 90, 2);
    assert.equal(background.width, 352);
    assert.equal(background.height, 180);
    assert.ok(background.operations.some((op) => op[0] === 'imageSmoothingEnabled' && op[1] === false));
    assert.ok(background.operations.some((op) => op[0] === 'strokeRect'));
  } finally {
    dom.restore();
  }
});

test('native UI texture registry deduplicates renderer registration', () => {
  const dom = installCanvasDocument();
  try {
    const registry = new NativeUiTextureRegistry();
    const renderer = fakeRenderer();
    const texture = { width: 1, height: 1 };

    assert.equal(registry.register(renderer, 'atlas', texture), true);
    assert.equal(registry.register(renderer, 'atlas', texture), true);
    assert.equal(renderer.calls.length, 1);
    assert.equal(registry.has('atlas'), true);

    assert.equal(registry.register(renderer, 'reject', texture), false);
    assert.equal(registry.has('reject'), false);

    registry.registerSlotTextures(renderer, 2, [
      { role: 'item-input', width: 18, height: 18 },
      { role: 'item-input', width: 18, height: 18 },
      { role: 'fluid-output', width: 20, height: 18 },
    ]);
    assert.deepEqual(renderer.calls.filter((call) => call.key.startsWith('recipe-slot:')).map((call) => call.key), [
      'recipe-slot:item-input:2:18x18',
      'recipe-slot:fluid-output:2:20x18',
    ]);

    registry.registerDynamicPrimitiveTextures(renderer, [{ kind: 'progress-bar', trackColor: 'track', fillColor: 'fill', borderColor: 'border' }]);
    assert.deepEqual(renderer.calls.slice(-3).map((call) => call.key), [
      'native-dynamic-solid:track',
      'native-dynamic-solid:fill',
      'native-dynamic-solid:border',
    ]);

    registry.clear();
    assert.equal(registry.has('atlas'), false);
  } finally {
    dom.restore();
  }
});

test('native UI texture registry fails closed when generated texture registration is rejected', () => {
  const dom = installCanvasDocument();
  try {
    const slotRegistry = new NativeUiTextureRegistry();
    assert.throws(
      () => slotRegistry.registerSlotTextures(
        fakeRenderer('recipe-slot:item-input:1:18x18'),
        1,
        [{ role: 'item-input', width: 18, height: 18 }],
      ),
      /Native UI texture registration failed: recipe-slot:item-input:1:18x18/,
    );

    const solidRegistry = new NativeUiTextureRegistry();
    assert.throws(
      () => solidRegistry.registerDynamicPrimitiveTextures(
        fakeRenderer('native-dynamic-solid:track'),
        [{ kind: 'progress-bar', trackColor: 'track', fillColor: 'fill', borderColor: 'border' }],
      ),
      /Native UI texture registration failed: native-dynamic-solid:track/,
    );
  } finally {
    dom.restore();
  }
});

test('native UI texture registry owns component texture construction boundary', () => {
  const componentSource = readFileSync(resolve(frontendRoot, 'src/components/NativeNeiRecipeCanvas.vue'), 'utf8').replace(/\r\n/g, '\n');
  const pipelineSource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiCanvasRenderPipeline.ts'), 'utf8').replace(/\r\n/g, '\n');
  const registrySource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiTextureRegistry.ts'), 'utf8').replace(/\r\n/g, '\n');
  const catalogSource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiRenderResourceCatalog.ts'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(componentSource, /nativeUiCanvasRenderPipeline/);
  assert.doesNotMatch(componentSource, /nativeUiTextureRegistry/);
  assert.doesNotMatch(componentSource, /new NativeUiTextureRegistry\(\)/);
  assert.doesNotMatch(componentSource, /textureRegistry\.registerSlotTextures/);
  assert.doesNotMatch(componentSource, /textureRegistry\.registerDynamicPrimitiveTextures/);
  assert.match(pipelineSource, /nativeUiTextureRegistry/);
  assert.match(pipelineSource, /new NativeUiTextureRegistry\(\)/);
  assert.match(pipelineSource, /textureRegistry\.registerSlotTextures/);
  assert.match(pipelineSource, /textureRegistry\.registerDynamicPrimitiveTextures/);
  assert.doesNotMatch(componentSource, /function createSlotTexture/);
  assert.doesNotMatch(componentSource, /function createSolidColorTexture/);
  assert.doesNotMatch(componentSource, /function createGtModularUiBackgroundTexture/);
  assert.doesNotMatch(componentSource, /const registeredTextureKeys/);
  assert.doesNotMatch(componentSource, /activeRenderer\.registerTexture/);
  assert.doesNotMatch(componentSource, /textureRegistry\.register\(activeRenderer/);

  assert.match(registrySource, /export class NativeUiTextureRegistry/);
  assert.match(registrySource, /assertNativeUiTextureRegistered/);
  assert.match(registrySource, /Native UI texture registration failed/);
  assert.match(registrySource, /from "\.\/nativeUiRenderResourceCatalog\.ts"/);
  assert.doesNotMatch(registrySource, /normalized\.includes\("fluid"\)/);
  assert.doesNotMatch(registrySource, /function drawRoundedRect/);

  assert.match(catalogSource, /NATIVE_UI_RENDER_RESOURCE_CATALOG_ABI/);
  assert.match(catalogSource, /NATIVE_UI_SLOT_TEXTURE_DESCRIPTOR_LIST/);
  assert.match(catalogSource, /NATIVE_UI_DYNAMIC_PRIMITIVE_DESCRIPTOR_LIST/);
  assert.match(catalogSource, /export function createNativeUiSlotTexture/);
  assert.match(catalogSource, /export function createNativeUiSolidColorTexture/);
  assert.match(catalogSource, /export function createNativeUiGtModularBackgroundTexture/);
});
