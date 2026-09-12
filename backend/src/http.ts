import type { Request, Response, NextFunction } from 'express';
import { Fault } from '@neonei/catalog';

export function errors(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) { next(error); return; }
  res.setHeader('Cache-Control', 'no-store');
  if (error instanceof Fault) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
    return;
  }
  if (error instanceof URIError) {
    res.status(400).json({ error: { code: 'invalid_url', message: 'Request URL is not valid' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: 'server_error', message: 'The server could not complete this request' } });
}
