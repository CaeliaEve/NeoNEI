import { validateAndFreezeRouteDescriptors } from './route-descriptor-registry';

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

export const RUNTIME_ADMIN_INDEX_ENDPOINTS: readonly RuntimeAdminIndexEndpoint[] =
  validateAndFreezeRouteDescriptors({
    label: 'runtime admin index endpoint',
    expectedKeys: RUNTIME_ADMIN_INDEX_ENDPOINT_KEYS,
    allowedMethods: ['get'],
    descriptors: [
      { key: 'health', method: 'get', path: '/api/health' },
      { key: 'api-index', method: 'get', path: '/api' },
      { key: 'openapi', method: 'get', path: '/api/openapi.json' },
    ],
  });

export const RUNTIME_ADMIN_CONTROL_ENDPOINTS: readonly RuntimeAdminControlEndpoint[] =
  validateAndFreezeRouteDescriptors({
    label: 'runtime admin control endpoint',
    expectedKeys: RUNTIME_ADMIN_CONTROL_ENDPOINT_KEYS,
    allowedMethods: ['get', 'post'],
    descriptors: [
      { key: 'runtime-diagnostics', method: 'get', path: '/runtime' },
      { key: 'acceleration-reconcile', method: 'post', path: '/acceleration/reconcile' },
    ],
  });
