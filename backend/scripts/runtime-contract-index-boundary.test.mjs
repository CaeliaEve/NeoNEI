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
  assert.match(contractIndexSource, /RUNTIME_SCHEMA_CONTRACT_KEYS/);
  assert.match(contractIndexSource, /RUNTIME_CONTROL_ENDPOINT_KEYS/);
  assert.match(contractIndexSource, /CURRENT_RUNTIME_NAMESPACE_KEYS/);
  assert.match(contractIndexSource, /CURRENT_RUNTIME_ENDPOINT_KEYS/);
  assert.match(contractIndexSource, /API_V1_RUNTIME_ENDPOINT_KEYS/);
  assert.match(contractIndexSource, /contractMapDescriptor/);
  assert.match(contractIndexSource, /validateAndProjectContractMap/);
  assert.match(contractIndexSource, /Duplicate \$\{label\} descriptor/);
  assert.match(contractIndexSource, /Missing \$\{label\} descriptor/);
  assert.match(contractIndexSource, /\$\{label\} descriptor value must be non-empty/);
  assert.match(contractIndexSource, /export function getCurrentRuntimeContractIndex/);
  assert.match(contractIndexSource, /export function getApiV1RuntimeContractIndex/);
  assert.match(contractIndexSource, /contractMapDescriptor\('patterns', '\/ops\/patterns'\)/);
  assert.match(contractIndexSource, /contractMapDescriptor\('publish', '\/ops\/publish'\)/);
  assert.match(contractIndexSource, /contractMapDescriptor\('renderContract', '\/ops\/render-contract'\)/);
  assert.match(contractIndexSource, /contractMapDescriptor\('runtime', 'public read-only runtime API'\)/);
  assert.match(contractIndexSource, /contractMapDescriptor\('ops', 'authenticated operations API'\)/);
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
