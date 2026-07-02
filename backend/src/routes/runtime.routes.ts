import { Router } from 'express';
import { getPublishManifestService } from '../services/publish-manifest.service';
import { asyncHandler } from '../utils/http';
import {
  createWeakEtag,
  sendNotModifiedIfEtagMatches,
  setNoStoreHeaders,
  setPublicCacheHeaders,
} from '../utils/http-cache';
import { getRuntimeDiagnosticsSummary } from '../services/runtime-diagnostics-summary.service';
import { getRuntimeHealthSummary } from '../services/runtime-health-summary.service';
import { getCurrentRuntimeContractIndex } from '../services/runtime-contract-index.service';

const router = Router();

router.get('/health', (_req, res) => {
  setNoStoreHeaders(res);
  const summary = getRuntimeHealthSummary();
  res.json({
    ...summary,
    contractVersion: 'runtime-contracts/current',
  });
});

router.get('/manifest',
  asyncHandler(async (req, res) => {
    const manifest = getPublishManifestService().getRuntimeManifest();
    const etag = createWeakEtag(
      'runtime-manifest',
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
        schemaVersion: 'neonei/runtime-manifest/current',
        contractIndex: '/runtime/contracts',
      },
    });
  }),
);

router.get('/contracts', (_req, res) => {
  setPublicCacheHeaders(res, {
    maxAgeSeconds: 300,
    staleWhileRevalidateSeconds: 3600,
  });
  res.json(getCurrentRuntimeContractIndex());
});
router.get('/diagnostics',
  asyncHandler(async (_req, res) => {
    setNoStoreHeaders(res);
    res.json(getRuntimeDiagnosticsSummary());
  }),
);

export default router;
