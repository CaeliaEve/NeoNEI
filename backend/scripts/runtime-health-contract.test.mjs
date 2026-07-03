import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const serviceSource = fs.readFileSync('src/services/runtime-health-summary.service.ts', 'utf8');
const healthAbiSource = fs.readFileSync('src/services/runtime-health-summary-abi.ts', 'utf8');
const deliverySource = fs.readFileSync('src/services/runtime-observability-delivery.service.ts', 'utf8');
const deliveryAbiSource = fs.readFileSync('src/services/runtime-observability-delivery-abi.ts', 'utf8');
const runtimeEndpointRegistrySource = fs.readFileSync('src/routes/runtime-public-endpoint-registry.ts', 'utf8');
const runtimeEndpointHandlerSource = fs.readFileSync('src/routes/runtime-public-endpoint-handlers.ts', 'utf8');
const diagnosticsSource = fs.readFileSync('src/services/runtime-diagnostics-summary.service.ts', 'utf8');

test('runtime health exposes the stable public health contract', () => {
  assert.equal(
    healthAbiSource.includes("RUNTIME_HEALTH_SCHEMA_VERSION = 'neonei/runtime-health-summary/current'"),
    true,
    'runtime health summary must keep a stable schemaVersion',
  );
  for (const field of ['distData', 'artifacts', 'counts', 'coverage', 'validation', 'files', 'runtimeSnapshot', 'compiler', 'nativeUi', 'nativeRender']) {
    assert.equal(
      serviceSource.includes(`${field}:`),
      true,
      `runtime health summary should expose ${field}`,
    );
  }
  assert.equal(
    serviceSource.includes('acquireCurrentRuntimeSnapshot'),
    true,
    'runtime health should read current runtime identity and artifact inventory through the snapshot read-handle service',
  );
  assert.equal(
    serviceSource.includes('RuntimeHealthSummaryOptions'),
    true,
    'runtime health should accept an explicit snapshot from higher-level request contexts',
  );
  assert.equal(
    serviceSource.includes('cacheMatchesSnapshot'),
    true,
    'runtime health cache must be tied to the pinned snapshot identity when one is provided',
  );
  assert.doesNotMatch(
    serviceSource,
    /getCurrentRuntimeSnapshot/,
    'runtime health must not bypass the snapshot read-handle boundary',
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
    serviceSource.includes('getNativeUiRuntimeProofSummary'),
    true,
    'runtime health should expose the Native UI producer/compiler proof chain',
  );
  assert.equal(
    serviceSource.includes('nativeUiProofBlocked'),
    true,
    'runtime health should fail closed when Native UI proof reports are missing or blocked',
  );
  assert.equal(
    runtimeEndpointRegistrySource.includes("path: '/health'"),
    true,
    'runtime endpoint registry should expose /runtime/health',
  );
  assert.equal(
    deliverySource.includes('getCurrentRuntimeHealthDelivery')
      && deliveryAbiSource.includes('contractVersion'),
    true,
    'runtime health delivery should include the runtime contract version',
  );
  assert.equal(
    runtimeEndpointHandlerSource.includes('getCurrentRuntimeHealthDelivery()'),
    true,
    'runtime health handler should expose the delivery boundary',
  );
});

test('runtime diagnostics route is a read-only service boundary', () => {
  assert.equal(
    deliverySource.includes('getRuntimeDiagnosticsSummary()'),
    true,
    'runtime diagnostics delivery should delegate diagnostic assembly to a service boundary',
  );
  assert.equal(
    runtimeEndpointHandlerSource.includes('res.json(getCurrentRuntimeDiagnosticsDelivery())'),
    true,
    'runtime diagnostics handler should only expose the delivery summary',
  );
  assert.doesNotMatch(
    runtimeEndpointHandlerSource,
    /fs\.existsSync/,
    'runtime diagnostics handler must not own direct filesystem readiness checks',
  );
  assert.doesNotMatch(
    runtimeEndpointHandlerSource,
    /getNativeRenderRuntimeDiagnostics/,
    'runtime diagnostics handler must consume native render diagnostics through runtime health',
  );
  assert.equal(
    diagnosticsSource.includes('schemaVersion: RUNTIME_DIAGNOSTICS_SCHEMA_VERSION')
      && diagnosticsSource.includes("RUNTIME_DIAGNOSTICS_SCHEMA_VERSION"),
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
  assert.equal(
    diagnosticsSource.includes('nativeUi: health.nativeUi'),
    true,
    'runtime diagnostics should expose Native UI proof state from runtime health',
  );
});
