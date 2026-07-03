import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const autowarmAbiPath = resolve(root, 'src/config/autowarm-policy-abi.ts');
const autowarmPolicyPath = resolve(root, 'src/config/autowarm-policy.ts');
const startupAutowarmPath = resolve(root, 'src/services/startup-autowarm.service.ts');
const autowarmAbi = readFileSync(autowarmAbiPath, 'utf8');
const autowarmPolicy = readFileSync(autowarmPolicyPath, 'utf8');
const startupAutowarm = readFileSync(startupAutowarmPath, 'utf8');

const autowarmStableLiterals = [
  'RECIPE_BOOTSTRAP_AUTOWARM',
  'RECIPE_BOOTSTRAP_AUTOWARM_LIMIT',
  'RECIPE_SHARD_AUTOWARM',
  'RECIPE_SHARD_AUTOWARM_LIMIT',
  '[RECIPE_BOOTSTRAP_AUTOWARM] completed',
  '[RECIPE_BOOTSTRAP_AUTOWARM] failed',
  '[RECIPE_SHARD_AUTOWARM] completed',
  '[RECIPE_SHARD_AUTOWARM] failed',
];

test('startup autowarm ABI owns env names defaults delays and log messages', () => {
  assert.equal(existsSync(autowarmAbiPath), true, 'autowarm-policy-abi.ts must exist');
  assert.match(autowarmAbi, /export type AutowarmTaskKey/);
  assert.match(autowarmAbi, /export type AutowarmPolicyDescriptor/);
  assert.match(autowarmAbi, /export type AutowarmStartupTask/);
  assert.match(autowarmAbi, /export const AUTOWARM_BOOLEAN_ENV_VALUES/);
  assert.match(autowarmAbi, /export const AUTOWARM_POLICY_DESCRIPTORS/);
  assert.match(autowarmAbi, /export const AUTOWARM_POLICY_DESCRIPTOR_BY_KEY/);
  assert.match(autowarmAbi, /export function resolveAutowarmPolicyFromEnv/);
  assert.match(autowarmAbi, /export function projectEnabledAutowarmStartupTasks/);
  assert.match(autowarmAbi, /defaultEnabled: false/);
  assert.match(autowarmAbi, /defaultLimit: 1_000/);
  assert.match(autowarmAbi, /defaultLimit: 16/);
  assert.match(autowarmAbi, /startupDelayMs: 500/);
  assert.match(autowarmAbi, /startupDelayMs: 1_800/);
  assert.match(autowarmAbi, /enabled: Object\.freeze\(\['1', 'true'\]\)/);
  assert.match(autowarmAbi, /disabled: Object\.freeze\(\['0', 'false'\]\)/);
  assert.match(autowarmAbi, /function validateAndFreezeBooleanEnvValues/);
  assert.match(autowarmAbi, /function validateAndFreezeAutowarmPolicyDescriptors/);
  assert.match(autowarmAbi, /function projectAutowarmPolicyDescriptorMap/);

  for (const literal of autowarmStableLiterals) {
    assert.ok(autowarmAbi.includes(literal), `autowarm ABI must own literal: ${literal}`);
    assert.equal(autowarmPolicy.includes(literal), false, `policy wrapper must not own literal: ${literal}`);
    assert.equal(startupAutowarm.includes(literal), false, `startup service must not own literal: ${literal}`);
  }
});

test('autowarm policy wrapper and startup service are descriptor consumers', () => {
  assert.equal(existsSync(autowarmPolicyPath), true, 'autowarm-policy.ts must exist');
  assert.equal(existsSync(startupAutowarmPath), true, 'startup-autowarm.service.ts must exist');
  assert.match(autowarmPolicy, /from '\.\/autowarm-policy-abi'/);
  assert.match(autowarmPolicy, /resolveAutowarmPolicyFromEnv\(env\)/);
  assert.doesNotMatch(autowarmPolicy, /readPositiveNumber/);
  assert.doesNotMatch(autowarmPolicy, /readEnabledWithDefault/);
  assert.doesNotMatch(autowarmPolicy, /process\.env\.RECIPE_/);

  assert.match(startupAutowarm, /projectEnabledAutowarmStartupTasks\(getAutowarmPolicy\(\)\)/);
  assert.match(startupAutowarm, /Readonly<Record<AutowarmTaskKey, AutowarmPrewarmHandler>>/);
  assert.match(startupAutowarm, /recipeBootstrap: \(limit\) => getRecipeBootstrapService\(\)\.prewarmBootstrapCache\(\{ limit \}\)/);
  assert.match(startupAutowarm, /recipeShard: \(limit\) => getRecipeBootstrapService\(\)\.prewarmShardCache\(\{ limit \}\)/);
  assert.match(startupAutowarm, /logger\.info\(task\.completedLogMessage/);
  assert.match(startupAutowarm, /logger\.warn\(task\.failedLogMessage, error\)/);
  assert.match(startupAutowarm, /\}, task\.delayMs\)/);
  assert.doesNotMatch(startupAutowarm, /autowarmPolicy\.recipeBootstrap\.enabled/);
  assert.doesNotMatch(startupAutowarm, /autowarmPolicy\.recipeShard\.enabled/);
  assert.doesNotMatch(startupAutowarm, /\}, 500\)/);
  assert.doesNotMatch(startupAutowarm, /\}, 1800\)/);
});
