import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const authorityPath = resolve(root, 'src/services/acceleration-runtime-compiler-authority.service.ts');
const phaseAbiPath = resolve(root, 'src/services/acceleration-runtime-phase-abi.ts');
const phaseMachinePath = resolve(root, 'src/services/acceleration-runtime-phase-machine.service.ts');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const dispatcherPath = resolve(root, 'src/services/acceleration-runtime-reconcile-dispatcher.service.ts');
const workerPath = resolve(root, 'src/services/acceleration-runtime-reconcile-worker.service.ts');
const jobRunnerPath = resolve(root, 'src/services/acceleration-runtime-job-runner.service.ts');
const identityPath = resolve(root, 'src/services/external-runtime-identity.service.ts');

const authority = readFileSync(authorityPath, 'utf8');
const phaseAbi = readFileSync(phaseAbiPath, 'utf8');
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
  assert.match(authority, /if \(!value\) \{\s*return 'external-runtime';\s*\}/);
  assert.doesNotMatch(authority, /!value \|\| value === 'internal'/);
  assert.match(authority, /NODE_ENV[\s\S]*production[\s\S]*internal-sqlite is retired from the production runtime/);
  assert.match(authority, /return 'external-runtime'/);
  assert.match(authority, /throw new Error\(/);
  assert.match(authority, /NEONEI_EXTERNAL_RUNTIME_RAW_EXPORT_ROOT/);
  assert.match(authority, /export function getExternalRuntimeRawExportRoot/);
  assert.match(authority, /export function resolveExternalRuntimeRawExportInput/);
  assert.match(authority, /nesqlpp\/raw-export-generation-pointer\/v1/);
  assert.match(authority, /missing required \$\{POINTER_FILE\}/);
  assert.doesNotMatch(authority, /legacy-direct-manifest/);
  assert.doesNotMatch(authority, /NESQL_REPOSITORY_PATH/);
  assert.doesNotMatch(authority, /explicit \|\|/);
});

test('phase machine can select external runtime without routing through internal sqlite compile', () => {
  assert.match(phaseAbi, /'compile-external-runtime'/);
  assert.match(phaseMachine, /ACCELERATION_RECONCILE_DECISION\.compileExternalRuntime/);
  assert.match(phaseMachine, /compilerAuthority\?: 'internal-sqlite' \| 'external-runtime'/);
  assert.match(phaseMachine, /if \(input\.compilerAuthority === 'external-runtime'\) \{/);
  assert.match(phaseMachine, /input\.fresh[\s\S]*ACCELERATION_RECONCILE_DECISION\.readyNoop[\s\S]*ACCELERATION_RECONCILE_DECISION\.compileExternalRuntime/);
  assert.doesNotMatch(phaseMachine, /'compile-external-runtime'/);
  assert.match(runtimeService, /resolveAccelerationCompilerAuthority\(\)/);
  assert.match(runtimeService, /if \(compilerAuthority === 'external-runtime'\) \{\s*await verifyAccelerationCompilerBoundary\(\);\s*\}/);
  assert.doesNotMatch(runtimeService, /await verifyAccelerationCompilerBoundary\(\);\s*const compilerAuthority/);
  assert.match(runtimeService, /compilerAuthority === 'internal-sqlite'/);
  assert.match(runtimeService, /probeExternalRuntimeIdentityFreshness\(\{ rawExportRoot: getExternalRuntimeRawExportRoot\(\) \}\)/);
  assert.match(runtimeService, /compilerAuthority,/);
});

test('external runtime identity is a first-class freshness boundary', () => {
  assert.equal(existsSync(identityPath), true, 'external runtime identity module must exist');
  assert.match(identity, /export function computeExternalRuntimeSourceIdentity/);
  assert.match(identity, /export function readExternalRuntimePromotionIdentity/);
  assert.match(identity, /export function probeExternalRuntimeIdentityFreshness/);
  assert.match(identity, /resolveExternalRuntimeRawExportInput\(rootDir\)/);
  assert.match(identity, /sourceIdentity\.identity === current\.identity/);
  assert.doesNotMatch(identity, /NeoNeiCompilerService/);
  assert.doesNotMatch(identity, /compiler_state/);
});

test('dispatcher maps external runtime to a separate worker action', () => {
  assert.match(dispatcher, /refreshExternalRuntimeArtifact/);
  assert.match(dispatcher, /reconcileHandlerDescriptor\(ACCELERATION_RECONCILE_DECISION\.compileExternalRuntime, \(\) => refreshExternalRuntimeArtifact\(\)\)/);
  assert.doesNotMatch(dispatcher, /'compile-external-runtime'/);
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
  assert.match(jobRunner, /compiler\.compile\(\{ input, output, report: compileReport, scope: 'all', strict: true \}\)/);
  assert.doesNotMatch(jobRunner, /scope: 'native-ui'/);
  assert.match(jobRunner, /resolveElysiumOutputGeneration\(output\)/);
  assert.match(jobRunner, /promoteExternalRuntimeArtifact\(\{ artifactRoot: compiledGeneration\.generationRoot, sourceIdentity \}\)/);
  assert.match(jobRunner, /resolveExternalRuntimeRawExportInput\(authorityInput\)/);
  assert.match(jobRunner, /const input = resolvedInput\.generationRoot/);
  assert.match(jobRunner, /computeExternalRuntimeSourceIdentityFromResolvedInput\(resolvedInput\)/);
  assert.match(jobRunner, /sourceIdentity: sourceIdentity\.identity/);
  assert.match(jobRunner, /EXTERNAL_RUNTIME_RESULT/);
});
