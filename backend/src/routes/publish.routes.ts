import { Router } from 'express';
import { asyncHandler } from '../utils/http';
import { getPublishManifestService } from '../services/publish-manifest.service';
import { derivePagePackFromWindow, getPublishPayloadService } from '../services/publish-payload.service';
import { createWeakEtag, sendNotModifiedIfEtagMatches, setPublicCacheHeaders } from '../utils/http-cache';
import { ItemsService, type BrowserPageEntry, type Item } from '../services/items.service';
import { getPageAtlasService } from '../services/page-atlas.service';
import { attachRenderHintsToEntries, buildBrowserRichMediaManifest } from '../services/browser-render-hints.service';

const router = Router();
const itemsService = new ItemsService({ splitExportFallback: false });

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

router.get(
  '/manifest',
  asyncHandler(async (req, res) => {
    const manifest = getPublishManifestService().getRuntimeManifest();
    const etag = createWeakEtag('publish-manifest', manifest.version, manifest.sourceSignature, manifest.compiledAt, manifest.publishRevision, manifest.publishCompiledAt, manifest.runtimeCacheKey);
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 60,
      staleWhileRevalidateSeconds: 300,
      staleIfErrorSeconds: 3600,
    });
    if (sendNotModifiedIfEtagMatches(req, res, etag)) {
      return;
    }
    res.json(manifest);
  }),
);

router.get(
  '/home-bootstrap',
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const slotSize = parseInt(req.query.slotSize as string) || 48;
    const modIdRaw = typeof req.query.modId === 'string' ? req.query.modId.trim() : '';
    const modId = modIdRaw && modIdRaw !== 'all' ? modIdRaw : undefined;

    const manifest = getPublishManifestService().getRuntimeManifest();
    const etag = createWeakEtag(
      'publish-home-bootstrap',
      manifest.version,
      manifest.runtimeCacheKey,
      manifest.compiledAt,
      page,
      pageSize,
      slotSize,
      modId ?? 'all',
    );
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 120,
      staleWhileRevalidateSeconds: 900,
      staleIfErrorSeconds: 3600,
    });
    if (sendNotModifiedIfEtagMatches(req, res, etag)) {
      return;
    }

    if (page === 1 && !modId) {
        const materialized = getPublishPayloadService().getHomeBootstrapWindow({
        slotSize: Math.max(24, Math.min(128, Number(slotSize))),
      }, manifest.sourceSignature);
      if (materialized) {
        const pagePack = derivePagePackFromWindow(materialized.pagePack, 1, pageSize);
        if (pagePack) {
          res.json({
            manifest,
            mods: materialized.mods,
            pagePack,
          });
          return;
        }
      }
    }

    const [mods, pagePack] = await Promise.all([
      itemsService.getMods(),
      itemsService.getBrowserItems({
        page,
        pageSize,
        modId,
        expandedGroups: [],
      }),
    ]);
    attachRenderHintsToEntries(pagePack.data);
    const displayItems = collectDisplayItems(pagePack.data);

    const atlas = await getPageAtlasService().buildAtlas(
      displayItems,
      Math.max(24, Math.min(128, Number(slotSize))),
    );

    res.json({
      manifest,
      mods,
      pagePack: {
        ...pagePack,
        atlas,
        mediaManifest: buildBrowserRichMediaManifest(displayItems),
      },
    });
  }),
);

export default router;
