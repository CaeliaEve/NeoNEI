import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const lifecycleAbiPath = resolve(root, 'src/services/runtime-server-lifecycle-abi.ts');
const lifecycleServicePath = resolve(root, 'src/services/runtime-server-lifecycle.service.ts');
const lifecycleAbi = readFileSync(lifecycleAbiPath, 'utf8');
const lifecycleService = readFileSync(lifecycleServicePath, 'utf8');

const lifecycleLiterals = [
  'Initializing databases...',
  'Acceleration database opened; background reconciliation pending.',
  'Acceleration reconciliation failed.',
  '[ACCELERATION_DB] background reconciliation failed',
  'Initializing database...',
  'Database ready',
  'Initializing acceleration database...',
  'Acceleration database ready',
  'Server listening on',
  'Public URL',
  'API endpoint',
  'Current runtime API',
  'Publish home bootstrap',
  'Images path',
  'Public runtime only',
  '[WARN] IMAGES_PATH does not exist',
  '/api',
  '/api/runtime/current',
  '/api/publish/home-bootstrap',
  '[NATIVE_RENDER] Angelica render index ready',
  '[NATIVE_RENDER] Angelica render index is not ready',
];

test('runtime server lifecycle ABI owns startup, ready-log, native-render, and reconcile policies', () => {
  assert.equal(existsSync(lifecycleAbiPath), true, 'runtime-server-lifecycle-abi.ts must exist');
  assert.match(lifecycleAbi, /export type RuntimeLifecyclePhaseKey/);
  assert.match(lifecycleAbi, /export type RuntimeLifecyclePhaseDescriptor/);
  assert.match(lifecycleAbi, /export type RuntimeLifecycleFailurePolicy/);
  assert.match(lifecycleAbi, /export type RuntimeDatabaseLogKey/);
  assert.match(lifecycleAbi, /export type RuntimeServerReadyEndpointKey/);
  assert.match(lifecycleAbi, /export const RUNTIME_LIFECYCLE_PHASE_DESCRIPTORS/);
  assert.match(lifecycleAbi, /export const RUNTIME_LIFECYCLE_PHASES/);
  assert.match(lifecycleAbi, /export const RUNTIME_LIFECYCLE_FAILURE_POLICY/);
  assert.match(lifecycleAbi, /export const RUNTIME_DATABASE_LOG_DESCRIPTORS/);
  assert.match(lifecycleAbi, /export const RUNTIME_DATABASE_LOGS/);
  assert.match(lifecycleAbi, /export const RUNTIME_SERVER_READY_LOG_POLICY/);
  assert.match(lifecycleAbi, /export const RUNTIME_SERVER_READY_ENDPOINT_DESCRIPTORS/);
  assert.match(lifecycleAbi, /export const RUNTIME_NATIVE_RENDER_LOG_POLICY/);
  assert.match(lifecycleAbi, /export const RUNTIME_BACKGROUND_RECONCILE_POLICY/);
  assert.match(lifecycleAbi, /export function getRuntimeLifecyclePhase/);
  assert.match(lifecycleAbi, /export function getBackgroundReconcileFailureTransition/);
  assert.match(lifecycleAbi, /export function projectRuntimeServerReadyLogs/);
  assert.match(lifecycleAbi, /export function getMissingImagesPathWarning/);
  assert.match(lifecycleAbi, /export function projectRuntimeBackgroundReconcileOptions/);
  assert.match(lifecycleAbi, /function validateAndFreezeLifecyclePhaseDescriptors/);
  assert.match(lifecycleAbi, /function validateAndFreezeFailurePolicy/);
  assert.match(lifecycleAbi, /function validateAndFreezeDatabaseLogDescriptors/);
  assert.match(lifecycleAbi, /function validateAndFreezeReadyLogPolicy/);
  assert.match(lifecycleAbi, /function validateAndFreezeReadyEndpointDescriptors/);
  assert.match(lifecycleAbi, /function validateAndFreezeNativeRenderLogPolicy/);
  assert.match(lifecycleAbi, /function validateAndFreezeBackgroundReconcilePolicy/);
  assert.match(lifecycleAbi, /delayMs: 150/);

  for (const literal of lifecycleLiterals) {
    assert.ok(lifecycleAbi.includes(literal), `lifecycle ABI must own literal: ${literal}`);
  }
});

test('runtime server lifecycle service consumes ABI policy instead of owning stable literals', () => {
  assert.equal(existsSync(lifecycleServicePath), true, 'runtime-server-lifecycle.service.ts must exist');
  assert.match(lifecycleService, /from '\.\/runtime-server-lifecycle-abi'/);
  assert.match(lifecycleService, /getRuntimeLifecyclePhase\('databaseInitializing'\)/);
  assert.match(lifecycleService, /getRuntimeLifecyclePhase\('databaseReady'\)/);
  assert.match(lifecycleService, /RUNTIME_DATABASE_LOGS\.initializingDatabase/);
  assert.match(lifecycleService, /RUNTIME_DATABASE_LOGS\.databaseReady/);
  assert.match(lifecycleService, /RUNTIME_DATABASE_LOGS\.initializingAccelerationDatabase/);
  assert.match(lifecycleService, /RUNTIME_DATABASE_LOGS\.accelerationDatabaseReady/);
  assert.match(lifecycleService, /RUNTIME_NATIVE_RENDER_LOG_POLICY\.readyStatus/);
  assert.match(lifecycleService, /RUNTIME_NATIVE_RENDER_LOG_POLICY\.readyMessage/);
  assert.match(lifecycleService, /RUNTIME_NATIVE_RENDER_LOG_POLICY\.notReadyMessage/);
  assert.match(lifecycleService, /getMissingImagesPathWarning\(IMAGES_PATH\)/);
  assert.match(lifecycleService, /projectRuntimeServerReadyLogs\(settings, IMAGES_PATH\)/);
  assert.match(lifecycleService, /projectRuntimeBackgroundReconcileOptions\(settings\)/);
  assert.match(lifecycleService, /getBackgroundReconcileFailureTransition\(message\)/);
  assert.match(lifecycleService, /RUNTIME_LIFECYCLE_FAILURE_POLICY\.logMessage/);
  assert.match(lifecycleService, /RUNTIME_BACKGROUND_RECONCILE_POLICY\.delayMs/);
  assert.doesNotMatch(lifecycleService, /nativeRenderDiagnostics\.status === 'ok'/);
  assert.doesNotMatch(lifecycleService, /\}, 150\)/);

  for (const literal of lifecycleLiterals) {
    assert.equal(
      lifecycleService.includes(literal),
      false,
      `lifecycle service must not own literal: ${literal}`,
    );
  }
});
