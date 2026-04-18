import { Router } from 'express';
import { asyncHandler } from '../utils/http';
import { getRenderContractService } from '../services/render-contract.service';
import { getUiPayloadsService } from '../services/ui-payloads.service';

const router = Router();

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json(getRenderContractService().getOverview());
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
  '/ui-payload',
  asyncHandler(async (req, res) => {
    const recipeId = String(req.query.recipeId || '').trim();
    res.json(await getUiPayloadsService().getByRecipeId(recipeId));
  })
);

export default router;
