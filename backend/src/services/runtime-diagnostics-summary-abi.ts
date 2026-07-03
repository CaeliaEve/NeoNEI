export const RUNTIME_DIAGNOSTICS_SCHEMA_VERSION = 'neonei/runtime-diagnostics/current';

export const RUNTIME_DIAGNOSTICS_READINESS_STATUS = Object.freeze({
  ready: 'ready',
  missing: 'missing',
  invalid: 'invalid',
} as const);

export type RuntimeDiagnosticsReadinessProbeStatus =
  typeof RUNTIME_DIAGNOSTICS_READINESS_STATUS[keyof typeof RUNTIME_DIAGNOSTICS_READINESS_STATUS];

export type RuntimeDiagnosticsReadinessStatus = RuntimeDiagnosticsReadinessProbeStatus;

export type RuntimeDiagnosticsReadinessProbeName =
  | 'dataDir'
  | 'publishDir'
  | 'activePublishRoot'
  | 'publishBundle'
  | 'browserLayout'
  | 'runtimeCacheKey'
  | 'sourceSignature';

export type RuntimeDiagnosticsReadinessProbeKind =
  | 'directory'
  | 'active-publish-root'
  | 'manifest-object'
  | 'manifest-string';

export type RuntimeDiagnosticsReadinessProbeDescriptor = Readonly<{
  name: RuntimeDiagnosticsReadinessProbeName;
  kind: RuntimeDiagnosticsReadinessProbeKind;
  required: true;
  description: string;
}>;

const RUNTIME_DIAGNOSTICS_READINESS_PROBE_NAMES = Object.freeze([
  'dataDir',
  'publishDir',
  'activePublishRoot',
  'publishBundle',
  'browserLayout',
  'runtimeCacheKey',
  'sourceSignature',
] as const satisfies readonly RuntimeDiagnosticsReadinessProbeName[]);

function readinessProbeDescriptor(
  name: RuntimeDiagnosticsReadinessProbeName,
  kind: RuntimeDiagnosticsReadinessProbeKind,
  description: string,
): RuntimeDiagnosticsReadinessProbeDescriptor {
  return Object.freeze({
    name,
    kind,
    required: true,
    description,
  });
}

function validateAndFreezeRuntimeDiagnosticsReadinessProbeDescriptors(
  descriptors: readonly RuntimeDiagnosticsReadinessProbeDescriptor[],
): readonly RuntimeDiagnosticsReadinessProbeDescriptor[] {
  const expected = new Set<RuntimeDiagnosticsReadinessProbeName>(RUNTIME_DIAGNOSTICS_READINESS_PROBE_NAMES);
  const seen = new Set<RuntimeDiagnosticsReadinessProbeName>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('runtime diagnostics readiness probe descriptor must not be null');
    }
    if (!expected.has(descriptor.name)) {
      throw new Error(`Unknown runtime diagnostics readiness probe: ${descriptor.name}`);
    }
    if (!seen.add(descriptor.name)) {
      throw new Error(`Duplicate runtime diagnostics readiness probe: ${descriptor.name}`);
    }
    if (descriptor.required !== true) {
      throw new Error(`runtime diagnostics readiness probe must be required: ${descriptor.name}`);
    }
    if (!descriptor.description.trim()) {
      throw new Error(`runtime diagnostics readiness probe description is required: ${descriptor.name}`);
    }
  }

  for (const name of RUNTIME_DIAGNOSTICS_READINESS_PROBE_NAMES) {
    if (!seen.has(name)) {
      throw new Error(`Missing runtime diagnostics readiness probe: ${name}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

export const RUNTIME_DIAGNOSTICS_READINESS_PROBE_DESCRIPTORS =
  validateAndFreezeRuntimeDiagnosticsReadinessProbeDescriptors([
    readinessProbeDescriptor(
      'dataDir',
      'directory',
      'Runtime data directory that contains generated compiler state.',
    ),
    readinessProbeDescriptor(
      'publishDir',
      'directory',
      'Publish output directory that contains immutable browser runtime bundles.',
    ),
    readinessProbeDescriptor(
      'activePublishRoot',
      'active-publish-root',
      'Source-signature-pinned publish root selected by the current manifest.',
    ),
    readinessProbeDescriptor(
      'publishBundle',
      'manifest-object',
      'Current publish bundle manifest loaded from the active publish root.',
    ),
    readinessProbeDescriptor(
      'browserLayout',
      'manifest-string',
      'Browser layout identity compiled into the current runtime manifest.',
    ),
    readinessProbeDescriptor(
      'runtimeCacheKey',
      'manifest-string',
      'Full runtime cache key used by clients to pin immutable runtime assets.',
    ),
    readinessProbeDescriptor(
      'sourceSignature',
      'manifest-string',
      'Compiler source signature that selects the active publish root.',
    ),
  ] as const);
