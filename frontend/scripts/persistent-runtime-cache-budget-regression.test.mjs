import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  estimatePersistentRuntimePayloadBytes,
  PERSISTENT_RUNTIME_CACHE_MAX_BYTES,
} from '../src/services/persistentRuntimeCache.ts';

const source = readFileSync('src/services/persistentRuntimeCache.ts', 'utf8').replace(/\r\n/g, '\n');

test('persistent runtime payload sizing handles binary, text and structured payloads', () => {
  assert.equal(estimatePersistentRuntimePayloadBytes(new ArrayBuffer(64)), 64);
  assert.equal(estimatePersistentRuntimePayloadBytes(new Uint8Array(17)), 17);
  assert.equal(estimatePersistentRuntimePayloadBytes('abc'), 3);
  assert.ok(estimatePersistentRuntimePayloadBytes({ value: 'abc' }) >= 15);
});

test('persistent runtime cache deduplicates reads before IndexedDB and enforces a byte LRU budget', () => {
  assert.equal(PERSISTENT_RUNTIME_CACHE_MAX_BYTES, 256 * 1024 * 1024);
  assert.match(source, /const readInFlightByCacheKey = new Map<string, Promise<unknown \| null>>\(\)/);
  assert.match(source, /const existing = readInFlightByCacheKey\.get\(cacheKey\)/);
  assert.match(source, /const METADATA_STORE_NAME = 'packMetadata'/);
  assert.match(source, /const STATE_STORE_NAME = 'state'/);
  assert.match(source, /metadataStore\.index\(LAST_ACCESSED_INDEX_NAME\)\.openCursor\(\)/);
  assert.doesNotMatch(source, /records\.push\(\{[\s\S]*recordBytes\(record\)/);
});
