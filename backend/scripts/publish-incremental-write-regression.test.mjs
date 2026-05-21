import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('publish compiler writes shards incrementally instead of deleting unchanged output', () => {
  assert.equal(
    source.includes('function writeUtf8IfChanged('),
    true,
    'publish compiler should have a UTF-8 write-if-changed helper',
  );
  assert.equal(
    source.includes('function writeBufferIfChanged('),
    true,
    'publish compiler should have a binary write-if-changed helper for compressed sidecars',
  );
  assert.equal(
    source.includes('fs.rmSync(bundleOutputDir, { recursive: true, force: true });\n      fs.mkdirSync(bundleOutputDir'),
    false,
    'enabled publish builds should not delete the whole static bundle directory before recompiling shards',
  );
  assert.equal(
    source.includes('incremental: { ...incrementalWriteStats }'),
    true,
    'build-report should expose written/skipped counters for incremental compile verification',
  );
  assert.equal(
    (source.match(/writeUtf8IfChanged\(/g) ?? []).length >= 4,
    true,
    'JSON payloads, manifest, and build reports should all use incremental writes',
  );
  assert.equal(
    (source.match(/writeBufferIfChanged\(/g) ?? []).length >= 3,
    true,
    'compressed sidecars should use incremental binary writes',
  );
});
