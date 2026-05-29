import type { Request, Response } from 'express';

export interface ErrorEnvelopeDetails {
  [key: string]: unknown;
}

export function sendErrorEnvelope(
  req: Request,
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: ErrorEnvelopeDetails,
): void {
  const requestId = (req as Request & { requestId?: string }).requestId;
  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId,
      ...(details && Object.keys(details).length > 0 ? { details } : {}),
    },
  });
}
