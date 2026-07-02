type RuntimeContractMapDescriptor<TKey extends string = string> = Readonly<{
  key: TKey;
  value: string;
}>;

type RuntimeContractMap<TKey extends string = string> = Readonly<Record<TKey, string>>;

const RUNTIME_SCHEMA_CONTRACT_KEYS = Object.freeze([
  'manifest',
  'browser',
  'search',
  'recipe',
  'texture',
  'error',
  'api',
] as const);
const RUNTIME_CONTROL_ENDPOINT_KEYS = Object.freeze([
  'patterns',
  'publish',
  'renderContract',
] as const);
const CURRENT_RUNTIME_NAMESPACE_KEYS = Object.freeze([
  'runtime',
  'ops',
] as const);
const CURRENT_RUNTIME_ENDPOINT_KEYS = Object.freeze([
  'manifest',
  'distDataManifest',
  'publishManifest',
  'health',
  'contracts',
  'diagnostics',
] as const);
const CURRENT_RUNTIME_STATIC_RESOURCE_KEYS = Object.freeze([
  'distData',
  'publish',
  'contracts',
] as const);
const API_V1_RUNTIME_ENDPOINT_KEYS = Object.freeze([
  'manifest',
  'distDataManifest',
  'publishManifest',
] as const);

type RuntimeSchemaContractKey = (typeof RUNTIME_SCHEMA_CONTRACT_KEYS)[number];
type RuntimeControlEndpointKey = (typeof RUNTIME_CONTROL_ENDPOINT_KEYS)[number];
type CurrentRuntimeNamespaceKey = (typeof CURRENT_RUNTIME_NAMESPACE_KEYS)[number];
type CurrentRuntimeEndpointKey = (typeof CURRENT_RUNTIME_ENDPOINT_KEYS)[number];
type CurrentRuntimeStaticResourceKey = (typeof CURRENT_RUNTIME_STATIC_RESOURCE_KEYS)[number];
type ApiV1RuntimeEndpointKey = (typeof API_V1_RUNTIME_ENDPOINT_KEYS)[number];

function contractMapDescriptor<TKey extends string>(
  key: TKey,
  value: string,
): RuntimeContractMapDescriptor<TKey> {
  return Object.freeze({ key, value });
}

function validateAndProjectContractMap<TKey extends string>(
  label: string,
  descriptors: readonly RuntimeContractMapDescriptor<TKey>[],
  expectedKeys: readonly TKey[],
): RuntimeContractMap<TKey> {
  const expected = new Set<string>(expectedKeys);
  const seen = new Set<string>();
  const map = {} as Record<TKey, string>;

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error(`${label} descriptor must not be null`);
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown ${label} descriptor: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate ${label} descriptor: ${descriptor.key}`);
    }
    if (!descriptor.value || !descriptor.value.trim()) {
      throw new Error(`${label} descriptor value must be non-empty: ${descriptor.key}`);
    }
    map[descriptor.key] = descriptor.value;
  }

  for (const key of expectedKeys) {
    if (!seen.has(key)) {
      throw new Error(`Missing ${label} descriptor: ${key}`);
    }
  }

  return Object.freeze(map);
}

const RUNTIME_SCHEMA_CONTRACTS: RuntimeContractMap<RuntimeSchemaContractKey> =
  validateAndProjectContractMap(
    'runtime schema contract',
    [
      contractMapDescriptor('manifest', '/contracts/runtime/manifest.schema.json'),
      contractMapDescriptor('browser', '/contracts/runtime/browser.schema.json'),
      contractMapDescriptor('search', '/contracts/runtime/search.schema.json'),
      contractMapDescriptor('recipe', '/contracts/runtime/recipe.schema.json'),
      contractMapDescriptor('texture', '/contracts/runtime/texture.schema.json'),
      contractMapDescriptor('error', '/contracts/runtime/error.schema.json'),
      contractMapDescriptor('api', '/contracts/runtime/api.schema.json'),
    ],
    RUNTIME_SCHEMA_CONTRACT_KEYS,
  );

const RUNTIME_CONTROL_ENDPOINTS: RuntimeContractMap<RuntimeControlEndpointKey> =
  validateAndProjectContractMap(
    'runtime control endpoint',
    [
      contractMapDescriptor('patterns', '/ops/patterns'),
      contractMapDescriptor('publish', '/ops/publish'),
      contractMapDescriptor('renderContract', '/ops/render-contract'),
    ],
    RUNTIME_CONTROL_ENDPOINT_KEYS,
  );

const CURRENT_RUNTIME_NAMESPACES: RuntimeContractMap<CurrentRuntimeNamespaceKey> =
  validateAndProjectContractMap(
    'current runtime namespace',
    [
      contractMapDescriptor('runtime', 'public read-only runtime API'),
      contractMapDescriptor('ops', 'authenticated operations API'),
    ],
    CURRENT_RUNTIME_NAMESPACE_KEYS,
  );

const CURRENT_RUNTIME_ENDPOINTS: RuntimeContractMap<CurrentRuntimeEndpointKey> =
  validateAndProjectContractMap(
    'current runtime contract endpoint',
    [
      contractMapDescriptor('manifest', '/runtime/manifest'),
      contractMapDescriptor('distDataManifest', '/dist-data/manifest.json'),
      contractMapDescriptor('publishManifest', '/runtime/manifest'),
      contractMapDescriptor('health', '/runtime/health'),
      contractMapDescriptor('contracts', '/runtime/contracts'),
      contractMapDescriptor('diagnostics', '/runtime/diagnostics'),
    ],
    CURRENT_RUNTIME_ENDPOINT_KEYS,
  );

const CURRENT_RUNTIME_STATIC_RESOURCES: RuntimeContractMap<CurrentRuntimeStaticResourceKey> =
  validateAndProjectContractMap(
    'current runtime static resource',
    [
      contractMapDescriptor('distData', '/dist-data/**'),
      contractMapDescriptor('publish', '/publish/**'),
      contractMapDescriptor('contracts', '/contracts/runtime/**'),
    ],
    CURRENT_RUNTIME_STATIC_RESOURCE_KEYS,
  );

const API_V1_RUNTIME_ENDPOINTS: RuntimeContractMap<ApiV1RuntimeEndpointKey> =
  validateAndProjectContractMap(
    'api v1 runtime contract endpoint',
    [
      contractMapDescriptor('manifest', '/api/v1/runtime/manifest'),
      contractMapDescriptor('distDataManifest', '/dist-data/manifest.json'),
      contractMapDescriptor('publishManifest', '/api/publish/manifest'),
    ],
    API_V1_RUNTIME_ENDPOINT_KEYS,
  );

export function getCurrentRuntimeContractIndex() {
  return Object.freeze({
    contractVersion: 'runtime-contracts/current',
    contracts: RUNTIME_SCHEMA_CONTRACTS,
    namespaces: CURRENT_RUNTIME_NAMESPACES,
    runtime: CURRENT_RUNTIME_ENDPOINTS,
    staticResources: CURRENT_RUNTIME_STATIC_RESOURCES,
    control: RUNTIME_CONTROL_ENDPOINTS,
  });
}

export function getApiV1RuntimeContractIndex() {
  return Object.freeze({
    version: 1,
    contracts: RUNTIME_SCHEMA_CONTRACTS,
    runtime: API_V1_RUNTIME_ENDPOINTS,
    control: RUNTIME_CONTROL_ENDPOINTS,
  });
}
