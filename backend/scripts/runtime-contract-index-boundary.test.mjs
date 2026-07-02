import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeRouteSource = readFileSync(resolve(root, 'src/routes/runtime.routes.ts'), 'utf8');
const v1RouteSource = readFileSync(resolve(root, 'src/routes/v1.routes.ts'), 'utf8');
const runtimeHandlerSource = readFileSync(resolve(root, 'src/routes/runtime-public-endpoint-handlers.ts'), 'utf8');
const v1HandlerSource = readFileSync(resolve(root, 'src/routes/v1-endpoint-handlers.ts'), 'utf8');
const contractIndexSource = readFileSync(resolve(root, 'src/services/runtime-contract-index.service.ts'), 'utf8');

test('runtime contract indexes are service-owned, not route-owned DTOs', () => {
  assert.match(contractIndexSource, /const RUNTIME_SCHEMA_CONTRACTS = Object\.freeze/);
  assert.match(contractIndexSource, /const RUNTIME_CONTROL_ENDPOINTS = Object\.freeze/);
  assert.match(contractIndexSource, /const CURRENT_RUNTIME_NAMESPACES = Object\.freeze/);
  assert.match(contractIndexSource, /const CURRENT_RUNTIME_ENDPOINTS = Object\.freeze/);
  assert.match(contractIndexSource, /const API_V1_RUNTIME_ENDPOINTS = Object\.freeze/);
  assert.match(contractIndexSource, /export function getCurrentRuntimeContractIndex/);
  assert.match(contractIndexSource, /export function getApiV1RuntimeContractIndex/);
  assert.match(contractIndexSource, /patterns: '\/ops\/patterns'/);
  assert.match(contractIndexSource, /publish: '\/ops\/publish'/);
  assert.match(contractIndexSource, /renderContract: '\/ops\/render-contract'/);
  assert.match(contractIndexSource, /runtime: 'public read-only runtime API'/);
  assert.match(contractIndexSource, /ops: 'authenticated operations API'/);
  assert.doesNotMatch(contractIndexSource, /\/lab\//);
  assert.doesNotMatch(contractIndexSource, /compat/i);

  assert.match(runtimeHandlerSource, /getCurrentRuntimeContractIndex\(\)/);
  assert.match(v1HandlerSource, /getApiV1RuntimeContractIndex\(\)/);
  assert.doesNotMatch(runtimeRouteSource, /getCurrentRuntimeContractIndex/);
  assert.doesNotMatch(v1RouteSource, /getApiV1RuntimeContractIndex/);
  assert.doesNotMatch(runtimeRouteSource, /const runtimeContracts/);
  assert.doesNotMatch(v1RouteSource, /function getRuntimeContracts/);
  assert.doesNotMatch(runtimeRouteSource, /control: \{/);
  assert.doesNotMatch(v1RouteSource, /control: \{/);
  assert.doesNotMatch(runtimeRouteSource, /namespaces: \{/);
  assert.doesNotMatch(v1RouteSource, /contracts: \{/);
});
