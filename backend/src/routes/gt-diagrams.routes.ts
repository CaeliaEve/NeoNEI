import { Router } from 'express';
import { getGTDiagramsService } from '../services/gt-diagrams.service';
import { asyncHandler } from '../utils/http';

const router = Router();

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json(getGTDiagramsService().getOverview());
  })
);

export default router;
