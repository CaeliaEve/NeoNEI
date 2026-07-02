import { validateAndFreezeRouteDescriptors } from './route-descriptor-registry';

export type RenderContractEndpointKey =
  | 'overview'
  | 'browser-atlas-index'
  | 'browser-atlas-entries'
  | 'browser-layout-index'
  | 'ui-family-census'
  | 'ui-family-census-entry'
  | 'ui-template-catalog'
  | 'ui-template-catalog-entry'
  | 'ui-template-binding-index'
  | 'ui-template-binding-entry'
  | 'animated-atlas'
  | 'asset'
  | 'ui-payload';
const RENDER_CONTRACT_ENDPOINT_KEYS = Object.freeze([
  'overview',
  'browser-atlas-index',
  'browser-atlas-entries',
  'browser-layout-index',
  'ui-family-census',
  'ui-family-census-entry',
  'ui-template-catalog',
  'ui-template-catalog-entry',
  'ui-template-binding-index',
  'ui-template-binding-entry',
  'animated-atlas',
  'asset',
  'ui-payload',
] as const satisfies readonly RenderContractEndpointKey[]);

export type RenderContractMethod = 'get' | 'post';
const RENDER_CONTRACT_METHODS = Object.freeze([
  'get',
  'post',
] as const satisfies readonly RenderContractMethod[]);

export type RenderContractEndpoint = Readonly<{
  key: RenderContractEndpointKey;
  method: RenderContractMethod;
  path: string;
}>;

export const RENDER_CONTRACT_ENDPOINTS: readonly RenderContractEndpoint[] =
  validateAndFreezeRouteDescriptors({
    label: 'render contract endpoint',
    expectedKeys: RENDER_CONTRACT_ENDPOINT_KEYS,
    allowedMethods: RENDER_CONTRACT_METHODS,
    descriptors: [
      { key: 'overview', method: 'get', path: '/overview' },
      { key: 'browser-atlas-index', method: 'get', path: '/browser-atlas-index' },
      { key: 'browser-atlas-entries', method: 'post', path: '/browser-atlas-entries' },
      { key: 'browser-layout-index', method: 'get', path: '/browser-layout-index' },
      { key: 'ui-family-census', method: 'get', path: '/ui-family-census' },
      { key: 'ui-family-census-entry', method: 'get', path: '/ui-family-census/:familyKey' },
      { key: 'ui-template-catalog', method: 'get', path: '/ui-template-catalog' },
      { key: 'ui-template-catalog-entry', method: 'get', path: '/ui-template-catalog/:templateKey' },
      { key: 'ui-template-binding-index', method: 'get', path: '/ui-template-binding-index' },
      { key: 'ui-template-binding-entry', method: 'get', path: '/ui-template-binding-index/:recipeId' },
      { key: 'animated-atlas', method: 'get', path: '/animated-atlas' },
      { key: 'asset', method: 'get', path: '/asset' },
      { key: 'ui-payload', method: 'get', path: '/ui-payload' },
    ],
  });
