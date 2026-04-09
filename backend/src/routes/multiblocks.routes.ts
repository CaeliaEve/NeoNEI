import { Router } from 'express';
import { getMultiblocksService } from '../services/multiblocks.service';

const router = Router();

// GET /api/multiblocks/:controllerItemId
router.get('/:controllerItemId', async (req, res) => {
  try {
    const service = getMultiblocksService();
    const blueprint = service.getBlueprintByControllerItemId(req.params.controllerItemId);
    if (!blueprint) {
      return res.status(404).json({ error: 'Multiblock blueprint not found' });
    }
    res.json(blueprint);
  } catch (error) {
    console.error('Error fetching multiblock blueprint:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch multiblock blueprint';
    res.status(500).json({ error: message });
  }
});

export default router;
