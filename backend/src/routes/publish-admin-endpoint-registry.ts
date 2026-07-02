export type PublishAdminEndpointKey = 'list-releases' | 'activate-release';
export type PublishAdminMethod = 'get' | 'post';

export type PublishAdminEndpoint = Readonly<{
  key: PublishAdminEndpointKey;
  method: PublishAdminMethod;
  path: string;
}>;

export const PUBLISH_ADMIN_ENDPOINTS: readonly PublishAdminEndpoint[] = Object.freeze([
  Object.freeze({ key: 'list-releases', method: 'get', path: '/releases' }),
  Object.freeze({ key: 'activate-release', method: 'post', path: '/releases/:sourceSignature/activate' }),
]);
