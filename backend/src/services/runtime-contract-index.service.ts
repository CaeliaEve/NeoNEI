const RUNTIME_SCHEMA_CONTRACTS = Object.freeze({
  manifest: '/contracts/runtime/manifest.schema.json',
  browser: '/contracts/runtime/browser.schema.json',
  search: '/contracts/runtime/search.schema.json',
  recipe: '/contracts/runtime/recipe.schema.json',
  texture: '/contracts/runtime/texture.schema.json',
  error: '/contracts/runtime/error.schema.json',
  api: '/contracts/runtime/api.schema.json',
});

const RUNTIME_CONTROL_ENDPOINTS = Object.freeze({
  patterns: '/ops/patterns',
  publish: '/ops/publish',
  renderContract: '/ops/render-contract',
});

const CURRENT_RUNTIME_NAMESPACES = Object.freeze({
  runtime: 'public read-only runtime API',
  ops: 'authenticated operations API',
});

const CURRENT_RUNTIME_ENDPOINTS = Object.freeze({
  manifest: '/runtime/manifest',
  distDataManifest: '/dist-data/manifest.json',
  publishManifest: '/runtime/manifest',
  health: '/runtime/health',
  contracts: '/runtime/contracts',
  diagnostics: '/runtime/diagnostics',
});

const CURRENT_RUNTIME_STATIC_RESOURCES = Object.freeze({
  distData: '/dist-data/**',
  publish: '/publish/**',
  contracts: '/contracts/runtime/**',
});

const API_V1_RUNTIME_ENDPOINTS = Object.freeze({
  manifest: '/api/v1/runtime/manifest',
  distDataManifest: '/dist-data/manifest.json',
  publishManifest: '/api/publish/manifest',
});

export function getCurrentRuntimeContractIndex() {
  return Object.freeze({
    contractVersion: 'runtime-contracts/current',
    contracts: RUNTIME_SCHEMA_CONTRACTS,
    namespaces: CURRENT_RUNTIME_NAMESPACES,
    runtime: CURRENT_RUNTIME_ENDPOINTS,
    staticResources: CURRENT_RUNTIME_STATIC_RESOURCES,
    control: RUNTIME_CONTROL_ENDPOINTS,
  });
}

export function getApiV1RuntimeContractIndex() {
  return Object.freeze({
    version: 1,
    contracts: RUNTIME_SCHEMA_CONTRACTS,
    runtime: API_V1_RUNTIME_ENDPOINTS,
    control: RUNTIME_CONTROL_ENDPOINTS,
  });
}
