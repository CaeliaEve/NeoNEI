import { Router, Request, Response, NextFunction } from 'express';
import { PatternsService } from '../services/patterns.service';
import { sendErrorEnvelope } from '../utils/error-response';
import { setNoStoreHeaders } from '../utils/http-cache';

const router = Router();

function addControlHeaders(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    setNoStoreHeaders(res);
  }
  next();
}

router.use(addControlHeaders);

function getService() {
  return new PatternsService();
}

export function normalizePatternOptions(body: Record<string, unknown>): {
  crafting?: number;
  substitute?: number;
  beSubstitute?: number;
  priority?: number;
} {
  if (body.options && typeof body.options === 'object') {
    return body.options as {
      crafting?: number;
      substitute?: number;
      beSubstitute?: number;
      priority?: number;
    };
  }

  return {
    crafting: body.crafting as number | undefined,
    substitute: body.substitute as number | undefined,
    beSubstitute: body.beSubstitute as number | undefined,
    priority: body.priority as number | undefined,
  };
}

router.get('/groups', async (req, res) => {
  try {
    const patternsService = getService();
    const groups = await patternsService.getPatternGroups();
    res.json(groups);
  } catch (error) {
    console.error('Error fetching pattern groups:', error);
    sendErrorEnvelope(req, res, 500, 'PATTERN_GROUPS_FETCH_FAILED', 'Failed to fetch pattern groups');
  }
});

router.get('/groups/:groupId', async (req, res) => {
  try {
    const patternsService = getService();
    const group = await patternsService.getPatternGroup(req.params.groupId);

    if (!group) {
      return sendErrorEnvelope(req, res, 404, 'PATTERN_GROUP_NOT_FOUND', 'Pattern group not found', {
        groupId: req.params.groupId,
      });
    }

    res.json(group);
  } catch (error) {
    console.error('Error fetching pattern group:', error);
    sendErrorEnvelope(req, res, 500, 'PATTERN_GROUP_FETCH_FAILED', 'Failed to fetch pattern group');
  }
});

router.get('/groups/:groupId/detail', async (req, res) => {
  try {
    const patternsService = getService();
    const groupWithPatterns = await patternsService.getPatternGroupWithPatterns(req.params.groupId);

    if (!groupWithPatterns) {
      return sendErrorEnvelope(req, res, 404, 'PATTERN_GROUP_NOT_FOUND', 'Pattern group not found', {
        groupId: req.params.groupId,
      });
    }

    res.json(groupWithPatterns);
  } catch (error) {
    console.error('Error fetching pattern group details:', error);
    sendErrorEnvelope(req, res, 500, 'PATTERN_GROUP_DETAIL_FETCH_FAILED', 'Failed to fetch pattern group details');
  }
});

router.post('/groups', async (req, res) => {
  try {
    const { groupName, description } = req.body;

    if (!groupName) {
      return sendErrorEnvelope(req, res, 400, 'PATTERN_GROUP_NAME_REQUIRED', 'groupName is required');
    }

    const patternsService = getService();
    const group = await patternsService.createPatternGroup(groupName, description);

    res.status(201).json(group);
  } catch (error) {
    console.error('Error creating pattern group:', error);
    sendErrorEnvelope(req, res, 500, 'PATTERN_GROUP_CREATE_FAILED', 'Failed to create pattern group');
  }
});

router.put('/groups/:groupId', async (req, res) => {
  try {
    const { groupName, description } = req.body;

    if (!groupName) {
      return sendErrorEnvelope(req, res, 400, 'PATTERN_GROUP_NAME_REQUIRED', 'groupName is required');
    }

    const patternsService = getService();
    await patternsService.updatePatternGroup(req.params.groupId, groupName, description);

    const updatedGroup = await patternsService.getPatternGroup(req.params.groupId);
    res.json(updatedGroup);
  } catch (error) {
    console.error('Error updating pattern group:', error);
    sendErrorEnvelope(req, res, 500, 'PATTERN_GROUP_UPDATE_FAILED', 'Failed to update pattern group');
  }
});

router.delete('/groups/:groupId', async (req, res) => {
  try {
    const patternsService = getService();
    await patternsService.deletePatternGroup(req.params.groupId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting pattern group:', error);
    sendErrorEnvelope(req, res, 500, 'PATTERN_GROUP_DELETE_FAILED', 'Failed to delete pattern group');
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const groupId = typeof body.groupId === 'string' ? body.groupId : null;
    const recipeId = typeof body.recipeId === 'string' ? body.recipeId : '';
    const patternName = typeof body.patternName === 'string' ? body.patternName : '';
    const outputItemId = typeof body.outputItemId === 'string' ? body.outputItemId : null;
    const options = normalizePatternOptions(body);

    if (!recipeId || !patternName) {
      return sendErrorEnvelope(
        req,
        res,
        400,
        'PATTERN_REQUIRED_FIELDS_MISSING',
        'recipeId and patternName are required',
      );
    }

    const patternsService = getService();
    const pattern = await patternsService.createPattern(
      groupId || null,
      recipeId,
      patternName,
      outputItemId,
      options,
    );

    res.status(201).json(pattern);
  } catch (error) {
    console.error('Error creating pattern:', error);
    sendErrorEnvelope(req, res, 500, 'PATTERN_CREATE_FAILED', 'Failed to create pattern');
  }
});

router.delete('/:patternId', async (req, res) => {
  try {
    const patternsService = getService();
    await patternsService.deletePattern(req.params.patternId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting pattern:', error);
    sendErrorEnvelope(req, res, 500, 'PATTERN_DELETE_FAILED', 'Failed to delete pattern');
  }
});

router.put('/:patternId', async (req, res) => {
  try {
    const patternsService = getService();
    await patternsService.updatePattern(req.params.patternId, req.body);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating pattern:', error);
    sendErrorEnvelope(req, res, 500, 'PATTERN_UPDATE_FAILED', 'Failed to update pattern');
  }
});

router.get('/groups/:groupId/export', async (req, res) => {
  try {
    const patternsService = getService();
    const exportData = await patternsService.exportPatternGroup(req.params.groupId);

    res.json(exportData);
  } catch (error) {
    console.error('Error exporting pattern group:', error);
    const message = error instanceof Error ? error.message : 'Failed to export pattern group';

    if (message === 'Pattern group not found') {
      sendErrorEnvelope(req, res, 404, 'PATTERN_GROUP_NOT_FOUND', 'Pattern group not found', {
        groupId: req.params.groupId,
      });
    } else {
      sendErrorEnvelope(req, res, 500, 'PATTERN_GROUP_EXPORT_FAILED', 'Failed to export pattern group');
    }
  }
});

export default router;
