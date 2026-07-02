export type RuntimeAdminIndexEndpointKey = 'health' | 'api-index' | 'openapi';
export type RuntimeAdminControlEndpointKey = 'runtime-diagnostics' | 'acceleration-reconcile';
export type RuntimeAdminEndpointMethod = 'get' | 'post';

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

export const RUNTIME_ADMIN_INDEX_ENDPOINTS: readonly RuntimeAdminIndexEndpoint[] = Object.freeze([
  Object.freeze({ key: 'health', method: 'get', path: '/api/health' }),
  Object.freeze({ key: 'api-index', method: 'get', path: '/api' }),
  Object.freeze({ key: 'openapi', method: 'get', path: '/api/openapi.json' }),
]);

export const RUNTIME_ADMIN_CONTROL_ENDPOINTS: readonly RuntimeAdminControlEndpoint[] = Object.freeze([
  Object.freeze({ key: 'runtime-diagnostics', method: 'get', path: '/runtime' }),
  Object.freeze({ key: 'acceleration-reconcile', method: 'post', path: '/acceleration/reconcile' }),
]);
