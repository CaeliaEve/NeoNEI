/** Runtime health summary ABI catalog and fail-closed policy. */

type RuntimeHealthArtifactDescriptor = Readonly<{
  name: RuntimeHealthArtifactProbeName;
  manifestKey: RuntimeHealthArtifactProbeName;
  required: boolean;
  rootManifest: boolean;
}>;

type RuntimeHealthCachePolicyDescriptor = Readonly<{
  envName: string;
  minTtlMs: number;
  defaultTtlMs: number;
}>;

export const RUNTIME_HEALTH_SCHEMA_VERSION = 'neonei/runtime-health-summary/current' as const;

export const RUNTIME_HEALTH_SUMMARY_STATUS = Object.freeze({
  ok: 'ok',
  warning: 'warning',
  blocked: 'blocked',
  degraded: 'degraded',
} as const);

export type RuntimeHealthSummaryStatus =
  typeof RUNTIME_HEALTH_SUMMARY_STATUS[keyof typeof RUNTIME_HEALTH_SUMMARY_STATUS];

export const RUNTIME_HEALTH_ARTIFACT_SUMMARY_STATUS = Object.freeze({
  ok: 'ok',
  missing: 'missing',
  invalid: 'invalid',
} as const);

export type RuntimeHealthArtifactSummaryStatus =
  typeof RUNTIME_HEALTH_ARTIFACT_SUMMARY_STATUS[keyof typeof RUNTIME_HEALTH_ARTIFACT_SUMMARY_STATUS];

export const RUNTIME_HEALTH_ARTIFACT_STATUS = Object.freeze({
  present: 'present',
  missing: 'missing',
  invalid: 'invalid',
} as const);

export const RUNTIME_HEALTH_ARTIFACT_ERRORS = Object.freeze({
  jsonObjectRequired: 'runtime health artifact JSON payload must be an object',
} as const);

export type RuntimeHealthArtifactProbeStatus =
  typeof RUNTIME_HEALTH_ARTIFACT_STATUS[keyof typeof RUNTIME_HEALTH_ARTIFACT_STATUS];

export type RuntimeHealthArtifactProbeName =
  | 'manifest'
  | 'validationReport'
  | 'migrationReadiness'
  | 'neiBrowserContract'
  | 'recipeFragmentation'
  | 'exportPathHygiene'
  | 'externalRuntimePromotionReport';

export interface RuntimeHealthArtifactProbe {
  name: RuntimeHealthArtifactProbeName;
  key: string;
  status: RuntimeHealthArtifactProbeStatus;
  path: string | null;
  relativePath: string | null;
  bytes: number | null;
  mtimeMs: number | null;
  error: string | null;
}

export type RuntimeHealthArtifactRead = Readonly<{
  probe: RuntimeHealthArtifactProbe;
  value: Record<string, unknown> | null;
}>;

export type RuntimeHealthArtifactSummary = Readonly<{
  status: RuntimeHealthArtifactSummaryStatus;
  probes: Record<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactProbe>;
  errors: string[];
}>;

export type RuntimeHealthStatusDecisionInput = Readonly<{
  distDataExists: boolean;
  manifestExists: boolean;
  runtimeSnapshotAvailable: boolean;
  missingFileCount: number;
  migrationReadinessStatus: string | null;
  browserContractStatus: string | null;
  recipeFragmentationStatus: string | null;
  compilerValidationBlocked: boolean;
  nativeUiProofBlocked: boolean;
  artifactStatus: RuntimeHealthArtifactSummaryStatus;
}>;

export const RUNTIME_HEALTH_DIST_MANIFEST_RELATIVE_PATH = 'manifest.json' as const;

const RUNTIME_HEALTH_ARTIFACT_DESCRIPTOR_KEYS = Object.freeze([
  'manifest',
  'validationReport',
  'migrationReadiness',
  'neiBrowserContract',
  'recipeFragmentation',
  'exportPathHygiene',
  'externalRuntimePromotionReport',
] as const satisfies readonly RuntimeHealthArtifactProbeName[]);

