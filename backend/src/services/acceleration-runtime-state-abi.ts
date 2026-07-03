/** Acceleration runtime state and gate ABI catalog. */

export type AccelerationRuntimePhase =
  | 'initializing'
  | 'ready'
  | 'stale'
  | 'compiling'
  | 'promoting'
  | 'materializing'
  | 'error';

export type AccelerationRuntimeState = Readonly<{
  revision: number;
  phase: AccelerationRuntimePhase;
  message: string;
  activeApiRequests: number;
  blocking: boolean;
  stale: boolean;
  lastCompiledSignature: string | null;
  lastError: string | null;
}>;

export type AccelerationRuntimeRequestLeaseStatus = 'acquired';
export type AccelerationRuntimeRequestBlockedStatus = 'blocked';

export type AccelerationRuntimeApiRequestLease = Readonly<{
  status: AccelerationRuntimeRequestLeaseStatus;
  snapshot: AccelerationRuntimeState;
  release: () => void;
}>;

export type AccelerationRuntimeApiRequestAcquireResult =
  | AccelerationRuntimeApiRequestLease
  | Readonly<{
      status: AccelerationRuntimeRequestBlockedStatus;
      snapshot: AccelerationRuntimeState;
    }>;

export type AccelerationRuntimeInitialStateDescriptor = Readonly<{
  revision: number;
  phase: AccelerationRuntimePhase;
  message: string;
  activeApiRequests: number;
  blocking: boolean;
  stale: boolean;
  lastCompiledSignature: string | null;
  lastError: string | null;
}>;

export type AccelerationRuntimeRequestStatusDescriptor = Readonly<{
  acquired: AccelerationRuntimeRequestLeaseStatus;
  blocked: AccelerationRuntimeRequestBlockedStatus;
}>;

export type AccelerationRuntimeIdleWaitPolicy = Readonly<{
  timeoutMs: number;
  pollIntervalMs: number;
}>;

export type AccelerationRuntimeGatePolicy = Readonly<{
  trackedPathPrefix: string;
  excludedPaths: readonly string[];
  retryAfterHeader: string;
  retryAfterSeconds: string;
  warmingStatusCode: number;
  warmingErrorCode: string;
  warmingMessage: string;
  warmingPayloadStatus: string;
}>;

export const ACCELERATION_RUNTIME_PHASE_DESCRIPTORS = validateAndFreezePhaseDescriptors([
  'initializing',
  'ready',
  'stale',
  'compiling',
  'promoting',
  'materializing',
  'error',
] as const satisfies readonly AccelerationRuntimePhase[]);

export const ACCELERATION_RUNTIME_REQUEST_STATUS = validateAndFreezeRequestStatuses({
  acquired: 'acquired',
  blocked: 'blocked',
});

export const INITIAL_ACCELERATION_RUNTIME_STATE = validateAndFreezeInitialState({
  revision: 0,
  phase: 'initializing',
  message: 'starting',
  activeApiRequests: 0,
  blocking: false,
  stale: false,
  lastCompiledSignature: null,
  lastError: null,
});

export const ACCELERATION_RUNTIME_IDLE_WAIT_POLICY = validateAndFreezeIdleWaitPolicy({
  timeoutMs: 5_000,
  pollIntervalMs: 25,
});

export const ACCELERATION_RUNTIME_GATE_POLICY = validateAndFreezeGatePolicy({
  trackedPathPrefix: '/api',
  excludedPaths: Object.freeze(['/api/health']),
  retryAfterHeader: 'Retry-After',
  retryAfterSeconds: '1',
  warmingStatusCode: 503,
  warmingErrorCode: 'ACCELERATION_RUNTIME_WARMING',
  warmingMessage: 'Acceleration database is switching snapshots. Retry shortly.',
  warmingPayloadStatus: 'warming',
});

export function isAccelerationRuntimeTrackedPath(routePath: string): boolean {
  return routePath.startsWith(ACCELERATION_RUNTIME_GATE_POLICY.trackedPathPrefix)
    && !ACCELERATION_RUNTIME_GATE_POLICY.excludedPaths.includes(routePath);
}

export function getAccelerationRuntimeWarmingDetails(snapshot: AccelerationRuntimeState): Readonly<{
  status: string;
  phase: AccelerationRuntimePhase;
}> {
  return Object.freeze({
    status: ACCELERATION_RUNTIME_GATE_POLICY.warmingPayloadStatus,
    phase: snapshot.phase,
  });
}

