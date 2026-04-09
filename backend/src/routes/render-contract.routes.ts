import { Router } from 'express';
import { asyncHandler } from '../utils/http';
import { getRenderContractService } from '../services/render-contract.service';

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

export default router;
