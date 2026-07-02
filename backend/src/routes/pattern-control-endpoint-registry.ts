import { validateAndFreezeRouteDescriptors } from './route-descriptor-registry';

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
const PATTERN_CONTROL_ENDPOINT_KEYS = Object.freeze([
  'list-groups',
  'get-group',
  'get-group-detail',
  'create-group',
  'update-group',
  'delete-group',
  'create-pattern',
  'delete-pattern',
  'update-pattern',
  'export-group',
] as const satisfies readonly PatternControlEndpointKey[]);

export type PatternControlMethod = 'get' | 'post' | 'put' | 'delete';
const PATTERN_CONTROL_METHODS = Object.freeze([
  'get',
  'post',
  'put',
  'delete',
] as const satisfies readonly PatternControlMethod[]);

export type PatternControlEndpoint = Readonly<{
  key: PatternControlEndpointKey;
  method: PatternControlMethod;
  path: string;
}>;

export const PATTERN_CONTROL_ENDPOINTS: readonly PatternControlEndpoint[] =
  validateAndFreezeRouteDescriptors({
    label: 'pattern control endpoint',
    expectedKeys: PATTERN_CONTROL_ENDPOINT_KEYS,
    allowedMethods: PATTERN_CONTROL_METHODS,
    descriptors: [
      { key: 'list-groups', method: 'get', path: '/groups' },
      { key: 'get-group', method: 'get', path: '/groups/:groupId' },
      { key: 'get-group-detail', method: 'get', path: '/groups/:groupId/detail' },
      { key: 'create-group', method: 'post', path: '/groups' },
      { key: 'update-group', method: 'put', path: '/groups/:groupId' },
      { key: 'delete-group', method: 'delete', path: '/groups/:groupId' },
      { key: 'create-pattern', method: 'post', path: '/' },
      { key: 'delete-pattern', method: 'delete', path: '/:patternId' },
      { key: 'update-pattern', method: 'put', path: '/:patternId' },
      { key: 'export-group', method: 'get', path: '/groups/:groupId/export' },
    ],
  });