function validateAndFreezePhaseDescriptors(
  phases: readonly AccelerationRuntimePhase[],
): readonly AccelerationRuntimePhase[] {
  const seen = new Set<string>();
  for (const phase of phases) {
    if (!phase.trim()) {
      throw new Error('acceleration runtime phase descriptor must be non-empty');
    }
    if (!seen.add(phase)) {
      throw new Error(`Duplicate acceleration runtime phase descriptor: ${phase}`);
    }
  }
  return Object.freeze([...phases]);
}

function validateAndFreezeRequestStatuses(
  descriptor: AccelerationRuntimeRequestStatusDescriptor,
): AccelerationRuntimeRequestStatusDescriptor {
  if (!descriptor.acquired.trim()) {
    throw new Error('acceleration runtime acquired status must be non-empty');
  }
  if (!descriptor.blocked.trim()) {
    throw new Error('acceleration runtime blocked status must be non-empty');
  }
  if ((descriptor.acquired as string) === (descriptor.blocked as string)) {
    throw new Error(`Duplicate acceleration runtime request status: ${descriptor.acquired}`);
  }
  return Object.freeze({ ...descriptor });
}

function validateAndFreezeInitialState(
  descriptor: AccelerationRuntimeInitialStateDescriptor,
): AccelerationRuntimeState {
  if (descriptor.revision !== 0) {
    throw new Error('initial acceleration runtime revision must be zero');
  }
  if (!ACCELERATION_RUNTIME_PHASE_DESCRIPTORS.includes(descriptor.phase)) {
    throw new Error(`Unknown initial acceleration runtime phase: ${descriptor.phase}`);
  }
  if (!descriptor.message.trim()) {
    throw new Error('initial acceleration runtime message must be non-empty');
  }
  if (descriptor.activeApiRequests !== 0) {
    throw new Error('initial acceleration runtime activeApiRequests must be zero');
  }
  return Object.freeze({ ...descriptor });
}

function validateAndFreezeIdleWaitPolicy(
  policy: AccelerationRuntimeIdleWaitPolicy,
): AccelerationRuntimeIdleWaitPolicy {
  if (!Number.isInteger(policy.timeoutMs) || policy.timeoutMs <= 0) {
    throw new Error('acceleration runtime idle wait timeoutMs must be positive');
  }
  if (!Number.isInteger(policy.pollIntervalMs) || policy.pollIntervalMs <= 0) {
    throw new Error('acceleration runtime idle wait pollIntervalMs must be positive');
  }
  if (policy.pollIntervalMs > policy.timeoutMs) {
    throw new Error('acceleration runtime idle wait pollIntervalMs must not exceed timeoutMs');
  }
  return Object.freeze({ ...policy });
}

function validateAndFreezeGatePolicy(
  policy: AccelerationRuntimeGatePolicy,
): AccelerationRuntimeGatePolicy {
  if (!policy.trackedPathPrefix.startsWith('/')) {
    throw new Error('acceleration runtime gate trackedPathPrefix must be absolute');
  }
  if (!policy.retryAfterHeader.trim()) {
    throw new Error('acceleration runtime gate retryAfterHeader must be non-empty');
  }
  if (!policy.retryAfterSeconds.trim()) {
    throw new Error('acceleration runtime gate retryAfterSeconds must be non-empty');
  }
  if (!Number.isInteger(policy.warmingStatusCode) || policy.warmingStatusCode < 400 || policy.warmingStatusCode > 599) {
    throw new Error('acceleration runtime gate warmingStatusCode must be an HTTP error');
  }
  if (!policy.warmingErrorCode.trim()) {
    throw new Error('acceleration runtime gate warmingErrorCode must be non-empty');
  }
  if (!policy.warmingMessage.trim()) {
    throw new Error('acceleration runtime gate warmingMessage must be non-empty');
  }
  if (!policy.warmingPayloadStatus.trim()) {
    throw new Error('acceleration runtime gate warmingPayloadStatus must be non-empty');
  }
  const excludedPaths = new Set<string>();
  for (const excludedPath of policy.excludedPaths) {
    if (!excludedPath.startsWith('/')) {
      throw new Error(`acceleration runtime gate excluded path must be absolute: ${excludedPath}`);
    }
    if (!excludedPath.startsWith(policy.trackedPathPrefix)) {
      throw new Error(`acceleration runtime gate excluded path must be under tracked prefix: ${excludedPath}`);
    }
    if (!excludedPaths.add(excludedPath)) {
      throw new Error(`Duplicate acceleration runtime gate excluded path: ${excludedPath}`);
    }
  }
  return Object.freeze({
    ...policy,
    excludedPaths: Object.freeze([...policy.excludedPaths]),
  });
}
