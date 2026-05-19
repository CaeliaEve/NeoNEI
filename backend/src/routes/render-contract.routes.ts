import { Router } from 'express';
import { asyncHandler } from '../utils/http';
import { getRenderContractService } from '../services/render-contract.service';
import { getUiPayloadsService } from '../services/ui-payloads.service';
import { getBrowserAtlasIndexService } from '../services/browser-atlas-index.service';
import { getBrowserLayoutIndexService } from '../services/browser-layout-index.service';

const router = Router();

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json(getRenderContractService().getOverview());
  })
);

router.get(
  '/browser-atlas-index',
  asyncHandler(async (_req, res) => {
    res.json(getBrowserAtlasIndexService().getIndex());
  })
);

router.get(
  '/browser-layout-index',
  asyncHandler(async (_req, res) => {
    res.json(getBrowserLayoutIndexService().getIndex());
  })
);

router.get(
  '/animated-atlas',
  asyncHandler(async (req, res) => {
    const assetId = String(req.query.assetId || '').trim();
    res.json(getRenderContractService().getAnimatedAtlasEntry(assetId));
  })
);

router.get(
  '/asset',
  asyncHandler(async (req, res) => {
    const assetId = String(req.query.assetId || '').trim();
    res.json(getRenderContractService().getRenderAssetEntry(assetId));
  })
);

router.get(
  '/ui-payload',
  asyncHandler(async (req, res) => {
    const recipeId = String(req.query.recipeId || '').trim();
    res.json(await getUiPayloadsService().getByRecipeId(recipeId));
  })
);

export default router;
