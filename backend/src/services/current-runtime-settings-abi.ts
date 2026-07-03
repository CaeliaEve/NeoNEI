/** ControlFS runtime settings ABI catalog consumed by the frontend bootstrap. */

type CurrentRuntimeSettingsEnvKey = 'debugPanels';
type CurrentRuntimeSettingsEnabledFlagKey = 'one' | 'true';
type CurrentRuntimeSettingsStaticKey =
  | 'apiBaseUrl'
  | 'runtimeMode'
  | 'rendererPreference'
  | 'allowPerItemImageHotLoad';
type CurrentRuntimeSettingsRuntimeUrlKey = 'currentUrl' | 'manifestUrl' | 'assetBaseUrl';

type CurrentRuntimeSettingsDescriptor<TKey extends string, TValue> = Readonly<{
  key: TKey;
  value: TValue;
}>;

export type CurrentRuntimeSettingsEnvironment = Readonly<Record<string, string | undefined>>;

function settingDescriptor<TKey extends string, TValue>(
  key: TKey,
  value: TValue,
): CurrentRuntimeSettingsDescriptor<TKey, TValue> {
  return Object.freeze({ key, value });
}

function validateAndFreezeRuntimeSettingsDescriptors<TKey extends string, TValue>(
  label: string,
  descriptors: readonly CurrentRuntimeSettingsDescriptor<TKey, TValue>[],
  expectedKeys: readonly TKey[],
  valueValidator?: (descriptor: CurrentRuntimeSettingsDescriptor<TKey, TValue>) => void,
): readonly CurrentRuntimeSettingsDescriptor<TKey, TValue>[] {
  const expected = new Set<TKey>(expectedKeys);
  const seen = new Set<TKey>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error(`${label} descriptor must not be null`);
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown ${label} descriptor: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate ${label} descriptor: ${descriptor.key}`);
    }
    valueValidator?.(descriptor);
  }

  for (const key of expectedKeys) {
    if (!seen.has(key)) {
      throw new Error(`Missing ${label} descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function projectSettingsDescriptorMap<TKey extends string, TValue>(
  descriptors: readonly CurrentRuntimeSettingsDescriptor<TKey, TValue>[],
): Readonly<Record<TKey, TValue>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor.value;
        return map;
      },
      {} as Record<TKey, TValue>,
    ),
  );
}

function requireNonEmptyString<TKey extends string>(
  label: string,
): (descriptor: CurrentRuntimeSettingsDescriptor<TKey, string>) => void {
  return (descriptor) => {
    if (!descriptor.value.trim()) {
      throw new Error(`${label} descriptor value must be non-empty: ${descriptor.key}`);
    }
  };
}

function requireAbsoluteUrlPath<TKey extends string>(
  label: string,
): (descriptor: CurrentRuntimeSettingsDescriptor<TKey, string>) => void {
  return (descriptor) => {
    if (!descriptor.value.startsWith('/')) {
      throw new Error(`${label} descriptor value must be an absolute URL path: ${descriptor.key}`);
    }
  };
}

export const CURRENT_RUNTIME_SETTINGS_ENV_DESCRIPTORS = validateAndFreezeRuntimeSettingsDescriptors(
  'current runtime settings env',
  [
    settingDescriptor('debugPanels', 'NEONEI_DEBUG_PANELS'),
  ] as const,
  ['debugPanels'] as const,
  requireNonEmptyString('current runtime settings env'),
);

export const CURRENT_RUNTIME_SETTINGS_ENV =
  projectSettingsDescriptorMap(CURRENT_RUNTIME_SETTINGS_ENV_DESCRIPTORS);

export const CURRENT_RUNTIME_ENABLED_FLAG_DESCRIPTORS = validateAndFreezeRuntimeSettingsDescriptors(
  'current runtime enabled flag',
  [
    settingDescriptor('one', '1'),
    settingDescriptor('true', 'true'),
  ] as const,
  ['one', 'true'] as const,
  requireNonEmptyString('current runtime enabled flag'),
);

export const CURRENT_RUNTIME_ENABLED_FLAG_VALUES =
  projectSettingsDescriptorMap(CURRENT_RUNTIME_ENABLED_FLAG_DESCRIPTORS);

export const CURRENT_RUNTIME_SETTINGS_RUNTIME_DESCRIPTORS = validateAndFreezeRuntimeSettingsDescriptors(
  'current runtime settings runtime URL',
  [
    settingDescriptor('currentUrl', '/api/runtime/current'),
    settingDescriptor('manifestUrl', '/api/runtime/current/manifest'),
    settingDescriptor('assetBaseUrl', '/api/runtime/current/asset/'),
  ] as const,
  ['currentUrl', 'manifestUrl', 'assetBaseUrl'] as const,
  requireAbsoluteUrlPath('current runtime settings runtime URL'),
);

const CURRENT_RUNTIME_SETTINGS_RUNTIME =
  projectSettingsDescriptorMap(CURRENT_RUNTIME_SETTINGS_RUNTIME_DESCRIPTORS);

export const CURRENT_RUNTIME_SETTINGS_STATIC_DESCRIPTORS =
  validateAndFreezeRuntimeSettingsDescriptors<CurrentRuntimeSettingsStaticKey, string | boolean>(
    'current runtime settings static',
    [
      settingDescriptor('apiBaseUrl', '/api'),
      settingDescriptor('runtimeMode', 'native'),
      settingDescriptor('rendererPreference', 'webgpu-first'),
      settingDescriptor('allowPerItemImageHotLoad', false),
    ] as const,
    [
      'apiBaseUrl',
      'runtimeMode',
      'rendererPreference',
      'allowPerItemImageHotLoad',
    ] as const,
    (descriptor) => {
      if (typeof descriptor.value === 'string' && !descriptor.value.trim()) {
        throw new Error(`current runtime settings static descriptor value must be non-empty: ${descriptor.key}`);
      }
      if (
        descriptor.key === 'apiBaseUrl'
        && typeof descriptor.value === 'string'
        && !descriptor.value.startsWith('/')
      ) {
        throw new Error('current runtime settings API base URL must be absolute');
      }
    },
  );

const CURRENT_RUNTIME_SETTINGS_STATIC_BASE =
  projectSettingsDescriptorMap(CURRENT_RUNTIME_SETTINGS_STATIC_DESCRIPTORS);

export const CURRENT_RUNTIME_SETTINGS_STATIC = Object.freeze({
  ...CURRENT_RUNTIME_SETTINGS_STATIC_BASE,
  runtime: CURRENT_RUNTIME_SETTINGS_RUNTIME,
} as Readonly<Record<CurrentRuntimeSettingsStaticKey, string | boolean>> & Readonly<{
  runtime: Readonly<Record<CurrentRuntimeSettingsRuntimeUrlKey, string>>;
}>);

export type CurrentRuntimeSettings = typeof CURRENT_RUNTIME_SETTINGS_STATIC & Readonly<{
  debugPanels: boolean;
}>;

export function isCurrentRuntimeSettingsEnabledFlag(value: string | undefined): boolean {
  const normalized = `${value ?? ''}`.trim().toLowerCase();
  return Object.values(CURRENT_RUNTIME_ENABLED_FLAG_VALUES).some((candidate) => candidate === normalized);
}

export function resolveCurrentRuntimeSettings(
  env: CurrentRuntimeSettingsEnvironment,
): CurrentRuntimeSettings {
  return Object.freeze({
    ...CURRENT_RUNTIME_SETTINGS_STATIC,
    debugPanels: isCurrentRuntimeSettingsEnabledFlag(env[CURRENT_RUNTIME_SETTINGS_ENV.debugPanels]),
  });
}
