export type RuntimePublicEndpointKey = 'health' | 'manifest' | 'contracts' | 'diagnostics';
export type RuntimePublicEndpointMethod = 'get';

export type RuntimePublicEndpoint = Readonly<{
  key: RuntimePublicEndpointKey;
  method: RuntimePublicEndpointMethod;
  path: string;
}>;

export const RUNTIME_PUBLIC_ENDPOINTS: readonly RuntimePublicEndpoint[] = Object.freeze([
  Object.freeze({ key: 'health', method: 'get', path: '/health' }),
  Object.freeze({ key: 'manifest', method: 'get', path: '/manifest' }),
  Object.freeze({ key: 'contracts', method: 'get', path: '/contracts' }),
  Object.freeze({ key: 'diagnostics', method: 'get', path: '/diagnostics' }),
]);
