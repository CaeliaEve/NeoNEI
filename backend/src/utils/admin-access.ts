import type { Request, Response } from 'express';
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
    const windowMs = Math.max(1_000, options.rateLimitWindowMs);
    const maxRequests = Math.max(1, options.rateLimitMax);
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
      res.setHeader('Retry-After', String(Math.ceil(Math.max(1_000, options.rateLimitWindowMs) / 1000)));
      sendErrorEnvelope(req, res, 429, 'ADMIN_RATE_LIMITED', 'Admin request rate limit exceeded');
      logger.warn('[ADMIN] rate limited request', { route: req.originalUrl, ip: req.ip });
      return false;
    }

    if (!options.token) {
      sendErrorEnvelope(
        req,
        res,
        503,
        'ADMIN_TOKEN_NOT_CONFIGURED',
        'Set NEONEI_ADMIN_TOKEN before enabling admin mutation endpoints.',
      );
      logger.warn('[ADMIN] rejected request because NEONEI_ADMIN_TOKEN is not configured', { route: req.originalUrl });
      return false;
    }

    const provided = `${req.header('x-neonei-admin-token') ?? req.query.adminToken ?? ''}`;
    if (provided !== options.token) {
      sendErrorEnvelope(req, res, 401, 'ADMIN_TOKEN_REQUIRED', 'Admin token is required');
      logger.warn('[ADMIN] rejected unauthorized request', { route: req.originalUrl, ip: req.ip });
      return false;
    }
    return true;
  };
}
