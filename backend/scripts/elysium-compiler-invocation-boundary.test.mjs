import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const clientSource = readFileSync(resolve(root, 'src/compiler-client/elysium-compiler-client.ts'), 'utf8');
const fixtureSmokeSource = readFileSync(resolve(root, '../scripts/elysium-compiler-fixture-smoke.mjs'), 'utf8');
const runtimeService = readFileSync(resolve(root, 'src/services/acceleration-runtime.service.ts'), 'utf8');
const jobRunner = readFileSync(resolve(root, 'src/services/acceleration-runtime-job-runner.service.ts'), 'utf8');

test('elysium compiler client owns external validate and compile invocation types', () => {
  assert.match(clientSource, /export type ElysiumCompilerScope/);
  for (const scope of ['all', 'native-ui', 'search', 'browser', 'recipes', 'ui', 'textures']) {
    assert.match(clientSource, new RegExp(`'${scope}'`));
  }
  assert.match(clientSource, /export type ElysiumCompilerValidateOptions/);
  assert.match(clientSource, /export type ElysiumCompilerCompileOptions/);
  assert.match(clientSource, /export type ElysiumCompilerCommandResult/);
});

test('elysium compiler client wraps validate and compile commands behind handshake-gated methods', () => {
  assert.match(clientSource, /function runCompilerCommand/);
  assert.match(clientSource, /spawn\(compiler, args/);
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
  assert.match(clientSource, /runCompilerCommand\(handshake\.compiler, args, 'elysium-compiler compile'\)/);
});

test('external compiler invocation boundary is not wired into runtime scheduler as a hidden fallback', () => {
  assert.doesNotMatch(runtimeService, /\.compile\(\{[^}]*elysium/s);
  assert.doesNotMatch(runtimeService, /\.validate\(\{/);
  assert.doesNotMatch(jobRunner, /new ElysiumCompilerClient/);
  assert.doesNotMatch(jobRunner, /elysium-compiler compile/);
  assert.match(jobRunner, /compileAccelerationSnapshotInChild/);
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
