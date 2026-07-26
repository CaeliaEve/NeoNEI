import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeArtifactClient } from '../src/runtime/RuntimeArtifactClient.ts';

function jsonResponse(payload, onParse) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() {
      onParse();
      return payload;
    },
    async arrayBuffer() {
      throw new Error('unexpected arrayBuffer parse');
    },
  };
}

function request(overrides = {}) {
  return {
    manifestIdentity: 'sig-a',
    artifactPath: 'rust/browser-pack.json',
    resolvedUrl: 'https://runtime.test/rust/browser-pack.json',
    ...overrides,
  };
}

test('concurrent artifact reads deduplicate before persistent storage, fetch and parse', async () => {
  let persistentReads = 0;
  let fetches = 0;
  let parses = 0;
  const client = createRuntimeArtifactClient({
    readPersistent: async () => {
      persistentReads += 1;
      return null;
    },
    fetchResponse: async () => {
      fetches += 1;
      return jsonResponse({ id: 'shared' }, () => { parses += 1; });
    },
  });

  const [left, right] = await Promise.all([
    client.loadJson(request()),
    client.loadJson(request()),
  ]);

  assert.deepEqual(left, { id: 'shared' });
  assert.strictEqual(left, right);
  assert.equal(persistentReads, 1);
  assert.equal(fetches, 1);
  assert.equal(parses, 1);
});

test('manifest signature changes isolate the same artifact path', async () => {
  let fetches = 0;
  const client = createRuntimeArtifactClient({
    readPersistent: async () => null,
    fetchResponse: async () => {
      fetches += 1;
      return jsonResponse({ revision: fetches }, () => undefined);
    },
  });

  const first = await client.loadJson(request({ manifestIdentity: 'sig-a' }));
  const second = await client.loadJson(request({ manifestIdentity: 'sig-b' }));
  assert.deepEqual(first, { revision: 1 });
  assert.deepEqual(second, { revision: 2 });
  assert.equal(fetches, 2);
});

test('failed artifact requests are removed from inflight and can retry', async () => {
  let fetches = 0;
  const client = createRuntimeArtifactClient({
    readPersistent: async () => null,
    fetchResponse: async () => {
      fetches += 1;
      if (fetches === 1) throw new Error('temporary failure');
      return jsonResponse({ ok: true }, () => undefined);
    },
  });

  await assert.rejects(client.loadJson(request()), /temporary failure/);
  assert.deepEqual(await client.loadJson(request()), { ok: true });
  assert.equal(fetches, 2);
});

test('persistent write failures are fail-closed and retry fetches again', async () => {
  let fetches = 0;
  let writes = 0;
  const client = createRuntimeArtifactClient({
    readPersistent: async () => null,
    writePersistent: async () => {
      writes += 1;
      if (writes === 1) throw new Error('persistent write failed');
    },
    fetchResponse: async () => {
      fetches += 1;
      return jsonResponse({ attempt: fetches }, () => undefined);
    },
  });

  await assert.rejects(client.loadJson(request()), /persistent write failed/);
  assert.deepEqual(await client.loadJson(request()), { attempt: 2 });
  assert.equal(fetches, 2);
  assert.equal(writes, 2);
});

test('volatile manifest requests deduplicate concurrently but refresh sequentially', async () => {
  let fetches = 0;
  const client = createRuntimeArtifactClient({
    fetchResponse: async () => {
      fetches += 1;
      return jsonResponse({ revision: fetches }, () => undefined);
    },
  });
  const manifestRequest = request({
    artifactPath: '/api/runtime/current/manifest',
    resolvedUrl: 'https://runtime.test/api/runtime/current/manifest',
    persistent: false,
    memory: false,
  });

  const [first, shared] = await Promise.all([
    client.loadJson(manifestRequest),
    client.loadJson(manifestRequest),
  ]);
  const refreshed = await client.loadJson(manifestRequest);
  assert.strictEqual(first, shared);
  assert.deepEqual(first, { revision: 1 });
  assert.deepEqual(refreshed, { revision: 2 });
  assert.equal(fetches, 2);
});

test('published client fails fast without a canonical artifact dependency', async () => {
  globalThis.__API_BASE_URL__ = '/api';
  globalThis.__BACKEND_BASE_URL__ = '/api';
  const { createPublishedJsonClient } = await import('../src/runtime/publishClient.ts?fail-fast=1');
  assert.throws(
    () => createPublishedJsonClient({}),
    /requires the canonical runtime artifact client/,
  );
});

test('publish and dist-data aliases sharing a content hash reuse one canonical request', async () => {
  let persistentReads = 0;
  let fetches = 0;
  let parses = 0;
  const client = createRuntimeArtifactClient({
    readPersistent: async () => {
      persistentReads += 1;
      return null;
    },
    fetchResponse: async () => {
      fetches += 1;
      return jsonResponse({ source: 'canonical' }, () => { parses += 1; });
    },
  });

  const [published, distData] = await Promise.all([
    client.loadJson(request({
      manifestIdentity: 'publish-signature',
      artifactPath: 'publish/browser.json',
      resolvedUrl: 'https://runtime.test/publish/browser.json',
      contentHash: 'ABC123',
    })),
    client.loadJson(request({
      manifestIdentity: 'dist-data-signature',
      artifactPath: 'dist-data/browser.json',
      resolvedUrl: 'https://runtime.test/dist-data/browser.json',
      contentHash: 'abc123',
    })),
  ]);

  assert.strictEqual(published, distData);
  assert.equal(persistentReads, 1);
  assert.equal(fetches, 1);
  assert.equal(parses, 1);
});

test('production artifact registry shares publish and dist aliases declared with one hash', async () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  };
  let fetches = 0;
  let parses = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    return jsonResponse({ shared: true }, () => { parses += 1; });
  };
  const production = await import('../src/services/runtimeArtifactClient.ts?production-alias=1');
  production.setRuntimeArtifactManifestIdentity('shared-signature');
  production.registerRuntimeArtifactContentHashes('shared-signature', {
    'publish/browser.json': 'deadbeef',
    'dist-data/browser.json': 'deadbeef',
  });

  const [published, distData] = await Promise.all([
    production.fetchRuntimeArtifactJson({
      manifestIdentity: 'shared-signature',
      artifactPath: 'publish/browser.json',
      resolvedUrl: 'https://runtime.test/publish/browser.json',
    }),
    production.fetchRuntimeArtifactJson({
      manifestIdentity: 'shared-signature',
      artifactPath: 'dist-data/browser.json',
      resolvedUrl: 'https://runtime.test/dist-data/browser.json',
    }),
  ]);
  assert.strictEqual(published, distData);
  assert.equal(fetches, 1);
  assert.equal(parses, 1);
});
