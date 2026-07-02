import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const authorityPath = resolve(root, 'src/services/acceleration-runtime-compiler-authority.service.ts');
const phaseMachinePath = resolve(root, 'src/services/acceleration-runtime-phase-machine.service.ts');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const dispatcherPath = resolve(root, 'src/services/acceleration-runtime-reconcile-dispatcher.service.ts');
const workerPath = resolve(root, 'src/services/acceleration-runtime-reconcile-worker.service.ts');
const jobRunnerPath = resolve(root, 'src/services/acceleration-runtime-job-runner.service.ts');
const identityPath = resolve(root, 'src/services/external-runtime-identity.service.ts');

const authority = readFileSync(authorityPath, 'utf8');
const phaseMachine = readFileSync(phaseMachinePath, 'utf8');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
const dispatcher = readFileSync(dispatcherPath, 'utf8');
const worker = readFileSync(workerPath, 'utf8');
const jobRunner = readFileSync(jobRunnerPath, 'utf8');
const identity = readFileSync(identityPath, 'utf8');

test('compiler authority policy is explicit and fail-closed', () => {
  assert.equal(existsSync(authorityPath), true, 'compiler authority policy module must exist');
  assert.match(authority, /export type AccelerationCompilerAuthority = 'internal-sqlite' \| 'external-runtime'/);
  assert.match(authority, /NEONEI_ACCELERATION_COMPILER_AUTHORITY/);
  assert.match(authority, /export function resolveAccelerationCompilerAuthority/);
  assert.match(authority, /return 'external-runtime'/);
  assert.match(authority, /throw new Error\(/);
  assert.match(authority, /NEONEI_EXTERNAL_RUNTIME_RAW_EXPORT_ROOT/);
  assert.match(authority, /export function getExternalRuntimeRawExportRoot/);
});

test('phase machine can select external runtime without routing through internal sqlite compile', () => {
  assert.match(phaseMachine, /'compile-external-runtime'/);
  assert.match(phaseMachine, /compilerAuthority\?: 'internal-sqlite' \| 'external-runtime'/);
  assert.match(phaseMachine, /if \(input\.compilerAuthority === 'external-runtime' && !input\.fresh\) return 'compile-external-runtime'/);
  assert.match(runtimeService, /resolveAccelerationCompilerAuthority\(\)/);
  assert.match(runtimeService, /compilerAuthority === 'internal-sqlite'/);
  assert.match(runtimeService, /probeExternalRuntimeIdentityFreshness\(\{ rawExportRoot: getExternalRuntimeRawExportRoot\(\) \}\)/);
  assert.match(runtimeService, /compilerAuthority,/);
});

test('external runtime identity is a first-class freshness boundary', () => {
  assert.equal(existsSync(identityPath), true, 'external runtime identity module must exist');
  assert.match(identity, /export function computeExternalRuntimeSourceIdentity/);
  assert.match(identity, /export function readExternalRuntimePromotionIdentity/);
  assert.match(identity, /export function probeExternalRuntimeIdentityFreshness/);
  assert.match(identity, /sourceIdentity\.identity === current\.identity/);
  assert.doesNotMatch(identity, /NeoNeiCompilerService/);
  assert.doesNotMatch(identity, /compiler_state/);
});

test('dispatcher maps external runtime to a separate worker action', () => {
  assert.match(dispatcher, /refreshExternalRuntimeArtifact/);
  assert.match(dispatcher, /reconcileHandlerDescriptor\('compile-external-runtime', \(\) => refreshExternalRuntimeArtifact\(\)\)/);
  assert.match(worker, /export async function refreshExternalRuntimeArtifact\(\)/);
  assert.match(worker, /compileExternalRuntimeArtifactInChild\(\)/);
  assert.doesNotMatch(worker, /refreshExternalRuntimeArtifact[\s\S]*activateCompiledAccelerationSnapshot/);
  assert.doesNotMatch(worker, /refreshExternalRuntimeArtifact[\s\S]*promoteCompiledAccelerationDatabase/);
});

test('external runtime child job invokes elysium-compiler and promotion kernel only', () => {
  assert.match(jobRunner, /export type BackgroundExternalRuntimeSummary/);
  assert.match(jobRunner, /export function compileExternalRuntimeArtifactInChild/);
  assert.match(jobRunner, /new ElysiumCompilerClient\(\)/);
  assert.match(jobRunner, /compiler\.validate\(\{ input, report: validateReport, output \}\)/);
  assert.match(jobRunner, /compiler\.compile\(\{ input, output, report: compileReport, scope: 'native-ui', strict: true \}\)/);
  assert.match(jobRunner, /promoteExternalRuntimeArtifact\(\{ artifactRoot: output, sourceIdentity \}\)/);
  assert.match(jobRunner, /computeExternalRuntimeSourceIdentity\(input\)/);
  assert.match(jobRunner, /sourceIdentity: sourceIdentity\.identity/);
  assert.match(jobRunner, /EXTERNAL_RUNTIME_RESULT/);
});
