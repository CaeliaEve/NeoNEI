import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeUiCanvasRenderPipeline } from '../src/services/nativeUiCanvasRenderPipeline.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');

function installCanvasDocument() {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const operations = [];
      const canvas = {
        width: 0,
        height: 0,
        operations,
        getContext(kind) {
          assert.equal(kind, '2d');
          return {
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
              operations.push(['createLinearGradient', ...args]);
              return { addColorStop: (...stopArgs) => operations.push(['addColorStop', ...stopArgs]) };
            },
            set fillStyle(value) { operations.push(['fillStyle', value]); },
            set strokeStyle(value) { operations.push(['strokeStyle', value]); },
            set lineWidth(value) { operations.push(['lineWidth', value]); },
            set imageSmoothingEnabled(value) { operations.push(['imageSmoothingEnabled', value]); },
          };
        },
      };
      return canvas;
    },
  };
  return {
    restore() {
      if (originalDocument === undefined) delete globalThis.document;
      else globalThis.document = originalDocument;
    },
  };
}

function fakeRenderer() {
  const textures = [];
  const renders = [];
  return {
    backend: 'webgl2',
    textures,
    renders,
    disposed: false,
    registerTexture(key, source) {
      textures.push({ key, source });
      return true;
    },
    textureCount() { return textures.length; },
    render(width, height, commands, spriteCommands) {
      renders.push({ width, height, commands, spriteCommands });
      return {
        drawCalls: commands.length,
        vertexCount: 0,
        spriteDrawCalls: spriteCommands.length,
        spriteVertexCount: 0,
      };
    },
    dispose() { this.disposed = true; },
  };
}

test('native UI canvas render pipeline owns rebuild sequencing and GPU resource orchestration', async () => {
  const dom = installCanvasDocument();
  try {
    const renderer = fakeRenderer();
    const states = [];
    let flushed = false;
    const pipeline = new NativeUiCanvasRenderPipeline({
      nextTick: async () => { flushed = true; },
      rendererFactory: () => renderer,
      prepareBackground: async (options) => {
        assert.equal(options.renderer, renderer);
        assert.equal(options.layoutWidth, 176);
        assert.equal(options.dpr, 2);
        assert.equal(options.isActive(), true);
        options.textureRegistry.register(options.renderer, 'background', { width: 176, height: 90 });
        return {
          source: {
            textureKey: 'background',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 176,
            sourceHeight: 90,
            width: 176,
            height: 90,
          },
          error: null,
          aborted: false,
        };
      },
      registerAtlasSources: async (options) => {
        assert.equal(options.renderer, renderer);
        assert.equal(options.slotCells.length, 1);
        options.textureRegistry.register(options.renderer, 'items.png', { width: 64, height: 64 });
        return {
          lookupIds: ['minecraft:iron_ingot'],
          preparedSources: new Map([[
            'minecraft:iron_ingot',
            {
              atlasFile: 'items.png',
              staticSource: { x: 4, y: 8, width: 16, height: 16 },
              frames: [],
              timeline: [],
            },
          ]]),
          missingCount: 0,
          hasAnimatedSprites: false,
          warmError: null,
        };
      },
      onStateChange: (state) => states.push(state),
    });

    const canvas = { width: 0, height: 0 };
    const state = await pipeline.rebuild({
      mounted: true,
      canvas,
      displayWidth: 176,
      displayHeight: 90,
      devicePixelRatio: 2,
      layout: {},
      manifestUrl: 'manifest.json',
      layoutWidth: 176,
      layoutHeight: 90,
      dynamicPrimitives: [
        {
          kind: 'progress-bar',
          x: 2,
          y: 3,
          width: 20,
          height: 6,
          coordinateSpace: 'nei_pixels',
          anchor: 'top-left',
          fill: 0.5,
          trackColor: 'track',
          fillColor: 'fill',
          borderColor: 'border',
        },
      ],
      slotCells: [
        {
          key: 'item-input:0:0',
          role: 'item-input',
          x: 45,
          y: 24,
          width: 20,
          height: 18,
          iconX: 47,
          iconY: 25,
          iconWidth: 16,
          iconHeight: 16,
          entry: { atlasLookupId: 'minecraft:iron_ingot' },
        },
      ],
    });

    assert.equal(flushed, true);
    assert.equal(canvas.width, 352);
    assert.equal(canvas.height, 180);
    assert.equal(state.currentDpr, 2);
    assert.equal(state.renderReady, true);
    assert.equal(state.backgroundSource.textureKey, 'background');
    assert.equal(state.missingTextureCount, 0);
    assert.deepEqual([...pipeline.preparedAtlasSources.keys()], ['minecraft:iron_ingot']);
    assert.equal(renderer.renders.length, 1);
    assert.deepEqual(renderer.renders[0].spriteCommands.map((command) => command.textureKey), [
      'background',
      'native-dynamic-solid:track',
      'native-dynamic-solid:fill',
      'native-dynamic-solid:border',
      'native-dynamic-solid:border',
      'native-dynamic-solid:border',
      'native-dynamic-solid:border',
      'items.png',
    ]);
    assert.ok(renderer.textures.some((entry) => entry.key === 'recipe-slot:item-input:2:20x18'));
    assert.ok(renderer.textures.some((entry) => entry.key === 'background'));
    assert.ok(renderer.textures.some((entry) => entry.key === 'items.png'));
    assert.equal(states.at(-1).renderReady, true);
  } finally {
    dom.restore();
  }
});

