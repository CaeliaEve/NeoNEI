import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const diagnosticsSource = fs.readFileSync('src/runtime/diagnostics.ts', 'utf8').replace(/\r\n/g, '\n');
const apiSource = fs.readFileSync('src/services/api.ts', 'utf8').replace(/\r\n/g, '\n');
const runtimeSessionSource = fs.readFileSync('src/services/api/runtimeSession.ts', 'utf8').replace(/\r\n/g, '\n');
const apiRuntimeSource = apiSource + '\n' + runtimeSessionSource;
const textureClientSource = fs.readFileSync('src/runtime/textureClient.ts', 'utf8').replace(/\r\n/g, '\n');
const distDataRuntimeSource = fs.readFileSync('src/services/distDataRuntime.ts', 'utf8').replace(/\r\n/g, '\n');
const distDataRuntimeRenderSource = fs.readFileSync('src/services/distDataRuntimeRender.ts', 'utf8').replace(/\r\n/g, '\n');
const distDataDiagnosticSource = `${distDataRuntimeSource}
${distDataRuntimeRenderSource}`;
const adminControlClientSource = fs.readFileSync('src/control/adminControlClient.ts', 'utf8').replace(/\r\n/g, '\n');
const runtimeModeSource = fs.readFileSync('src/runtime/runtimeMode.ts', 'utf8').replace(/\r\n/g, '\n');
const viteConfigSource = fs.readFileSync('vite.config.ts', 'utf8').replace(/\r\n/g, '\n');

test('public runtime profile blocks ops control calls before network IO and token injection', () => {
  const adminControlGuardSource = `${adminControlClientSource}
${runtimeModeSource}`;
  for (const token of [
    'VITE_PUBLIC_RUNTIME_ONLY',
    'VITE_RUNTIME_DISABLE_CONTROL_PLANE',
    'VITE_NEONEI_ADMIN_TOKEN',
    'isControlPlaneDisabled',
    'CONTROL_PLANE_DISABLED',
    'CONTROL_PLANE_ADMIN_TOKEN_MISSING',
    'assertControlPlaneEnabled',
    'x-neonei-admin-token',
    'public runtime profile must use compiled runtime artifacts',
  ]) {
    assert.equal(adminControlGuardSource.includes(token), true, `missing control-plane guard token: ${token}`);
  }

  assert.match(
    adminControlClientSource,
    /assertControlPlaneEnabled\('get', path\);\n\s*const response = await adminHttp\.get/s,
    'GET control calls should be blocked before HTTP execution',
  );
  assert.match(
    adminControlClientSource,
    /assertControlPlaneEnabled\('post', path\);\n\s*const response = await adminHttp\.post/s,
    'POST control calls should be blocked before HTTP execution',
  );
  assert.match(
    adminControlClientSource,
    /assertControlPlaneEnabled\('put', path\);\n\s*const response = await adminHttp\.put/s,
    'PUT control calls should be blocked before HTTP execution',
  );
  assert.match(
    adminControlClientSource,
    /assertControlPlaneEnabled\('delete', path\);\n\s*const response = await adminHttp\.delete/s,
    'DELETE control calls should be blocked before HTTP execution',
  );
});

test('runtime diagnostics expose a structured copyable envelope', () => {
  for (const token of [
    'RuntimeDiagnosticContext',
    'code: string;',
    'itemId?: string | null;',
    'recipeId?: string | null;',
    'assetId?: string | null;',
    'sourceSignature?: string | null;',
    'runtimeCacheKey?: string | null;',
    'recordRuntimeDiagnostic',
    'getRuntimeDiagnosticsSnapshot',
    "neonei:runtime-diagnostic",
  ]) {
    assert.equal(diagnosticsSource.includes(token), true, `missing diagnostics token: ${token}`);
  }
});

