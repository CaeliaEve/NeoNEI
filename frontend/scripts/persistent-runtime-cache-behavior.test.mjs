import assert from 'node:assert/strict';
import test from 'node:test';

import { createFakeWindow, FakeIndexedDBFactory } from './fake-indexeddb.mjs';

let moduleSequence = 0;

async function installFactory(factory) {
  globalThis.window = createFakeWindow(factory);
  moduleSequence += 1;
  return import(`../src/services/persistentRuntimeCache.ts?behavior=${moduleSequence}`);
}

function cacheKey(signature, id) {
  return JSON.stringify({ signature, id });
}

test('persistent runtime cache migrates legacy payload metadata without scanning payloads for stats', async () => {
  const factory = new FakeIndexedDBFactory();
  factory.seedDatabase('neonei-runtime-cache', 2, {
    packs: {
      keyPath: 'cacheKey',
      records: [
        {
          cacheKey: cacheKey('legacy', 'a'),
          payload: 'abcd',
          bytes: 4,
          lastAccessedAt: 10,
          updatedAt: 10,
        },
      ],
    },
  });
  const cache = await installFactory(factory);

  assert.deepEqual(await cache.getPersistentRuntimeCacheStats(), {
    entryCount: 1,
    approxBytes: 4,
  });
  assert.equal(await cache.readPersistentRuntimeCache(cacheKey('legacy', 'a')), 'abcd');
});

test('persistent runtime cache overwrite accounting uses byte delta', async () => {
  const factory = new FakeIndexedDBFactory();
  const cache = await installFactory(factory);
  const key = cacheKey('current', 'overwrite');

  await cache.writePersistentRuntimeCache(key, 'abc');
  await cache.writePersistentRuntimeCache(key, '12345');

  assert.deepEqual(await cache.getPersistentRuntimeCacheStats(), {
    entryCount: 1,
    approxBytes: 5,
  });
});

test('persistent runtime cache rejects unmeasurable cloneable payloads before budget accounting', async () => {
  const factory = new FakeIndexedDBFactory();
  const cache = await installFactory(factory);
  const circular = {};
  circular.self = circular;

  assert.throws(
    () => cache.estimatePersistentRuntimePayloadBytes(circular),
    /JSON-safe structure/,
  );
  assert.throws(
    () => cache.estimatePersistentRuntimePayloadBytes({ value: 1n }),
    /JSON-safe structure/,
  );
  await assert.rejects(
    cache.writePersistentRuntimeCache(cacheKey('current', 'circular'), circular),
    /JSON-safe structure/,
  );
  await assert.rejects(
    cache.writePersistentRuntimeCache(cacheKey('current', 'bigint'), { value: 1n }),
    /JSON-safe structure/,
  );
  assert.deepEqual(await cache.getPersistentRuntimeCacheStats(), {
    entryCount: 0,
    approxBytes: 0,
  });
});

test('persistent runtime cache evicts payloads through the metadata LRU index', async () => {
  const factory = new FakeIndexedDBFactory();
  const oldest = cacheKey('current', 'oldest');
  const newest = cacheKey('current', 'newest');
  factory.seedDatabase('neonei-runtime-cache', 3, {
    packs: {
      keyPath: 'cacheKey',
      records: [{ cacheKey: oldest, payload: 'old' }],
    },
    packMetadata: {
      keyPath: 'cacheKey',
      indexes: { lastAccessedAt: 'lastAccessedAt' },
      records: [{
        cacheKey: oldest,
        bytes: 256 * 1024 * 1024 - 4,
        lastAccessedAt: 1,
        signature: 'current',
      }],
    },
    state: {
      keyPath: 'key',
      records: [{ key: 'totalBytes', value: 256 * 1024 * 1024 - 4 }],
    },
  });
  const cache = await installFactory(factory);

  await cache.writePersistentRuntimeCache(newest, 'abcdef');

  assert.equal(await cache.readPersistentRuntimeCache(oldest), null);
  assert.equal(await cache.readPersistentRuntimeCache(newest), 'abcdef');
  assert.deepEqual(await cache.getPersistentRuntimeCacheStats(), {
    entryCount: 1,
    approxBytes: 6,
  });
});

