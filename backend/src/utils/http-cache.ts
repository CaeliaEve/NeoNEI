import crypto from 'crypto';
import type { Request, Response } from 'express';

export function createWeakEtag(...parts: Array<string | number | boolean | null | undefined>): string {
  const digest = crypto
    .createHash('sha1')
    .update(parts.map((part) => `${part ?? ''}`).join('|'))
    .digest('hex');
  return `W/"${digest}"`;
}

export function setPublicCacheHeaders(
  res: Response,
  options: {
    maxAgeSeconds: number;
    staleWhileRevalidateSeconds?: number;
    staleIfErrorSeconds?: number;
  },
): void {
  const directives = [
    'public',
    `max-age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
  ];
  if (typeof options.staleWhileRevalidateSeconds === 'number' && options.staleWhileRevalidateSeconds >= 0) {
    directives.push(`stale-while-revalidate=${Math.floor(options.staleWhileRevalidateSeconds)}`);
  }
  if (typeof options.staleIfErrorSeconds === 'number' && options.staleIfErrorSeconds >= 0) {
    directives.push(`stale-if-error=${Math.floor(options.staleIfErrorSeconds)}`);
  }

  res.setHeader('Cache-Control', directives.join(', '));
  res.setHeader('Vary', 'Accept-Encoding');
}

export function sendNotModifiedIfEtagMatches(req: Request, res: Response, etag: string): boolean {
  res.setHeader('ETag', etag);
  const ifNoneMatch = req.header('if-none-match');
  if (!ifNoneMatch) {
    return false;
  }

  const requestedEtags = ifNoneMatch
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!requestedEtags.includes('*') && !requestedEtags.includes(etag)) {
    return false;
  }

  res.status(304).end();
  return true;
}
