/** Server runtime settings ABI catalog. */

import type { AdminAccessGuardOptions } from '../utils/admin-access';

export type ServerSettingsEnv = Readonly<Record<string, string | undefined>>;

export type ServerSettingsStringEnvKey =
  | 'host'
  | 'publicBaseUrl'
  | 'adminTokenPrimary'
  | 'adminTokenLegacy';

export type ServerSettingsNumberEnvKey =
  | 'port'
  | 'adminRateLimitWindowMs'
  | 'adminRateLimitMax';

export type ServerSettingsBooleanEnvKey =
  | 'publicRuntimeOnly'
  | 'publishMaterializeOnStart';

type ServerSettingsStringEnvDescriptor = Readonly<{
  key: ServerSettingsStringEnvKey;
  envName: string;
  defaultValue?: string;
}>;

type ServerSettingsNumberEnvDescriptor = Readonly<{
  key: ServerSettingsNumberEnvKey;
  envName: string;
  defaultValue: number;
  minValue: number;
}>;

type ServerSettingsBooleanEnvDescriptor = Readonly<{
  key: ServerSettingsBooleanEnvKey;
  envName: string;
}>;

const SERVER_SETTINGS_STRING_ENV_KEYS = Object.freeze([
  'host',
  'publicBaseUrl',
  'adminTokenPrimary',
  'adminTokenLegacy',
] as const satisfies readonly ServerSettingsStringEnvKey[]);

const SERVER_SETTINGS_NUMBER_ENV_KEYS = Object.freeze([
  'port',
  'adminRateLimitWindowMs',
  'adminRateLimitMax',
] as const satisfies readonly ServerSettingsNumberEnvKey[]);

const SERVER_SETTINGS_BOOLEAN_ENV_KEYS = Object.freeze([
  'publicRuntimeOnly',
  'publishMaterializeOnStart',
] as const satisfies readonly ServerSettingsBooleanEnvKey[]);

export const SERVER_SETTINGS_STRING_ENV_DESCRIPTORS: readonly ServerSettingsStringEnvDescriptor[] =
  validateAndFreezeServerSettingsEnvDescriptors(
    'server settings string env',
    SERVER_SETTINGS_STRING_ENV_KEYS,
    [
      { key: 'host', envName: 'HOST', defaultValue: '0.0.0.0' },
      { key: 'publicBaseUrl', envName: 'PUBLIC_BASE_URL' },
      { key: 'adminTokenPrimary', envName: 'NEONEI_ADMIN_TOKEN' },
      { key: 'adminTokenLegacy', envName: 'ADMIN_TOKEN' },
    ],
  );

export const SERVER_SETTINGS_NUMBER_ENV_DESCRIPTORS: readonly ServerSettingsNumberEnvDescriptor[] =
  validateAndFreezeServerSettingsEnvDescriptors(
    'server settings number env',
    SERVER_SETTINGS_NUMBER_ENV_KEYS,
    [
      { key: 'port', envName: 'PORT', defaultValue: 3002, minValue: 1 },
      { key: 'adminRateLimitWindowMs', envName: 'NEONEI_ADMIN_RATE_LIMIT_WINDOW_MS', defaultValue: 60_000, minValue: 1 },
      { key: 'adminRateLimitMax', envName: 'NEONEI_ADMIN_RATE_LIMIT_MAX', defaultValue: 12, minValue: 1 },
    ],
  );

export const SERVER_SETTINGS_BOOLEAN_ENV_DESCRIPTORS: readonly ServerSettingsBooleanEnvDescriptor[] =
  validateAndFreezeServerSettingsEnvDescriptors(
    'server settings boolean env',
    SERVER_SETTINGS_BOOLEAN_ENV_KEYS,
    [
      { key: 'publicRuntimeOnly', envName: 'NEONEI_PUBLIC_RUNTIME_ONLY' },
      { key: 'publishMaterializeOnStart', envName: 'NEONEI_PUBLISH_MATERIALIZE_ON_START' },
    ],
  );

