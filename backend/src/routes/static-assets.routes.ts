import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  CONTRACTS_DIR,
  DATA_DIR,
  IMAGES_PATH,
  PUBLIC_DIR,
  NESQL_CANONICAL_DIR,
  PUBLISH_OUTPUT_DIR,
} from '../config/runtime-paths';
import { setNoStoreHeaders, setStaticAssetCacheHeaders } from '../utils/http-cache';

type RequestedArtifactDescriptor = {
  stem: string;
  extension: string;
  variantRegexes: RegExp[];
};

function isSafeUnderRoot(root: string, candidate: string): boolean {
  return candidate.startsWith(root);
}

function isExistingFile(candidate: string): boolean {
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
}

function parseRequestedArtifact(fileName: string): RequestedArtifactDescriptor | null {
  const match = fileName.match(/^(.*?)(\.sprite-atlas\.png|\.sprite\.json|\.render\.json|\.png|\.gif)$/i);
  if (!match) {
    return null;
  }

  const stem = match[1];
  const extension = match[2].toLowerCase();
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variantRegexes =
    extension === '.png' || extension === '.gif'
      ? [
          new RegExp(`^${escapedStem}~.+${extension.replace('.', '\\.')}$`, 'i'),
          new RegExp(`^${escapedStem}~.+\\.sprite-atlas\\.png$`, 'i'),
        ]
      : [new RegExp(`^${escapedStem}~.+${extension.replace('.', '\\.')}$`, 'i')];
  return {
    stem,
    extension,
    variantRegexes,
  };
}

function resolveFamilyArtifact(
  family: 'item' | 'fluid' | 'entity',
  modId: string,
  fileName: string,
): string | null {
  const familyRoot = path.resolve(IMAGES_PATH, family);
  const familyDir = path.resolve(familyRoot, modId);
  const direct = path.resolve(familyDir, fileName);

  if (!isSafeUnderRoot(familyRoot, direct) || !isSafeUnderRoot(familyRoot, familyDir)) {
    return null;
  }

  if (isExistingFile(direct)) {
    return direct;
  }

  const descriptor = parseRequestedArtifact(fileName);
  if (!descriptor) {
    return null;
  }

  if (descriptor.extension === '.png' || descriptor.extension === '.gif') {
    const alternateExtension = descriptor.extension === '.png' ? '.gif' : '.png';
    const alternateDirect = path.resolve(familyDir, `${descriptor.stem}${alternateExtension}`);
    if (isSafeUnderRoot(familyRoot, alternateDirect) && isExistingFile(alternateDirect)) {
      return alternateDirect;
    }

    const spriteAtlasDirect = path.resolve(familyDir, `${descriptor.stem}.sprite-atlas.png`);
    if (isSafeUnderRoot(familyRoot, spriteAtlasDirect) && isExistingFile(spriteAtlasDirect)) {
      return spriteAtlasDirect;
    }
  }

  if (!fs.existsSync(familyDir) || !fs.statSync(familyDir).isDirectory()) {
    return null;
  }

  const siblings = fs.readdirSync(familyDir);
  const variantCandidates = siblings.filter((name) =>
    descriptor.variantRegexes.some((regex) => regex.test(name)),
  );
  if (variantCandidates.length > 0) {
    variantCandidates.sort((left, right) => left.localeCompare(right));
    const sameExtension =
      variantCandidates.find((name) => !name.toLowerCase().includes('.sprite-atlas.') && name.toLowerCase().endsWith(descriptor.extension))
      ?? variantCandidates.find((name) => name.toLowerCase().endsWith('.gif'))
      ?? variantCandidates.find((name) => name.toLowerCase().endsWith('.sprite-atlas.png'));
    const chosen = sameExtension ?? variantCandidates[0];
    const resolved = path.resolve(familyDir, chosen);
    if (isSafeUnderRoot(familyRoot, resolved) && isExistingFile(resolved)) {
      return resolved;
    }
  }

  const baseNbtMatch = fileName.match(/^(.+~\d+)~.+(\.png|\.gif)$/i);
  if (baseNbtMatch) {
    const fallback = path.resolve(familyDir, `${baseNbtMatch[1]}${baseNbtMatch[2]}`);
    if (isSafeUnderRoot(familyRoot, fallback) && isExistingFile(fallback)) {
      return fallback;
    }
  }

  return null;
}

function createArtifactFallbackRoute(family: 'item' | 'fluid' | 'entity') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const modId = decodeURIComponent(req.params.modId || '');
      const fileName = decodeURIComponent(req.params.fileName || '');
      if (!modId || !fileName || modId.includes('..') || fileName.includes('..')) {
        return next();
      }

      const resolved = resolveFamilyArtifact(family, modId, fileName);
      if (resolved) {
        return res.sendFile(resolved);
      }
    } catch {
      // Fall through to static middleware.
    }
    return next();
  };
}

function createRawStaticRoute(rootDir: string, options?: { maxAge?: string; immutable?: boolean }) {
  const resolvedRoot = path.resolve(rootDir);
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawPath = `${req.url ?? ''}`.split('?')[0] || '/';
      const normalizedRelativePath = rawPath.replace(/^\/+/, '');
      if (!normalizedRelativePath) {
        return next();
      }

      const segments = normalizedRelativePath.split('/').filter(Boolean);
      if (segments.some((segment) => segment === '.' || segment === '..')) {
        return next();
      }

      const absolutePath = path.resolve(resolvedRoot, ...segments);
      if (!isSafeUnderRoot(resolvedRoot, absolutePath) || !isExistingFile(absolutePath)) {
        return next();
      }

      setStaticAssetCacheHeaders(res, {
        maxAge: options?.maxAge ?? 0,
        immutable: options?.immutable ?? false,
      });
      return res.sendFile(absolutePath, {
        cacheControl: false,
        lastModified: true,
      });
    } catch {
      return next();
    }
  };
}

