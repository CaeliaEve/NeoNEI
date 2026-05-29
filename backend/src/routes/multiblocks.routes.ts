import { Router } from 'express';
import { getMultiblocksService } from '../services/multiblocks.service';
import { sendErrorEnvelope } from '../utils/error-response';

const router = Router();

// GET /api/multiblocks/:controllerItemId
router.get('/:controllerItemId', async (req, res) => {
  try {
    const service = getMultiblocksService();
    const blueprint = service.getBlueprintByControllerItemId(req.params.controllerItemId);
    if (!blueprint) {
      return sendErrorEnvelope(req, res, 404, 'MULTIBLOCK_BLUEPRINT_NOT_FOUND', 'Multiblock blueprint not found', {
        controllerItemId: req.params.controllerItemId,
      });
    }
    res.json(blueprint);
  } catch (error) {
    console.error('Error fetching multiblock blueprint:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch multiblock blueprint';
    sendErrorEnvelope(req, res, 500, 'MULTIBLOCK_BLUEPRINT_FETCH_FAILED', message);
  }
});

export default router;
