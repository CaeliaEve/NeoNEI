import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS || 500);

export function requestObservability(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = typeof req.headers['x-request-id'] === 'string'
    ? req.headers['x-request-id'].trim()
    : '';
  const requestId = incomingRequestId || randomUUID();
  const startedAt = Date.now();

  res.setHeader('x-request-id', requestId);
  (req as Request & { requestId?: string }).requestId = requestId;

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const cache = String(res.getHeader('x-cache') || 'NA');
    const base = `${req.method} ${req.originalUrl} -> ${res.statusCode} ${durationMs}ms cache=${cache} [${requestId}]`;
    if (durationMs >= SLOW_REQUEST_MS) {
      logger.warn(`[SLOW] ${base}`);
    } else {
      logger.info(`[REQ] ${base}`);
    }
  });

  next();
}
