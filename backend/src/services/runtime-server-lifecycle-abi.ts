/** Runtime server lifecycle ABI catalog. */

import type { AccelerationRuntimePhase, AccelerationRuntimeState } from './acceleration-runtime-state-abi';

export type RuntimeLifecyclePhaseKey =
  | 'databaseInitializing'
  | 'databaseReady';

export type RuntimeLifecyclePhaseDescriptor = Readonly<{
  key: RuntimeLifecyclePhaseKey;
  phase: AccelerationRuntimePhase;
  message: string;
  extras: Readonly<Partial<Pick<AccelerationRuntimeState, 'stale' | 'lastCompiledSignature' | 'lastError'>>>;
}>;

export type RuntimeLifecycleFailurePolicy = Readonly<{
  phase: AccelerationRuntimePhase;
  message: string;
  stale: boolean;
  logMessage: string;
}>;

export type RuntimeDatabaseLogKey =
  | 'initializingDatabase'
  | 'databaseReady'
  | 'initializingAccelerationDatabase'
  | 'accelerationDatabaseReady';

export type RuntimeDatabaseLogDescriptor = Readonly<{
  key: RuntimeDatabaseLogKey;
  message: string;
}>;

export type RuntimeServerReadyEndpointKey =
  | 'apiEndpoint'
  | 'currentRuntimeApi'
  | 'publishHomeBootstrap';

export type RuntimeServerReadyEndpointDescriptor = Readonly<{
  key: RuntimeServerReadyEndpointKey;
  label: string;
  path: string;
}>;

export type RuntimeServerReadySettings = Readonly<{
  host: string;
  port: number;
  publicBaseUrl: string;
  publicRuntimeOnly: boolean;
  publishMaterializeOnStart: boolean;
}>;

export type RuntimeBackgroundReconcileOptions = Readonly<{
  publishMaterializeOnStart: boolean;
}>;

export type RuntimeServerReadyLogPolicy = Readonly<{
  serverListeningLabel: string;
  publicUrlLabel: string;
  imagesPathLabel: string;
  publicRuntimeOnlyLabel: string;
  missingImagesPathPrefix: string;
}>;

export type RuntimeNativeRenderLogPolicy = Readonly<{
  readyStatus: string;
  readyMessage: string;
  notReadyMessage: string;
}>;

export type RuntimeBackgroundReconcilePolicy = Readonly<{
  delayMs: number;
}>;

export const RUNTIME_LIFECYCLE_PHASE_DESCRIPTORS = validateAndFreezeLifecyclePhaseDescriptors([
  {
    key: 'databaseInitializing',
    phase: 'initializing',
    message: 'Initializing databases...',
    extras: Object.freeze({
      stale: false,
      lastCompiledSignature: null,
      lastError: null,
    }),
  },
  {
    key: 'databaseReady',
    phase: 'ready',
    message: 'Acceleration database opened; background reconciliation pending.',
    extras: Object.freeze({
      stale: false,
      lastError: null,
    }),
  },
]);

export const RUNTIME_LIFECYCLE_PHASES = projectLifecyclePhaseMap(
  RUNTIME_LIFECYCLE_PHASE_DESCRIPTORS,
);

export const RUNTIME_LIFECYCLE_FAILURE_POLICY = validateAndFreezeFailurePolicy({
  phase: 'error',
  message: 'Acceleration reconciliation failed.',
  stale: true,
  logMessage: '[ACCELERATION_DB] background reconciliation failed',
});

export const RUNTIME_DATABASE_LOG_DESCRIPTORS = validateAndFreezeDatabaseLogDescriptors([
  {
    key: 'initializingDatabase',
    message: 'Initializing database...',
  },
  {
    key: 'databaseReady',
    message: 'Database ready',
  },
  {
    key: 'initializingAccelerationDatabase',
    message: 'Initializing acceleration database...',
  },
  {
    key: 'accelerationDatabaseReady',
    message: 'Acceleration database ready',
  },
]);

export const RUNTIME_DATABASE_LOGS = projectDatabaseLogMap(RUNTIME_DATABASE_LOG_DESCRIPTORS);

export const RUNTIME_SERVER_READY_LOG_POLICY = validateAndFreezeReadyLogPolicy({
  serverListeningLabel: 'Server listening on',
  publicUrlLabel: 'Public URL',
  imagesPathLabel: 'Images path',
  publicRuntimeOnlyLabel: 'Public runtime only',
  missingImagesPathPrefix: '[WARN] IMAGES_PATH does not exist',
});

