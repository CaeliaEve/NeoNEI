import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, ref } from 'vue';
import { usePreferences } from '../src/state/preferences.ts';

const catalogA = 'a'.repeat(64), catalogB = 'b'.repeat(64);
const iron = 'item_' + '1'.repeat(64), water = 'fluid_' + '2'.repeat(64);
const saved = (catalog, id, name) => ({ catalog, id, kind: id.startsWith('fluid_') ? 'fluid' : 'item', name });
const item = (itemId, localizedName) => ({ itemId, localizedName, internalName: '', modId: '' });
let persisted = JSON.stringify({ size: 64, limit: 192, scale: 3, animate: false, collapsed: false,
  bookmarks: [saved(catalogB, iron, '旧收藏')], history: [saved(catalogB, water, '旧历史')] });
let failWrites = false;
globalThis.matchMedia = () => ({ matches: false });
globalThis.localStorage = {
  getItem: () => persisted,
  setItem: (_key, value) => { if (failWrites) throw new Error('QuotaExceededError'); persisted = value; },
};

// Per-component stores lose each other's edits; a component-owned watcher also stops on unmount.
test('browser and history share favorites and save after the first consumer unmounts', async () => {
  const component = effectScope();
  const browser = component.run(() => usePreferences());
  const history = usePreferences();
  component.stop();
  browser.bookmark(catalogA, { id: iron, kind: 'item', name: '铁' });
  assert.deepEqual(history.preferences.bookmarks.map(row => row.name), ['旧收藏', '铁']);
  await nextTick();
  const stored = JSON.parse(persisted);
  assert.deepEqual(stored.bookmarks.map(row => row.name), ['旧收藏', '铁']);
  assert.deepEqual([stored.size, stored.limit, stored.scale, stored.animate, stored.collapsed], [64, 192, 3, false, false]);
  assert.deepEqual(stored.history, [saved(catalogB, water, '旧历史')]);
});

// A missing catalog predicate leaks another dataset's same-id favorite into the current grid.
test('favorite bridge isolates catalogs, retains saved names offline and toggles item/fluid rows', async () => {
  const module = await import('../src/browser/favorites.ts').catch(() => null);
  assert.ok(module, 'favorites bridge is not implemented');
  const store = usePreferences();
  store.preferences.bookmarks = [saved(catalogA, iron, '铁'), saved(catalogB, iron, '另一数据集的铁')];
  const catalog = ref(catalogA);
  const browser = module.useFavorites(catalog), history = module.useFavorites(catalog);
  assert.deepEqual(history.items.value.map(row => row.localizedName), ['铁']);
  browser.toggle(item(water, '水'));
  assert.deepEqual(history.items.value.map(row => row.itemId), [iron, water]);
  assert.equal(store.preferences.bookmarks.at(-1).kind, 'fluid');
  history.toggle(item(iron, '铁'));
  assert.deepEqual(browser.items.value.map(row => row.itemId), [water]);
  catalog.value = catalogB;
  assert.deepEqual(browser.items.value.map(row => row.localizedName), ['另一数据集的铁']);
  catalog.value = '';
  assert.deepEqual(browser.items.value, []);
  browser.toggle(item(water, '水'));
  assert.equal(store.preferences.bookmarks.length, 2, 'an unresolved catalog must not create an invalid saved row');
  await nextTick();
});

// Persistence must be read by a fresh application instance without needing a network lookup.
test('favorites survive a fresh preferences instance', async () => {
  usePreferences().preferences.bookmarks = [saved(catalogB, iron, '另一数据集的铁'), saved(catalogA, water, '水')];
  await nextTick();
  const fresh = (await import('../src/state/preferences.ts?restored')).usePreferences();
  assert.deepEqual(fresh.preferences.bookmarks, [saved(catalogB, iron, '另一数据集的铁'), saved(catalogA, water, '水')]);
});

// A swallowed quota failure would falsely imply the favorite will survive refresh.
test('save failures remain visible to both consumers while in-memory favorites remain usable', async () => {
  const browser = usePreferences(), history = usePreferences();
  browser.preferences.bookmarks = [];
  await nextTick();
  failWrites = true;
  const before = persisted;
  browser.bookmark(catalogA, { id: iron, kind: 'item', name: '铁' });
  await nextTick();
  assert.match(history.storageError.value, /无法保存/);
  assert.equal(history.preferences.bookmarks.some(row => row.catalog === catalogA && row.id === iron), true);
  assert.equal(persisted, before);
  failWrites = false;
  browser.bookmark(catalogA, { id: iron, kind: 'item', name: '铁' });
  await nextTick();
  assert.equal(history.storageError.value, '');
});

// Refusing a 501st favorite must leave old entries intact and still allow removal at capacity.
test('the 500 favorite limit preserves old entries and permits removing one', async () => {
  const store = usePreferences();
  store.preferences.bookmarks = Array.from({ length: 500 }, (_, index) => saved(catalogB, 'item_' + index.toString(16).padStart(64, '0'), String(index)));
  await nextTick();
  store.bookmark(catalogA, { id: water, kind: 'fluid', name: '水' });
  assert.equal(store.preferences.bookmarks.length, 500);
  assert.match(store.storageError.value, /500/);
  store.bookmark(catalogB, { id: 'item_' + '0'.repeat(64), kind: 'item', name: '0' });
  await nextTick();
  assert.equal(store.preferences.bookmarks.length, 499);
  assert.equal(JSON.parse(persisted).bookmarks.length, 499);
});
