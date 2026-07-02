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

function noInteraction() {
  return {
    interactionKind: 'none',
    interactionTargetKind: 'none',
    interactionTargetId: '',
    interactionPayloadSchema: 'neonei/native-ui-interaction/v1',
  };
}

function itemClickInteraction(itemId) {
  return {
    interactionKind: 'item-click',
    interactionTargetKind: 'item',
    interactionTargetId: itemId,
    interactionPayloadSchema: 'neonei/native-ui-interaction/v1',
  };
}

test('native UI interaction projection enforces design-space geometry ABI', () => {
  assert.deepEqual(nativeUiSlotCellStyle({ x: 4, y: 8, width: 20, height: 18 }), {
    left: '4px',
    top: '8px',
    width: '20px',
    height: '18px',
  });

  assert.deepEqual(nativeUiTextOverlayStyle({ text: 'EU/t', x: 4, y: 5, width: 24, height: 8, coordinateSpace: 'nei_pixels', anchor: 'top-left' }), {
    left: '4px',
    top: '5px',
    width: '24px',
    height: '8px',
  });

  assert.deepEqual(nativeUiRectStyle({ id: 'r', kind: 'info', role: 'hint', label: '', tooltip: '', action: '', itemId: '', payloadKey: '', ...noInteraction(), x: 10, y: 11, width: 12, height: 13, coordinateSpace: 'nei_pixels', anchor: 'top-left' }), {
    left: '10px',
    top: '11px',
    width: '12px',
    height: '13px',
  });

  assert.throws(() => nativeUiTextOverlayStyle({ text: 'bad', x: -4, y: 'bad', width: 24, height: -1 }), /missing required Native UI geometry field: coordinateSpace/);
});

test('native UI interaction projection owns hotspot labels and actions', () => {
  const hotspot = {
    id: 'hotspot-1',
    kind: 'ignored-kind',
    role: 'output',
    label: '',
    tooltip: 'Output slot',
    action: 'legacy-string-is-ignored',
    itemId: 'legacy:item_is_ignored',
    ...itemClickInteraction('minecraft:iron_ingot'),
  };

  assert.equal(nativeUiRectLabel(hotspot, 'fallback'), 'Output slot');
  assert.equal(nativeUiHotspotAction(hotspot), 'item-click');
  assert.equal(nativeUiHotspotItemId(hotspot), 'minecraft:iron_ingot');
  assert.equal(isNativeUiHotspotInteractive(hotspot), true);
  assert.equal(isNativeUiHotspotInteractive({ ...hotspot, ...noInteraction() }), false);
  assert.throws(() => nativeUiHotspotItemId({ ...hotspot, interactionPayloadSchema: '' }), /interactionPayloadSchema/);
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
