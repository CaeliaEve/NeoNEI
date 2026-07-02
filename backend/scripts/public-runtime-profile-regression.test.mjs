import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverSource = readFileSync(join(repoRoot, 'backend/src/server.ts'), 'utf8');
const bootstrapSource = readFileSync(join(repoRoot, 'backend/src/bootstrap-server.ts'), 'utf8');
const appSource = readFileSync(join(repoRoot, 'backend/src/app.ts'), 'utf8');
const serverSettingsSource = readFileSync(join(repoRoot, 'backend/src/config/server-settings.ts'), 'utf8');
const apiNamespacesRoutesSource = readFileSync(join(repoRoot, 'backend/src/routes/api-namespaces.routes.ts'), 'utf8');
const apiNamespaceRegistrySource = readFileSync(join(repoRoot, 'backend/src/routes/api-namespace-registry.ts'), 'utf8');
const staticAssetRoutesSource = readFileSync(join(repoRoot, 'backend/src/routes/static-assets.routes.ts'), 'utf8');
const errorResponseSource = readFileSync(join(repoRoot, 'backend/src/utils/error-response.ts'), 'utf8');
const patternsRoutesSource = readFileSync(join(repoRoot, 'backend/src/routes/patterns.routes.ts'), 'utf8');
const multiblocksRoutesSource = readFileSync(join(repoRoot, 'backend/src/routes/multiblocks.routes.ts'), 'utf8');
const backendEnvExample = readFileSync(join(repoRoot, 'backend/.env.example'), 'utf8');
const rootEnvExample = readFileSync(join(repoRoot, '.env.example'), 'utf8');

test('public runtime profile is explicit and disables lab/dev dynamic mounts', () => {
  assert.match(serverSettingsSource, /function resolvePublicRuntimeOnly/);
  assert.match(serverSettingsSource, /process\.env\.NODE_ENV === 'production'/);
  assert.match(serverSettingsSource, /publicRuntimeOnly: resolvePublicRuntimeOnly\(\)/);
  assert.equal(appSource.includes('registerApiNamespaces(app, { publicRuntimeOnly: options.serverSettings.publicRuntimeOnly })'), true);
  assert.match(apiNamespacesRoutesSource, /mountApiNamespaces\(\s*app,\s*getApiNamespacePlan/s);
  assert.match(apiNamespacesRoutesSource, /publicRuntimeOnly:\s*options\.publicRuntimeOnly/);
  assert.match(apiNamespacesRoutesSource, /externalRuntimeAuthority/);
  assert.doesNotMatch(apiNamespacesRoutesSource, /app\.use\('\/lab'/);
  assert.doesNotMatch(apiNamespacesRoutesSource, /app\.use\('\/api\/items'/);
  assert.match(apiNamespaceRegistrySource, /PUBLIC_RUNTIME_ROOT_NAMESPACE[\s\S]*mountPath:\s*'\/runtime'[\s\S]*handler:\s*runtimeRoutes/);
  assert.match(apiNamespaceRegistrySource, /if \(!input\.publicRuntimeOnly\) \{\s*namespaces\.push\(\.\.\.DEV_COMPAT_NAMESPACES\);/s);
  assert.match(apiNamespaceRegistrySource, /if \(!input\.publicRuntimeOnly && !input\.externalRuntimeAuthority\) \{\s*namespaces\.push\(\.\.\.LEGACY_COMPAT_NAMESPACES\);/s);
  assert.match(apiNamespaceRegistrySource, /function mountApiNamespaces[\s\S]*for \(const namespace of namespaces\)[\s\S]*mountApiNamespace\(app, namespace, tagApiTier\);/);
  assert.match(staticAssetRoutesSource, /app\.use\(\s*'\/publish'/);
});

test('unmatched routes use the same diagnostic error envelope', () => {
  assert.equal(appSource.includes('app.use((req, res) => {'), true);
  assert.equal(appSource.includes("sendErrorEnvelope(req, res, 404, 'NOT_FOUND'"), true);
  assert.match(appSource, /path:\s*req\.originalUrl \?\? req\.url/);
  assert.equal(appSource.includes('app.use(errorHandler)'), true);
});

test('backend route errors use the uniform error envelope helper', () => {
  assert.match(errorResponseSource, /function sendErrorEnvelope/);
  assert.match(errorResponseSource, /requestId/);
  assert.doesNotMatch(bootstrapSource, /json\(\{\s*error:\s*'[^']+'/);
  assert.doesNotMatch(patternsRoutesSource, /json\(\{\s*error:\s*'[^']+'/);
  assert.doesNotMatch(multiblocksRoutesSource, /json\(\{\s*error:\s*'[^']+'/);
});

test('portable env examples document public runtime only deployment', () => {
  assert.match(backendEnvExample, /NEONEI_PUBLIC_RUNTIME_ONLY=1/);
  assert.match(rootEnvExample, /NEONEI_PUBLIC_RUNTIME_ONLY=1/);
  assert.doesNotMatch(backendEnvExample, /E:\\|E:\//, 'backend production example must not require a Windows path');
});



