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

export type AccelerationRuntimeApiRequestLease = Readonly<{
  status: 'acquired';
  snapshot: AccelerationRuntimeState;
  release: () => void;
}>;

export type AccelerationRuntimeApiRequestAcquireResult =
  | AccelerationRuntimeApiRequestLease
  | Readonly<{
      status: 'blocked';
      snapshot: AccelerationRuntimeState;
    }>;

type MutableAccelerationRuntimeState = {
  -readonly [Key in keyof AccelerationRuntimeState]: AccelerationRuntimeState[Key];
};

type AccelerationRuntimePatch = Partial<Omit<MutableAccelerationRuntimeState, 'revision'>>;

const INITIAL_ACCELERATION_RUNTIME_STATE: AccelerationRuntimeState = Object.freeze({
  revision: 0,
  phase: 'initializing',
  message: 'starting',
  activeApiRequests: 0,
  blocking: false,
  stale: false,
  lastCompiledSignature: null,
  lastError: null,
});

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
      status: 'blocked',
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
    status: 'acquired',
    snapshot: acquiredSnapshot,
    release,
  });
}

export async function waitForAccelerationApiIdle(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (getAccelerationRuntimeSnapshot().activeApiRequests > 0 && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
