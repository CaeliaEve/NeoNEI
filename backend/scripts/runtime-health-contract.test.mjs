import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const serviceSource = fs.readFileSync('src/services/runtime-health-summary.service.ts', 'utf8');
const routeSource = fs.readFileSync('src/routes/runtime.routes.ts', 'utf8');

test('runtime health exposes the stable public health contract', () => {
  assert.equal(
    serviceSource.includes("schemaVersion: 'neonei/runtime-health-summary/current'"),
    true,
    'runtime health summary must keep a stable schemaVersion',
  );
  for (const field of ['distData', 'counts', 'coverage', 'validation', 'files', 'nativeRender']) {
    assert.equal(
      serviceSource.includes(`${field}:`),
      true,
      `runtime health summary should expose ${field}`,
    );
  }
  assert.equal(
    routeSource.includes("router.get('/health'"),
    true,
    'runtime routes should expose /runtime/health',
  );
  assert.equal(
    routeSource.includes('contractVersion'),
    true,
    'runtime health response should include the runtime contract version',
  );
});
