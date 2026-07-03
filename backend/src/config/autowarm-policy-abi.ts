/** Startup autowarm policy ABI catalog. */

export type Env = Record<string, string | undefined>;

export type AutowarmTaskKey =
  | 'recipeBootstrap'
  | 'recipeShard';

export type AutowarmTaskPolicy = Readonly<{
  enabled: boolean;
  limit: number;
}>;

export type AutowarmPolicy = Readonly<Record<AutowarmTaskKey, AutowarmTaskPolicy>>;

export type AutowarmPolicyDescriptor = Readonly<{
  key: AutowarmTaskKey;
  enabledEnv: string;
  limitEnv: string;
  defaultEnabled: boolean;
  defaultLimit: number;
  startupDelayMs: number;
  completedLogMessage: string;
  failedLogMessage: string;
}>;

export type AutowarmStartupTask = Readonly<{
  key: AutowarmTaskKey;
  limit: number;
  delayMs: number;
  completedLogMessage: string;
  failedLogMessage: string;
}>;

export const AUTOWARM_BOOLEAN_ENV_VALUES = validateAndFreezeBooleanEnvValues({
  enabled: Object.freeze(['1', 'true']),
  disabled: Object.freeze(['0', 'false']),
});

export const AUTOWARM_POLICY_DESCRIPTORS = validateAndFreezeAutowarmPolicyDescriptors([
  {
    key: 'recipeBootstrap',
    enabledEnv: 'RECIPE_BOOTSTRAP_AUTOWARM',
    limitEnv: 'RECIPE_BOOTSTRAP_AUTOWARM_LIMIT',
    defaultEnabled: false,
    defaultLimit: 1_000,
    startupDelayMs: 500,
    completedLogMessage: '[RECIPE_BOOTSTRAP_AUTOWARM] completed',
    failedLogMessage: '[RECIPE_BOOTSTRAP_AUTOWARM] failed',
  },
  {
    key: 'recipeShard',
    enabledEnv: 'RECIPE_SHARD_AUTOWARM',
    limitEnv: 'RECIPE_SHARD_AUTOWARM_LIMIT',
    defaultEnabled: false,
    defaultLimit: 16,
    startupDelayMs: 1_800,
    completedLogMessage: '[RECIPE_SHARD_AUTOWARM] completed',
    failedLogMessage: '[RECIPE_SHARD_AUTOWARM] failed',
  },
]);

export const AUTOWARM_POLICY_DESCRIPTOR_BY_KEY = projectAutowarmPolicyDescriptorMap(
  AUTOWARM_POLICY_DESCRIPTORS,
);

export function resolveAutowarmPolicyFromEnv(env: Env = process.env): AutowarmPolicy {
  return Object.freeze(
    AUTOWARM_POLICY_DESCRIPTORS.reduce(
      (policy, descriptor) => {
        policy[descriptor.key] = Object.freeze({
          enabled: readEnabledWithDefault(env[descriptor.enabledEnv], descriptor.defaultEnabled),
          limit: readPositiveNumber(env[descriptor.limitEnv], descriptor.defaultLimit),
        });
        return policy;
      },
      {} as Record<AutowarmTaskKey, AutowarmTaskPolicy>,
    ),
  );
}

