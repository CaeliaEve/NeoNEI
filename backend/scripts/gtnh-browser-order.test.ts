import assert from 'node:assert/strict';
import { compareGtnhBrowserOrder, type GtnhBrowserSortable } from '../src/services/gtnh-browser-order.service';

function sortItems(items: GtnhBrowserSortable[]): GtnhBrowserSortable[] {
  return [...items].sort(compareGtnhBrowserOrder);
}

const sorted = sortItems([
  {
    itemId: 'i~Botania~twigWand~0',
    modId: 'Botania',
    internalName: 'twigWand',
    localizedName: '森林法杖',
    damage: 0,
    tooltip: '森林法杖 (#600/0)',
  },
  {
    itemId: 'i~minecraft~apple~0',
    modId: 'minecraft',
    internalName: 'apple',
    localizedName: '苹果',
    damage: 0,
    tooltip: '苹果 (#260/0)',
  },
  {
    itemId: 'i~Botania~blackLotus~0',
    modId: 'Botania',
    internalName: 'blackLotus',
    localizedName: '黑莲花',
    damage: 0,
    tooltip: '黑莲花 (#450/0)',
  },
  {
    itemId: 'i~Botania~blackLotus~1',
    modId: 'Botania',
    internalName: 'blackLotus',
    localizedName: '黑莲花（损坏）',
    damage: 1,
    tooltip: '黑莲花（损坏） (#450/1)',
  },
]);

assert.equal(sorted[0]?.itemId, 'i~minecraft~apple~0');
assert.equal(sorted[1]?.itemId, 'i~Botania~blackLotus~0');
assert.equal(sorted[2]?.itemId, 'i~Botania~blackLotus~1');
assert.equal(sorted[3]?.itemId, 'i~Botania~twigWand~0');

console.log('gtnh-browser-order.test.ts passed');
