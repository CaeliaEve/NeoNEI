import {
  ACCELERATION_RUNTIME_IDLE_WAIT_POLICY,
  ACCELERATION_RUNTIME_REQUEST_STATUS,
  INITIAL_ACCELERATION_RUNTIME_STATE,
  type AccelerationRuntimeApiRequestAcquireResult,
  type AccelerationRuntimeApiRequestLease,
  type AccelerationRuntimePhase,
  type AccelerationRuntimeState,
} from './acceleration-runtime-state-abi';

export type {
  AccelerationRuntimeApiRequestAcquireResult,
  AccelerationRuntimeApiRequestLease,
  AccelerationRuntimePhase,
  AccelerationRuntimeState,
};

type MutableAccelerationRuntimeState = {
  -readonly [Key in keyof AccelerationRuntimeState]: AccelerationRuntimeState[Key];
};

type AccelerationRuntimePatch = Partial<Omit<MutableAccelerationRuntimeState, 'revision'>>;

let accelerationRuntimeSnapshot: AccelerationRuntimeState = INITIAL_ACCELERATION_RUNTIME_STATE;

function publishAccelerationRuntimeSnapshot(patch: AccelerationRuntimePatch): AccelerationRuntimeState {
  accelerationRuntimeSnapshot = Object.freeze({
    ...accelerationRuntimeSnapshot,
    ...patch,
    revision: accelerationRuntimeSnapshot.revision + 1,
  });
  return accelerationRuntimeSnapshot;
}

export function getAccelerationRuntimeSnapshot(): AccelerationRuntimeState {
  return accelerationRuntimeSnapshot;
}

export function setAccelerationRuntimePhase(
  phase: AccelerationRuntimePhase,
  message: string,
  extras?: Partial<Pick<AccelerationRuntimeState, 'stale' | 'lastCompiledSignature' | 'lastError'>>,
): void {
  const patch: AccelerationRuntimePatch = {
    phase,
    message,
  };
  if (typeof extras?.stale === 'boolean') {
    patch.stale = extras.stale;
  }
  if (typeof extras?.lastCompiledSignature !== 'undefined') {
    patch.lastCompiledSignature = extras.lastCompiledSignature;
  }
  if (typeof extras?.lastError !== 'undefined') {
    patch.lastError = extras.lastError;
  }
  publishAccelerationRuntimeSnapshot(patch);
}

export function setAccelerationRuntimeBlocking(blocking: boolean): void {
  publishAccelerationRuntimeSnapshot({ blocking });
}

export function acquireAccelerationRuntimeApiRequest(): AccelerationRuntimeApiRequestAcquireResult {
  const snapshot = getAccelerationRuntimeSnapshot();
  if (snapshot.blocking) {
    return Object.freeze({
      status: ACCELERATION_RUNTIME_REQUEST_STATUS.blocked,
      snapshot,
    });
  }

  const acquiredSnapshot = publishAccelerationRuntimeSnapshot({
    activeApiRequests: snapshot.activeApiRequests + 1,
  });
  let released = false;

  const release = (): void => {
    if (released) {
      return;
    }
    released = true;
    publishAccelerationRuntimeSnapshot({
      activeApiRequests: Math.max(0, getAccelerationRuntimeSnapshot().activeApiRequests - 1),
    });
  };

  return Object.freeze({
    status: ACCELERATION_RUNTIME_REQUEST_STATUS.acquired,
    snapshot: acquiredSnapshot,
    release,
  });
}

export async function waitForAccelerationApiIdle(
  timeoutMs = ACCELERATION_RUNTIME_IDLE_WAIT_POLICY.timeoutMs,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (getAccelerationRuntimeSnapshot().activeApiRequests > 0 && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, ACCELERATION_RUNTIME_IDLE_WAIT_POLICY.pollIntervalMs));
  }
}
