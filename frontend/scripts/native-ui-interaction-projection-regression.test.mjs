import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isNativeUiHotspotInteractive,
  nativeUiHitCellEntryLabel,
  nativeUiHotspotAction,
  nativeUiHotspotItemId,
  nativeUiRectLabel,
  nativeUiRectStyle,
  nativeUiSlotCellStyle,
  nativeUiTextOverlayStyle,
  projectNativeUiHitCells,
} from '../src/services/nativeUiInteractionProjection.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');

test('native UI interaction projection builds clamped design-space styles', () => {
  assert.deepEqual(nativeUiSlotCellStyle({ x: 4, y: 8, width: 20, height: 18 }), {
    left: '4px',
    top: '8px',
    width: '20px',
    height: '18px',
  });

  assert.deepEqual(nativeUiTextOverlayStyle({ x: -4, y: 'bad', width: 24, height: -1 }), {
    left: '0px',
    top: '0px',
    width: '24px',
    height: '0px',
  });

  assert.deepEqual(nativeUiRectStyle({ x: 10, y: 11, width: 12, height: 13 }), {
    left: '10px',
    top: '11px',
    width: '12px',
    height: '13px',
  });
});

test('native UI interaction projection owns hotspot labels and actions', () => {
  const hotspot = {
    id: 'hotspot-1',
    kind: 'ignored-kind',
    role: 'output',
    label: '',
    tooltip: 'Output slot',
    action: ' item-click ',
    itemId: ' minecraft:iron_ingot ',
  };

  assert.equal(nativeUiRectLabel(hotspot, 'fallback'), 'Output slot');
  assert.equal(nativeUiHotspotAction(hotspot), 'item-click');
  assert.equal(nativeUiHotspotItemId(hotspot), 'minecraft:iron_ingot');
  assert.equal(isNativeUiHotspotInteractive(hotspot), true);
  assert.equal(isNativeUiHotspotInteractive({ ...hotspot, action: 'inspect' }), false);
  assert.equal(nativeUiRectLabel({ label: '', tooltip: '', role: '', kind: '', id: '' }, 'fallback'), 'fallback');
});

test('native UI interaction projection filters slot hit cells and labels entries', () => {
  const cells = projectNativeUiHitCells([
    { key: 'input:0', role: 'item-input', x: 1, y: 2, width: 20, height: 18, iconX: 3, iconY: 3, iconWidth: 16, iconHeight: 16, entry: { itemId: 'minecraft:iron_ore', localizedName: 'Iron Ore', count: 2 } },
    { key: 'input:1', role: 'item-input', x: 19, y: 2, width: 20, height: 18, iconX: 21, iconY: 3, iconWidth: 16, iconHeight: 16, entry: null },
    { key: 'output:0', role: 'item-output', x: 80, y: 2, width: 18, height: 18, iconX: 81, iconY: 3, iconWidth: 16, iconHeight: 16, entry: { itemId: 'minecraft:iron_ingot', localizedName: '', count: 1 } },
  ]);

  assert.deepEqual(cells.map((cell) => cell.key), ['input:0', 'output:0']);
  assert.equal(cells[0].entry.itemId, 'minecraft:iron_ore');
  assert.equal(cells[0].width, 20);
  assert.equal(nativeUiHitCellEntryLabel(cells[0].entry), 'Iron Ore x2');
  assert.equal(nativeUiHitCellEntryLabel(cells[1].entry), 'minecraft:iron_ingot');
});

test('native UI interaction projection owns component hit-region boundary', () => {
  const componentSource = readFileSync(resolve(frontendRoot, 'src/components/NativeNeiRecipeCanvas.vue'), 'utf8').replace(/\r\n/g, '\n');
  const projectionSource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiInteractionProjection.ts'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(componentSource, /nativeUiInteractionProjection/);
  assert.match(componentSource, /projectNativeUiHitCells/);
  assert.match(componentSource, /nativeUiSlotCellStyle/);
  assert.doesNotMatch(componentSource, /slotCells\.filter\(\(candidate\) => candidate\.entry\)/);
  assert.doesNotMatch(componentSource, /function textOverlayStyle/);
  assert.doesNotMatch(componentSource, /function rectFactStyle/);
  assert.doesNotMatch(componentSource, /function labelForEntry/);
  assert.doesNotMatch(componentSource, /entry!/);

  assert.match(projectionSource, /export function projectNativeUiHitCells/);
  assert.match(projectionSource, /export function nativeUiRectStyle/);
  assert.match(projectionSource, /export function isNativeUiHotspotInteractive/);
});
