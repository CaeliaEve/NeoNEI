import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

test('publish, dist-data and native loaders share the canonical runtime artifact client', () => {
  const runtimeSession = read('src/services/api/runtimeSession.ts');
  const distResolver = read('src/services/distDataRuntimeAssetResolver.ts');
  const nativeLoader = read('src/native-surface/runtimeLoader.ts');

  assert.match(runtimeSession, /loadJson: fetchRuntimeArtifactJson/);
  assert.match(distResolver, /fetchRuntimeArtifactJson<T>/);
  assert.match(distResolver, /fetchRuntimeArtifactArrayBuffer/);
  assert.match(nativeLoader, /fetchRuntimeArtifactJson<unknown>/);
  assert.match(nativeLoader, /fetchRuntimeArtifactArrayBuffer/);
});

test('duplicate raw artifact memory and inflight maps are retired from adapters', () => {
  const runtimeSession = read('src/services/api/runtimeSession.ts');
  const nativeLoader = read('src/native-surface/runtimeLoader.ts');

  assert.doesNotMatch(runtimeSession, /publishedJsonValueCache|publishedJsonInFlight/);
  assert.doesNotMatch(nativeLoader, /manifestRequestCache|packRequestCache/);
  assert.doesNotMatch(read('src/runtime/publishClient.ts'), /hasMemory|getMemory|readPersistent|fetch\(url\)/);
});

test('production manifests register authoritative artifact hashes', () => {
  const runtimeSession = read('src/services/api/runtimeSession.ts');
  const distRuntime = read('src/services/distDataRuntime.ts');
  assert.match(runtimeSession, /publishBundle\?\.compression\?\.assets/);
  assert.match(runtimeSession, /registerRuntimeArtifactContentHashes/);
  assert.match(distRuntime, /files\?\.rustIntegrity/);
  assert.match(distRuntime, /registerRuntimeArtifactContentHashes/);
});

test('canonical inflight registration precedes persistent and HTTP work', () => {
  const client = read('src/runtime/RuntimeArtifactClient.ts');
  const setIndex = client.indexOf('inFlight.set(key, pending)');
  const persistentIndex = client.indexOf('options.readPersistent?.(request, key)');
  assert.ok(setIndex > 0 && persistentIndex > 0);
  assert.match(client, /const pending = Promise\.resolve\(\)\s*\.then\(async \(\) => \{/);
  assert.ok(
    setIndex > persistentIndex,
    'persistent read is deferred to a microtask, so inflight must be registered before it executes',
  );
});
