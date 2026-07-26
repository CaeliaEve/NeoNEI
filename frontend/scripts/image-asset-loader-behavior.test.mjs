import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync('src/services/imageAssetLoader.ts', 'utf8').replace(
  /import \{ resolveOpfsCachedAssetUrl \} from ['"]\.\/opfsAssetCache['"];?/,
  'const resolveOpfsCachedAssetUrl = globalThis.__imageLoaderTestResolveOpfs;',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const failedSources = new Set();
const createdBySource = new Map();

class FakeImage {
  constructor() {
    this.width = 16;
    this.height = 16;
    this.naturalWidth = 16;
    this.naturalHeight = 16;
  }

  set src(value) {
    this.currentSrc = value;
    createdBySource.set(value, (createdBySource.get(value) ?? 0) + 1);
    queueMicrotask(() => {
      if (failedSources.has(value)) {
        this.onerror?.(new Error(`injected image failure: ${value}`));
      } else {
        this.onload?.();
      }
    });
  }

  async decode() {}
}

globalThis.Image = FakeImage;
let resolverCalls = 0;
let resolver = async () => null;
globalThis.__imageLoaderTestResolveOpfs = async (src) => {
  resolverCalls += 1;
  return resolver(src);
};

const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}#${Date.now()}`;
const loader = await import(moduleUrl);

test('concurrent callers share one image request and publish warm/decoded state', async () => {
  resolverCalls = 0;
  const url = '/assets/concurrent.png';
  const [first, second, third] = await Promise.all([
    loader.loadImageAsset(url),
    loader.loadImageAsset(url),
    loader.loadImageAsset(url),
  ]);

  assert.equal(first, second);
  assert.equal(second, third);
  assert.equal(createdBySource.get(url), 1);
  assert.equal(resolverCalls, 1);
  assert.equal(loader.isImageAssetWarm(url), true);
  assert.equal(loader.isImageAssetDecoded(url), true);
});

test('failed requests leave no poisoned in-flight entry and can retry', async () => {
  const url = '/assets/retry.png';
  failedSources.add(url);
  await assert.rejects(loader.loadImageAsset(url), /Image load failed/);
  failedSources.delete(url);

  const image = await loader.loadImageAsset(url);
  assert.equal(image.currentSrc, url);
  assert.equal(createdBySource.get(url), 2);
  assert.equal(loader.isImageAssetDecoded(url), true);
});

test('OPFS resolution loads the blob URL while retaining the original cache key', async () => {
  resolverCalls = 0;
  const url = '/assets/opfs-key.png';
  const blobUrl = 'blob:test-opfs-key';
  resolver = async (candidate) => candidate === url ? blobUrl : null;

  const first = await loader.loadImageAsset(url);
  const second = await loader.loadImageAsset(url);
  assert.equal(first, second);
  assert.equal(first.currentSrc, blobUrl);
  assert.equal(createdBySource.get(blobUrl), 1);
  assert.equal(resolverCalls, 1);
  assert.equal(loader.isImageAssetWarm(url), true);
  resolver = async () => null;
});

test('short image cache is bounded while longer warm history remains available', async () => {
  const prefix = '/assets/lru/';
  for (let index = 0; index < 385; index += 1) {
    await loader.loadImageAsset(`${prefix}${index}.png`);
  }

  const oldest = `${prefix}0.png`;
  assert.equal(loader.isImageAssetWarm(oldest), true, 'warm history should outlive the short image cache');
  const beforeReload = createdBySource.get(oldest);
  await loader.loadImageAsset(oldest);
  assert.equal(createdBySource.get(oldest), beforeReload + 1, 'oldest decoded image should have been evicted');
});

test('warm history obeys its configured hard bound', async () => {
  const prefix = '/assets/history/';
  for (let index = 0; index < 8193; index += 1) {
    await loader.loadImageAsset(`${prefix}${index}.png`);
  }

  assert.equal(loader.isImageAssetWarm(`${prefix}0.png`), false);
  assert.equal(loader.isImageAssetWarm(`${prefix}8192.png`), true);
});
