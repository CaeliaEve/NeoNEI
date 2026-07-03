import type { Request, Response } from 'express';
import {
  ADMIN_ACCESS_ERRORS,
  ADMIN_ACCESS_MIN_RATE_LIMIT_MAX,
  ADMIN_ACCESS_MIN_RATE_LIMIT_WINDOW_MS,
  ADMIN_ACCESS_RETRY_AFTER_HEADER,
  getAdminAccessTokenCandidate,
} from './admin-access-abi';
import { sendErrorEnvelope } from './error-response';
import { logger } from './logger';

type AdminRateBucket = {
  windowStartedAt: number;
  count: number;
};

export type AdminAccessGuardOptions = {
  token: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
};

export function createAdminAccessGuard(options: AdminAccessGuardOptions): (req: Request, res: Response) => boolean {
  const adminRateBuckets = new Map<string, AdminRateBucket>();

  function getAdminRateLimitKey(req: Request): string {
    return `${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`;
  }

  function isAdminRateLimited(req: Request): boolean {
    const now = Date.now();
    const windowMs = Math.max(ADMIN_ACCESS_MIN_RATE_LIMIT_WINDOW_MS, options.rateLimitWindowMs);
    const maxRequests = Math.max(ADMIN_ACCESS_MIN_RATE_LIMIT_MAX, options.rateLimitMax);
    const key = getAdminRateLimitKey(req);
    const bucket = adminRateBuckets.get(key);
    if (!bucket || now - bucket.windowStartedAt > windowMs) {
      adminRateBuckets.set(key, { windowStartedAt: now, count: 1 });
      return false;
    }
    bucket.count += 1;
    return bucket.count > maxRequests;
  }

  return (req: Request, res: Response): boolean => {
    if (isAdminRateLimited(req)) {
      const error = ADMIN_ACCESS_ERRORS.rateLimited;
      res.setHeader(
        ADMIN_ACCESS_RETRY_AFTER_HEADER,
        String(Math.ceil(Math.max(ADMIN_ACCESS_MIN_RATE_LIMIT_WINDOW_MS, options.rateLimitWindowMs) / 1000)),
      );
      sendErrorEnvelope(req, res, error.statusCode, error.code, error.message);
      logger.warn(error.logMessage, { route: req.originalUrl, ip: req.ip });
      return false;
    }

    if (!options.token) {
      const error = ADMIN_ACCESS_ERRORS.tokenNotConfigured;
      sendErrorEnvelope(req, res, error.statusCode, error.code, error.message);
      logger.warn(error.logMessage, { route: req.originalUrl });
      return false;
    }

    const provided = getAdminAccessTokenCandidate({
      header: (name) => req.header(name),
      query: req.query as Readonly<Record<string, unknown>>,
    });
    if (provided !== options.token) {
      const error = ADMIN_ACCESS_ERRORS.tokenRequired;
      sendErrorEnvelope(req, res, error.statusCode, error.code, error.message);
      logger.warn(error.logMessage, { route: req.originalUrl, ip: req.ip });
      return false;
    }
    return true;
  };
}
