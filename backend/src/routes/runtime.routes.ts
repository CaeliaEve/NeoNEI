import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { getPublishManifestService } from '../services/publish-manifest.service';
import { asyncHandler } from '../utils/http';
import { createWeakEtag, sendNotModifiedIfEtagMatches } from '../utils/http-cache';
import { DATA_DIR, PUBLISH_OUTPUT_DIR } from '../config/runtime-paths';

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
  },
  runtime: {
    manifest: '/runtime/manifest',
    distDataManifest: '/dist-data/manifest.json',
    publishManifest: '/runtime/manifest',
  },
  compatibility: {
    devItems: '/lab/items',
    devRecipesIndexed: '/lab/recipes',
    devRecipeBootstrap: '/lab/recipe-bootstrap',
  },
};

router.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({
    status: 'ok',
    contractVersion: 'runtime-contracts/current',
    timestamp: new Date().toISOString(),
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
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
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
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.json(runtimeContracts);
});
router.get('/diagnostics',
  asyncHandler(async (_req, res) => {
    const manifest = getPublishManifestService().getRuntimeManifest();
    const publishBundle = manifest.publishBundle;
    const publishRoot = manifest.sourceSignature
      ? path.join(PUBLISH_OUTPUT_DIR, manifest.sourceSignature)
      : null;
    const checks = {
      dataDir: fs.existsSync(DATA_DIR),
      publishDir: fs.existsSync(PUBLISH_OUTPUT_DIR),
      activePublishRoot: publishRoot ? fs.existsSync(publishRoot) : false,
      publishBundle: Boolean(publishBundle),
      browserLayout: Boolean(manifest.browserLayoutKey),
      runtimeCacheKey: Boolean(manifest.runtimeCacheKey),
      sourceSignature: Boolean(manifest.sourceSignature),
    };
    const missing = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([key]) => key);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      schemaVersion: 'neonei/runtime-diagnostics/current',
      status: missing.length === 0 ? 'ok' : 'degraded',
      sourceSignature: manifest.sourceSignature,
      runtimeCacheKey: manifest.runtimeCacheKey,
      publishRevision: manifest.publishRevision,
      publishCompiledAt: manifest.publishCompiledAt,
      browserLayoutKey: manifest.browserLayoutKey,
      readiness: checks,
      mode: {
        publicRuntimeOnly: process.env.NEONEI_PUBLIC_RUNTIME_ONLY === '1' || process.env.NEONEI_PUBLIC_RUNTIME_ONLY?.toLowerCase() === 'true',
      },
      missing,
      assets: {
        publishBundleFiles: publishBundle ? Object.keys(publishBundle.files ?? {}).length : 0,
        hasBrowserWindows: Boolean(publishBundle?.files?.browserPageWindows?.length),
        hasRecipeBootstrap: Boolean(publishBundle?.files?.recipeBootstrapBasePath),
        hasRecipeSearch: Boolean(publishBundle?.files?.recipeSearchBasePath),
      },
    });
  }),
);

export default router;


