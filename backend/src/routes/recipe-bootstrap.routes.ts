import { Router } from 'express';
import { asyncHandler, badRequest, notFound } from '../utils/http';
import { getRecipeBootstrapService } from '../services/recipe-bootstrap.service';
import { getIndexedRecipesService } from '../services/recipes-indexed.service';
import { createWeakEtag, sendNotModifiedIfEtagMatches, setPublicCacheHeaders } from '../utils/http-cache';

const router = Router();

function normalizeRequiredQuery(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest(`${name} is required`);
  }
  return value.trim();
}

function normalizeOptionalPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
}

router.get(
  '/:itemId/produced-by-group',
  asyncHandler(async (req, res) => {
    const itemId = req.params.itemId;
    const machineType = normalizeRequiredQuery(req.query.machineType, 'machineType');
    const voltageTier = typeof req.query.voltageTier === 'string' && req.query.voltageTier.trim()
      ? req.query.voltageTier.trim()
      : null;
    const offset = normalizeOptionalPositiveInt(req.query.offset, 0);
    const limit = Math.max(0, Math.min(256, normalizeOptionalPositiveInt(req.query.limit, 48)));
    const includeRecipeIds = req.query.includeRecipeIds === '1' || req.query.includeRecipeIds === 'true';
    const cacheToken = getRecipeBootstrapService().getCacheToken(itemId);
    const etag = createWeakEtag('recipe-bootstrap-produced-by-group', cacheToken, itemId, machineType, voltageTier, offset, limit, includeRecipeIds);
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 3600,
      staleIfErrorSeconds: 86400,
    });
    if (sendNotModifiedIfEtagMatches(req, res, etag)) {
      return;
    }

    const pack = await getIndexedRecipesService().getProducedByRecipePackForMachineGroup(itemId, machineType, voltageTier, {
      offset,
      limit,
      includeRecipeIds,
    });
    res.json({
      itemId,
      machineType,
      voltageTier,
      recipeCount: pack.recipeCount,
      recipes: pack.recipes,
      recipeIds: pack.recipeIds,
      offset: pack.offset,
      limit: pack.limit,
      hasMore: pack.hasMore,
    });
  })
);

router.get(
  '/:itemId/used-in-group',
  asyncHandler(async (req, res) => {
    const itemId = req.params.itemId;
    const machineType = normalizeRequiredQuery(req.query.machineType, 'machineType');
    const voltageTier = typeof req.query.voltageTier === 'string' && req.query.voltageTier.trim()
      ? req.query.voltageTier.trim()
      : null;
    const offset = normalizeOptionalPositiveInt(req.query.offset, 0);
    const limit = Math.max(0, Math.min(256, normalizeOptionalPositiveInt(req.query.limit, 48)));
    const includeRecipeIds = req.query.includeRecipeIds === '1' || req.query.includeRecipeIds === 'true';
    const cacheToken = getRecipeBootstrapService().getCacheToken(itemId);
    const etag = createWeakEtag('recipe-bootstrap-used-in-group', cacheToken, itemId, machineType, voltageTier, offset, limit, includeRecipeIds);
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 3600,
      staleIfErrorSeconds: 86400,
    });
    if (sendNotModifiedIfEtagMatches(req, res, etag)) {
      return;
    }

    const pack = await getIndexedRecipesService().getUsedInRecipePackForMachineGroup(itemId, machineType, voltageTier, {
      offset,
      limit,
      includeRecipeIds,
    });
    res.json({
      itemId,
      machineType,
      voltageTier,
      recipeCount: pack.recipeCount,
      recipes: pack.recipes,
      recipeIds: pack.recipeIds,
      offset: pack.offset,
      limit: pack.limit,
      hasMore: pack.hasMore,
    });
  })
);

