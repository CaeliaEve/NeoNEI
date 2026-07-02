import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildNativeUiSpriteCommands,
  nativeUiDynamicPrimitiveColors,
  nativeUiSolidTextureKey,
  pushNativeUiBackgroundCommands,
  pushNativeUiDynamicPrimitiveCommands,
  pushNativeUiTextureSpriteRect,
} from '../src/services/nativeUiRenderCommandBuilder.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');

test('native UI render command builder scales texture rects in device pixels', () => {
  const commands = [];
  pushNativeUiTextureSpriteRect(commands, 2, 'atlas', 1, 2, 16, 16, 45.2, 24.4, 18, 18);
  assert.deepEqual(commands, [{
    textureKey: 'atlas',
    sourceX: 1,
    sourceY: 2,
    sourceWidth: 16,
    sourceHeight: 16,
    destX: 90,
    destY: 49,
    destWidth: 36,
    destHeight: 36,
  }]);
});

test('native UI render command builder emits nine-slice background commands', () => {
  const commands = [];
  pushNativeUiBackgroundCommands(commands, 1, {
    textureKey: 'background',
    sourceX: 10,
    sourceY: 20,
    sourceWidth: 12,
    sourceHeight: 10,
    destX: 2,
    destY: 3,
    width: 30,
    height: 24,
    nineSlice: { borderU: 2, borderV: 3 },
  });

  assert.equal(commands.length, 9);
  assert.deepEqual(commands[0], {
    textureKey: 'background',
    sourceX: 10,
    sourceY: 20,
    sourceWidth: 2,
    sourceHeight: 3,
    destX: 2,
    destY: 3,
    destWidth: 2,
    destHeight: 3,
  });
  assert.deepEqual(commands[8], {
    textureKey: 'background',
    sourceX: 12,
    sourceY: 23,
    sourceWidth: 8,
    sourceHeight: 4,
    destX: 4,
    destY: 6,
    destWidth: 26,
    destHeight: 18,
  });
});

test('native UI render command builder emits dynamic primitive track fill and borders', () => {
  assert.deepEqual(nativeUiDynamicPrimitiveColors({ kind: 'fluid-bar' }), [
    'rgba(5, 9, 14, 0.72)',
    'rgba(82, 189, 255, 0.78)',
    'rgba(238, 244, 252, 0.22)',
  ]);
  assert.equal(nativeUiSolidTextureKey('red'), 'native-dynamic-solid:red');

  const commands = [];
  pushNativeUiDynamicPrimitiveCommands(commands, 1, {
    kind: 'progress-bar',
    x: 10,
    y: 5,
    width: 20,
    height: 6,
    fill: 0.5,
    orientation: 'horizontal',
    trackColor: 'track',
    fillColor: 'fill',
    borderColor: 'border',
  });

  assert.equal(commands.length, 6);
  assert.deepEqual(commands.map((command) => command.textureKey), [
    'native-dynamic-solid:track',
    'native-dynamic-solid:fill',
    'native-dynamic-solid:border',
    'native-dynamic-solid:border',
    'native-dynamic-solid:border',
    'native-dynamic-solid:border',
  ]);
  assert.deepEqual(commands[1], {
    textureKey: 'native-dynamic-solid:fill',
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 1,
    sourceHeight: 1,
    destX: 11,
    destY: 6,
    destWidth: 9,
    destHeight: 4,
  });
});

test('native UI render command builder assembles background, slot, and atlas sprites', () => {
  const slotCells = [{
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
  }];
  const baseOptions = {
    dpr: 2,
    nowMs: 1000,
    background: null,
    dynamicPrimitives: [],
    slotCells,
    slotTextureKey: (cell) => `slot:${cell.role}:${cell.width}x${cell.height}`,
    resolveAtlasSource: () => ({ atlasFile: 'items.png', x: 4, y: 8, width: 16, height: 16 }),
  };

  const withoutBackground = buildNativeUiSpriteCommands(baseOptions);
  assert.equal(withoutBackground.length, 2);
  assert.deepEqual(withoutBackground[0], {
    textureKey: 'slot:item-input:20x18',
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 40,
    sourceHeight: 36,
    destX: 90,
    destY: 48,
    destWidth: 40,
    destHeight: 36,
  });
  assert.deepEqual(withoutBackground[1], {
    textureKey: 'items.png',
    sourceX: 4,
    sourceY: 8,
    sourceWidth: 16,
    sourceHeight: 16,
    destX: 94,
    destY: 50,
    destWidth: 32,
    destHeight: 32,
  });

  const withBackground = buildNativeUiSpriteCommands({
    ...baseOptions,
    background: {
      textureKey: 'background',
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 176,
      sourceHeight: 90,
      width: 176,
      height: 90,
    },
  });
  assert.equal(withBackground.length, 2);
  assert.equal(withBackground[0]?.textureKey, 'background');
  assert.equal(withBackground[1]?.textureKey, 'items.png');
});

test('native UI render command builder owns component sprite assembly boundary', () => {
  const componentSource = readFileSync(resolve(frontendRoot, 'src/components/NativeNeiRecipeCanvas.vue'), 'utf8').replace(/\r\n/g, '\n');
  const pipelineSource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiCanvasRenderPipeline.ts'), 'utf8').replace(/\r\n/g, '\n');
  const builderSource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiRenderCommandBuilder.ts'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(componentSource, /nativeUiCanvasRenderPipeline/);
  assert.doesNotMatch(componentSource, /nativeUiRenderCommandBuilder/);
  assert.doesNotMatch(componentSource, /buildNativeUiSpriteCommands/);
  assert.match(pipelineSource, /nativeUiRenderCommandBuilder/);
  assert.match(pipelineSource, /buildNativeUiSpriteCommands/);
  assert.doesNotMatch(componentSource, /function pushTextureSpriteRect/);
  assert.doesNotMatch(componentSource, /function pushBackgroundCommands/);
  assert.doesNotMatch(componentSource, /function pushDynamicPrimitiveCommands/);
  assert.doesNotMatch(componentSource, /function primitiveFillRatio/);
  assert.doesNotMatch(componentSource, /const DYNAMIC_TRACK_COLOR/);

  assert.match(builderSource, /export function buildNativeUiSpriteCommands/);
  assert.match(builderSource, /export function pushNativeUiBackgroundCommands/);
  assert.match(builderSource, /export function pushNativeUiDynamicPrimitiveCommands/);
  assert.match(builderSource, /export function nativeUiDynamicPrimitiveColors/);
});