export const SERVER_SETTINGS_PRODUCTION_NODE_ENV = 'production';

export function isEnvEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function isEnvDisabled(value: string | undefined): boolean {
  return value === '0' || value?.toLowerCase() === 'false';
}

export function resolveStringSetting(
  key: ServerSettingsStringEnvKey,
  env: ServerSettingsEnv = process.env,
): string {
  const descriptor = findDescriptor(SERVER_SETTINGS_STRING_ENV_DESCRIPTORS, key);
  const configured = env[descriptor.envName]?.trim();
  return configured || descriptor.defaultValue || '';
}

export function resolveNumberSetting(
  key: ServerSettingsNumberEnvKey,
  env: ServerSettingsEnv = process.env,
): number {
  const descriptor = findDescriptor(SERVER_SETTINGS_NUMBER_ENV_DESCRIPTORS, key);
  const parsed = Number(env[descriptor.envName]);
  if (Number.isFinite(parsed) && parsed >= descriptor.minValue) {
    return parsed;
  }
  return descriptor.defaultValue;
}

export function resolveBooleanSetting(
  key: ServerSettingsBooleanEnvKey,
  env: ServerSettingsEnv = process.env,
): boolean | null {
  const descriptor = findDescriptor(SERVER_SETTINGS_BOOLEAN_ENV_DESCRIPTORS, key);
  const configured = env[descriptor.envName];
  if (isEnvEnabled(configured)) {
    return true;
  }
  if (isEnvDisabled(configured)) {
    return false;
  }
  return null;
}

export function resolvePublicRuntimeOnly(env: ServerSettingsEnv = process.env): boolean {
  return resolveBooleanSetting('publicRuntimeOnly', env) ?? env.NODE_ENV === SERVER_SETTINGS_PRODUCTION_NODE_ENV;
}

export function resolvePublicBaseUrl(options: {
  env?: ServerSettingsEnv;
  host: string;
  port: number;
}): string {
  const env = options.env ?? process.env;
  const configured = resolveStringSetting('publicBaseUrl', env).replace(/\/+$/, '');
  if (configured) {
    return configured;
  }
  const host = options.host === '0.0.0.0' ? 'localhost' : options.host;
  return `http://${host}:${options.port}`;
}

export function resolveAdminAccessGuardOptions(env: ServerSettingsEnv = process.env): AdminAccessGuardOptions {
  return Object.freeze({
    token: resolveStringSetting('adminTokenPrimary', env) || resolveStringSetting('adminTokenLegacy', env),
    rateLimitWindowMs: resolveNumberSetting('adminRateLimitWindowMs', env),
    rateLimitMax: resolveNumberSetting('adminRateLimitMax', env),
  });
}

function findDescriptor<TKey extends string, TDescriptor extends Readonly<{ key: TKey }>>(
  descriptors: readonly TDescriptor[],
  key: TKey,
): TDescriptor {
  const descriptor = descriptors.find((candidate) => candidate.key === key);
  if (!descriptor) {
    throw new Error(`Missing server settings descriptor: ${key}`);
  }
  return descriptor;
}

function validateAndFreezeServerSettingsEnvDescriptors<TKey extends string, TDescriptor extends Readonly<{
  key: TKey;
  envName: string;
}>>(
  label: string,
  expectedKeys: readonly TKey[],
  descriptors: readonly TDescriptor[],
): readonly TDescriptor[] {
  const expected = new Set<string>(expectedKeys);
  const seenKeys = new Set<string>();
  const seenEnvNames = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error(`${label} descriptor must not be null`);
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown ${label} descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate ${label} descriptor: ${descriptor.key}`);
    }
    if (!descriptor.envName.trim()) {
      throw new Error(`${label} envName must be non-empty: ${descriptor.key}`);
    }
    if (!seenEnvNames.add(descriptor.envName)) {
      throw new Error(`Duplicate ${label} envName: ${descriptor.envName}`);
    }
  }

  for (const key of expectedKeys) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing ${label} descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor }))) as readonly TDescriptor[];
}
