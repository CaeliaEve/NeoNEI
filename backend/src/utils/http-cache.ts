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

export function parseCacheMaxAgeSeconds(value: string | number | undefined, fallbackSeconds = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value / 1000));
  }

  const raw = `${value ?? ''}`.trim().toLowerCase();
  if (!raw) {
    return Math.max(0, Math.floor(fallbackSeconds));
  }

  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/);
  if (!match) {
    return Math.max(0, Math.floor(fallbackSeconds));
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? 'ms';
  const seconds = unit === 'd'
    ? amount * 86400
    : unit === 'h'
      ? amount * 3600
      : unit === 'm'
        ? amount * 60
        : unit === 's'
          ? amount
          : amount / 1000;
  return Math.max(0, Math.floor(seconds));
}

export function setStaticAssetCacheHeaders(
  res: Response,
  options: {
    maxAge?: string | number;
    immutable?: boolean;
    fallbackSeconds?: number;
    varyAcceptEncoding?: boolean;
  } = {},
): void {
  const maxAgeSeconds = parseCacheMaxAgeSeconds(options.maxAge, options.fallbackSeconds ?? 0);
  const directives = ['public', `max-age=${maxAgeSeconds}`];
  if (options.immutable) {
    directives.push('immutable');
  }
  res.setHeader('Cache-Control', directives.join(', '));
  if (options.varyAcceptEncoding ?? true) {
    res.setHeader('Vary', 'Accept-Encoding');
  }
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

export function setNoStoreHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}
