import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const serviceSource = fs.readFileSync('src/services/runtime-health-summary.service.ts', 'utf8');
const abiSource = fs.readFileSync('src/services/runtime-health-summary-abi.ts', 'utf8');
const frontendTypesSource = fs.readFileSync('../frontend/src/runtime/types.ts', 'utf8');
const healthViewSource = fs.readFileSync('../frontend/src/views/RuntimeHealthView.vue', 'utf8');

function sourceSection(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source section start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing source section end: ${endNeedle}`);
  return source.slice(start, end);
}

test('runtime health owns an explicit artifact probe ABI', () => {
  assert.match(serviceSource, /from '\.\/runtime-health-summary-abi'/);
  assert.match(abiSource, /RUNTIME_HEALTH_ARTIFACT_STATUS = Object\.freeze/);
  assert.match(abiSource, /RUNTIME_HEALTH_ARTIFACT_DESCRIPTORS/);
  assert.match(abiSource, /RUNTIME_HEALTH_ARTIFACT_ERRORS/);
  assert.match(abiSource, /export type RuntimeHealthArtifactProbeName/);
  assert.match(abiSource, /export interface RuntimeHealthArtifactProbe/);
  assert.match(abiSource, /RUNTIME_HEALTH_REQUIRED_ARTIFACTS/);
  assert.match(abiSource, /RUNTIME_HEALTH_MANIFEST_FILE_ARTIFACTS/);
  assert.match(abiSource, /validateAndFreezeRuntimeHealthArtifactDescriptors/);
  for (const artifact of [
    'manifest',
    'validationReport',
    'migrationReadiness',
    'neiBrowserContract',
    'recipeFragmentation',
    'exportPathHygiene',
    'externalRuntimePromotionReport',
  ]) {
    assert.match(abiSource, new RegExp(`'${artifact}'`));
  }
  assert.doesNotMatch(serviceSource, /RUNTIME_HEALTH_REQUIRED_ARTIFACTS = Object\.freeze/);
  assert.doesNotMatch(serviceSource, /RUNTIME_HEALTH_ARTIFACT_STATUS = Object\.freeze/);
});

test('runtime health JSON artifacts are probed as present missing or invalid instead of swallowed into null', () => {
  const readArtifact = sourceSection(
    serviceSource,
    'function readRuntimeHealthJsonArtifact',
    'function asRecord',
  );

  assert.match(abiSource, /RUNTIME_HEALTH_ARTIFACT_STATUS\.missing/);
  assert.match(serviceSource, /createMissingRuntimeHealthArtifactProbe/);
  assert.match(readArtifact, /RUNTIME_HEALTH_ARTIFACT_STATUS\.invalid/);
  assert.match(readArtifact, /RUNTIME_HEALTH_ARTIFACT_STATUS\.present/);
  assert.match(readArtifact, /RUNTIME_HEALTH_ARTIFACT_ERRORS\.jsonObjectRequired/);
  assert.match(abiSource, /runtime health artifact JSON payload must be an object/);
  assert.doesNotMatch(serviceSource, /'runtime health artifact JSON payload must be an object'/);
  assert.match(readArtifact, /error instanceof Error \? error\.message : String\(error\)/);
  assert.doesNotMatch(readArtifact, /catch \{\s*return null;\s*\}/s);
  assert.doesNotMatch(serviceSource, /function readJson\(filePath: string\): JsonRecord \| null/);
});

test('runtime health status fails closed on invalid or missing required artifacts', () => {
  const summaryAssembly = sourceSection(serviceSource, 'export function getRuntimeHealthSummary', 'cache = {');

  assert.match(abiSource, /export function chooseRuntimeHealthSummaryStatus/);
  assert.match(abiSource, /args\.artifactStatus !== RUNTIME_HEALTH_ARTIFACT_SUMMARY_STATUS\.ok/);
  assert.match(abiSource, /RUNTIME_HEALTH_SUMMARY_STATUS\.blocked/);
  assert.match(abiSource, /RUNTIME_HEALTH_SUMMARY_STATUS\.warning/);
  assert.match(abiSource, /RUNTIME_HEALTH_SUMMARY_STATUS\.degraded/);
  assert.match(abiSource, /export function summarizeRuntimeHealthArtifacts/);
  assert.match(summaryAssembly, /const artifactReads = new Map<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactRead>/);
  assert.match(summaryAssembly, /const manifestRead = readRuntimeHealthJsonArtifact/);
  assert.match(summaryAssembly, /const artifacts = summarizeRuntimeHealthArtifacts\(artifactReads\)/);
  assert.match(summaryAssembly, /chooseRuntimeHealthSummaryStatus\(\{/);
  assert.match(summaryAssembly, /artifactStatus: artifacts\.status/);
  assert.match(summaryAssembly, /artifacts,/);
  assert.doesNotMatch(serviceSource, /function chooseStatus/);
  assert.doesNotMatch(serviceSource, /args\.artifactStatus !== 'ok'/);
  assert.doesNotMatch(serviceSource, /schemaVersion: 'neonei\/runtime-health-summary\/current'/);
  assert.match(abiSource, /RUNTIME_HEALTH_SCHEMA_VERSION = 'neonei\/runtime-health-summary\/current'/);
  assert.match(abiSource, /RUNTIME_HEALTH_CACHE_POLICY/);
  assert.match(abiSource, /resolveRuntimeHealthCacheTtlMs/);
  assert.match(serviceSource, /const CACHE_TTL_MS = resolveRuntimeHealthCacheTtlMs\(\)/);
});

test('runtime health artifact probe ABI is visible to frontend observability', () => {
  assert.match(frontendTypesSource, /export type RuntimeHealthArtifactProbeStatus = 'present' \| 'missing' \| 'invalid'/);
  assert.match(frontendTypesSource, /export interface RuntimeHealthArtifactProbe/);
  assert.match(frontendTypesSource, /artifacts: \{/);
  assert.match(healthViewSource, /const runtimeHealthArtifacts = computed/);
  assert.match(healthViewSource, /Runtime Health Artifact Probes/);
  assert.match(healthViewSource, /health\.artifacts\?\.errors/);
});
