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

function fakeRenderer() {
  const calls = [];
  return {
    backend: 'webgl2',
    calls,
    registerTexture(key, source) {
      calls.push({ key, source });
      return key !== 'reject';
    },
    textureCount() { return calls.length; },
    render() { return { drawCalls: 0, vertexCount: 0, spriteDrawCalls: 0, spriteVertexCount: 0 }; },
    dispose() {},
  };
}

test('native UI texture registry classifies slot roles and keys deterministically', () => {
  assert.equal(nativeUiTextureKindForRole('item-input'), 'item-input');
  assert.equal(nativeUiTextureKindForRole('item-output'), 'item-output');
  assert.equal(nativeUiTextureKindForRole('fluid-input'), 'fluid-input');
  assert.equal(nativeUiTextureKindForRole('fluid-output'), 'fluid-output');
  assert.equal(nativeUiTextureKindForRole('steam-fluid-output'), 'fluid-output');
  assert.equal(nativeUiSlotTextureKey('fluid-output', 2), 'recipe-slot:fluid-output:2');
});

test('native UI texture registry creates slot, solid, and GT background canvases', () => {
  const dom = installCanvasDocument();
  try {
    const slot = createNativeUiSlotTexture('fluid-output', 2, 18);
    assert.equal(slot.width, 36);
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

    registry.registerSlotTextures(renderer, 2, 18);
    assert.equal(renderer.calls.filter((call) => call.key.startsWith('recipe-slot:')).length, 4);

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

test('native UI texture registry owns component texture construction boundary', () => {
  const componentSource = readFileSync(resolve(frontendRoot, 'src/components/NativeNeiRecipeCanvas.vue'), 'utf8').replace(/\r\n/g, '\n');
  const registrySource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiTextureRegistry.ts'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(componentSource, /nativeUiTextureRegistry/);
  assert.match(componentSource, /new NativeUiTextureRegistry\(\)/);
  assert.match(componentSource, /textureRegistry\.registerSlotTextures/);
  assert.match(componentSource, /textureRegistry\.registerDynamicPrimitiveTextures/);
  assert.match(componentSource, /textureRegistry/);
  assert.doesNotMatch(componentSource, /function createSlotTexture/);
  assert.doesNotMatch(componentSource, /function createSolidColorTexture/);
  assert.doesNotMatch(componentSource, /function createGtModularUiBackgroundTexture/);
  assert.doesNotMatch(componentSource, /const registeredTextureKeys/);
  assert.doesNotMatch(componentSource, /activeRenderer\.registerTexture/);
  assert.doesNotMatch(componentSource, /textureRegistry\.register\(activeRenderer/);

  assert.match(registrySource, /export class NativeUiTextureRegistry/);
  assert.match(registrySource, /export function createNativeUiSlotTexture/);
  assert.match(registrySource, /export function createNativeUiSolidColorTexture/);
  assert.match(registrySource, /export function createNativeUiGtModularBackgroundTexture/);
});
