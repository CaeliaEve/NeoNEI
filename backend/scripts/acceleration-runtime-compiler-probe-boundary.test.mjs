import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const compilerProbePath = resolve(root, 'src/services/acceleration-runtime-compiler-probe.service.ts');
const jobRunnerPath = resolve(root, 'src/services/acceleration-runtime-job-runner.service.ts');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
const compilerProbe = readFileSync(compilerProbePath, 'utf8');
const jobRunner = readFileSync(jobRunnerPath, 'utf8');

test('acceleration compiler source-root policy lives behind a probe boundary', () => {
  assert.equal(existsSync(compilerProbePath), true, 'acceleration-runtime-compiler-probe.service.ts must exist');
  assert.match(compilerProbe, /export const ACCELERATION_SOURCE_ROOTS/);
  assert.match(compilerProbe, /Object\.freeze\(\{/);
  assert.match(compilerProbe, /itemsDir: SPLIT_ITEMS_DIR/);
  assert.match(compilerProbe, /recipesDir: SPLIT_RECIPES_DIR/);
  assert.match(compilerProbe, /canonicalDir: NESQL_CANONICAL_DIR/);
  assert.match(compilerProbe, /imageRoot: IMAGES_PATH/);
  assert.match(compilerProbe, /export function getAccelerationCompilerSourceRoots/);
});

test('acceleration compiler freshness probing is not owned by the runtime scheduler', () => {
  assert.match(compilerProbe, /export function probeAccelerationCompilerState/);
  assert.match(compilerProbe, /new NeoNeiCompilerService\(input\.manager, getAccelerationCompilerSourceRoots\(\)\)/);
  assert.match(compilerProbe, /fresh: compiler\.isAccelerationStateFresh\(\)/);
  assert.match(runtimeService, /probeAccelerationCompilerState\(\{ manager: accelerationDbManager \}\)/);
  assert.match(runtimeService, /fresh: compilerProbe\.fresh/);
  assert.doesNotMatch(runtimeService, /NeoNeiCompilerService/);
  assert.doesNotMatch(runtimeService, /ACCELERATION_SOURCE_ROOTS/);
  assert.doesNotMatch(runtimeService, /SPLIT_ITEMS_DIR|SPLIT_RECIPES_DIR|NESQL_CANONICAL_DIR|IMAGES_PATH/);
  assert.doesNotMatch(runtimeService, /isAccelerationStateFresh\(\)/);
});

test('child jobs reuse the same compiler source-root policy instead of duplicating runtime paths', () => {
  assert.match(jobRunner, /getAccelerationCompilerSourceRoots/);
  assert.match(jobRunner, /sourceRoots: getAccelerationCompilerSourceRoots\(\)/);
  assert.doesNotMatch(jobRunner, /SPLIT_ITEMS_DIR|SPLIT_RECIPES_DIR|NESQL_CANONICAL_DIR|IMAGES_PATH/);
  assert.doesNotMatch(jobRunner, /sourceRoots:\s*\{\s*itemsDir:/s);
});
