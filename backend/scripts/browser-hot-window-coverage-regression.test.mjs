import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const compilerSource = fs.readFileSync(
  'src/services/neonei-compiler.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const materializerSource = fs.readFileSync(
  'src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('compiler defaults expand browser hot-window and search hot-shard coverage without page atlas warmup', () => {
  assert.equal(
    compilerSource.includes('hotPageAtlas'),
    false,
    'compiler should not retain page-atlas warmup options after native/global atlas takeover',
  );
  assert.equal(
    compilerSource.includes("windowCount: options.publishHotPayloads?.windowCount ?? numberFromEnv('NEONEI_PUBLISH_WINDOW_COUNT', 48),"),
    true,
    'compiler should materialize a much wider hot-page window ring by default',
  );
  assert.equal(
    compilerSource.includes("windowStride: options.publishHotPayloads?.windowStride ?? numberFromEnv('NEONEI_PUBLISH_WINDOW_STRIDE', 64),"),
    true,
    'compiler should overlap hot-page windows more aggressively to reduce uncached flip misses',
  );
  assert.equal(
    compilerSource.includes("searchHotShardSize: options.publishHotPayloads?.searchHotShardSize ?? numberFromEnv('NEONEI_PUBLISH_SEARCH_HOT_SHARD_SIZE', 8192),"),
    true,
    'compiler should widen the hot search shard so more browser searches stay on the small fast path',
  );
});

test('publish payload materializer keeps standalone defaults aligned with the expanded hot ring', () => {
  assert.equal(
    materializerSource.includes("export const PUBLISH_PAYLOAD_REVISION = '2026-05-23-publish-static-bundle-v12-recipe-group-windows';"),
    true,
    'publish payload revision should identify the current materialized bundle layout',
  );
  assert.equal(
    materializerSource.includes('PageAtlasService'),
    false,
    'publish payload materializer should not build retired page-scoped atlas payloads',
  );
  assert.equal(
    materializerSource.includes('windowCount: Math.max(1, Math.floor(options.publishHotPayloads?.windowCount ?? 48)),'),
    true,
    'materializer should keep the much wider hot-window count as the standalone default',
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
