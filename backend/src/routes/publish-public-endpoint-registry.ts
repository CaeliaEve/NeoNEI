import { validateAndFreezeRouteDescriptors } from './route-descriptor-registry';

export type PublishPublicEndpointKey = 'manifest' | 'home-bootstrap';
const PUBLISH_PUBLIC_ENDPOINT_KEYS = Object.freeze([
  'manifest',
  'home-bootstrap',
] as const satisfies readonly PublishPublicEndpointKey[]);

export type PublishPublicEndpointMethod = 'get';
const PUBLISH_PUBLIC_ENDPOINT_METHODS = Object.freeze([
  'get',
] as const satisfies readonly PublishPublicEndpointMethod[]);

export type PublishPublicEndpoint = Readonly<{
  key: PublishPublicEndpointKey;
  method: PublishPublicEndpointMethod;
  path: string;
}>;

export const PUBLISH_PUBLIC_ENDPOINTS: readonly PublishPublicEndpoint[] =
  validateAndFreezeRouteDescriptors({
    label: 'publish public endpoint',
    expectedKeys: PUBLISH_PUBLIC_ENDPOINT_KEYS,
    allowedMethods: PUBLISH_PUBLIC_ENDPOINT_METHODS,
    descriptors: [
      { key: 'manifest', method: 'get', path: '/manifest' },
      { key: 'home-bootstrap', method: 'get', path: '/home-bootstrap' },
    ],
  });