export const RUNTIME_SERVER_READY_ENDPOINT_DESCRIPTORS = validateAndFreezeReadyEndpointDescriptors([
  {
    key: 'apiEndpoint',
    label: 'API endpoint',
    path: '/api',
  },
  {
    key: 'currentRuntimeApi',
    label: 'Current runtime API',
    path: '/api/runtime/current',
  },
  {
    key: 'publishHomeBootstrap',
    label: 'Publish home bootstrap',
    path: '/api/publish/home-bootstrap',
  },
]);

export const RUNTIME_NATIVE_RENDER_LOG_POLICY = validateAndFreezeNativeRenderLogPolicy({
  readyStatus: 'ok',
  readyMessage: '[NATIVE_RENDER] Angelica render index ready',
  notReadyMessage: '[NATIVE_RENDER] Angelica render index is not ready',
});

export const RUNTIME_BACKGROUND_RECONCILE_POLICY = validateAndFreezeBackgroundReconcilePolicy({
  delayMs: 150,
});

export function getRuntimeLifecyclePhase(key: RuntimeLifecyclePhaseKey): RuntimeLifecyclePhaseDescriptor {
  return RUNTIME_LIFECYCLE_PHASES[key];
}

export function getBackgroundReconcileFailureTransition(
  errorMessage: string,
): Readonly<{
  phase: AccelerationRuntimePhase;
  message: string;
  extras: Readonly<Pick<AccelerationRuntimeState, 'stale' | 'lastError'>>;
}> {
  const lastError = errorMessage.trim() || 'Unknown background reconciliation failure';
  return Object.freeze({
    phase: RUNTIME_LIFECYCLE_FAILURE_POLICY.phase,
    message: RUNTIME_LIFECYCLE_FAILURE_POLICY.message,
    extras: Object.freeze({
      stale: RUNTIME_LIFECYCLE_FAILURE_POLICY.stale,
      lastError,
    }),
  });
}

export function projectRuntimeServerReadyLogs(
  settings: RuntimeServerReadySettings,
  imagesPath: string,
): readonly string[] {
  const endpointLogs = RUNTIME_SERVER_READY_ENDPOINT_DESCRIPTORS.map(
    (descriptor) => `${descriptor.label}: ${settings.publicBaseUrl}${descriptor.path}`,
  );
  return Object.freeze([
    `${RUNTIME_SERVER_READY_LOG_POLICY.serverListeningLabel}: ${settings.host}:${settings.port}`,
    `${RUNTIME_SERVER_READY_LOG_POLICY.publicUrlLabel}: ${settings.publicBaseUrl}`,
    ...endpointLogs,
    `${RUNTIME_SERVER_READY_LOG_POLICY.imagesPathLabel}: ${imagesPath}`,
    `${RUNTIME_SERVER_READY_LOG_POLICY.publicRuntimeOnlyLabel}: ${settings.publicRuntimeOnly}`,
  ]);
}

export function getMissingImagesPathWarning(imagesPath: string): string {
  return `${RUNTIME_SERVER_READY_LOG_POLICY.missingImagesPathPrefix}: ${imagesPath}`;
}

export function projectRuntimeBackgroundReconcileOptions(
  settings: RuntimeServerReadySettings,
): RuntimeBackgroundReconcileOptions {
  return Object.freeze({
    publishMaterializeOnStart: settings.publishMaterializeOnStart,
  });
}

function validateAndFreezeLifecyclePhaseDescriptors(
  descriptors: readonly RuntimeLifecyclePhaseDescriptor[],
): readonly RuntimeLifecyclePhaseDescriptor[] {
  const expected = new Set<RuntimeLifecyclePhaseKey>([
    'databaseInitializing',
    'databaseReady',
  ]);
  const seen = new Set<RuntimeLifecyclePhaseKey>();
  for (const descriptor of descriptors) {
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown runtime lifecycle phase descriptor: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate runtime lifecycle phase descriptor: ${descriptor.key}`);
    }
    if (!descriptor.phase.trim()) {
      throw new Error(`Runtime lifecycle phase must be non-empty: ${descriptor.key}`);
    }
    if (!descriptor.message.trim()) {
      throw new Error(`Runtime lifecycle phase message must be non-empty: ${descriptor.key}`);
    }
  }
  for (const key of expected) {
    if (!seen.has(key)) {
      throw new Error(`Missing runtime lifecycle phase descriptor: ${key}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({
    ...descriptor,
    extras: Object.freeze({ ...descriptor.extras }),
  })));
}

function validateAndFreezeFailurePolicy(
  policy: RuntimeLifecycleFailurePolicy,
): RuntimeLifecycleFailurePolicy {
  if (!policy.phase.trim()) {
    throw new Error('Runtime lifecycle failure phase must be non-empty');
  }
  if (!policy.message.trim()) {
    throw new Error('Runtime lifecycle failure message must be non-empty');
  }
  if (!policy.logMessage.trim()) {
    throw new Error('Runtime lifecycle failure log message must be non-empty');
  }
  return Object.freeze({ ...policy });
}

