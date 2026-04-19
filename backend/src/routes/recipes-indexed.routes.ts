import { Router } from 'express';
import { getIndexedRecipesService } from '../services/recipes-indexed.service';
import { asyncHandler, badRequest, notFound } from '../utils/http';

const router = Router();

function normalizeRequiredParam(value: string | undefined, name: string): string {
  const normalized = (value || '').trim();
  if (!normalized) {
    throw badRequest(`${name} is required`);
  }
  return normalized;
}

// Keep static machine routes before dynamic :recipeId/:itemId routes.

// GET /api/recipes-indexed/machines/list - Get all machine types
router.get(
  '/machines/list',
  asyncHandler(async (_req, res) => {
    const service = getIndexedRecipesService();
    const cacheHit = service.peekMachineTypesCache();
    const machines = await service.getAllMachineTypes();
    res.setHeader('x-cache', cacheHit ? 'HIT' : 'MISS');
    res.json(machines);
  })
);

// GET /api/recipes-indexed/machines/:machineType/recipes - Get recipes by machine type
router.get(
  '/machines/:machineType/recipes',
  asyncHandler(async (req, res) => {
    const machineType = normalizeRequiredParam(req.params.machineType, 'machineType');
    const voltageTierRaw = req.query.voltageTier;
    const voltageTier = typeof voltageTierRaw === 'string' && voltageTierRaw.trim()
      ? voltageTierRaw.trim()
      : undefined;

    const service = getIndexedRecipesService();
    const recipes = await service.getRecipesByMachine(machineType, voltageTier);

    res.json({
      machineType,
      voltageTier: voltageTier || 'all',
      recipeCount: recipes.length,
      recipes,
    });
  })
);

// GET /api/recipes-indexed/item/:itemId/summary - Get item recipe summary for recipe page bootstrap
router.get(
  '/item/:itemId/summary',
  asyncHandler(async (req, res) => {
    const itemId = normalizeRequiredParam(req.params.itemId, 'itemId');
    const service = getIndexedRecipesService();
    const cacheHit = service.peekItemRecipeSummaryCache(itemId);
    const summary = await service.getItemRecipeSummary(itemId);
    res.setHeader('x-cache', cacheHit ? 'HIT' : 'MISS');
    res.json(summary);
  })
);

// POST /api/recipes-indexed/batch - Get recipes by ids
router.post(
  '/batch',
  asyncHandler(async (req, res) => {
    const rawIds = Array.isArray(req.body?.recipeIds) ? req.body.recipeIds : [];
    const recipeIds = rawIds
      .filter((value: unknown): value is string => typeof value === 'string')
      .map((value: string) => value.trim())
      .filter(Boolean);

    if (recipeIds.length === 0) {
      throw badRequest('recipeIds is required');
    }

    const service = getIndexedRecipesService();
    const recipes = await service.getRecipesByIds(recipeIds);
    res.json(recipes);
  })
);

// GET /api/recipes-indexed/:itemId/crafting - Get crafting recipes for item
router.get(
  '/:itemId/crafting',
  asyncHandler(async (req, res) => {
    const itemId = normalizeRequiredParam(req.params.itemId, 'itemId');
    const service = getIndexedRecipesService();
    const cacheHit = service.peekRecipeIndexCache(itemId, 'produced_by_recipes');
    const recipes = await service.getCraftingRecipesForItem(itemId);
    res.setHeader('x-cache', cacheHit ? 'HIT' : 'MISS');
    res.json(recipes);
  })
);

// GET /api/recipes-indexed/:itemId/usage - Get usage recipes for item
router.get(
  '/:itemId/usage',
  asyncHandler(async (req, res) => {
    const itemId = normalizeRequiredParam(req.params.itemId, 'itemId');
    const service = getIndexedRecipesService();
    const cacheHit = service.peekRecipeIndexCache(itemId, 'used_in_recipes');
    const recipes = await service.getUsageRecipesForItem(itemId);
    res.setHeader('x-cache', cacheHit ? 'HIT' : 'MISS');
    res.json(recipes);
  })
);

// GET /api/recipes-indexed/:itemId/machines - Get all available machines for item
router.get(
  '/:itemId/machines',
  asyncHandler(async (req, res) => {
    const itemId = normalizeRequiredParam(req.params.itemId, 'itemId');
    const service = getIndexedRecipesService();
    const result = await service.getMachinesForItem(itemId);
    res.setHeader('x-cache', 'MISS');
    res.json(result);
  })
);

// GET /api/recipes-indexed/:recipeId - Get recipe by ID
router.get(
  '/:recipeId',
  asyncHandler(async (req, res) => {
    const recipeId = normalizeRequiredParam(req.params.recipeId, 'recipeId');
    const service = getIndexedRecipesService();
    const recipe = await service.getRecipeById(recipeId);

    if (!recipe) {
      throw notFound('Recipe not found');
    }

    res.json(recipe);
  })
);

export default router;
