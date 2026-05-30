import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const diagnosticsSource = fs.readFileSync('src/runtime/diagnostics.ts', 'utf8').replace(/\r\n/g, '\n');
const apiSource = fs.readFileSync('src/services/api.ts', 'utf8').replace(/\r\n/g, '\n');
const textureClientSource = fs.readFileSync('src/runtime/textureClient.ts', 'utf8').replace(/\r\n/g, '\n');

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
    apiSource.includes('reportMissingRuntimePayload({'),
    true,
    'api.ts should report missing recipe UI payloads through runtime diagnostics',
  );
  assert.equal(
    apiSource.includes('getRuntimeDiagnosticIdentity()'),
    true,
    'dev compatibility gaps should include runtime identity where available',
  );
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
    apiSource.includes('getDiagnosticIdentity: getRuntimeDiagnosticIdentity'),
    true,
    'texture runtime diagnostics should receive source signature and runtime cache key identity',
  );
});


test('manifest updates prime the runtime diagnostic identity', () => {
  assert.equal(
    apiSource.includes('setRuntimeDiagnosticIdentity({'),
    true,
    'api manifest client should prime the shared runtime diagnostic identity',
  );
  assert.equal(
    apiSource.includes('sourceSignature: manifest.sourceSignature'),
    true,
    'diagnostic identity should include source signature from the active manifest',
  );
  assert.equal(
    apiSource.includes('runtimeCacheKey,'),
    true,
    'diagnostic identity should include the active runtime cache key',
  );
});
