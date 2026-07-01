import type { Request, RequestHandler, Response } from 'express';
import {
  acquireAccelerationRuntimeApiRequest,
  type AccelerationRuntimeState,
} from '../services/acceleration-runtime-state.service';
import { sendErrorEnvelope } from '../utils/error-response';

function isTrackedAccelerationApiRequest(req: Request): boolean {
  const routePath = `${req.originalUrl ?? req.url ?? ''}`.split('?')[0] || '';
  return routePath.startsWith('/api') && routePath !== '/api/health';
}

function sendAccelerationRuntimeWarming(req: Request, res: Response, snapshot: AccelerationRuntimeState): void {
  res.setHeader('Retry-After', '1');
  sendErrorEnvelope(
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

export function createAccelerationRuntimeMiddleware(): RequestHandler {
  return (req, res, next) => {
    if (!isTrackedAccelerationApiRequest(req)) {
      return next();
    }

    const requestLease = acquireAccelerationRuntimeApiRequest();
    if (requestLease.status === 'blocked') {
      sendAccelerationRuntimeWarming(req, res, requestLease.snapshot);
      return;
    }

    res.on('finish', requestLease.release);
    res.on('close', requestLease.release);
    return next();
  };
}