function validateAndFreezeDatabaseLogDescriptors(
  descriptors: readonly RuntimeDatabaseLogDescriptor[],
): readonly RuntimeDatabaseLogDescriptor[] {
  const expected = new Set<RuntimeDatabaseLogKey>([
    'initializingDatabase',
    'databaseReady',
    'initializingAccelerationDatabase',
    'accelerationDatabaseReady',
  ]);
  const seen = new Set<RuntimeDatabaseLogKey>();
  const messages = new Set<string>();
  for (const descriptor of descriptors) {
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown runtime database log descriptor: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate runtime database log descriptor: ${descriptor.key}`);
    }
    if (!descriptor.message.trim()) {
      throw new Error(`Runtime database log message must be non-empty: ${descriptor.key}`);
    }
    if (!messages.add(descriptor.message)) {
      throw new Error(`Duplicate runtime database log message: ${descriptor.message}`);
    }
  }
  for (const key of expected) {
    if (!seen.has(key)) {
      throw new Error(`Missing runtime database log descriptor: ${key}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateAndFreezeReadyLogPolicy(
  policy: RuntimeServerReadyLogPolicy,
): RuntimeServerReadyLogPolicy {
  for (const [key, value] of Object.entries(policy)) {
    if (!value.trim()) {
      throw new Error(`Runtime server ready log policy must be non-empty: ${key}`);
    }
  }
  return Object.freeze({ ...policy });
}

function validateAndFreezeReadyEndpointDescriptors(
  descriptors: readonly RuntimeServerReadyEndpointDescriptor[],
): readonly RuntimeServerReadyEndpointDescriptor[] {
  const expected = new Set<RuntimeServerReadyEndpointKey>([
    'apiEndpoint',
    'currentRuntimeApi',
    'publishHomeBootstrap',
  ]);
  const seen = new Set<RuntimeServerReadyEndpointKey>();
  const paths = new Set<string>();
  for (const descriptor of descriptors) {
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown runtime ready endpoint descriptor: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate runtime ready endpoint descriptor: ${descriptor.key}`);
    }
    if (!descriptor.label.trim()) {
      throw new Error(`Runtime ready endpoint label must be non-empty: ${descriptor.key}`);
    }
    if (!descriptor.path.startsWith('/')) {
      throw new Error(`Runtime ready endpoint path must be absolute: ${descriptor.key}`);
    }
    if (!paths.add(descriptor.path)) {
      throw new Error(`Duplicate runtime ready endpoint path: ${descriptor.path}`);
    }
  }
  for (const key of expected) {
    if (!seen.has(key)) {
      throw new Error(`Missing runtime ready endpoint descriptor: ${key}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateAndFreezeNativeRenderLogPolicy(
  policy: RuntimeNativeRenderLogPolicy,
): RuntimeNativeRenderLogPolicy {
  if (!policy.readyStatus.trim()) {
    throw new Error('Runtime native render ready status must be non-empty');
  }
  if (!policy.readyMessage.trim()) {
    throw new Error('Runtime native render ready message must be non-empty');
  }
  if (!policy.notReadyMessage.trim()) {
    throw new Error('Runtime native render not-ready message must be non-empty');
  }
  if (policy.readyMessage === policy.notReadyMessage) {
    throw new Error('Runtime native render log messages must be distinct');
  }
  return Object.freeze({ ...policy });
}

function validateAndFreezeBackgroundReconcilePolicy(
  policy: RuntimeBackgroundReconcilePolicy,
): RuntimeBackgroundReconcilePolicy {
  if (!Number.isInteger(policy.delayMs) || policy.delayMs <= 0) {
    throw new Error('Runtime background reconcile delayMs must be positive');
  }
  return Object.freeze({ ...policy });
}

function projectLifecyclePhaseMap(
  descriptors: readonly RuntimeLifecyclePhaseDescriptor[],
): Readonly<Record<RuntimeLifecyclePhaseKey, RuntimeLifecyclePhaseDescriptor>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor;
        return map;
      },
      {} as Record<RuntimeLifecyclePhaseKey, RuntimeLifecyclePhaseDescriptor>,
    ),
  );
}

function projectDatabaseLogMap(
  descriptors: readonly RuntimeDatabaseLogDescriptor[],
): Readonly<Record<RuntimeDatabaseLogKey, string>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor.message;
        return map;
      },
      {} as Record<RuntimeDatabaseLogKey, string>,
    ),
  );
}