router.get(
  '/:itemId/category-group',
  asyncHandler(async (req, res) => {
    const itemId = req.params.itemId;
    const categoryKey = normalizeRequiredQuery(req.query.categoryKey, 'categoryKey');
    const tab = normalizeRequiredQuery(req.query.tab, 'tab');
    const relationType = tab === 'producedBy'
      ? 'produced_by'
      : tab === 'usedIn'
        ? 'used_in'
        : null;
    const offset = normalizeOptionalPositiveInt(req.query.offset, 0);
    const limit = Math.max(0, Math.min(256, normalizeOptionalPositiveInt(req.query.limit, 48)));
    const includeRecipeIds = req.query.includeRecipeIds === '1' || req.query.includeRecipeIds === 'true';
    if (!relationType) {
      throw badRequest('tab must be producedBy or usedIn');
    }
    const cacheToken = getRecipeBootstrapService().getCacheToken(itemId);
    const etag = createWeakEtag('recipe-bootstrap-category-group', cacheToken, itemId, relationType, categoryKey, offset, limit, includeRecipeIds);
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 3600,
      staleIfErrorSeconds: 86400,
    });
    if (sendNotModifiedIfEtagMatches(req, res, etag)) {
      return;
    }

    const pack = await getIndexedRecipesService().getRecipePackForCategoryGroup(itemId, relationType, categoryKey, {
      offset,
      limit,
      includeRecipeIds,
    });
    res.json({
      itemId,
      categoryKey,
      tab,
      recipeCount: pack.recipeCount,
      recipes: pack.recipes,
      recipeIds: pack.recipeIds,
      offset: pack.offset,
      limit: pack.limit,
      hasMore: pack.hasMore,
    });
  })
);

router.get(
  '/:itemId/search',
  asyncHandler(async (req, res) => {
    const itemId = req.params.itemId;
    const tab = normalizeRequiredQuery(req.query.tab, 'tab');
    const query = normalizeRequiredQuery(req.query.q, 'q');
    const relationType = tab === 'producedBy'
      ? 'produced_by'
      : tab === 'usedIn'
        ? 'used_in'
        : null;
    if (!relationType) {
      throw badRequest('tab must be producedBy or usedIn');
    }
    const cacheToken = getRecipeBootstrapService().getCacheToken(itemId);
    const etag = createWeakEtag('recipe-bootstrap-search', cacheToken, itemId, relationType, query);
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 120,
      staleWhileRevalidateSeconds: 1800,
      staleIfErrorSeconds: 86400,
    });
    if (sendNotModifiedIfEtagMatches(req, res, etag)) {
      return;
    }

    const result = await getIndexedRecipesService().searchRecipesForItem(itemId, relationType, query);
    res.json({
      itemId,
      tab,
      query,
      recipeIds: result.recipeIds,
      itemMatches: result.itemMatches,
    });
  })
);

router.get(
  '/:itemId/shard',
  asyncHandler(async (req, res) => {
    const cacheToken = getRecipeBootstrapService().getCacheToken(req.params.itemId);
    const etag = createWeakEtag('recipe-bootstrap-shard', cacheToken, req.params.itemId);
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 3600,
      staleIfErrorSeconds: 86400,
    });
    if (sendNotModifiedIfEtagMatches(req, res, etag)) {
      return;
    }
    const payload = await getRecipeBootstrapService().getBootstrapShard(req.params.itemId);
    if (!payload) {
      throw notFound('Item not found');
    }
    res.json(payload);
  })
);

router.get(
  '/:itemId',
  asyncHandler(async (req, res) => {
    const cacheToken = getRecipeBootstrapService().getCacheToken(req.params.itemId);
    const etag = createWeakEtag('recipe-bootstrap', cacheToken, req.params.itemId);
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 3600,
      staleIfErrorSeconds: 86400,
    });
    if (sendNotModifiedIfEtagMatches(req, res, etag)) {
      return;
    }
    const payload = await getRecipeBootstrapService().getBootstrap(req.params.itemId);
    if (!payload) {
      throw notFound('Item not found');
    }
    res.json(payload);
  })
);

export default router;