export const RUNTIME_HEALTH_ARTIFACT_DESCRIPTORS: readonly RuntimeHealthArtifactDescriptor[] =
  validateAndFreezeRuntimeHealthArtifactDescriptors([
    {
      name: 'manifest',
      manifestKey: 'manifest',
      required: true,
      rootManifest: true,
    },
    {
      name: 'validationReport',
      manifestKey: 'validationReport',
      required: true,
      rootManifest: false,
    },
    {
      name: 'migrationReadiness',
      manifestKey: 'migrationReadiness',
      required: true,
      rootManifest: false,
    },
    {
      name: 'neiBrowserContract',
      manifestKey: 'neiBrowserContract',
      required: true,
      rootManifest: false,
    },
    {
      name: 'recipeFragmentation',
      manifestKey: 'recipeFragmentation',
      required: true,
      rootManifest: false,
    },
    {
      name: 'exportPathHygiene',
      manifestKey: 'exportPathHygiene',
      required: true,
      rootManifest: false,
    },
    {
      name: 'externalRuntimePromotionReport',
      manifestKey: 'externalRuntimePromotionReport',
      required: false,
      rootManifest: false,
    },
  ]);

export const RUNTIME_HEALTH_REQUIRED_ARTIFACTS = Object.freeze(
  RUNTIME_HEALTH_ARTIFACT_DESCRIPTORS
    .filter((descriptor) => descriptor.required)
    .map((descriptor) => descriptor.name),
);

export const RUNTIME_HEALTH_MANIFEST_FILE_ARTIFACTS = Object.freeze(
  RUNTIME_HEALTH_ARTIFACT_DESCRIPTORS
    .filter((descriptor) => !descriptor.rootManifest)
    .map((descriptor) => descriptor.name),
);

export const RUNTIME_HEALTH_CACHE_POLICY = validateRuntimeHealthCachePolicy({
  envName: 'RUNTIME_HEALTH_SUMMARY_TTL_MS',
  minTtlMs: 1_000,
  defaultTtlMs: 10_000,
});

export function resolveRuntimeHealthCacheTtlMs(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const parsed = Number(env[RUNTIME_HEALTH_CACHE_POLICY.envName]);
  return Math.max(
    RUNTIME_HEALTH_CACHE_POLICY.minTtlMs,
    Number.isFinite(parsed) ? parsed : RUNTIME_HEALTH_CACHE_POLICY.defaultTtlMs,
  );
}

export function createRuntimeHealthArtifactProbe(args: {
  name: RuntimeHealthArtifactProbeName;
  key: string;
  status: RuntimeHealthArtifactProbeStatus;
  path: string | null;
  relativePath: string | null;
  bytes?: number | null;
  mtimeMs?: number | null;
  error?: string | null;
}): RuntimeHealthArtifactProbe {
  return Object.freeze({
    name: args.name,
    key: args.key,
    status: args.status,
    path: args.path,
    relativePath: args.relativePath,
    bytes: args.bytes ?? null,
    mtimeMs: args.mtimeMs ?? null,
    error: args.error ?? null,
  });
}

export function createMissingRuntimeHealthArtifactProbe(args: {
  name: RuntimeHealthArtifactProbeName;
  key?: string;
  path?: string | null;
  relativePath?: string | null;
}): RuntimeHealthArtifactProbe {
  const key = args.key ?? args.name;
  const relativePath = args.relativePath ?? null;
  return createRuntimeHealthArtifactProbe({
    name: args.name,
    key,
    status: RUNTIME_HEALTH_ARTIFACT_STATUS.missing,
    path: args.path ?? null,
    relativePath,
    error: relativePath
      ? `runtime health artifact is missing: ${relativePath}`
      : `runtime health artifact is not declared: ${key}`,
  });
}

export function createMissingRuntimeHealthArtifactRead(
  name: RuntimeHealthArtifactProbeName,
): RuntimeHealthArtifactRead {
  return Object.freeze({
    probe: createMissingRuntimeHealthArtifactProbe({ name }),
    value: null,
  });
}

export function summarizeRuntimeHealthArtifacts(
  artifactReads: ReadonlyMap<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactRead>,
): RuntimeHealthArtifactSummary {
  const probes = Object.fromEntries(
    RUNTIME_HEALTH_ARTIFACT_DESCRIPTORS.map((descriptor) => [
      descriptor.name,
      artifactReads.get(descriptor.name)?.probe ?? createMissingRuntimeHealthArtifactRead(descriptor.name).probe,
    ]),
  ) as Record<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactProbe>;
  const required = new Set<RuntimeHealthArtifactProbeName>(RUNTIME_HEALTH_REQUIRED_ARTIFACTS);
  const requiredProbes = Object.values(probes).filter((probe) => required.has(probe.name));
  const status = requiredProbes.some((probe) => probe.status === RUNTIME_HEALTH_ARTIFACT_STATUS.invalid)
    ? RUNTIME_HEALTH_ARTIFACT_SUMMARY_STATUS.invalid
    : requiredProbes.some((probe) => probe.status === RUNTIME_HEALTH_ARTIFACT_STATUS.missing)
      ? RUNTIME_HEALTH_ARTIFACT_SUMMARY_STATUS.missing
      : RUNTIME_HEALTH_ARTIFACT_SUMMARY_STATUS.ok;
  return Object.freeze({
    status,
    probes,
    errors: Object.values(probes)
      .filter((probe) => probe.error)
      .map((probe) => `${probe.name}: ${probe.error}`),
  });
}

