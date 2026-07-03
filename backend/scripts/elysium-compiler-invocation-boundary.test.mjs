import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const clientPath = resolve(root, 'src/compiler-client/elysium-compiler-client.ts');
const transportPath = resolve(root, 'src/compiler-client/elysium-compiler-transport.ts');
const clientSource = readFileSync(clientPath, 'utf8');
const transportSource = readFileSync(transportPath, 'utf8');
const capabilityAbiSource = readFileSync(
  resolve(root, 'src/compiler-client/elysium-compiler-capability-abi.ts'),
  'utf8',
);
const fixtureSmokeSource = readFileSync(resolve(root, '../scripts/elysium-compiler-fixture-smoke.mjs'), 'utf8');
const runtimeService = readFileSync(resolve(root, 'src/services/acceleration-runtime.service.ts'), 'utf8');
const jobRunner = readFileSync(resolve(root, 'src/services/acceleration-runtime-job-runner.service.ts'), 'utf8');

test('elysium compiler transport owns process execution and repository path discovery', () => {
  assert.equal(existsSync(transportPath), true, 'elysium-compiler-transport.ts must exist');
  assert.match(transportSource, /import \{ spawn \} from 'child_process'/);
  assert.match(transportSource, /export const ELYSIUM_COMPILER_REPO_ROOT/);
  assert.match(transportSource, /export const DEFAULT_ELYSIUM_COMPILER_LOCK_PATH/);
  assert.match(transportSource, /export const DEFAULT_ELYSIUM_COMPILER_ENSURE_SCRIPT/);
  assert.match(transportSource, /function spawnCapturedProcess/);
  assert.match(transportSource, /windowsHide: true/);
  assert.match(transportSource, /stdio: \['ignore', 'pipe', 'pipe'\]/);
  assert.match(transportSource, /async resolveCompilerHandshake<T>\(lockPath: string\)/);
  assert.match(transportSource, /fs\.existsSync\(lockPath\)/);
  assert.match(transportSource, /async runNodeJson<T>/);
  assert.match(transportSource, /async runCompilerCommand/);
});

test('elysium compiler client owns typed ABI methods but not child-process transport', () => {
  assert.match(capabilityAbiSource, /export type ElysiumCompilerScope/);
  assert.match(clientSource, /import type \{ ElysiumCompilerScope \} from '\.\/elysium-compiler-capability-abi'/);
  for (const scope of ['all', 'native-ui', 'search', 'browser', 'recipes', 'ui', 'textures']) {
    assert.match(capabilityAbiSource, new RegExp(`'${scope}'`));
  }
  assert.match(clientSource, /export type ElysiumCompilerValidateOptions/);
  assert.match(clientSource, /export type ElysiumCompilerCompileOptions/);
  assert.match(clientSource, /export type \{ ElysiumCompilerCommandResult \} from '\.\/elysium-compiler-transport'/);
  assert.doesNotMatch(clientSource, /from 'child_process'/);
  assert.doesNotMatch(clientSource, /spawn\(/);
  assert.doesNotMatch(clientSource, /fs\.existsSync/);
  assert.doesNotMatch(clientSource, /path\.join|path\.resolve/);
  assert.doesNotMatch(clientSource, /ensure-elysium-compiler\.mjs/);
});

test('elysium compiler client wraps validate and compile commands behind handshake-gated methods', () => {
  assert.match(clientSource, /private readonly transport: ElysiumCompilerTransport = new ElysiumCompilerTransport\(\)/);
  assert.match(clientSource, /async validate\(options: ElysiumCompilerValidateOptions\)/);
  assert.match(clientSource, /const handshake = await this\.handshake\(\)/);
  assert.match(clientSource, /\['validate', '--input', options\.input, '--report', options\.report\]/);
  assert.match(clientSource, /if \(options\.output\) args\.push\('--output', options\.output\)/);
  assert.match(clientSource, /async compile\(options: ElysiumCompilerCompileOptions\)/);
  assert.match(clientSource, /'compile'/);
  assert.match(clientSource, /'--scope'/);
  assert.match(clientSource, /options\.scope \?\? 'all'/);
  assert.match(clientSource, /if \(options\.strict\) args\.push\('--strict'\)/);
  assert.match(clientSource, /if \(options\.debugJson\) args\.push\('--debug-json'\)/);
  assert.match(clientSource, /pushOptionalNumberArg\(args, '--threads', options\.threads\)/);
  assert.match(clientSource, /this\.transport\.runCompilerCommand\(handshake\.compiler, args, 'elysium-compiler compile'\)/);
});

test('external compiler invocation boundary is not wired into runtime scheduler as a hidden fallback', () => {
  assert.doesNotMatch(runtimeService, /\.compile\(\{[^}]*elysium/s);
  assert.doesNotMatch(runtimeService, /\.validate\(\{/);
  assert.doesNotMatch(runtimeService, /new ElysiumCompilerClient/);
  assert.doesNotMatch(runtimeService, /elysium-compiler compile/);
  assert.match(jobRunner, /compileAccelerationSnapshotInChild/);
  assert.match(jobRunner, /compileExternalRuntimeArtifactInChild/);
  assert.match(jobRunner, /new ElysiumCompilerClient\(\)/);
  assert.match(jobRunner, /promoteExternalRuntimeArtifact/);
});

test('fixture smoke gate proves external compiler validate and compile produce runtime packs', () => {
  assert.match(fixtureSmokeSource, /ensure-elysium-compiler\.mjs/);
  assert.match(fixtureSmokeSource, /raw-export-minimal/);
  assert.match(fixtureSmokeSource, /runCompiler\(compiler, \['validate', '--input', fixturePath, '--report', validateReport\]/);
  assert.match(fixtureSmokeSource, /\['compile', '--input', fixturePath, '--output', outputDir, '--report', compileReport, '--scope', scope\]/);
  for (const output of [
    'manifest.json',
    'runtime-manifest.json',
    'ui_templates.bin',
    'ui_bindings.bin',
    'ui_strings.bin',
  ]) {
    assert.equal(fixtureSmokeSource.includes(output), true, `fixture smoke missing required output: ${output}`);
  }
  assert.match(fixtureSmokeSource, /external compiler smoke missing required outputs/);
  assert.match(fixtureSmokeSource, /runtimeManifestSchema/);
});
