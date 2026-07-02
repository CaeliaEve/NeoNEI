import { validateAndFreezeRouteDescriptors } from './route-descriptor-registry';

export type PublishAdminEndpointKey = 'list-releases' | 'activate-release';
const PUBLISH_ADMIN_ENDPOINT_KEYS = Object.freeze([
  'list-releases',
  'activate-release',
] as const satisfies readonly PublishAdminEndpointKey[]);

export type PublishAdminMethod = 'get' | 'post';
const PUBLISH_ADMIN_METHODS = Object.freeze([
  'get',
  'post',
] as const satisfies readonly PublishAdminMethod[]);

export type PublishAdminEndpoint = Readonly<{
  key: PublishAdminEndpointKey;
  method: PublishAdminMethod;
  path: string;
}>;

export const PUBLISH_ADMIN_ENDPOINTS: readonly PublishAdminEndpoint[] =
  validateAndFreezeRouteDescriptors({
    label: 'publish admin endpoint',
    expectedKeys: PUBLISH_ADMIN_ENDPOINT_KEYS,
    allowedMethods: PUBLISH_ADMIN_METHODS,
    descriptors: [
      { key: 'list-releases', method: 'get', path: '/releases' },
      { key: 'activate-release', method: 'post', path: '/releases/:sourceSignature/activate' },
    ],
  });
