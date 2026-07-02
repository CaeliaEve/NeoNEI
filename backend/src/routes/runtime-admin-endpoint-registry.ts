export type RuntimeAdminIndexEndpointKey = 'health' | 'api-index' | 'openapi';
export type RuntimeAdminControlEndpointKey = 'runtime-diagnostics' | 'acceleration-reconcile';
export type RuntimeAdminEndpointMethod = 'get' | 'post';
const RUNTIME_ADMIN_INDEX_ENDPOINT_KEYS = Object.freeze([
  'health',
  'api-index',
  'openapi',
] as const satisfies readonly RuntimeAdminIndexEndpointKey[]);
const RUNTIME_ADMIN_CONTROL_ENDPOINT_KEYS = Object.freeze([
  'runtime-diagnostics',
  'acceleration-reconcile',
] as const satisfies readonly RuntimeAdminControlEndpointKey[]);

export type RuntimeAdminIndexEndpoint = Readonly<{
  key: RuntimeAdminIndexEndpointKey;
  method: Extract<RuntimeAdminEndpointMethod, 'get'>;
  path: string;
}>;

export type RuntimeAdminControlEndpoint = Readonly<{
  key: RuntimeAdminControlEndpointKey;
  method: RuntimeAdminEndpointMethod;
  path: string;
}>;

function validateAndFreezeEndpoints<
  TEndpoint extends Readonly<{ key: string; method: RuntimeAdminEndpointMethod; path: string }>,
>(
  label: string,
  endpoints: readonly TEndpoint[],
  expectedKeys: readonly string[],
  allowedMethods: readonly RuntimeAdminEndpointMethod[],
): readonly TEndpoint[] {
  const expected = new Set(expectedKeys);
  const methods = new Set(allowedMethods);
  const seen = new Set<string>();
  const paths = new Set<string>();
  for (const endpoint of endpoints) {
    if (!endpoint) {
      throw new Error(`${label} endpoint descriptor must not be null`);
    }
    if (!expected.has(endpoint.key)) {
      throw new Error(`Unknown ${label} endpoint descriptor: ${endpoint.key}`);
    }
    if (!seen.add(endpoint.key)) {
      throw new Error(`Duplicate ${label} endpoint descriptor: ${endpoint.key}`);
    }
    if (!methods.has(endpoint.method)) {
      throw new Error(`Invalid ${label} endpoint method for ${endpoint.key}: ${endpoint.method}`);
    }
    if (!endpoint.path || !endpoint.path.startsWith('/')) {
      throw new Error(`${label} endpoint path must be absolute: ${endpoint.key}`);
    }
    if (!paths.add(endpoint.path)) {
      throw new Error(`Duplicate ${label} endpoint path: ${endpoint.path}`);
    }
  }
  for (const key of expectedKeys) {
    if (!seen.has(key)) {
      throw new Error(`Missing ${label} endpoint descriptor: ${key}`);
    }
  }
  return Object.freeze(endpoints.map((endpoint) => Object.freeze({ ...endpoint }) as TEndpoint));
}

export const RUNTIME_ADMIN_INDEX_ENDPOINTS: readonly RuntimeAdminIndexEndpoint[] =
  validateAndFreezeEndpoints(
    'runtime admin index',
    [
      { key: 'health', method: 'get', path: '/api/health' },
      { key: 'api-index', method: 'get', path: '/api' },
      { key: 'openapi', method: 'get', path: '/api/openapi.json' },
    ],
    RUNTIME_ADMIN_INDEX_ENDPOINT_KEYS,
    ['get'],
  );

export const RUNTIME_ADMIN_CONTROL_ENDPOINTS: readonly RuntimeAdminControlEndpoint[] =
  validateAndFreezeEndpoints(
    'runtime admin control',
    [
      { key: 'runtime-diagnostics', method: 'get', path: '/runtime' },
      { key: 'acceleration-reconcile', method: 'post', path: '/acceleration/reconcile' },
    ],
    RUNTIME_ADMIN_CONTROL_ENDPOINT_KEYS,
    ['get', 'post'],
  );