test('persistent runtime cache budget eviction preserves current and previous rollback signatures', async () => {
  const factory = new FakeIndexedDBFactory();
  const previous = cacheKey('alpha', 'rollback-pack');
  const current = cacheKey('beta', 'candidate-pack');
  factory.seedDatabase('neonei-runtime-cache', 3, {
    packs: {
      keyPath: 'cacheKey',
      records: [{ cacheKey: previous, payload: 'previous-runtime' }],
    },
    packMetadata: {
      keyPath: 'cacheKey',
      indexes: { lastAccessedAt: 'lastAccessedAt' },
      records: [{
        cacheKey: previous,
        bytes: 256 * 1024 * 1024 - 4,
        lastAccessedAt: 1,
        signature: 'alpha',
      }],
    },
    state: {
      keyPath: 'key',
      records: [{ key: 'totalBytes', value: 256 * 1024 * 1024 - 4 }],
    },
  });
  const cache = await installFactory(factory);
  window.localStorage.setItem(cache.RUNTIME_SIGNATURE_STORAGE_KEY, 'beta');
  window.localStorage.setItem(cache.RUNTIME_PREVIOUS_SIGNATURE_STORAGE_KEY, 'alpha');

  await cache.writePersistentRuntimeCache(current, 'candidate-runtime');

  assert.equal(await cache.readPersistentRuntimeCache(previous), 'previous-runtime');
  assert.equal(await cache.readPersistentRuntimeCache(current), 'candidate-runtime');
  const stats = await cache.getPersistentRuntimeCacheStats();
  assert.equal(stats.entryCount, 2);
  assert.ok(stats.approxBytes > 256 * 1024 * 1024);
});

test('blocked database open clears the cached promise and allows retry', async () => {
  const factory = new FakeIndexedDBFactory();
  factory.blockNextOpen = true;
  const cache = await installFactory(factory);

  await assert.rejects(cache.getPersistentRuntimeCacheStats(), /open was blocked/);
  await cache.writePersistentRuntimeCache(cacheKey('current', 'retry'), 'ok');
  assert.equal(await cache.readPersistentRuntimeCache(cacheKey('current', 'retry')), 'ok');
});

test('aborted signature cleanup rejects and remains retryable', async () => {
  const factory = new FakeIndexedDBFactory();
  const cache = await installFactory(factory);
  const stale = cacheKey('stale', 'a');
  const current = cacheKey('current', 'b');
  await cache.writePersistentRuntimeCache(stale, 'old');
  await cache.writePersistentRuntimeCache(current, 'new');

  factory.abortNextTransaction = true;
  await assert.rejects(cache.cleanupPersistentRuntimeCacheForSignature('current'));
  assert.equal(await cache.cleanupPersistentRuntimeCacheForSignature('current'), true);
  assert.equal(await cache.readPersistentRuntimeCache(stale), null);
  assert.equal(await cache.readPersistentRuntimeCache(current), 'new');
});

test('cleanup signature is recorded only after a completed transaction', async () => {
  const factory = new FakeIndexedDBFactory();
  const cache = await installFactory(factory);
  await cache.writePersistentRuntimeCache(cacheKey('stale', 'marker'), 'old');
  factory.abortNextTransaction = true;

  cache.primeRuntimeCacheSignature('current');
  await cache.getPersistentRuntimeCacheStats();
  assert.equal(
    window.localStorage.getItem('neonei:runtime-cache-cleanup-signature:v1'),
    null,
  );

  cache.primeRuntimeCacheSignature('current');
  await cache.getPersistentRuntimeCacheStats();
  assert.equal(
    window.localStorage.getItem('neonei:runtime-cache-cleanup-signature:v1'),
    'current\n',
  );
});

