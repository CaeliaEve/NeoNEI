import {
  resolveCurrentRuntimeSettings,
  type CurrentRuntimeSettings,
  type CurrentRuntimeSettingsEnvironment,
} from './current-runtime-settings-abi';

export type { CurrentRuntimeSettings, CurrentRuntimeSettingsEnvironment };

export function getCurrentRuntimeSettings(
  env: CurrentRuntimeSettingsEnvironment = process.env,
): CurrentRuntimeSettings {
  return resolveCurrentRuntimeSettings(env);
}
