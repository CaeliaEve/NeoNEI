import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const serviceSource = fs.readFileSync('src/services/runtime-health-summary.service.ts', 'utf8');
const routeSource = fs.readFileSync('src/routes/runtime.routes.ts', 'utf8');
const diagnosticsSource = fs.readFileSync('src/services/runtime-diagnostics-summary.service.ts', 'utf8');

test('runtime health exposes the stable public health contract', () => {
  assert.equal(
    serviceSource.includes("schemaVersion: 'neonei/runtime-health-summary/current'"),
    true,
    'runtime health summary must keep a stable schemaVersion',
  );
  for (const field of ['distData', 'counts', 'coverage', 'validation', 'files', 'runtimeSnapshot', 'compiler', 'nativeRender']) {
    assert.equal(
      serviceSource.includes(`${field}:`),
      true,
      `runtime health summary should expose ${field}`,
    );
  }
  assert.equal(
    serviceSource.includes('getCurrentRuntimeSnapshot'),
    true,
    'runtime health should read current runtime identity and artifact inventory from the immutable snapshot service',
  );
  assert.equal(
    serviceSource.includes('buildRuntimeSnapshotHealth'),
    true,
    'runtime health should derive file diagnostics from a snapshot-backed boundary',
  );
  assert.doesNotMatch(
    serviceSource,
    /function readDeclaredFileStats/,
    'runtime health must not own a second declared-file filesystem scanner',
  );
  assert.equal(
    serviceSource.includes('resolveAccelerationCompilerAuthority'),
    true,
    'runtime health should expose the active compiler authority',
  );
  assert.equal(
    serviceSource.includes('externalRuntimePromotion'),
    true,
    'runtime health should expose external runtime promotion status',
  );
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

test('runtime diagnostics route is a read-only service boundary', () => {
  assert.equal(
    routeSource.includes('getRuntimeDiagnosticsSummary'),
    true,
    'runtime diagnostics route should delegate diagnostic assembly to a service boundary',
  );
  assert.equal(
    routeSource.includes('res.json(getRuntimeDiagnosticsSummary())'),
    true,
    'runtime diagnostics route should only expose the service summary',
  );
  assert.doesNotMatch(
    routeSource,
    /fs\.existsSync/,
    'runtime diagnostics route must not own direct filesystem readiness checks',
  );
  assert.doesNotMatch(
    routeSource,
    /getNativeRenderRuntimeDiagnostics/,
    'runtime diagnostics route must consume native render diagnostics through runtime health',
  );
  assert.equal(
    diagnosticsSource.includes("schemaVersion: 'neonei/runtime-diagnostics/current'"),
    true,
    'runtime diagnostics service must keep a stable schemaVersion',
  );
  assert.equal(
    diagnosticsSource.includes('getRuntimeHealthSummary'),
    true,
    'runtime diagnostics service should build on runtime health as the read-only authority',
  );
  assert.equal(
    diagnosticsSource.includes("if (healthStatus === 'blocked') return 'blocked'"),
    true,
    'runtime diagnostics status must fail closed when health is blocked',
  );
  assert.equal(
    diagnosticsSource.includes('nativeRender: health.nativeRender'),
    true,
    'runtime diagnostics should not re-read native render diagnostics outside runtime health',
  );
});
