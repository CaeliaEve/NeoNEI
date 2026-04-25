import { Router, Request, Response, NextFunction } from 'express';
import { ItemsService } from '../services/items.service';
import { getItemsSearchService } from '../services/items-search.service';
import { getPageAtlasService } from '../services/page-atlas.service';
import { asyncHandler, badRequest, notFound } from '../utils/http';

const router = Router();

// Helper function to add cache headers for GET requests
function addCacheHeaders(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
    res.setHeader('Vary', 'Accept-Encoding');
  }
  next();
}

function getItemsService(): ItemsService {
  return new ItemsService({ splitExportFallback: false });
}

// Apply cache headers to all routes in this router
router.use(addCacheHeaders);

// GET /api/items - Get paginated items
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const search = req.query.search as string;
    const modId = req.query.modId as string;

    const result = await getItemsService().getItems({
      page,
      pageSize,
      search,
      modId
    });

    res.json(result);
  })
);

router.get(
  '/browser',
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const search = req.query.search as string;
    const modId = req.query.modId as string;
    const expandedGroupsRaw = req.query.expandedGroups as string | undefined;
    const expandedGroups = `${expandedGroupsRaw ?? ''}`
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const result = await getItemsService().getBrowserItems({
      page,
      pageSize,
      search,
      modId,
      expandedGroups,
    });

    res.json(result);
  })
);

// GET /api/items/mods - Get all mods
router.get(
  '/mods',
  asyncHandler(async (_req, res) => {
    const mods = await getItemsService().getMods();
    res.json(mods);
  })
);

// GET /api/items/search/fast - Fast prefix search
router.get(
  '/search/fast',
  asyncHandler(async (req, res) => {
    const keyword = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 100;

    if (!keyword) {
      throw badRequest('Keyword parameter "q" is required');
    }

    const searchService = getItemsSearchService();
    const results = await searchService.searchItems(keyword, limit);
    res.setHeader('x-cache', 'MISS');
    res.json(results);
  })
);

// GET /api/items/search/all - Load all items for client-side search
router.get(
  '/search/all',
  asyncHandler(async (_req, res) => {
    const searchService = getItemsSearchService();
    const cacheHit = searchService.peekAllItemsCache();
    const results = await searchService.getAllItemsBasic();
    res.setHeader('x-cache', cacheHit ? 'HIT' : 'MISS');
    res.json(results);
  })
);

// POST /api/items/batch - Get items by IDs in a single query
router.post(
  '/batch',
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body as { itemIds?: string[] };
    if (!Array.isArray(itemIds)) {
      throw badRequest('itemIds must be an array');
    }

    const limitedIds = itemIds.slice(0, 1000);
    const items = await getItemsService().getItemsByIds(limitedIds);
    res.json(items);
  })
);

router.post(
  '/image-manifest',
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body as { itemIds?: string[] };
    if (!Array.isArray(itemIds)) {
      throw badRequest('itemIds must be an array');
    }

    const limitedIds = Array.from(new Set(itemIds.filter(Boolean))).slice(0, 1000);
    const itemsService = getItemsService();
    const items = await itemsService.getItemsByIds(limitedIds);
    const manifest = Object.fromEntries(
      items.map((item) => [
        item.itemId,
        {
          imageUrl: itemsService.resolvePreferredStaticImageUrl(item),
        },
      ]),
    );
    res.json({
      items: manifest,
    });
  })
);

router.post(
  '/page-atlas',
  asyncHandler(async (req, res) => {
    const { itemIds, slotSize } = req.body as { itemIds?: string[]; slotSize?: number };
    if (!Array.isArray(itemIds)) {
      throw badRequest('itemIds must be an array');
    }

    const limitedIds = Array.from(new Set(itemIds.filter(Boolean))).slice(0, 500);
    const itemsService = getItemsService();
    const items = await itemsService.getItemsByIds(limitedIds);
    const normalizedSlotSize = Number.isFinite(slotSize) ? Math.max(24, Math.min(128, Number(slotSize))) : 48;
    const atlas = await getPageAtlasService().buildAtlas(items, normalizedSlotSize);
    res.json(atlas);
  })
);

router.get(
  '/page-atlas/precomputed',
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const slotSize = parseInt(req.query.slotSize as string) || 48;
    const modIdRaw = typeof req.query.modId === 'string' ? req.query.modId.trim() : '';
    const modId = modIdRaw && modIdRaw !== 'all' ? modIdRaw : undefined;

    const atlas = await getPageAtlasService().buildAtlasForPage({
      page,
      pageSize,
      slotSize: Math.max(24, Math.min(128, Number(slotSize))),
      modId,
    });
    res.json(atlas);
  })
);

// GET /api/items/:itemId - Get item by ID
router.get(
  '/:itemId',
  asyncHandler(async (req, res) => {
    const item = await getItemsService().getItemById(req.params.itemId);
    if (!item) {
      throw notFound('Item not found');
    }
    res.json(item);
  })
);

export default router;
