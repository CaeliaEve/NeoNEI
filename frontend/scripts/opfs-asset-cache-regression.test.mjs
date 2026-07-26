import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

const opfs = read('src/services/opfsAssetCache.ts');
const imageAssetLoader = read('src/services/imageAssetLoader.ts');
const sitePreheater = read('src/composables/useSitePreheater.ts');
const runtimeSession = read('src/services/api/runtimeSession.ts');

const checks = [
  {
    name: 'OPFS asset cache uses navigator.storage.getDirectory and blob URLs',
    pass: opfs.includes('navigator.storage.getDirectory')
      && opfs.includes('URL.createObjectURL')
      && opfs.includes('fetch(normalized')
      && opfs.includes('clearOpfsAssetCache')
      && opfs.includes('getOpfsAssetCacheStats'),
  },
  {
    name: 'image prewarm resolves OPFS cached asset URL before decode',
    pass: imageAssetLoader.includes("resolveOpfsCachedAssetUrl")
      && imageAssetLoader.includes('loadImage(cachedSrc ?? src)'),
  },
  {
    name: 'site preheater reports and clears IDB plus OPFS caches together',
    pass: sitePreheater.includes('getOpfsAssetCacheStats')
      && sitePreheater.includes('clearOpfsAssetCache()')
      && sitePreheater.includes('runtimeStats.entryCount + opfsStats.entryCount'),
  },
  {
    name: 'small JSON runtime payloads remain IndexedDB-backed before HTTP fallback',
    pass: runtimeSession.includes('readPersistentRuntimePayload')
      && runtimeSession.includes('persistRuntimePayload')
      && runtimeSession.includes('fetchPublishedJson'),
  },
];

const failed = checks.filter((check) => !check.pass);
if (failed.length > 0) {
  for (const check of failed) {
    console.error(`FAIL ${check.name}`);
  }
  process.exit(1);
}

for (const check of checks) {
  console.log(`PASS ${check.name}`);
}