test('runtime contract gaps and missing payloads use the structured diagnostics channel', () => {
  assert.equal(
    diagnosticsSource.includes("code: 'RUNTIME_CONTRACT_GAP'"),
    true,
    'contract gaps should use a stable diagnostic code',
  );
  assert.equal(
    diagnosticsSource.includes("code: 'MISSING_RUNTIME_PAYLOAD'"),
    true,
    'missing runtime payloads should use a stable diagnostic code',
  );
  assert.equal(
    apiRuntimeSource.includes('reportMissingRuntimePayload'),
    true,
    'api.ts should report missing recipe UI payloads through runtime diagnostics',
  );
  assert.equal(
    apiRuntimeSource.includes('getRuntimeDiagnosticIdentity()'),
    true,
    'runtime contract gaps should include runtime identity where available',
  );
});

test('dist-data schema mismatches include reproducible runtime identity', () => {
  assert.equal(
    distDataRuntimeSource.includes('reportRuntimeSchemaMismatch({'),
    true,
    'dist-data runtime should report malformed payloads through runtime diagnostics',
  );
  for (const token of [
    'sourceSignature:',
    'runtimeCacheKey:',
    'path,',
    'Dist-data browser catalog is missing items[]',
    'Dist-data recipe UI payload is missing recipeId',
    'Dist-data browser atlas index is missing items[]',
  ]) {
    assert.equal(distDataDiagnosticSource.includes(token), true, `missing dist-data diagnostic token: ${token}`);
  }
});


test('missing browser atlas assets use structured runtime diagnostics', () => {
  assert.equal(
    textureClientSource.includes('reportMissingRuntimeAsset({'),
    true,
    'texture runtime should report missing atlas/index assets through runtime diagnostics',
  );
  for (const token of [
    "assetId: 'browser-atlas-index'",
    'assetId: itemId',
    'itemId,',
    'path:',
    'sourceSignature',
    'runtimeCacheKey',
  ]) {
    assert.equal(textureClientSource.includes(token), true, `missing texture diagnostic token: ${token}`);
  }
  assert.equal(
    apiRuntimeSource.includes('getDiagnosticIdentity: getRuntimeDiagnosticIdentity'),
    true,
    'texture runtime diagnostics should receive source signature and runtime cache key identity',
  );
});


test('manifest updates prime the runtime diagnostic identity', () => {
  assert.equal(
    apiRuntimeSource.includes('setRuntimeDiagnosticIdentity({'),
    true,
    'api manifest client should prime the shared runtime diagnostic identity',
  );
  assert.equal(
    apiRuntimeSource.includes('sourceSignature: manifest.sourceSignature'),
    true,
    'diagnostic identity should include source signature from the active manifest',
  );
  assert.equal(
    apiRuntimeSource.includes('runtimeCacheKey,'),
    true,
    'diagnostic identity should include the active runtime cache key',
  );
});



test('production builds default to strict public runtime mode', () => {
  for (const token of [
    'VITE_PUBLIC_RUNTIME_ONLY',
    'VITE_RUNTIME_DISABLE_CONTROL_PLANE',
    'VITE_STRICT_RUNTIME_CONTRACTS',
    "mode === 'development' ? '0' : '1'",
    "'import.meta.env.VITE_PUBLIC_RUNTIME_ONLY'",
    "'import.meta.env.VITE_RUNTIME_DISABLE_CONTROL_PLANE'",
    "'import.meta.env.VITE_STRICT_RUNTIME_CONTRACTS'",
  ]) {
    assert.equal(viteConfigSource.includes(token), true, `missing production runtime default token: ${token}`);
  }
  for (const token of [
    'isPublicRuntimeOnly',
    'isControlPlaneDisabled',
    'isStrictRuntimeContractsEnabledByEnv',
    'import.meta.env.PROD === true',
  ]) {
    assert.equal(runtimeModeSource.includes(token), true, `missing runtime mode helper token: ${token}`);
  }
  assert.equal(
    diagnosticsSource.includes('isStrictRuntimeContractsEnabledByEnv()'),
    true,
    'strict runtime contracts should honor the production/public runtime mode helper',
  );
});
