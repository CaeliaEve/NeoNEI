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

const router = Router();

const runtimeContracts = {
  contractVersion: 'runtime-contracts/current',
  contracts: {
    manifest: '/contracts/runtime/manifest.schema.json',
    browser: '/contracts/runtime/browser.schema.json',
    search: '/contracts/runtime/search.schema.json',
    recipe: '/contracts/runtime/recipe.schema.json',
    texture: '/contracts/runtime/texture.schema.json',
    error: '/contracts/runtime/error.schema.json',
    api: '/contracts/runtime/api.schema.json',
  },
  namespaces: {
    runtime: 'public read-only runtime API',
    ops: 'authenticated operations API',
  },
  runtime: {
    manifest: '/runtime/manifest',
    distDataManifest: '/dist-data/manifest.json',
    publishManifest: '/runtime/manifest',
    health: '/runtime/health',
    contracts: '/runtime/contracts',
    diagnostics: '/runtime/diagnostics',
  },
  staticResources: {
    distData: '/dist-data/**',
    publish: '/publish/**',
    contracts: '/contracts/runtime/**',
  },
  control: {
    patterns: '/ops/patterns',
    publish: '/ops/publish',
    renderContract: '/ops/render-contract',
  },
};

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
  res.json(runtimeContracts);
});
router.get('/diagnostics',
  asyncHandler(async (_req, res) => {
    setNoStoreHeaders(res);
    res.json(getRuntimeDiagnosticsSummary());
  }),
);

export default router;
