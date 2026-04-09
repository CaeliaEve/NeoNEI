import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

type HttpError = Error & { statusCode?: number; code?: string };

export function errorHandler(
  error: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  const code = error.code || (statusCode === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const message = statusCode === 500 ? 'Internal server error' : error.message;
  const requestId = (req as Request & { requestId?: string }).requestId;

  if (statusCode >= 500) {
    logger.error(`[ERR] ${requestId || '-'} ${error.message}`, { stack: error.stack });
  } else {
    logger.warn(`[WARN] ${requestId || '-'} ${error.message}`);
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId,
    },
  });
}
