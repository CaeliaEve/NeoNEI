import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const serverSource = readFileSync(resolve(root, 'src/server.ts'), 'utf8');
const bootstrapSource = readFileSync(resolve(root, 'src/bootstrap-server.ts'), 'utf8');
const appSource = readFileSync(resolve(root, 'src/app.ts'), 'utf8');
const serverSettingsSource = readFileSync(resolve(root, 'src/config/server-settings.ts'), 'utf8');
const accelerationRuntimeSource = readFileSync(resolve(root, 'src/services/acceleration-runtime.service.ts'), 'utf8');

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
  assert.match(appSource, /registerRuntimeAdminRoutes\(/);
  assert.match(appSource, /registerStaticAssetRoutes\(/);
  assert.doesNotMatch(bootstrapSource, /express\(\)/);
  assert.doesNotMatch(bootstrapSource, /app\.use\(/);
  assert.doesNotMatch(bootstrapSource, /registerApiNamespaces\(/);
});

test('bootstrap boundary owns startup lifecycle and delegates app construction', () => {
  assert.match(bootstrapSource, /export\s+const\s+app\s*=\s*createApp\(/);
  assert.match(bootstrapSource, /export\s+async\s+function\s+startServer\(\)/);
  assert.match(bootstrapSource, /serverSettings\.publicRuntimeOnly/);
  assert.match(serverSettingsSource, /export const serverSettings/);
  assert.match(serverSettingsSource, /createAdminAccessGuard/);
  assert.match(bootstrapSource, /reconcileAccelerationRuntime\(/);
});



test('background acceleration child jobs resolve modules from the active src or dist root', () => {
  assert.match(accelerationRuntimeSource, /NEONEI_BACKEND_MODULE_ROOT:\s*path\.resolve\(__dirname, '\.\.'\)/);
  assert.match(accelerationRuntimeSource, /function requireFromBackendRoot\(modulePath\)/);
  assert.match(accelerationRuntimeSource, /require\(path\.join\(moduleRoot, modulePath\)\)/);
  assert.match(accelerationRuntimeSource, /requireFromBackendRoot\('services\/acceleration-db-pipeline\.service'\)/);
  assert.match(accelerationRuntimeSource, /requireFromBackendRoot\('config\/runtime-paths'\)/);
  assert.doesNotMatch(accelerationRuntimeSource, /require\('\.\/src\//);
  assert.doesNotMatch(accelerationRuntimeSource, /require\('\.\/dist\//);
});
