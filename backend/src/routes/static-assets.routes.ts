import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';
import {
  CONTRACTS_DIR,
  IMAGES_PATH,
  PUBLIC_DIR,
  PUBLISH_OUTPUT_DIR,
} from '../config/runtime-paths';
import {
  resolveImageFamilyArtifact,
  resolvePublishStaticAsset,
  resolveRawStaticAsset,
  staticDirectoryExists,
  type ImageArtifactFamily,
} from '../services/static-asset-delivery.service';
import { setNoStoreHeaders, setStaticAssetCacheHeaders } from '../utils/http-cache';

function createArtifactFallbackRoute(family: ImageArtifactFamily) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const resolved = resolveImageFamilyArtifact(family, req.params.modId, req.params.fileName);
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
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const delivery = resolveRawStaticAsset(rootDir, req.url);
      if (!delivery) {
        return next();
      }

      setStaticAssetCacheHeaders(res, {
        maxAge: options?.maxAge ?? 0,
        immutable: options?.immutable ?? false,
      });
      return res.sendFile(delivery.absolutePath, {
        cacheControl: false,
        lastModified: true,
      });
    } catch {
      return next();
    }
  };
}

function createPublishStaticRoute(rootDir: string, options?: { maxAge?: string; immutable?: boolean }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const delivery = resolvePublishStaticAsset({
        rootDir,
        requestUrl: req.url,
        acceptEncoding: req.headers['accept-encoding'],
        bypassCompression: Boolean(req.headers['x-no-compression']),
      });
      if (!delivery) {
        return next();
      }

      if (delivery.varyAcceptEncoding) {
        res.setHeader('Vary', 'Accept-Encoding');
      }
      if (delivery.contentEncoding) {
        res.setHeader('Content-Encoding', delivery.contentEncoding);
        res.type(delivery.contentTypeExtension);
      }

      if (delivery.mutable) {
        setNoStoreHeaders(res);
        return res.sendFile(delivery.responsePath, {
          cacheControl: false,
          lastModified: true,
        });
      }

      setStaticAssetCacheHeaders(res, {
        maxAge: options?.maxAge ?? 0,
        immutable: options?.immutable ?? false,
      });
      return res.sendFile(delivery.responsePath, {
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

  if (staticDirectoryExists(CONTRACTS_DIR)) {
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


}
