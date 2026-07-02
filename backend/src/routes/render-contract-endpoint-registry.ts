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

export type RenderContractMethod = 'get' | 'post';

export type RenderContractEndpoint = Readonly<{
  key: RenderContractEndpointKey;
  method: RenderContractMethod;
  path: string;
}>;

export const RENDER_CONTRACT_ENDPOINTS: readonly RenderContractEndpoint[] = Object.freeze([
  Object.freeze({ key: 'overview', method: 'get', path: '/overview' }),
  Object.freeze({ key: 'browser-atlas-index', method: 'get', path: '/browser-atlas-index' }),
  Object.freeze({ key: 'browser-atlas-entries', method: 'post', path: '/browser-atlas-entries' }),
  Object.freeze({ key: 'browser-layout-index', method: 'get', path: '/browser-layout-index' }),
  Object.freeze({ key: 'ui-family-census', method: 'get', path: '/ui-family-census' }),
  Object.freeze({ key: 'ui-family-census-entry', method: 'get', path: '/ui-family-census/:familyKey' }),
  Object.freeze({ key: 'ui-template-catalog', method: 'get', path: '/ui-template-catalog' }),
  Object.freeze({ key: 'ui-template-catalog-entry', method: 'get', path: '/ui-template-catalog/:templateKey' }),
  Object.freeze({ key: 'ui-template-binding-index', method: 'get', path: '/ui-template-binding-index' }),
  Object.freeze({ key: 'ui-template-binding-entry', method: 'get', path: '/ui-template-binding-index/:recipeId' }),
  Object.freeze({ key: 'animated-atlas', method: 'get', path: '/animated-atlas' }),
  Object.freeze({ key: 'asset', method: 'get', path: '/asset' }),
  Object.freeze({ key: 'ui-payload', method: 'get', path: '/ui-payload' }),
]);
