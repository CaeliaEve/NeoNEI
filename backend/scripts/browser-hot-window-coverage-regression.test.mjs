import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const compilerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/neonei-compiler.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const materializerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('compiler defaults expand browser hot-window and search hot-shard coverage', () => {
  assert.equal(
    compilerSource.includes('pages: options.hotPageAtlas?.pages ?? 12,'),
    true,
    'compiler should prebuild more hot atlas pages for the browser surface',
  );
  assert.equal(
    compilerSource.includes('windowCount: options.publishHotPayloads?.windowCount ?? 10,'),
    true,
    'compiler should materialize a wider hot-page window ring by default',
  );
  assert.equal(
    compilerSource.includes('windowStride: options.publishHotPayloads?.windowStride ?? 64,'),
    true,
    'compiler should overlap hot-page windows more aggressively to reduce uncached flip misses',
  );
  assert.equal(
    compilerSource.includes('searchHotShardSize: options.publishHotPayloads?.searchHotShardSize ?? 8192,'),
    true,
    'compiler should widen the hot search shard so more browser searches stay on the small fast path',
  );
});

test('publish payload materializer keeps standalone defaults aligned with the expanded hot ring', () => {
  assert.equal(
    materializerSource.includes("export const PUBLISH_PAYLOAD_REVISION = '2026-04-28-publish-static-bundle-v8';"),
    true,
    'publish payload revision should advance when the bundle hot-window layout changes',
  );
  assert.equal(
    materializerSource.includes('windowCount: Math.max(1, Math.floor(options.publishHotPayloads?.windowCount ?? 10)),'),
    true,
    'materializer should keep the wider hot-window count as the standalone default',
  );
  assert.equal(
    materializerSource.includes('?? Math.max(48, Math.floor((options.publishHotPayloads?.firstPageSize ?? 256) / 4)),'),
    true,
    'materializer should use denser overlapping windows when no explicit stride override is provided',
  );
  assert.equal(
    materializerSource.includes('searchHotShardSize: Math.max(512, Math.floor(options.publishHotPayloads?.searchHotShardSize ?? 8192)),'),
    true,
    'materializer should match the expanded hot search shard default',
  );
});