export function chooseRuntimeHealthSummaryStatus(
  args: RuntimeHealthStatusDecisionInput,
): RuntimeHealthSummaryStatus {
  if (
    args.artifactStatus !== RUNTIME_HEALTH_ARTIFACT_SUMMARY_STATUS.ok
    || !args.manifestExists
    || !args.runtimeSnapshotAvailable
    || args.missingFileCount > 0
    || args.compilerValidationBlocked
    || args.nativeUiProofBlocked
    || args.migrationReadinessStatus === RUNTIME_HEALTH_SUMMARY_STATUS.blocked
  ) {
    return RUNTIME_HEALTH_SUMMARY_STATUS.blocked;
  }
  if (
    args.browserContractStatus === RUNTIME_HEALTH_SUMMARY_STATUS.warning
    || args.recipeFragmentationStatus === RUNTIME_HEALTH_SUMMARY_STATUS.warning
    || args.migrationReadinessStatus === RUNTIME_HEALTH_SUMMARY_STATUS.warning
  ) {
    return RUNTIME_HEALTH_SUMMARY_STATUS.warning;
  }
  if (!args.distDataExists) {
    return RUNTIME_HEALTH_SUMMARY_STATUS.degraded;
  }
  return RUNTIME_HEALTH_SUMMARY_STATUS.ok;
}

function validateAndFreezeRuntimeHealthArtifactDescriptors(
  descriptors: readonly RuntimeHealthArtifactDescriptor[],
): readonly RuntimeHealthArtifactDescriptor[] {
  const expected = new Set<RuntimeHealthArtifactProbeName>(RUNTIME_HEALTH_ARTIFACT_DESCRIPTOR_KEYS);
  const seenNames = new Set<RuntimeHealthArtifactProbeName>();
  const seenManifestKeys = new Set<RuntimeHealthArtifactProbeName>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('runtime health artifact descriptor must not be null');
    }
    if (!expected.has(descriptor.name)) {
      throw new Error(`Unknown runtime health artifact descriptor: ${descriptor.name}`);
    }
    if (!expected.has(descriptor.manifestKey)) {
      throw new Error(`Unknown runtime health artifact manifest key: ${descriptor.manifestKey}`);
    }
    if (!seenNames.add(descriptor.name)) {
      throw new Error(`Duplicate runtime health artifact descriptor: ${descriptor.name}`);
    }
    if (!seenManifestKeys.add(descriptor.manifestKey)) {
      throw new Error(`Duplicate runtime health artifact manifest key: ${descriptor.manifestKey}`);
    }
    if (descriptor.rootManifest !== (descriptor.name === 'manifest')) {
      throw new Error(`runtime health root manifest descriptor mismatch: ${descriptor.name}`);
    }
    if (descriptor.rootManifest && !descriptor.required) {
      throw new Error('runtime health root manifest must be required');
    }
  }

  for (const key of expected) {
    if (!seenNames.has(key)) {
      throw new Error(`Missing runtime health artifact descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateRuntimeHealthCachePolicy(
  descriptor: RuntimeHealthCachePolicyDescriptor,
): RuntimeHealthCachePolicyDescriptor {
  if (!descriptor.envName.trim()) {
    throw new Error('runtime health cache policy envName must be non-empty');
  }
  if (!Number.isFinite(descriptor.minTtlMs) || descriptor.minTtlMs < 1) {
    throw new Error('runtime health cache policy minTtlMs must be positive');
  }
  if (!Number.isFinite(descriptor.defaultTtlMs) || descriptor.defaultTtlMs < descriptor.minTtlMs) {
    throw new Error('runtime health cache policy defaultTtlMs must be at least minTtlMs');
  }
  return Object.freeze({ ...descriptor });
}
