import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const serverSource = readFileSync(resolve(root, 'src/server.ts'), 'utf8');
const bootstrapSource = readFileSync(resolve(root, 'src/bootstrap-server.ts'), 'utf8');

test('server entrypoint delegates startup to bootstrap boundary', () => {
  assert.match(serverSource, /import\s+\{\s*startServer\s*\}\s+from\s+['"]\.\/bootstrap-server['"]/);
  assert.match(serverSource, /void\s+startServer\(\);/);
  assert.doesNotMatch(serverSource, /express\(\)/);
  assert.doesNotMatch(serverSource, /getDatabaseManager\(/);
  assert.doesNotMatch(serverSource, /app\.use\(/);
});

test('bootstrap boundary owns app construction and exported startup', () => {
  assert.match(bootstrapSource, /export\s+const\s+app\s*=\s*express\(\)/);
  assert.match(bootstrapSource, /export\s+async\s+function\s+startServer\(\)/);
  assert.match(bootstrapSource, /registerApiNamespaces\(/);
  assert.match(bootstrapSource, /reconcileAccelerationRuntime\(/);
});
