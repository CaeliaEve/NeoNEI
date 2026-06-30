import type { Request, RequestHandler } from 'express';
import { sendErrorEnvelope } from '../utils/error-response';

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

export const accelerationRuntime = Object.freeze({
  get revision(): number {
    return getAccelerationRuntimeSnapshot().revision;
  },
  get phase(): AccelerationRuntimePhase {
    return getAccelerationRuntimeSnapshot().phase;
  },
  get message(): string {
    return getAccelerationRuntimeSnapshot().message;
  },
  get activeApiRequests(): number {
    return getAccelerationRuntimeSnapshot().activeApiRequests;
  },
  get blocking(): boolean {
    return getAccelerationRuntimeSnapshot().blocking;
  },
  get stale(): boolean {
    return getAccelerationRuntimeSnapshot().stale;
  },
  get lastCompiledSignature(): string | null {
    return getAccelerationRuntimeSnapshot().lastCompiledSignature;
  },
  get lastError(): string | null {
    return getAccelerationRuntimeSnapshot().lastError;
  },
}) satisfies AccelerationRuntimeState;

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

function isTrackedAccelerationApiRequest(req: Request): boolean {
  const routePath = `${req.originalUrl ?? req.url ?? ''}`.split('?')[0] || '';
  return routePath.startsWith('/api') && routePath !== '/api/health';
}

export function createAccelerationRuntimeMiddleware(): RequestHandler {
  return (req, res, next) => {
    if (!isTrackedAccelerationApiRequest(req)) {
      return next();
    }

    const snapshot = getAccelerationRuntimeSnapshot();
    if (snapshot.blocking) {
      res.setHeader('Retry-After', '1');
      return sendErrorEnvelope(
        req,
        res,
        503,
        'ACCELERATION_RUNTIME_WARMING',
        'Acceleration database is switching snapshots. Retry shortly.',
        {
          status: 'warming',
          phase: snapshot.phase,
        },
      );
    }

    publishAccelerationRuntimeSnapshot({ activeApiRequests: snapshot.activeApiRequests + 1 });
    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      publishAccelerationRuntimeSnapshot({
        activeApiRequests: Math.max(0, getAccelerationRuntimeSnapshot().activeApiRequests - 1),
      });
    };

    res.on('finish', release);
    res.on('close', release);
    return next();
  };
}

export async function waitForAccelerationApiIdle(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (getAccelerationRuntimeSnapshot().activeApiRequests > 0 && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
