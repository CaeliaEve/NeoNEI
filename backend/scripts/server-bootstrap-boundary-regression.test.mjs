import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const serverSource = readFileSync(resolve(root, 'src/server.ts'), 'utf8');
const bootstrapSource = readFileSync(resolve(root, 'src/bootstrap-server.ts'), 'utf8');
const appSource = readFileSync(resolve(root, 'src/app.ts'), 'utf8');
const serverSettingsSource = readFileSync(resolve(root, 'src/config/server-settings.ts'), 'utf8');
const runtimeServerLifecycleSource = readFileSync(
  resolve(root, 'src/services/runtime-server-lifecycle.service.ts'),
  'utf8',
);
const runtimeServerLifecycleAbiSource = readFileSync(
  resolve(root, 'src/services/runtime-server-lifecycle-abi.ts'),
  'utf8',
);
const accelerationRuntimeJobRunnerSource = readFileSync(
  resolve(root, 'src/services/acceleration-runtime-job-runner.service.ts'),
  'utf8',
);

test('server entrypoint delegates startup to bootstrap boundary', () => {
  assert.match(serverSource, /import\s+\{\s*startServer\s*\}\s+from\s+['"]\.\/bootstrap-server['"]/);
  assert.match(serverSource, /void\s+startServer\(\);/);
  assert.doesNotMatch(serverSource, /express\(\)/);
  assert.doesNotMatch(serverSource, /getDatabaseManager\(/);
  assert.doesNotMatch(serverSource, /app\.use\(/);
});

test('app boundary owns middleware and route construction', () => {
  assert.match(appSource, /export\s+function\s+createApp\(/);
  assert.match(appSource, /const\s+app\s*=\s*express\(\)/);
  assert.match(appSource, /registerApiNamespaces\(/);
  assert.match(appSource, /registerRuntimeAdminIndexRoutes\(/);
  assert.match(appSource, /registerRuntimeAdminControlPlaneRoutes\(/);
  assert.match(appSource, /registerStaticAssetRoutes\(/);
  assert.doesNotMatch(bootstrapSource, /express\(\)/);
  assert.doesNotMatch(bootstrapSource, /app\.use\(/);
  assert.doesNotMatch(bootstrapSource, /registerApiNamespaces\(/);
});

test('bootstrap boundary owns startup lifecycle and delegates app construction', () => {
  assert.match(bootstrapSource, /export\s+const\s+app\s*=\s*createApp\(/);
  assert.match(bootstrapSource, /export\s+async\s+function\s+startServer\(\)/);
  assert.match(bootstrapSource, /createRuntimeAccelerationManagerRegistry\(\)/);
  assert.match(bootstrapSource, /initializeRuntimeDatabases\(runtimeAccelerationRegistry\)/);
  assert.match(bootstrapSource, /startRuntimeServer\(\{/);
  assert.match(serverSettingsSource, /export const serverSettings/);
  assert.match(serverSettingsSource, /createAdminAccessGuard/);
  assert.doesNotMatch(bootstrapSource, /getDatabaseManager\(/);
  assert.doesNotMatch(bootstrapSource, /getAccelerationDatabaseManager\(/);
  assert.doesNotMatch(bootstrapSource, /setAccelerationRuntimePhase\(/);
  assert.doesNotMatch(bootstrapSource, /reconcileAccelerationRuntime\(/);
  assert.doesNotMatch(bootstrapSource, /scheduleStartupAutowarm\(/);
  assert.doesNotMatch(bootstrapSource, /getNativeRenderRuntimeDiagnostics\(/);
  assert.doesNotMatch(bootstrapSource, /app\.listen\(/);
  assert.match(runtimeServerLifecycleSource, /export function createRuntimeAccelerationManagerRegistry/);
  assert.match(runtimeServerLifecycleSource, /export async function initializeRuntimeDatabases/);
  assert.match(runtimeServerLifecycleSource, /export function startRuntimeServer/);
  assert.match(runtimeServerLifecycleSource, /getDatabaseManager\(/);
  assert.match(runtimeServerLifecycleSource, /getAccelerationDatabaseManager\(/);
  assert.match(runtimeServerLifecycleSource, /getRuntimeLifecyclePhase\('databaseInitializing'\)/);
  assert.match(runtimeServerLifecycleSource, /getRuntimeLifecyclePhase\('databaseReady'\)/);
  assert.match(runtimeServerLifecycleSource, /getBackgroundReconcileFailureTransition\(message\)/);
  assert.match(runtimeServerLifecycleSource, /setAccelerationRuntimePhase\(initializingPhase\.phase, initializingPhase\.message, initializingPhase\.extras\)/);
  assert.match(runtimeServerLifecycleSource, /setAccelerationRuntimePhase\(readyPhase\.phase, readyPhase\.message, readyPhase\.extras\)/);
  assert.match(runtimeServerLifecycleSource, /setAccelerationRuntimePhase\(transition\.phase, transition\.message, transition\.extras\)/);
  assert.match(runtimeServerLifecycleAbiSource, /key: 'databaseInitializing'[\s\S]*phase: 'initializing'/);
  assert.match(runtimeServerLifecycleAbiSource, /key: 'databaseReady'[\s\S]*phase: 'ready'/);
  assert.match(runtimeServerLifecycleAbiSource, /phase: 'error'/);
  assert.match(runtimeServerLifecycleSource, /reconcileAccelerationRuntime\(\s*accelerationDbManager/);
  assert.match(runtimeServerLifecycleSource, /scheduleStartupAutowarm\(\)/);
  assert.match(runtimeServerLifecycleSource, /getNativeRenderRuntimeDiagnostics\(\)/);
  assert.match(runtimeServerLifecycleSource, /app\.listen\(serverSettings\.port, serverSettings\.host/);
  assert.match(runtimeServerLifecycleAbiSource, /settings\.publicRuntimeOnly/);
});



test('background acceleration child jobs resolve modules from the active src or dist root', () => {
  assert.match(accelerationRuntimeJobRunnerSource, /NEONEI_BACKEND_MODULE_ROOT:\s*path\.resolve\(__dirname, '\.\.'\)/);
  assert.match(accelerationRuntimeJobRunnerSource, /function requireFromBackendRoot\(modulePath\)/);
  assert.match(accelerationRuntimeJobRunnerSource, /require\(path\.join\(moduleRoot, modulePath\)\)/);
  assert.match(accelerationRuntimeJobRunnerSource, /requireFromBackendRoot\('services\/acceleration-db-pipeline\.service'\)/);
  assert.match(accelerationRuntimeJobRunnerSource, /requireFromBackendRoot\('services\/acceleration-runtime-compiler-probe\.service'\)/);
  assert.doesNotMatch(accelerationRuntimeJobRunnerSource, /require\('\.\/src\//);
  assert.doesNotMatch(accelerationRuntimeJobRunnerSource, /require\('\.\/dist\//);
});