test('runtime signature promotion retains one previous cache for rollback and removes older signatures', async () => {
  const factory = new FakeIndexedDBFactory();
  const cache = await installFactory(factory);
  const alpha = cacheKey('alpha', 'pack');
  const beta = cacheKey('beta', 'pack');
  const gamma = cacheKey('gamma', 'pack');
  await cache.writePersistentRuntimeCache(gamma, 'gamma-payload');

  cache.primeRuntimeCacheSignature('alpha');
  await cache.getPersistentRuntimeCacheStats();
  await cache.writePersistentRuntimeCache(alpha, 'alpha-payload');
  cache.primeRuntimeCacheSignature('beta');
  await cache.getPersistentRuntimeCacheStats();
  await cache.writePersistentRuntimeCache(beta, 'beta-payload');

  assert.equal(cache.getStoredRuntimeSignature(), 'beta');
  assert.equal(cache.getStoredPreviousRuntimeSignature(), 'alpha');
  assert.equal(await cache.readPersistentRuntimeCache(alpha), 'alpha-payload');
  assert.equal(await cache.readPersistentRuntimeCache(beta), 'beta-payload');
  assert.equal(await cache.readPersistentRuntimeCache(gamma), null);

  cache.primeRuntimeCacheSignature('alpha');
  await cache.getPersistentRuntimeCacheStats();
  assert.equal(cache.getStoredRuntimeSignature(), 'alpha');
  assert.equal(cache.getStoredPreviousRuntimeSignature(), 'beta');
  assert.equal(await cache.readPersistentRuntimeCache(beta), 'beta-payload');
});

test('clear is exclusive with concurrent writes and leaves an authoritative empty state', async () => {
  const factory = new FakeIndexedDBFactory();
  const cache = await installFactory(factory);
  const pendingWrite = cache.writePersistentRuntimeCache(cacheKey('current', 'race'), 'payload');
  const pendingClear = cache.clearPersistentRuntimeCache();

  await Promise.all([pendingWrite, pendingClear]);
  assert.deepEqual(await cache.getPersistentRuntimeCacheStats(), {
    entryCount: 0,
    approxBytes: 0,
  });
  assert.equal(await cache.readPersistentRuntimeCache(cacheKey('current', 'race')), null);
});

test('blocked clear rejects without clearing success markers and succeeds on retry', async () => {
  const factory = new FakeIndexedDBFactory();
  const storedKey = cacheKey('current', 'blocked-clear');
  factory.seedDatabase('neonei-runtime-cache', 3, {
    packs: {
      keyPath: 'cacheKey',
      records: [{ cacheKey: storedKey, payload: 'payload' }],
    },
    packMetadata: {
      keyPath: 'cacheKey',
      indexes: { lastAccessedAt: 'lastAccessedAt' },
      records: [{
        cacheKey: storedKey,
        bytes: 7,
        lastAccessedAt: 1,
        signature: 'current',
      }],
    },
    state: {
      keyPath: 'key',
      records: [{ key: 'totalBytes', value: 7 }],
    },
  });
  factory.blockNextOpen = true;
  const cache = await installFactory(factory);
  window.localStorage.setItem(cache.RUNTIME_SIGNATURE_STORAGE_KEY, 'current');
  window.localStorage.setItem(cache.RUNTIME_PREVIOUS_SIGNATURE_STORAGE_KEY, 'previous');
  window.localStorage.setItem('neonei:runtime-cache-cleanup-signature:v1', 'current');

  await assert.rejects(cache.clearPersistentRuntimeCache(), /open was blocked/);
  assert.equal(window.localStorage.getItem(cache.RUNTIME_SIGNATURE_STORAGE_KEY), 'current');
  assert.equal(
    window.localStorage.getItem('neonei:runtime-cache-cleanup-signature:v1'),
    'current',
  );

  await cache.clearPersistentRuntimeCache();
  assert.equal(window.localStorage.getItem(cache.RUNTIME_SIGNATURE_STORAGE_KEY), null);
  assert.equal(window.localStorage.getItem(cache.RUNTIME_PREVIOUS_SIGNATURE_STORAGE_KEY), null);
  assert.equal(
    window.localStorage.getItem('neonei:runtime-cache-cleanup-signature:v1'),
    null,
  );
  assert.deepEqual(await cache.getPersistentRuntimeCacheStats(), {
    entryCount: 0,
    approxBytes: 0,
  });
});
