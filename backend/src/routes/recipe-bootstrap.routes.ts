import { Router } from 'express';
import { asyncHandler, notFound } from '../utils/http';
import { getRecipeBootstrapService } from '../services/recipe-bootstrap.service';

const router = Router();

router.get(
  '/:itemId',
  asyncHandler(async (req, res) => {
    const payload = await getRecipeBootstrapService().getBootstrap(req.params.itemId);
    if (!payload) {
      throw notFound('Item not found');
    }
    res.json(payload);
  })
);

export default router;
