import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTick } from 'vue';

const api = await import('../src/state/personal-backup.ts').catch(() => null);
const catalogA = 'a'.repeat(64), catalogB = 'b'.repeat(64);
const row = (n, catalog = catalogA, name = '收藏') => ({ catalog, id: `item_${n.toString(16).padStart(64, '0')}`, kind: 'item', name });
const settings = { itemSize: 72, size: 64, limit: 192, scale: 3, animate: false, collapsed: false };
const backup = () => ({ format: 'neonei.personal-backup', version: 1, settings: { ...settings }, bookmarks: [row(1)] });

// Exporting all preferences would leak history; using preferences.size would lose the real home size.
test('backup round trip contains only personal settings and catalog-scoped favorites', () => {
  assert.ok(api, 'personal backup codec is not implemented');
  const json = api.serializePersonalBackup(settings, [row(1), row(2, catalogB)], { history: ['private'] });
  assert.deepEqual(JSON.parse(json), { ...backup(), bookmarks: [row(1), row(2, catalogB)] });
  assert.deepEqual(api.parsePersonalBackup(json), JSON.parse(json));
});

// A relaxed decoder could import wrong versions, corrupt identities or non-finite/unsupported settings.
test('invalid structures, versions, values, identities and oversized files are refused', () => {
  assert.ok(api, 'personal backup codec is not implemented');
  const invalid = [null, [], {}, { ...backup(), version: 2 }, { ...backup(), format: 'other' },
    { ...backup(), history: [] }, { ...backup(), settings: { ...settings, itemSize: 129 } },
    { ...backup(), settings: { ...settings, itemSize: 24.5 } },
    { ...backup(), settings: { ...settings, size: 50 } },
    { ...backup(), settings: { ...settings, animate: 'false' } },
    { ...backup(), settings: { ...settings, scale: null } },
    { ...backup(), bookmarks: [{ ...row(1), catalog: '../path' }] },
    { ...backup(), bookmarks: [{ ...row(1), kind: 'fluid' }] },
    { ...backup(), bookmarks: [{ ...row(1), id: 'item_123' }] },
    { ...backup(), bookmarks: [{ ...row(1), name: 'x'.repeat(4097) }] },
    { ...backup(), bookmarks: [{ ...row(1), extra: true }] },
    { ...backup(), bookmarks: Array.from({ length: 501 }, (_, n) => row(n)) }];
  for (const value of invalid) assert.throws(() => api.parsePersonalBackup(JSON.stringify(value)));
  assert.throws(() => api.parsePersonalBackup('{bad json'), /JSON/);
  assert.throws(() => api.parsePersonalBackup(' '.repeat(api.MAX_BACKUP_BYTES + 1)), /大小|MB/);
});

// De-duplicating only by id leaks catalogs; incoming duplicates must never rename an existing favorite.
test('merge keeps current favorites and their names, deduplicates and isolates catalogs', () => {
  assert.ok(api, 'personal backup codec is not implemented');
  const current = [row(1, catalogA, '原名')];
  const result = api.mergePersonalBookmarks(current, [row(1, catalogA, '新名'), row(1, catalogB), row(2), row(2)]);
  assert.deepEqual(result, [row(1, catalogA, '原名'), row(1, catalogB), row(2)]);
  assert.deepEqual(current, [row(1, catalogA, '原名')]);
});

// Truncation at 500 would silently lose data. A full collection may still import existing favorites.
test('capacity rejects the whole merge without removing old entries', () => {
  assert.ok(api, 'personal backup codec is not implemented');
  const current = Array.from({ length: 500 }, (_, n) => row(n));
  assert.equal(api.mergePersonalBookmarks(current, [row(1)]).length, 500);
  assert.throws(() => api.mergePersonalBookmarks(current, [row(501)]), /500/);
  assert.equal(current.length, 500);
});

// Persistence must succeed before reactive state changes, and a failed second write must undo the first.
test('apply persists real home settings, preserves history, and rolls back on quota failure', async () => {
  const values = new Map([['itemSize', '50'], ['neonei.preferences', JSON.stringify({
    size: 48, limit: 96, scale: 2, animate: true, collapsed: true, bookmarks: [row(3)], history: [row(4)],
  })]]);
  let failPreferences = false;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (failPreferences && key === 'neonei.preferences') throw Error('quota'); values.set(key, value); },
    removeItem: key => values.delete(key),
  };
  const store = (await import('../src/state/preferences.ts?backup')).usePreferences();
  assert.equal(typeof store.applyPersonalBackup, 'function', 'backup apply is not implemented');
  const before = JSON.stringify(store.preferences);
  failPreferences = true;
  assert.throws(() => store.applyPersonalBackup(backup()), /无法保存/);
  await nextTick();
  assert.equal(JSON.stringify(store.preferences), before);
  assert.equal(values.get('itemSize'), '50');
  assert.equal(values.get('neonei.preferences'), before);
  assert.match(store.storageError.value, /无法保存/);
  failPreferences = false;
  store.applyPersonalBackup(backup());
  await nextTick();
  assert.equal(values.get('itemSize'), '72');
  assert.deepEqual(store.preferences.bookmarks, [row(3), row(1)]);
  assert.deepEqual(store.preferences.history, [row(4)]);
  assert.equal(store.preferences.scale, 3);
  assert.equal(store.storageError.value, '');
  const fresh = (await import('../src/state/preferences.ts?backup-fresh')).usePreferences();
  assert.equal(fresh.preferences.scale, 3);
  assert.deepEqual(fresh.preferences.bookmarks, [row(3), row(1)]);
  const settingsOnly = backup();
  settingsOnly.settings.itemSize = 80;
  settingsOnly.bookmarks = [row(99)];
  store.applyPersonalBackup(settingsOnly, { settings: true, bookmarks: false });
  await nextTick();
  assert.equal(values.get('itemSize'), '80');
  assert.deepEqual(store.preferences.bookmarks, [row(3), row(1)]);
  const beforeBookmarksOnly = values.get('itemSize');
  store.applyPersonalBackup({ ...backup(), bookmarks: [row(20)] }, { settings: false, bookmarks: true });
  await nextTick();
  assert.equal(values.get('itemSize'), beforeBookmarksOnly);
  assert.deepEqual(store.preferences.bookmarks, [row(3), row(1), row(20)]);
  assert.throws(() => store.applyPersonalBackup({ ...backup(), settings: { ...settings, itemSize: 999 } }));
  assert.equal(values.get('itemSize'), beforeBookmarksOnly);
});
