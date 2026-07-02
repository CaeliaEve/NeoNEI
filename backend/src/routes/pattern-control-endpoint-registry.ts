export type PatternControlEndpointKey =
  | 'list-groups'
  | 'get-group'
  | 'get-group-detail'
  | 'create-group'
  | 'update-group'
  | 'delete-group'
  | 'create-pattern'
  | 'delete-pattern'
  | 'update-pattern'
  | 'export-group';

export type PatternControlMethod = 'get' | 'post' | 'put' | 'delete';

export type PatternControlEndpoint = Readonly<{
  key: PatternControlEndpointKey;
  method: PatternControlMethod;
  path: string;
}>;

export const PATTERN_CONTROL_ENDPOINTS: readonly PatternControlEndpoint[] = Object.freeze([
  Object.freeze({ key: 'list-groups', method: 'get', path: '/groups' }),
  Object.freeze({ key: 'get-group', method: 'get', path: '/groups/:groupId' }),
  Object.freeze({ key: 'get-group-detail', method: 'get', path: '/groups/:groupId/detail' }),
  Object.freeze({ key: 'create-group', method: 'post', path: '/groups' }),
  Object.freeze({ key: 'update-group', method: 'put', path: '/groups/:groupId' }),
  Object.freeze({ key: 'delete-group', method: 'delete', path: '/groups/:groupId' }),
  Object.freeze({ key: 'create-pattern', method: 'post', path: '/' }),
  Object.freeze({ key: 'delete-pattern', method: 'delete', path: '/:patternId' }),
  Object.freeze({ key: 'update-pattern', method: 'put', path: '/:patternId' }),
  Object.freeze({ key: 'export-group', method: 'get', path: '/groups/:groupId/export' }),
]);
