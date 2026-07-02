import { Router, type Request, type Response } from 'express';
import { getPublishManifestService } from '../services/publish-manifest.service';
import { getPublishReleaseService } from '../services/publish-release.service';
import { asyncHandler } from '../utils/http';
import { setNoStoreHeaders } from '../utils/http-cache';
import { sendRuntimeAdminJson } from './runtime-admin-transport';

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

export function createPublishAdminRouter(): Router {
  const router = Router();

  router.get(
    '/releases',
    asyncHandler(async (req, res) => sendPublishReleases(req, res)),
  );

  router.post(
    '/releases/:sourceSignature/activate',
    asyncHandler(async (req, res) => activatePublishRelease(req, res)),
  );

  return router;
}
