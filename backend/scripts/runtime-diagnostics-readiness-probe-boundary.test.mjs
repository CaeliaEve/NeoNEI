import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const serviceSource = fs.readFileSync('src/services/runtime-diagnostics-summary.service.ts', 'utf8');
const abiSource = fs.readFileSync('src/services/runtime-diagnostics-summary-abi.ts', 'utf8');

function sourceSection(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source section start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing source section end: ${endNeedle}`);
  return source.slice(start, end);
}

test('runtime diagnostics owns an explicit readiness probe ABI catalog', () => {
  assert.match(abiSource, /RUNTIME_DIAGNOSTICS_SCHEMA_VERSION = 'neonei\/runtime-diagnostics\/current'/);
  assert.match(abiSource, /RUNTIME_DIAGNOSTICS_READINESS_STATUS = Object\.freeze/);
  assert.match(abiSource, /export type RuntimeDiagnosticsReadinessProbeName/);
  assert.match(abiSource, /export const RUNTIME_DIAGNOSTICS_READINESS_PROBE_DESCRIPTORS/);
  assert.match(abiSource, /validateAndFreezeRuntimeDiagnosticsReadinessProbeDescriptors/);

  for (const probe of [
    'dataDir',
    'publishDir',
    'activePublishRoot',
    'publishBundle',
    'browserLayout',
    'runtimeCacheKey',
    'sourceSignature',
  ]) {
    assert.match(abiSource, new RegExp(`'${probe}'`));
  }
});

test('runtime diagnostics readiness probes report ready missing or invalid without boolean existsSync collapse', () => {
  const readinessBuilder = sourceSection(
    serviceSource,
    'function buildRuntimeDiagnosticsReadiness',
    'export function getRuntimeDiagnosticsSummary',
  );
  const directoryProbe = sourceSection(
    serviceSource,
    'function probeRuntimeDiagnosticsDirectory',
    'function probeRuntimeDiagnosticsManifestValue',
  );

  assert.match(serviceSource, /RuntimeDiagnosticsReadinessProbeStatus/);
  assert.match(serviceSource, /RuntimeDiagnosticsReadiness = Readonly/);
  assert.match(directoryProbe, /fs\.statSync/);
  assert.match(directoryProbe, /stat\.isDirectory\(\)/);
  assert.match(directoryProbe, /RUNTIME_DIAGNOSTICS_READINESS_STATUS\.ready/);
  assert.match(directoryProbe, /RUNTIME_DIAGNOSTICS_READINESS_STATUS\.missing/);
  assert.match(directoryProbe, /RUNTIME_DIAGNOSTICS_READINESS_STATUS\.invalid/);
  assert.match(readinessBuilder, /RUNTIME_DIAGNOSTICS_READINESS_PROBE_DESCRIPTORS/);
  assert.doesNotMatch(serviceSource, /fs\.existsSync/);
});

test('runtime diagnostics summary status is driven by readiness status instead of top-level missing strings', () => {
  const chooseStatus = sourceSection(
    serviceSource,
    'function chooseDiagnosticsStatus',
    'function describeError',
  );
  const summaryAssembly = sourceSection(
    serviceSource,
    'export function getRuntimeDiagnosticsSummary',
    'health,',
  );

  assert.match(chooseStatus, /readinessStatus: RuntimeDiagnosticsReadinessStatus/);
  assert.match(chooseStatus, /RUNTIME_DIAGNOSTICS_READINESS_STATUS\.invalid/);
  assert.match(chooseStatus, /RUNTIME_DIAGNOSTICS_READINESS_STATUS\.ready/);
  assert.match(summaryAssembly, /const readiness = buildRuntimeDiagnosticsReadiness\(manifest\)/);
  assert.match(summaryAssembly, /status: chooseDiagnosticsStatus\(health\.status, readiness\.status\)/);
  assert.match(summaryAssembly, /schemaVersion: RUNTIME_DIAGNOSTICS_SCHEMA_VERSION/);
  assert.doesNotMatch(serviceSource, /^\s+missing: string\[\];/m);
  assert.doesNotMatch(serviceSource, /^\s+missing,$/m);
});
