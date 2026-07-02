import { Router } from 'express';
import { getPublishManifestService } from '../services/publish-manifest.service';
import { asyncHandler } from '../utils/http';
import {
  createWeakEtag,
  sendNotModifiedIfEtagMatches,
  setNoStoreHeaders,
  setPublicCacheHeaders,
} from '../utils/http-cache';
import { getApiV1RuntimeContractIndex } from '../services/runtime-contract-index.service';

const router = Router();

router.get('/health', (_req, res) => {
  setNoStoreHeaders(res);
  res.json({
    status: 'ok',
    version: 1,
    timestamp: new Date().toISOString(),
  });
});

router.get(
  '/runtime/manifest',
  asyncHandler(async (req, res) => {
    const manifest = getPublishManifestService().getRuntimeManifest();
    const etag = createWeakEtag(
      'v1-runtime-manifest',
      manifest.version,
      manifest.sourceSignature,
      manifest.compiledAt,
      manifest.publishRevision,
      manifest.publishCompiledAt,
      manifest.runtimeCacheKey,
    );
    setNoStoreHeaders(res);
    if (sendNotModifiedIfEtagMatches(req, res, etag)) {
      return;
    }
    res.json({
      ...manifest,
      contract: {
        schemaVersion: 'neonei/api-v1/runtime-manifest/v1',
        contractIndex: '/api/v1/runtime/contracts',
      },
    });
  }),
);

router.get('/runtime/contracts', (_req, res) => {
  setPublicCacheHeaders(res, {
    maxAgeSeconds: 300,
    staleWhileRevalidateSeconds: 3600,
  });
  res.json(getApiV1RuntimeContractIndex());
});

export default router;
