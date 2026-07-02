import type { Request, RequestHandler, Response } from 'express';
import type { RuntimeAdminControlError } from '../services/runtime-admin-reconcile-control.service';
import { sendErrorEnvelope } from '../utils/error-response';
import { setPublicCacheHeaders } from '../utils/http-cache';

export type RuntimeAdminTokenGuard = (req: Request, res: Response) => boolean;

export function sendRuntimeAdminJson(res: Response, payload: unknown): void {
  res.json(payload);
}

export function sendRuntimeAdminAccepted(res: Response, payload: unknown): void {
  res.status(202).json(payload);
}

export function sendRuntimeAdminOpenApi(res: Response, payload: unknown): void {
  setPublicCacheHeaders(res, {
    maxAgeSeconds: 300,
    staleWhileRevalidateSeconds: 3600,
    staleIfErrorSeconds: 86400,
  });
  res.json(payload);
}

export function sendRuntimeAdminControlError(req: Request, res: Response, error: RuntimeAdminControlError): void {
  sendErrorEnvelope(req, res, error.statusCode, error.code, error.message, error.details);
}

export function withRuntimeAdminToken(
  req: Request,
  res: Response,
  requireAdminToken: RuntimeAdminTokenGuard,
  handler: () => void,
): void {
  if (!requireAdminToken(req, res)) {
    return;
  }
  handler();
}

export function createRuntimeAdminTokenMiddleware(
  requireAdminToken: RuntimeAdminTokenGuard,
): RequestHandler {
  return (req, res, next) => {
    withRuntimeAdminToken(req, res, requireAdminToken, next);
  };
}
