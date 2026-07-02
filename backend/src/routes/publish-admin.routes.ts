import type { Application, Request, Response } from 'express';
import { getPublishManifestService } from '../services/publish-manifest.service';
import { getPublishReleaseService } from '../services/publish-release.service';
import { asyncHandler } from '../utils/http';
import { setNoStoreHeaders } from '../utils/http-cache';
import {
  sendRuntimeAdminJson,
  type RuntimeAdminTokenGuard,
  withRuntimeAdminToken,
} from './runtime-admin-transport';

type PublishAdminPrefix = '/ops/publish' | '/api/admin/publish';

type RegisterPublishAdminRoutesOptions = Readonly<{
  requireAdminToken: RuntimeAdminTokenGuard;
}>;

function sendPublishReleases(_req: Request, res: Response): void {
  setNoStoreHeaders(res);
  sendRuntimeAdminJson(res, {
    releases: getPublishReleaseService().listReleases(),
  });
}

function activatePublishRelease(req: Request, res: Response): void {
  const sourceSignature = `${req.params.sourceSignature ?? ''}`.trim();
  const result = getPublishReleaseService().activateRelease(sourceSignature);
  getPublishManifestService().invalidate();
  sendRuntimeAdminJson(res, result);
}

function registerPublishAdminPrefix(
  app: Application,
  prefix: PublishAdminPrefix,
  requireAdminToken: RuntimeAdminTokenGuard,
): void {
  app.get(
    `${prefix}/releases`,
    asyncHandler(async (req, res) => {
      withRuntimeAdminToken(req, res, requireAdminToken, () => sendPublishReleases(req, res));
    }),
  );

  app.post(
    `${prefix}/releases/:sourceSignature/activate`,
    asyncHandler(async (req, res) => {
      withRuntimeAdminToken(req, res, requireAdminToken, () => activatePublishRelease(req, res));
    }),
  );
}

export function registerPublishAdminRoutes(
  app: Application,
  options: RegisterPublishAdminRoutesOptions,
): void {
  registerPublishAdminPrefix(app, '/ops/publish', options.requireAdminToken);
  registerPublishAdminPrefix(app, '/api/admin/publish', options.requireAdminToken);
}
