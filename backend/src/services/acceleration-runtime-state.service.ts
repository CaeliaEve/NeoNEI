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

export type AccelerationRuntimeState = {
  phase: AccelerationRuntimePhase;
  message: string;
  activeApiRequests: number;
  blocking: boolean;
  stale: boolean;
  lastCompiledSignature: string | null;
  lastError: string | null;
};

export const accelerationRuntime: AccelerationRuntimeState = {
  phase: 'initializing',
  message: 'starting',
  activeApiRequests: 0,
  blocking: false,
  stale: false,
  lastCompiledSignature: null,
  lastError: null,
};

export function setAccelerationRuntimePhase(
  phase: AccelerationRuntimePhase,
  message: string,
  extras?: Partial<Pick<AccelerationRuntimeState, 'stale' | 'lastCompiledSignature' | 'lastError'>>,
): void {
  accelerationRuntime.phase = phase;
  accelerationRuntime.message = message;
  if (typeof extras?.stale === 'boolean') {
    accelerationRuntime.stale = extras.stale;
  }
  if (typeof extras?.lastCompiledSignature !== 'undefined') {
    accelerationRuntime.lastCompiledSignature = extras.lastCompiledSignature;
  }
  if (typeof extras?.lastError !== 'undefined') {
    accelerationRuntime.lastError = extras.lastError;
  }
}

export function setAccelerationRuntimeBlocking(blocking: boolean): void {
  accelerationRuntime.blocking = blocking;
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

    if (accelerationRuntime.blocking) {
      res.setHeader('Retry-After', '1');
      return sendErrorEnvelope(
        req,
        res,
        503,
        'ACCELERATION_RUNTIME_WARMING',
        'Acceleration database is switching snapshots. Retry shortly.',
        {
          status: 'warming',
          phase: accelerationRuntime.phase,
        },
      );
    }

    accelerationRuntime.activeApiRequests += 1;
    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      accelerationRuntime.activeApiRequests = Math.max(0, accelerationRuntime.activeApiRequests - 1);
    };

    res.on('finish', release);
    res.on('close', release);
    return next();
  };
}

export async function waitForAccelerationApiIdle(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (accelerationRuntime.activeApiRequests > 0 && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
