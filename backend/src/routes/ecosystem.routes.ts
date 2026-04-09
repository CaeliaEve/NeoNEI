import { Router } from 'express';
import { getEcosystemService } from '../services/ecosystem.service';
import { asyncHandler } from '../utils/http';

const router = Router();

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json(getEcosystemService().getOverview());
  })
);

export default router;
