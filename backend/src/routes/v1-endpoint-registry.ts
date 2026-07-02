import { validateAndFreezeRouteDescriptors } from './route-descriptor-registry';

export type ApiV1EndpointKey = 'health' | 'runtime-manifest' | 'runtime-contracts';
const API_V1_ENDPOINT_KEYS = Object.freeze([
  'health',
  'runtime-manifest',
  'runtime-contracts',
] as const satisfies readonly ApiV1EndpointKey[]);

export type ApiV1EndpointMethod = 'get';
const API_V1_ENDPOINT_METHODS = Object.freeze([
  'get',
] as const satisfies readonly ApiV1EndpointMethod[]);

export type ApiV1Endpoint = Readonly<{
  key: ApiV1EndpointKey;
  method: ApiV1EndpointMethod;
  path: string;
}>;

export const API_V1_ENDPOINTS: readonly ApiV1Endpoint[] =
  validateAndFreezeRouteDescriptors({
    label: 'api v1 endpoint',
    expectedKeys: API_V1_ENDPOINT_KEYS,
    allowedMethods: API_V1_ENDPOINT_METHODS,
    descriptors: [
      { key: 'health', method: 'get', path: '/health' },
      { key: 'runtime-manifest', method: 'get', path: '/runtime/manifest' },
      { key: 'runtime-contracts', method: 'get', path: '/runtime/contracts' },
    ],
  });
