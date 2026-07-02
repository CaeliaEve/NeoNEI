import { Router, Request, Response, NextFunction } from 'express';
import { ItemsService, type BrowserPageEntry, type Item } from '../services/items.service';
import { getItemsSearchService } from '../services/items-search.service';
import { getPublishManifestService } from '../services/publish-manifest.service';
import {
  buildBrowserPageResourceManifest,
  derivePagePackFromWindow,
  getPublishPayloadService,
} from '../services/publish-payload.service';
import {
  attachRenderHintsToEntries,
  attachRenderHintsToItems,
  buildBrowserRichMediaManifest,
} from '../services/browser-render-hints.service';
import { getRustSearchPackService } from '../services/rust-search-pack.service';
import { createWeakEtag, sendNotModifiedIfEtagMatches, setPublicCacheHeaders } from '../utils/http-cache';
import { asyncHandler, badRequest, notFound } from '../utils/http';

const router = Router();

// Helper function to add cache headers for GET requests
function addCacheHeaders(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    setPublicCacheHeaders(res, { maxAgeSeconds: 300 }); // 5 minutes
  }
  next();
}

function getItemsService(): ItemsService {
  return new ItemsService({ splitExportFallback: false });
}

function collectDisplayItems(entries: BrowserPageEntry[]): Item[] {
  const ordered: Item[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const item = entry.kind === 'item' ? entry.item : entry.group.representative;
    if (!item?.itemId || seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    ordered.push(item);
  }

  return ordered;
}

function getMaterializedBrowserPagePack(params: {
  page: number;
  pageSize: number;
  slotSize: number;
  modId?: string;
  sourceSignature: string;
}) {
  if (params.modId) {
    return null;
  }

  const windowPayload = getPublishPayloadService().getBrowserPageWindow({
    slotSize: params.slotSize,
  }, params.sourceSignature);

  if (!windowPayload) {
    return null;
  }

  return derivePagePackFromWindow(windowPayload, params.page, params.pageSize);
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

    attachRenderHintsToEntries(result.data);
    res.json(result);
  })
);

router.get(
  '/browser/default-catalog',
  asyncHandler(async (req, res) => {
    const modId = req.query.modId as string | undefined;
    const result = await getItemsService().getBrowserDefaultCatalog({
      modId,
    });
    attachRenderHintsToEntries(result.data);
    res.json(result);
  }),
);

router.get(
  '/browser/search-catalog',
  asyncHandler(async (req, res) => {
    const search = `${req.query.q ?? ''}`.trim();
    const modId = req.query.modId as string | undefined;
    const result = await getItemsService().getBrowserSearchCatalog({
      search,
      modId,
    });
    attachRenderHintsToEntries(result.data);
    res.json(result);
  }),
);

router.get(
  '/browser/group/:groupKey',
  asyncHandler(async (req, res) => {
    const groupKey = `${req.params.groupKey ?? ''}`.trim();
    const modId = req.query.modId as string | undefined;
    if (!groupKey) {
      throw badRequest('Group key is required');
    }

    const items = await getItemsService().getBrowserGroupItems(groupKey, modId);
    attachRenderHintsToItems(items);
    res.json({
      groupKey,
      total: items.length,
      items,
    });
  }),
);

router.get(
  '/browser/page-pack',
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const search = req.query.search as string;
    const modId = req.query.modId as string;
    const slotSize = parseInt(req.query.slotSize as string) || 48;
    const expandedGroupsRaw = req.query.expandedGroups as string | undefined;
    const expandedGroups = `${expandedGroupsRaw ?? ''}`
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const manifest = getPublishManifestService().getRuntimeManifest();
    const sourceSignature = manifest.sourceSignature;
    const etag = createWeakEtag(
      'browser-page-pack',
      getPublishManifestService().getRuntimeManifest().runtimeCacheKey,
      page,
      pageSize,
      search,
      modId,
      expandedGroups.join(','),
      slotSize,
    );
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 3600,
      staleIfErrorSeconds: 86400,
    });
    if (sendNotModifiedIfEtagMatches(req, res, etag)) {
      return;
    }

    if (!search && expandedGroups.length === 0) {
      const materialized = getMaterializedBrowserPagePack({
        page,
        pageSize,
        slotSize: Math.max(24, Math.min(128, Number(slotSize))),
        modId,
        sourceSignature,
      });
      if (materialized) {
        res.json(materialized);
        return;
      }
    }

    const result = await getItemsService().getBrowserItems({
      page,
      pageSize,
      search,
      modId,
      expandedGroups,
    });
    attachRenderHintsToEntries(result.data);
    const displayItems = collectDisplayItems(result.data);

    const mediaManifest = buildBrowserRichMediaManifest(displayItems);
    res.json({
      ...result,
      mediaManifest,
      resourceManifest: buildBrowserPageResourceManifest(result.data, mediaManifest),
    });
  })
);

// GET /api/items/mods - Get all mods
router.get(
  '/mods',
  asyncHandler(async (_req, res) => {
    const manifest = getPublishManifestService().getRuntimeManifest();
    const sourceSignature = manifest.sourceSignature;
    const materialized = getPublishPayloadService().getModsList(sourceSignature);
    if (materialized) {
      res.json(materialized);
      return;
    }
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

router.get(
  '/search/pack',
  asyncHandler(async (req, res) => {
    const manifest = getPublishManifestService().getRuntimeManifest();
    const etag = createWeakEtag('browser-search-pack', manifest.runtimeCacheKey);
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 3600,
      staleWhileRevalidateSeconds: 86400,
      staleIfErrorSeconds: 86400,
    });
    if (sendNotModifiedIfEtagMatches(req, res, etag)) {
      return;
    }
    const rustPack = getRustSearchPackService().readDistDataSearchPack();
    if (rustPack) {
      res.json({
        ...rustPack,
        signature: rustPack.signature ?? manifest.sourceSignature,
      });
      return;
    }
    const materialized = getPublishPayloadService().getBrowserSearchPack(manifest.sourceSignature);
    if (materialized) {
      res.json(materialized);
      return;
    }
    const searchService = getItemsSearchService();
    const pack = await searchService.getBrowserSearchPack();
    res.json({
      version: 1,
      signature: manifest.sourceSignature,
      total: pack.length,
      items: pack,
    });
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
  '/browser/by-ids-pack',
  asyncHandler(async (req, res) => {
    const { itemIds } = req.body as { itemIds?: string[]; slotSize?: number };
    if (!Array.isArray(itemIds)) {
      throw badRequest('itemIds must be an array');
    }

    const orderedIds = itemIds
      .map((itemId) => `${itemId ?? ''}`.trim())
      .filter(Boolean)
      .slice(0, 500);

    const itemsService = getItemsService();
    const fetched = await itemsService.getItemsByIds(Array.from(new Set(orderedIds)));
    const byId = new Map(fetched.map((item) => [item.itemId, item]));
    const orderedItems = orderedIds
      .map((itemId) => byId.get(itemId))
      .filter((item): item is Item => Boolean(item));
    attachRenderHintsToItems(orderedItems);

    const mediaManifest = buildBrowserRichMediaManifest(orderedItems);
    const data = orderedItems.map((item) => ({
      key: item.itemId,
      kind: 'item' as const,
      item,
    }));
    res.json({
      data,
      mediaManifest,
      resourceManifest: buildBrowserPageResourceManifest(data, mediaManifest),
    });
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
