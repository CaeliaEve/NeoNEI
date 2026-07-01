import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectNativeUiAtlasLookupIds,
  prepareNativeUiAtlasSource,
  registerNativeUiAtlasSources,
  resolveNativeUiAtlasSpriteSource,
} from '../src/services/nativeUiAtlasResourceRegistry.ts';

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

function fakeTextureRegistry(rejectedKey = null) {
  const calls = [];
  return {
    calls,
    register(renderer, key, source) {
      assert.equal(renderer.backend, 'webgl2');
      calls.push({ key, source });
      return key !== rejectedKey;
    },
  };
}

test('native UI atlas registry collects unique lookup ids from populated slot cells', () => {
  const ids = collectNativeUiAtlasLookupIds([
    { key: 'a', role: 'input', x: 0, y: 0, entry: { atlasLookupId: 'minecraft:iron_ingot' } },
    { key: 'b', role: 'input', x: 18, y: 0, entry: null },
    { key: 'c', role: 'output', x: 36, y: 0, entry: { atlasLookupId: ' minecraft:iron_ingot ' } },
    { key: 'd', role: 'output', x: 54, y: 0, entry: { atlasLookupId: 'gregtech:plate_iron' } },
  ]);

  assert.deepEqual(ids, ['minecraft:iron_ingot', 'gregtech:plate_iron']);
});

test('native UI atlas registry prepares animated and static atlas sources', () => {
  const animated = prepareNativeUiAtlasSource({
    animatedAtlas: {
      atlasFile: '\\\\atlases/items.png',
      frames: [
        [0, 1, 2, 16, 16],
        { index: 1, x: 17, y: 2, width: 16, height: 16 },
      ],
      timeline: [
        [0, 50],
        { frameIndex: 1, durationMs: 70 },
      ],
      frameDurationMs: 50,
    },
  });

  assert.equal(animated.atlasFile, 'atlases/items.png');
  assert.equal(animated.staticSource, null);
  assert.deepEqual(animated.frames.map((frame) => [frame.index, frame.x, frame.y, frame.width, frame.height]), [
    [0, 1, 2, 16, 16],
    [1, 17, 2, 16, 16],
  ]);
  assert.deepEqual(animated.timeline, [
    { frameIndex: 0, durationMs: 50 },
    { frameIndex: 1, durationMs: 70 },
  ]);

  const staticSource = prepareNativeUiAtlasSource({
    staticAtlas: { atlasFile: '/atlases/static.png', x: '4', y: 5, width: 32, height: 16 },
  });
  assert.deepEqual(staticSource, {
    atlasFile: 'atlases/static.png',
    staticSource: { x: 4, y: 5, width: 32, height: 16 },
    frames: [],
    timeline: [],
  });
});

test('native UI atlas registry resolves static and animated sprite sources', () => {
  const preparedSources = new Map([
    ['static', prepareNativeUiAtlasSource({ staticAtlas: { atlasFile: 'atlas-static.png', x: 1, y: 2, width: 16, height: 16 } })],
    ['animated', prepareNativeUiAtlasSource({
      animatedAtlas: {
        atlasFile: 'atlas-animated.png',
        frames: [[0, 0, 0, 16, 16], [1, 16, 0, 16, 16]],
        timeline: [[0, 50], [1, 50]],
      },
    })],
  ]);

  assert.deepEqual(resolveNativeUiAtlasSpriteSource(preparedSources, { atlasLookupId: 'static' }, 0), {
    atlasFile: 'atlas-static.png',
    x: 1,
    y: 2,
    width: 16,
    height: 16,
  });

  assert.deepEqual(resolveNativeUiAtlasSpriteSource(preparedSources, { atlasLookupId: 'animated' }, 75), {
    atlasFile: 'atlas-animated.png',
    x: 16,
    y: 0,
    width: 16,
    height: 16,
  });
});

test('native UI atlas registry warms, prepares, and registers atlas textures', async () => {
  const registry = fakeTextureRegistry();
  const warmed = [];
  const images = new Map([
    ['atlas-a.png', { width: 64, height: 64 }],
    ['atlas-b.png', { width: 64, height: 64 }],
  ]);
  const entries = new Map([
    ['a', { staticAtlas: { atlasFile: 'atlas-a.png', x: 0, y: 0, width: 16, height: 16 } }],
    ['b', { animatedAtlas: { atlasFile: 'atlas-b.png', frames: [[0, 0, 0, 16, 16]], timeline: [[0, 50]] } }],
    ['missing', null],
  ]);

  const result = await registerNativeUiAtlasSources({
    renderer: fakeRenderer(),
    textureRegistry: registry,
    slotCells: [
      { key: 'a', role: 'input', x: 0, y: 0, entry: { atlasLookupId: 'a' } },
      { key: 'b', role: 'input', x: 18, y: 0, entry: { atlasLookupId: 'b' } },
      { key: 'missing', role: 'output', x: 36, y: 0, entry: { atlasLookupId: 'missing' } },
    ],
    deps: {
      warmAtlas: async (lookupIds) => { warmed.push([...lookupIds]); },
      getAtlasEntry: (lookupId) => entries.get(lookupId),
      getAtlasImage: (atlasFile) => images.get(atlasFile),
    },
  });

  assert.deepEqual(warmed, [['a', 'b', 'missing']]);
  assert.deepEqual(registry.calls.map((call) => call.key), ['atlas-a.png', 'atlas-b.png']);
  assert.deepEqual([...result.preparedSources.keys()], ['a', 'b']);
  assert.equal(result.missingCount, 1);
  assert.equal(result.hasAnimatedSprites, true);
  assert.equal(result.warmError, null);
});

test('native UI atlas registry owns component atlas resource boundary', () => {
  const componentSource = readFileSync(resolve(frontendRoot, 'src/components/NativeNeiRecipeCanvas.vue'), 'utf8').replace(/\r\n/g, '\n');
  const pipelineSource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiCanvasRenderPipeline.ts'), 'utf8').replace(/\r\n/g, '\n');
  const registrySource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiAtlasResourceRegistry.ts'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(componentSource, /nativeUiCanvasRenderPipeline/);
  assert.doesNotMatch(componentSource, /nativeUiAtlasResourceRegistry/);
  assert.doesNotMatch(componentSource, /registerNativeUiAtlasSources/);
  assert.doesNotMatch(componentSource, /resolveNativeUiAtlasSpriteSource/);
  assert.match(pipelineSource, /nativeUiAtlasResourceRegistry/);
  assert.match(pipelineSource, /registerNativeUiAtlasSources/);
  assert.match(pipelineSource, /resolveNativeUiAtlasSpriteSource/);
  assert.doesNotMatch(componentSource, /globalBrowserAtlas/);
  assert.doesNotMatch(componentSource, /function prepareAtlasSource/);
  assert.doesNotMatch(componentSource, /getGlobalBrowserAtlasEntry/);
  assert.doesNotMatch(componentSource, /getLoadedGlobalAtlasImage/);
  assert.doesNotMatch(componentSource, /warmGlobalBrowserAtlasForItemsDetailed/);
  assert.doesNotMatch(componentSource, /selectAtlasFrameByTimelineIndex/);
  assert.doesNotMatch(componentSource, /resolveTimelineFrameIndex/);

  assert.match(registrySource, /export async function registerNativeUiAtlasSources/);
  assert.match(registrySource, /export function prepareNativeUiAtlasSource/);
  assert.match(registrySource, /globalBrowserAtlas\.ts/);
});
