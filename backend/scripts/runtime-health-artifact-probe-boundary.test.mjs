import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const serviceSource = fs.readFileSync('src/services/runtime-health-summary.service.ts', 'utf8');
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
  assert.match(serviceSource, /RUNTIME_HEALTH_ARTIFACT_STATUS = Object\.freeze/);
  assert.match(serviceSource, /export type RuntimeHealthArtifactProbeName/);
  assert.match(serviceSource, /export interface RuntimeHealthArtifactProbe/);
  assert.match(serviceSource, /RUNTIME_HEALTH_REQUIRED_ARTIFACTS = Object\.freeze/);
  for (const artifact of [
    'manifest',
    'validationReport',
    'migrationReadiness',
    'neiBrowserContract',
    'recipeFragmentation',
    'exportPathHygiene',
    'externalRuntimePromotionReport',
  ]) {
    assert.match(serviceSource, new RegExp(`'${artifact}'`));
  }
});

test('runtime health JSON artifacts are probed as present missing or invalid instead of swallowed into null', () => {
  const readArtifact = sourceSection(
    serviceSource,
    'function readRuntimeHealthJsonArtifact',
    'function asRecord',
  );

  assert.match(serviceSource, /RUNTIME_HEALTH_ARTIFACT_STATUS\.missing/);
  assert.match(readArtifact, /RUNTIME_HEALTH_ARTIFACT_STATUS\.invalid/);
  assert.match(readArtifact, /RUNTIME_HEALTH_ARTIFACT_STATUS\.present/);
  assert.match(readArtifact, /runtime health artifact JSON payload must be an object/);
  assert.match(readArtifact, /error instanceof Error \? error\.message : String\(error\)/);
  assert.doesNotMatch(readArtifact, /catch \{\s*return null;\s*\}/s);
  assert.doesNotMatch(serviceSource, /function readJson\(filePath: string\): JsonRecord \| null/);
});

test('runtime health status fails closed on invalid or missing required artifacts', () => {
  const chooseStatus = sourceSection(serviceSource, 'function chooseStatus', 'function hasPinnedSnapshotOption');
  const summaryAssembly = sourceSection(serviceSource, 'export function getRuntimeHealthSummary', 'cache = {');

  assert.match(chooseStatus, /artifactStatus: RuntimeHealthSummary\['artifacts'\]\['status'\]/);
  assert.match(chooseStatus, /args\.artifactStatus !== 'ok'/);
  assert.match(summaryAssembly, /const artifactReads = new Map<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactRead>/);
  assert.match(summaryAssembly, /const manifestRead = readRuntimeHealthJsonArtifact/);
  assert.match(summaryAssembly, /const artifacts = summarizeRuntimeHealthArtifacts\(artifactReads\)/);
  assert.match(summaryAssembly, /artifactStatus: artifacts\.status/);
  assert.match(summaryAssembly, /artifacts,/);
});

test('runtime health artifact probe ABI is visible to frontend observability', () => {
  assert.match(frontendTypesSource, /export type RuntimeHealthArtifactProbeStatus = 'present' \| 'missing' \| 'invalid'/);
  assert.match(frontendTypesSource, /export interface RuntimeHealthArtifactProbe/);
  assert.match(frontendTypesSource, /artifacts: \{/);
  assert.match(healthViewSource, /const runtimeHealthArtifacts = computed/);
  assert.match(healthViewSource, /Runtime Health Artifact Probes/);
  assert.match(healthViewSource, /health\.artifacts\?\.errors/);
});
