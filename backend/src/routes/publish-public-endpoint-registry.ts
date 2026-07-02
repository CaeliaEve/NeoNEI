export type PublishPublicEndpointKey = 'manifest' | 'home-bootstrap';
export type PublishPublicEndpointMethod = 'get';

export type PublishPublicEndpoint = Readonly<{
  key: PublishPublicEndpointKey;
  method: PublishPublicEndpointMethod;
  path: string;
}>;

export const PUBLISH_PUBLIC_ENDPOINTS: readonly PublishPublicEndpoint[] = Object.freeze([
  Object.freeze({ key: 'manifest', method: 'get', path: '/manifest' }),
  Object.freeze({ key: 'home-bootstrap', method: 'get', path: '/home-bootstrap' }),
]);
