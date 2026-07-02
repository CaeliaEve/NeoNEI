export type ApiV1EndpointKey = 'health' | 'runtime-manifest' | 'runtime-contracts';
export type ApiV1EndpointMethod = 'get';

export type ApiV1Endpoint = Readonly<{
  key: ApiV1EndpointKey;
  method: ApiV1EndpointMethod;
  path: string;
}>;

export const API_V1_ENDPOINTS: readonly ApiV1Endpoint[] = Object.freeze([
  Object.freeze({ key: 'health', method: 'get', path: '/health' }),
  Object.freeze({ key: 'runtime-manifest', method: 'get', path: '/runtime/manifest' }),
  Object.freeze({ key: 'runtime-contracts', method: 'get', path: '/runtime/contracts' }),
]);
