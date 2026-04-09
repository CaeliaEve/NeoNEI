import { Router, Request, Response, NextFunction } from 'express';
import { PatternsService } from '../services/patterns.service';

const router = Router();

// Helper function to add cache headers for GET requests
function addCacheHeaders(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
    res.setHeader('Vary', 'Accept-Encoding');
  }
  next();
}

// Apply cache headers to all routes in this router
router.use(addCacheHeaders);

// Helper function to get service instance
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

// === 样板组管理 ===

// GET /api/patterns/groups - 获取所有样板组
router.get('/groups', async (req, res) => {
  try {
    const patternsService = getService();
    const groups = await patternsService.getPatternGroups();
    res.json(groups);
  } catch (error) {
    console.error('Error fetching pattern groups:', error);
    res.status(500).json({ error: 'Failed to fetch pattern groups' });
  }
});

// GET /api/patterns/groups/:groupId - 获取单个样板组
router.get('/groups/:groupId', async (req, res) => {
  try {
    const patternsService = getService();
    const group = await patternsService.getPatternGroup(req.params.groupId);

    if (!group) {
      return res.status(404).json({ error: 'Pattern group not found' });
    }

    res.json(group);
  } catch (error) {
    console.error('Error fetching pattern group:', error);
    res.status(500).json({ error: 'Failed to fetch pattern group' });
  }
});

// GET /api/patterns/groups/:groupId/detail - 获取样板组及其所有样板
router.get('/groups/:groupId/detail', async (req, res) => {
  try {
    const patternsService = getService();
    const groupWithPatterns = await patternsService.getPatternGroupWithPatterns(req.params.groupId);

    if (!groupWithPatterns) {
      return res.status(404).json({ error: 'Pattern group not found' });
    }

    res.json(groupWithPatterns);
  } catch (error) {
    console.error('Error fetching pattern group details:', error);
    res.status(500).json({ error: 'Failed to fetch pattern group details' });
  }
});

// POST /api/patterns/groups - 创建样板组
router.post('/groups', async (req, res) => {
  try {
    const { groupName, description } = req.body;

    if (!groupName) {
      return res.status(400).json({ error: 'groupName is required' });
    }

    const patternsService = getService();
    const group = await patternsService.createPatternGroup(groupName, description);

    res.status(201).json(group);
  } catch (error) {
    console.error('Error creating pattern group:', error);
    res.status(500).json({ error: 'Failed to create pattern group' });
  }
});

// PUT /api/patterns/groups/:groupId - 更新样板组
router.put('/groups/:groupId', async (req, res) => {
  try {
    const { groupName, description } = req.body;

    if (!groupName) {
      return res.status(400).json({ error: 'groupName is required' });
    }

    const patternsService = getService();
    await patternsService.updatePatternGroup(req.params.groupId, groupName, description);

    const updatedGroup = await patternsService.getPatternGroup(req.params.groupId);
    res.json(updatedGroup);
  } catch (error) {
    console.error('Error updating pattern group:', error);
    res.status(500).json({ error: 'Failed to update pattern group' });
  }
});

// DELETE /api/patterns/groups/:groupId - 删除样板组
router.delete('/groups/:groupId', async (req, res) => {
  try {
    const patternsService = getService();
    await patternsService.deletePatternGroup(req.params.groupId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting pattern group:', error);
    res.status(500).json({ error: 'Failed to delete pattern group' });
  }
});

// === 样板管理 ===

// POST /api/patterns - 创建样板
router.post('/', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const groupId = typeof body.groupId === 'string' ? body.groupId : null;
    const recipeId = typeof body.recipeId === 'string' ? body.recipeId : '';
    const patternName = typeof body.patternName === 'string' ? body.patternName : '';
    const outputItemId = typeof body.outputItemId === 'string' ? body.outputItemId : null;
    const options = normalizePatternOptions(body);

    if (!recipeId || !patternName) {
      return res.status(400).json({ error: 'recipeId and patternName are required' });
    }

    const patternsService = getService();
    const pattern = await patternsService.createPattern(
      groupId || null,
      recipeId,
      patternName,
      outputItemId,
      options
    );

    res.status(201).json(pattern);
  } catch (error) {
    console.error('Error creating pattern:', error);
    res.status(500).json({ error: 'Failed to create pattern' });
  }
});

// DELETE /api/patterns/:patternId - 删除样板
router.delete('/:patternId', async (req, res) => {
  try {
    const patternsService = getService();
    await patternsService.deletePattern(req.params.patternId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting pattern:', error);
    res.status(500).json({ error: 'Failed to delete pattern' });
  }
});

// PUT /api/patterns/:patternId - 更新样板
router.put('/:patternId', async (req, res) => {
  try {
    const patternsService = getService();
    await patternsService.updatePattern(req.params.patternId, req.body);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating pattern:', error);
    res.status(500).json({ error: 'Failed to update pattern' });
  }
});

// === 导出 ===

// GET /api/patterns/groups/:groupId/export - 导出样板组为 OC-AE JSON
router.get('/groups/:groupId/export', async (req, res) => {
  try {
    const patternsService = getService();
    const exportData = await patternsService.exportPatternGroup(req.params.groupId);

    res.json(exportData);
  } catch (error) {
    console.error('Error exporting pattern group:', error);
    const message = error instanceof Error ? error.message : 'Failed to export pattern group';

    if (message === 'Pattern group not found') {
      res.status(404).json({ error: 'Pattern group not found' });
    } else {
      res.status(500).json({ error: 'Failed to export pattern group' });
    }
  }
});

export default router;