test('native UI canvas render pipeline fails closed on resource boundary errors', async () => {
  const renderer = fakeRenderer();
  const states = [];
  const pipeline = new NativeUiCanvasRenderPipeline({
    nextTick: async () => {},
    rendererFactory: () => renderer,
    prepareBackground: async () => ({
      source: null,
      error: 'captured background missing',
      aborted: false,
    }),
    registerAtlasSources: async () => ({
      lookupIds: ['minecraft:iron_ingot'],
      preparedSources: new Map(),
      missingCount: 1,
      hasAnimatedSprites: false,
      warmError: null,
    }),
    onStateChange: (state) => states.push(state),
  });

  const state = await pipeline.rebuild({
    mounted: true,
    canvas: { width: 0, height: 0 },
    displayWidth: 176,
    displayHeight: 90,
    devicePixelRatio: 1,
    layout: {},
    manifestUrl: 'manifest.json',
    layoutWidth: 176,
    layoutHeight: 90,
    dynamicPrimitives: [],
    slotCells: [],
  });

  assert.equal(state.renderReady, false);
  assert.equal(state.renderError, 'captured background missing');
  assert.equal(state.backgroundLoadError, 'captured background missing');
  assert.equal(state.missingTextureCount, 1);
  assert.equal(renderer.renders.length, 0);
  assert.equal(states.at(-1).renderReady, false);

  const atlasFailure = new NativeUiCanvasRenderPipeline({
    nextTick: async () => {},
    rendererFactory: () => renderer,
    prepareBackground: async () => ({
      source: null,
      error: null,
      aborted: false,
    }),
    registerAtlasSources: async () => { throw new Error('atlas resources are incomplete'); },
  });
  const atlasFailureState = await atlasFailure.rebuild({
    mounted: true,
    canvas: { width: 0, height: 0 },
    displayWidth: 176,
    displayHeight: 90,
    devicePixelRatio: 1,
    layout: {},
    manifestUrl: 'manifest.json',
    layoutWidth: 176,
    layoutHeight: 90,
    dynamicPrimitives: [],
    slotCells: [],
  });
  assert.equal(atlasFailureState.renderReady, false);
  assert.equal(atlasFailureState.renderError, 'atlas resources are incomplete');
});

test('native UI canvas render pipeline is the component rebuild boundary', () => {
  const componentSource = readFileSync(resolve(frontendRoot, 'src/components/NativeNeiRecipeCanvas.vue'), 'utf8').replace(/\r\n/g, '\n');
  const pipelineSource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiCanvasRenderPipeline.ts'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(componentSource, /new NativeUiCanvasRenderPipeline/);
  assert.match(componentSource, /renderPipeline\.rebuild/);
  assert.doesNotMatch(componentSource, /function ensureSlotTextures/);
  assert.doesNotMatch(componentSource, /function ensureDynamicPrimitiveTextures/);
  assert.doesNotMatch(componentSource, /function ensureBackgroundTexture/);
  assert.doesNotMatch(componentSource, /function buildSpriteCommands/);
  assert.doesNotMatch(componentSource, /function renderFrame/);
  assert.doesNotMatch(componentSource, /function scheduleAnimationLoop/);
  assert.doesNotMatch(componentSource, /function resetRendererState/);
  assert.doesNotMatch(componentSource, /preparedSources\.clear/);
  assert.doesNotMatch(componentSource, /hasAnimatedSprites/);

  assert.match(pipelineSource, /class NativeUiCanvasRenderPipeline/);
  assert.match(pipelineSource, /beginRebuild/);
  assert.match(pipelineSource, /buildSpriteCommands/);
  assert.match(pipelineSource, /registerSlotTextures/);
  assert.match(pipelineSource, /registerDynamicPrimitiveTextures/);
  assert.match(pipelineSource, /prepareNativeUiBackgroundSource/);
  assert.match(pipelineSource, /registerNativeUiAtlasSources/);
  assert.match(pipelineSource, /NativeUiAtlasResourceError/);
  assert.match(pipelineSource, /nativeUiRenderErrorMessage/);
  assert.match(pipelineSource, /scheduleAnimationLoop/);
});
