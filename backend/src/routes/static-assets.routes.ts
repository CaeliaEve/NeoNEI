import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';
import {
  resolveImageFamilyArtifact,
  resolvePublishStaticAsset,
  resolveRawStaticAsset,
  staticDirectoryExists,
  type ImageArtifactFamily,
} from '../services/static-asset-delivery.service';
import { setNoStoreHeaders, setStaticAssetCacheHeaders } from '../utils/http-cache';
import {
  STATIC_ASSET_IMAGE_ARTIFACT_ROUTES,
  STATIC_ASSET_POST_IMAGE_ARTIFACT_MOUNTS,
  STATIC_ASSET_PRE_IMAGE_ARTIFACT_MOUNTS,
  type StaticAssetMountDescriptor,
} from './static-asset-route-registry';

function createImageArtifactRoute(family: ImageArtifactFamily) {
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

function createRawStaticRoute(rootDir: string, options?: { maxAge?: string | number; immutable?: boolean }) {
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

function createPublishStaticRoute(rootDir: string, options?: { maxAge?: string | number; immutable?: boolean }) {
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
  for (const mount of STATIC_ASSET_PRE_IMAGE_ARTIFACT_MOUNTS) {
    mountStaticAssetSurface(app, mount);
  }

  for (const route of STATIC_ASSET_IMAGE_ARTIFACT_ROUTES) {
    app.get(route.path, createImageArtifactRoute(route.family));
  }

  for (const mount of STATIC_ASSET_POST_IMAGE_ARTIFACT_MOUNTS) {
    mountStaticAssetSurface(app, mount);
  }
}

function mountStaticAssetSurface(app: Express, mount: StaticAssetMountDescriptor): void {
  if (mount.requireExistingDirectory && !staticDirectoryExists(mount.rootDir)) {
    return;
  }

  if (mount.kind === 'public-root') {
    app.use(express.static(mount.rootDir));
    return;
  }

  if (mount.kind === 'publish-precompressed') {
    app.use(
      requiredMountPath(mount),
      createPublishStaticRoute(mount.rootDir, {
        maxAge: mount.cache.maxAge,
        immutable: mount.cache.immutable,
      }),
    );
    return;
  }

  app.use(
    requiredMountPath(mount),
    express.static(mount.rootDir, {
      maxAge: mount.cache.maxAge,
      immutable: mount.cache.immutable,
      etag: mount.cache.etag,
    }),
  );
}

function requiredMountPath(mount: StaticAssetMountDescriptor): string {
  if (!mount.mountPath) {
    throw new Error(`static asset mount requires an absolute mount path: ${mount.key}`);
  }
  return mount.mountPath;
}
