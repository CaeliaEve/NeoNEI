import { Router } from 'express';
import { getPublishManifestService } from '../services/publish-manifest.service';
import { asyncHandler } from '../utils/http';
import { createWeakEtag, sendNotModifiedIfEtagMatches, setNoStoreHeaders } from '../utils/http-cache';

const router = Router();

const runtimeContracts = {
  version: 1,
  contracts: {
    manifest: '/contracts/runtime/manifest.schema.json',
    browser: '/contracts/runtime/browser.schema.json',
    search: '/contracts/runtime/search.schema.json',
    recipe: '/contracts/runtime/recipe.schema.json',
    texture: '/contracts/runtime/texture.schema.json',
    error: '/contracts/runtime/error.schema.json',
  },
  runtime: {
    manifest: '/api/v1/runtime/manifest',
    distDataManifest: '/dist-data/manifest.json',
    publishManifest: '/api/publish/manifest',
  },
  compatibility: {
    devItems: '/api/items',
    devRecipesIndexed: '/api/recipes-indexed',
    devRecipeBootstrap: '/api/recipe-bootstrap',
  },
};

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
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.json(runtimeContracts);
});

export default router;