export function projectEnabledAutowarmStartupTasks(
  policy: AutowarmPolicy,
): readonly AutowarmStartupTask[] {
  return Object.freeze(
    AUTOWARM_POLICY_DESCRIPTORS
      .filter((descriptor) => policy[descriptor.key].enabled)
      .map((descriptor) => Object.freeze({
        key: descriptor.key,
        limit: policy[descriptor.key].limit,
        delayMs: descriptor.startupDelayMs,
        completedLogMessage: descriptor.completedLogMessage,
        failedLogMessage: descriptor.failedLogMessage,
      })),
  );
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isExplicitlyEnabled(value: string | undefined): boolean {
  const normalized = value?.toLowerCase();
  return Boolean(normalized && AUTOWARM_BOOLEAN_ENV_VALUES.enabled.includes(normalized));
}

function isExplicitlyDisabled(value: string | undefined): boolean {
  const normalized = value?.toLowerCase();
  return Boolean(normalized && AUTOWARM_BOOLEAN_ENV_VALUES.disabled.includes(normalized));
}

function readEnabledWithDefault(value: string | undefined, fallback: boolean): boolean {
  if (isExplicitlyEnabled(value)) return true;
  if (isExplicitlyDisabled(value)) return false;
  return fallback;
}

function validateAndFreezeBooleanEnvValues(values: Readonly<{
  enabled: readonly string[];
  disabled: readonly string[];
}>): Readonly<{
  enabled: readonly string[];
  disabled: readonly string[];
}> {
  const allValues = new Set<string>();
  for (const [label, rawValues] of Object.entries(values)) {
    if (rawValues.length === 0) {
      throw new Error(`Autowarm boolean env values must not be empty: ${label}`);
    }
    for (const value of rawValues) {
      const normalized = value.toLowerCase();
      if (!normalized.trim()) {
        throw new Error(`Autowarm boolean env value must be non-empty: ${label}`);
      }
      if (!allValues.add(normalized)) {
        throw new Error(`Duplicate autowarm boolean env value: ${normalized}`);
      }
    }
  }
  return Object.freeze({
    enabled: Object.freeze(values.enabled.map((value) => value.toLowerCase())),
    disabled: Object.freeze(values.disabled.map((value) => value.toLowerCase())),
  });
}

function validateAndFreezeAutowarmPolicyDescriptors(
  descriptors: readonly AutowarmPolicyDescriptor[],
): readonly AutowarmPolicyDescriptor[] {
  const expected = new Set<AutowarmTaskKey>([
    'recipeBootstrap',
    'recipeShard',
  ]);
  const keys = new Set<AutowarmTaskKey>();
  const envNames = new Set<string>();
  const logMessages = new Set<string>();
  for (const descriptor of descriptors) {
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown autowarm task descriptor: ${descriptor.key}`);
    }
    if (!keys.add(descriptor.key)) {
      throw new Error(`Duplicate autowarm task descriptor: ${descriptor.key}`);
    }
    validateEnvName('enabledEnv', descriptor.enabledEnv);
    validateEnvName('limitEnv', descriptor.limitEnv);
    if (!envNames.add(descriptor.enabledEnv)) {
      throw new Error(`Duplicate autowarm enabled env: ${descriptor.enabledEnv}`);
    }
    if (!envNames.add(descriptor.limitEnv)) {
      throw new Error(`Duplicate autowarm limit env: ${descriptor.limitEnv}`);
    }
    if (!Number.isInteger(descriptor.defaultLimit) || descriptor.defaultLimit <= 0) {
      throw new Error(`Autowarm default limit must be positive: ${descriptor.key}`);
    }
    if (!Number.isInteger(descriptor.startupDelayMs) || descriptor.startupDelayMs <= 0) {
      throw new Error(`Autowarm startupDelayMs must be positive: ${descriptor.key}`);
    }
    if (!descriptor.completedLogMessage.trim()) {
      throw new Error(`Autowarm completed log message must be non-empty: ${descriptor.key}`);
    }
    if (!descriptor.failedLogMessage.trim()) {
      throw new Error(`Autowarm failed log message must be non-empty: ${descriptor.key}`);
    }
    if (!logMessages.add(descriptor.completedLogMessage)) {
      throw new Error(`Duplicate autowarm log message: ${descriptor.completedLogMessage}`);
    }
    if (!logMessages.add(descriptor.failedLogMessage)) {
      throw new Error(`Duplicate autowarm log message: ${descriptor.failedLogMessage}`);
    }
  }
  for (const key of expected) {
    if (!keys.has(key)) {
      throw new Error(`Missing autowarm task descriptor: ${key}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateEnvName(label: string, envName: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(envName)) {
    throw new Error(`Autowarm ${label} must be an uppercase env name: ${envName}`);
  }
}

function projectAutowarmPolicyDescriptorMap(
  descriptors: readonly AutowarmPolicyDescriptor[],
): Readonly<Record<AutowarmTaskKey, AutowarmPolicyDescriptor>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor;
        return map;
      },
      {} as Record<AutowarmTaskKey, AutowarmPolicyDescriptor>,
    ),
  );
}
