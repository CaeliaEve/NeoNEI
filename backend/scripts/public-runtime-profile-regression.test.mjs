import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverSource = readFileSync(join(repoRoot, 'backend/src/server.ts'), 'utf8');
const staticAssetRoutesSource = readFileSync(join(repoRoot, 'backend/src/routes/static-assets.routes.ts'), 'utf8');
const errorResponseSource = readFileSync(join(repoRoot, 'backend/src/utils/error-response.ts'), 'utf8');
const patternsRoutesSource = readFileSync(join(repoRoot, 'backend/src/routes/patterns.routes.ts'), 'utf8');
const multiblocksRoutesSource = readFileSync(join(repoRoot, 'backend/src/routes/multiblocks.routes.ts'), 'utf8');
const backendEnvExample = readFileSync(join(repoRoot, 'backend/.env.example'), 'utf8');
const rootEnvExample = readFileSync(join(repoRoot, '.env.example'), 'utf8');

test('public runtime profile is explicit and disables lab/dev dynamic mounts', () => {
  assert.match(serverSource, /const PUBLIC_RUNTIME_ONLY = isEnvEnabled\(process\.env\.NEONEI_PUBLIC_RUNTIME_ONLY\)/);
  assert.match(serverSource, /if \(!PUBLIC_RUNTIME_ONLY\) \{\s*app\.use\('\/lab'/s);
  assert.match(serverSource, /if \(!PUBLIC_RUNTIME_ONLY\) \{\s*app\.use\('\/api\/items'/s);
  assert.match(serverSource, /app\.use\('\/runtime'[\s\S]*runtimeRoutes\)/);
  assert.match(staticAssetRoutesSource, /app\.use\(\s*'\/publish'/);
});

test('unmatched routes use the same diagnostic error envelope', () => {
  assert.match(serverSource, /app\.use\(\(req, res\) => \{/);
  assert.match(serverSource, /sendErrorEnvelope\(req, res, 404, 'NOT_FOUND'/);
  assert.match(serverSource, /path:\s*req\.originalUrl \?\? req\.url/);
  assert.match(serverSource, /app\.use\(errorHandler\)/);
});

test('backend route errors use the uniform error envelope helper', () => {
  assert.match(errorResponseSource, /function sendErrorEnvelope/);
  assert.match(errorResponseSource, /requestId/);
  assert.doesNotMatch(serverSource, /json\(\{\s*error:\s*'[^']+'/);
  assert.doesNotMatch(patternsRoutesSource, /json\(\{\s*error:\s*'[^']+'/);
  assert.doesNotMatch(multiblocksRoutesSource, /json\(\{\s*error:\s*'[^']+'/);
});

test('portable env examples document public runtime only deployment', () => {
  assert.match(backendEnvExample, /NEONEI_PUBLIC_RUNTIME_ONLY=1/);
  assert.match(rootEnvExample, /NEONEI_PUBLIC_RUNTIME_ONLY=1/);
  assert.doesNotMatch(backendEnvExample, /E:\\|E:\//, 'backend production example must not require a Windows path');
});