const PUBLISH_STATIC_SIDECAR_VARIANTS = [
  { encoding: 'br' as const, extension: '.br' as const },
  { encoding: 'gzip' as const, extension: '.gz' as const },
];

function canServePrecompressedPublishAsset(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith('.json');
}

function acceptsEncoding(rawHeader: string | string[] | undefined, encoding: 'br' | 'gzip'): boolean {
  const header = Array.isArray(rawHeader) ? rawHeader.join(',') : `${rawHeader ?? ''}`;
  return header
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .some((token) => token === encoding || token.startsWith(`${encoding};`) || token === '*');
}

function isPublishMutableArtifact(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  return normalized === 'manifest.json'
    || normalized === 'build-report.json'
    || normalized === 'build-report.html'
    || normalized.endsWith('/manifest.json');
}

function createPublishStaticRoute(rootDir: string, options?: { maxAge?: string; immutable?: boolean }) {
  const resolvedRoot = path.resolve(rootDir);
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawPath = `${req.url ?? ''}`.split('?')[0] || '/';
      const normalizedRelativePath = rawPath.replace(/^\/+/, '');
      if (!normalizedRelativePath) {
        return next();
      }

      const segments = normalizedRelativePath.split('/').filter(Boolean);
      if (segments.some((segment) => segment === '.' || segment === '..')) {
        return next();
      }

      const absolutePath = path.resolve(resolvedRoot, ...segments);
      if (!isSafeUnderRoot(resolvedRoot, absolutePath) || !isExistingFile(absolutePath)) {
        return next();
      }

      let responsePath = absolutePath;
      let contentEncoding: 'br' | 'gzip' | null = null;
      if (!req.headers['x-no-compression'] && canServePrecompressedPublishAsset(normalizedRelativePath)) {
        for (const variant of PUBLISH_STATIC_SIDECAR_VARIANTS) {
          const candidatePath = `${absolutePath}${variant.extension}`;
          if (acceptsEncoding(req.headers['accept-encoding'], variant.encoding) && isExistingFile(candidatePath)) {
            responsePath = candidatePath;
            contentEncoding = variant.encoding;
            break;
          }
        }
      }

      if (canServePrecompressedPublishAsset(normalizedRelativePath)) {
        res.setHeader('Vary', 'Accept-Encoding');
      }
      if (contentEncoding) {
        res.setHeader('Content-Encoding', contentEncoding);
        res.type(path.extname(absolutePath));
      }

      if (isPublishMutableArtifact(normalizedRelativePath)) {
        setNoStoreHeaders(res);
        return res.sendFile(responsePath, {
          cacheControl: false,
          lastModified: true,
        });
      }

      setStaticAssetCacheHeaders(res, {
        maxAge: options?.maxAge ?? 0,
        immutable: options?.immutable ?? false,
      });
      return res.sendFile(responsePath, {
        cacheControl: false,
        lastModified: true,
      });
    } catch {
      return next();
    }
  };
}

export function registerStaticAssetRoutes(app: Express): void {
  app.use(express.static(PUBLIC_DIR));

  if (fs.existsSync(CONTRACTS_DIR)) {
    app.use(
      '/contracts',
      express.static(CONTRACTS_DIR, {
        maxAge: '1h',
        etag: true,
      }),
    );
  }

  app.get('/images/item/:modId/:fileName', createArtifactFallbackRoute('item'));
  app.get('/images/fluid/:modId/:fileName', createArtifactFallbackRoute('fluid'));
  app.get('/images/entity/:modId/:fileName', createArtifactFallbackRoute('entity'));
  app.get('/api/images/item/:modId/:fileName', createArtifactFallbackRoute('item'));
  app.get('/api/images/fluid/:modId/:fileName', createArtifactFallbackRoute('fluid'));
  app.get('/api/images/entity/:modId/:fileName', createArtifactFallbackRoute('entity'));

  app.use(
    '/images',
    express.static(IMAGES_PATH, {
      maxAge: '7d',
      etag: true,
    }),
  );
  app.use(
    '/api/images',
    express.static(IMAGES_PATH, {
      maxAge: '7d',
      etag: true,
    }),
  );

  app.use(
    '/generated/page-atlas',
    express.static(path.join(DATA_DIR, 'page-atlas-cache'), {
      maxAge: '7d',
      etag: true,
    }),
  );

  app.use(
    '/api/generated/page-atlas',
    express.static(path.join(DATA_DIR, 'page-atlas-cache'), {
      maxAge: '7d',
      etag: true,
    }),
  );

  app.use(
    '/publish',
    createPublishStaticRoute(PUBLISH_OUTPUT_DIR, {
      maxAge: '365d',
      immutable: true,
    }),
  );

  app.use(
    '/publish',
    express.static(PUBLISH_OUTPUT_DIR, {
      maxAge: '365d',
      immutable: true,
      etag: true,
    }),
  );

  if (NESQL_CANONICAL_DIR && fs.existsSync(NESQL_CANONICAL_DIR)) {
    app.use(
      '/canonical',
      createRawStaticRoute(NESQL_CANONICAL_DIR, {
        maxAge: '7d',
      }),
    );

    app.use(
      '/canonical',
      express.static(NESQL_CANONICAL_DIR, {
        maxAge: '7d',
        etag: true,
      }),
    );

    app.use(
      '/api/canonical',
      createRawStaticRoute(NESQL_CANONICAL_DIR, {
        maxAge: '7d',
      }),
    );

    app.use(
      '/api/canonical',
      express.static(NESQL_CANONICAL_DIR, {
        maxAge: '7d',
        etag: true,
      }),
    );
  }
}
