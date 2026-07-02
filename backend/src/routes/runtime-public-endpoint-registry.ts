import { validateAndFreezeRouteDescriptors } from './route-descriptor-registry';

export type RuntimePublicEndpointKey = 'health' | 'manifest' | 'contracts' | 'diagnostics';
const RUNTIME_PUBLIC_ENDPOINT_KEYS = Object.freeze([
  'health',
  'manifest',
  'contracts',
  'diagnostics',
] as const satisfies readonly RuntimePublicEndpointKey[]);

export type RuntimePublicEndpointMethod = 'get';
const RUNTIME_PUBLIC_ENDPOINT_METHODS = Object.freeze([
  'get',
] as const satisfies readonly RuntimePublicEndpointMethod[]);

export type RuntimePublicEndpoint = Readonly<{
  key: RuntimePublicEndpointKey;
  method: RuntimePublicEndpointMethod;
  path: string;
}>;

export const RUNTIME_PUBLIC_ENDPOINTS: readonly RuntimePublicEndpoint[] =
  validateAndFreezeRouteDescriptors({
    label: 'runtime public endpoint',
    expectedKeys: RUNTIME_PUBLIC_ENDPOINT_KEYS,
    allowedMethods: RUNTIME_PUBLIC_ENDPOINT_METHODS,
    descriptors: [
      { key: 'health', method: 'get', path: '/health' },
      { key: 'manifest', method: 'get', path: '/manifest' },
      { key: 'contracts', method: 'get', path: '/contracts' },
      { key: 'diagnostics', method: 'get', path: '/diagnostics' },
    ],
  });
