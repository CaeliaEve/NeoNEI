import { Router } from 'express';
import { getForestryGeneticsService } from '../services/forestry-genetics.service';
import { asyncHandler } from '../utils/http';

const router = Router();

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json(getForestryGeneticsService().getOverview());
  })
);

export default router;
