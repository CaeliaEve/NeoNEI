import type { Request, RequestHandler, Response } from 'express';
import {
  ACCELERATION_RUNTIME_GATE_POLICY,
  ACCELERATION_RUNTIME_REQUEST_STATUS,
  getAccelerationRuntimeWarmingDetails,
  isAccelerationRuntimeTrackedPath,
} from '../services/acceleration-runtime-state-abi';
import {
  acquireAccelerationRuntimeApiRequest,
  type AccelerationRuntimeState,
} from '../services/acceleration-runtime-state.service';
import { sendErrorEnvelope } from '../utils/error-response';

function isTrackedAccelerationApiRequest(req: Request): boolean {
  const routePath = `${req.originalUrl ?? req.url ?? ''}`.split('?')[0] || '';
  return isAccelerationRuntimeTrackedPath(routePath);
}

function sendAccelerationRuntimeWarming(req: Request, res: Response, snapshot: AccelerationRuntimeState): void {
  res.setHeader(ACCELERATION_RUNTIME_GATE_POLICY.retryAfterHeader, ACCELERATION_RUNTIME_GATE_POLICY.retryAfterSeconds);
  sendErrorEnvelope(
    req,
    res,
    ACCELERATION_RUNTIME_GATE_POLICY.warmingStatusCode,
    ACCELERATION_RUNTIME_GATE_POLICY.warmingErrorCode,
    ACCELERATION_RUNTIME_GATE_POLICY.warmingMessage,
    getAccelerationRuntimeWarmingDetails(snapshot),
  );
}

export function createAccelerationRuntimeMiddleware(): RequestHandler {
  return (req, res, next) => {
    if (!isTrackedAccelerationApiRequest(req)) {
      return next();
    }

    const requestLease = acquireAccelerationRuntimeApiRequest();
    if (requestLease.status === ACCELERATION_RUNTIME_REQUEST_STATUS.blocked) {
      sendAccelerationRuntimeWarming(req, res, requestLease.snapshot);
      return;
    }

    res.on('finish', requestLease.release);
    res.on('close', requestLease.release);
    return next();
  };
}
