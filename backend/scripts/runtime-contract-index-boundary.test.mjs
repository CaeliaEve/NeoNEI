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
const contractIndexAbiSource = readFileSync(resolve(root, 'src/services/runtime-contract-index-abi.ts'), 'utf8');

test('runtime contract indexes are service-owned, not route-owned DTOs', () => {
  assert.match(contractIndexSource, /from '\.\/runtime-contract-index-abi'/);
  assert.match(contractIndexAbiSource, /RUNTIME_SCHEMA_CONTRACT_KEYS/);
  assert.match(contractIndexAbiSource, /RUNTIME_CONTROL_ENDPOINT_KEYS/);
  assert.match(contractIndexAbiSource, /CURRENT_RUNTIME_NAMESPACE_KEYS/);
  assert.match(contractIndexAbiSource, /CURRENT_RUNTIME_ENDPOINT_KEYS/);
  assert.match(contractIndexAbiSource, /API_V1_RUNTIME_ENDPOINT_KEYS/);
  assert.match(contractIndexAbiSource, /RUNTIME_SCHEMA_CONTRACT_DESCRIPTORS/);
  assert.match(contractIndexAbiSource, /RUNTIME_CONTROL_ENDPOINT_DESCRIPTORS/);
  assert.match(contractIndexAbiSource, /CURRENT_RUNTIME_NAMESPACE_DESCRIPTORS/);
  assert.match(contractIndexAbiSource, /CURRENT_RUNTIME_ENDPOINT_DESCRIPTORS/);
  assert.match(contractIndexAbiSource, /CURRENT_RUNTIME_STATIC_RESOURCE_DESCRIPTORS/);
  assert.match(contractIndexAbiSource, /API_V1_RUNTIME_ENDPOINT_DESCRIPTORS/);
  assert.match(contractIndexAbiSource, /contractMapDescriptor/);
  assert.match(contractIndexAbiSource, /validateAndFreezeContractMapDescriptors/);
  assert.match(contractIndexAbiSource, /projectRuntimeContractMap/);
  assert.match(contractIndexAbiSource, /Duplicate \$\{label\} descriptor/);
  assert.match(contractIndexAbiSource, /Missing \$\{label\} descriptor/);
  assert.match(contractIndexAbiSource, /\$\{label\} descriptor value must be non-empty/);
  assert.match(contractIndexAbiSource, /descriptor path must be absolute/);
  assert.match(contractIndexAbiSource, /descriptor glob must be absolute and recursive/);
  assert.match(contractIndexAbiSource, /descriptor description must not be a path/);
  assert.match(contractIndexSource, /export function getCurrentRuntimeContractIndex/);
  assert.match(contractIndexSource, /export function getApiV1RuntimeContractIndex/);
  assert.match(contractIndexSource, /CURRENT_RUNTIME_CONTRACT_INDEX_METADATA/);
  assert.match(contractIndexSource, /API_V1_RUNTIME_CONTRACT_INDEX_METADATA/);
  assert.match(contractIndexAbiSource, /contractMapDescriptor\('patterns', '\/ops\/patterns', 'path'\)/);
  assert.match(contractIndexAbiSource, /contractMapDescriptor\('publish', '\/ops\/publish', 'path'\)/);
  assert.match(contractIndexAbiSource, /contractMapDescriptor\('renderContract', '\/ops\/render-contract', 'path'\)/);
  assert.match(contractIndexAbiSource, /contractMapDescriptor\('runtime', 'public read-only runtime API', 'description'\)/);
  assert.match(contractIndexAbiSource, /contractMapDescriptor\('ops', 'authenticated operations API', 'description'\)/);
  assert.match(contractIndexAbiSource, /contractMapDescriptor\('distData', '\/dist-data\/\*\*', 'glob'\)/);
  assert.doesNotMatch(contractIndexAbiSource, /\/lab\//);
  assert.doesNotMatch(contractIndexAbiSource, /compat/i);

  for (const catalogOwnedLiteral of [
    /'runtime-contracts\/current'/,
    /'\/ops\/patterns'/,
    /'\/ops\/publish'/,
    /'\/ops\/render-contract'/,
    /'public read-only runtime API'/,
    /'authenticated operations API'/,
    /'\/dist-data\/\*\*'/,
  ]) {
    assert.match(contractIndexAbiSource, catalogOwnedLiteral);
    assert.doesNotMatch(contractIndexSource, catalogOwnedLiteral);
  }

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
