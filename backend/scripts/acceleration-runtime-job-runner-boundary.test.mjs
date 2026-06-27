import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const jobRunnerPath = resolve(root, 'src/services/acceleration-runtime-job-runner.service.ts');
const reconcileWorkerPath = resolve(root, 'src/services/acceleration-runtime-reconcile-worker.service.ts');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
const jobRunner = readFileSync(jobRunnerPath, 'utf8');
const reconcileWorker = readFileSync(reconcileWorkerPath, 'utf8');

test('acceleration runtime child jobs live in a dedicated job runner', () => {
  assert.equal(existsSync(jobRunnerPath), true, 'acceleration-runtime-job-runner.service.ts must exist');
  assert.match(jobRunner, /import \{ spawn \} from 'child_process'/);
  assert.match(jobRunner, /function pipeChildOutput/);
  assert.match(jobRunner, /function runBackgroundNodeJob/);
  assert.match(jobRunner, /export function compileAccelerationSnapshotInChild/);
  assert.match(jobRunner, /export function materializePublishPayloadsInChild/);
  assert.match(jobRunner, /ACCEL_COMPILE_RESULT/);
  assert.match(jobRunner, /PUBLISH_PAYLOAD_RESULT/);
});

test('acceleration reconcile worker delegates child jobs instead of spawning them inline from the scheduler', () => {
  assert.match(reconcileWorker, /from '\.\/acceleration-runtime-job-runner\.service'/);
  assert.match(reconcileWorker, /compileAccelerationSnapshotInChild\(candidateDbPath\)/);
  assert.match(reconcileWorker, /materializePublishPayloadsInChild\(\)/);
  assert.doesNotMatch(runtimeService, /from '\.\/acceleration-runtime-job-runner\.service'/);
  assert.doesNotMatch(runtimeService, /compileAccelerationSnapshotInChild\(/);
  assert.doesNotMatch(runtimeService, /materializePublishPayloadsInChild\(/);
  assert.doesNotMatch(runtimeService, /import \{ spawn \} from 'child_process'/);
  assert.doesNotMatch(runtimeService, /process\.execPath/);
  assert.doesNotMatch(runtimeService, /NEONEI_BACKEND_MODULE_ROOT/);
  assert.doesNotMatch(runtimeService, /function pipeChildOutput/);
  assert.doesNotMatch(runtimeService, /function runBackgroundNodeJob/);
  assert.doesNotMatch(runtimeService, /ACCEL_COMPILE_RESULT/);
  assert.doesNotMatch(runtimeService, /PUBLISH_PAYLOAD_RESULT/);
});

test('acceleration runtime job runner keeps active backend-root module resolution', () => {
  assert.match(jobRunner, /NEONEI_BACKEND_MODULE_ROOT:\s*path\.resolve\(__dirname, '\.\.'\)/);
  assert.match(jobRunner, /function requireFromBackendRoot\(modulePath\)/);
  assert.match(jobRunner, /require\(path\.join\(moduleRoot, modulePath\)\)/);
  assert.match(jobRunner, /requireFromBackendRoot\('services\/acceleration-runtime-compiler-probe\.service'\)/);
  assert.doesNotMatch(jobRunner, /require\('\.\/src\//);
  assert.doesNotMatch(jobRunner, /require\('\.\/dist\//);
});
