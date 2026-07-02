/** ControlFS runtime settings ABI catalog consumed by the frontend bootstrap. */

export const CURRENT_RUNTIME_SETTINGS_ENV = Object.freeze({
  debugPanels: 'NEONEI_DEBUG_PANELS',
} as const);

export const CURRENT_RUNTIME_ENABLED_FLAG_VALUES = Object.freeze(['1', 'true'] as const);

export const CURRENT_RUNTIME_SETTINGS_STATIC = Object.freeze({
  apiBaseUrl: '/api',
  runtimeMode: 'native',
  rendererPreference: 'webgpu-first',
  allowDomGridFallback: false,
  allowPerItemImageHotLoad: false,
  runtime: Object.freeze({
    currentUrl: '/api/runtime/current',
    manifestUrl: '/api/runtime/current/manifest',
    assetBaseUrl: '/api/runtime/current/asset/',
  }),
} as const);
