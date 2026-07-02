import {
  CURRENT_RUNTIME_ENABLED_FLAG_VALUES,
  CURRENT_RUNTIME_SETTINGS_ENV,
  CURRENT_RUNTIME_SETTINGS_STATIC,
} from './current-runtime-settings-abi';

type RuntimeSettingsEnvironment = NodeJS.ProcessEnv;

export type CurrentRuntimeSettings = typeof CURRENT_RUNTIME_SETTINGS_STATIC & Readonly<{
  debugPanels: boolean;
}>;

function isEnabledFlag(value: string | undefined): boolean {
  const normalized = `${value ?? ''}`.trim().toLowerCase();
  return CURRENT_RUNTIME_ENABLED_FLAG_VALUES.some((candidate) => candidate === normalized);
}

export function getCurrentRuntimeSettings(env: RuntimeSettingsEnvironment = process.env): CurrentRuntimeSettings {
  return Object.freeze({
    ...CURRENT_RUNTIME_SETTINGS_STATIC,
    debugPanels: isEnabledFlag(env[CURRENT_RUNTIME_SETTINGS_ENV.debugPanels]),
  });
}
