type RuntimeSettingsEnvironment = NodeJS.ProcessEnv;

export type CurrentRuntimeSettings = Readonly<{
  apiBaseUrl: '/api';
  runtimeMode: 'native';
  rendererPreference: 'webgpu-first';
  allowDomGridFallback: false;
  allowPerItemImageHotLoad: false;
  debugPanels: boolean;
  runtime: Readonly<{
    currentUrl: '/api/runtime/current';
    manifestUrl: '/api/runtime/current/manifest';
    assetBaseUrl: '/api/runtime/current/asset/';
  }>;
}>;

function isEnabledFlag(value: string | undefined): boolean {
  const normalized = `${value ?? ''}`.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

export function getCurrentRuntimeSettings(env: RuntimeSettingsEnvironment = process.env): CurrentRuntimeSettings {
  return Object.freeze({
    apiBaseUrl: '/api',
    runtimeMode: 'native',
    rendererPreference: 'webgpu-first',
    allowDomGridFallback: false,
    allowPerItemImageHotLoad: false,
    debugPanels: isEnabledFlag(env.NEONEI_DEBUG_PANELS),
    runtime: Object.freeze({
      currentUrl: '/api/runtime/current',
      manifestUrl: '/api/runtime/current/manifest',
      assetBaseUrl: '/api/runtime/current/asset/',
    }),
  });
}
