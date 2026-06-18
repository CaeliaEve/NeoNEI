import { Router } from 'express';
import { asyncHandler } from '../utils/http';
import { getRenderContractService } from '../services/render-contract.service';
import { getUiPayloadsService } from '../services/ui-payloads.service';
import { getBrowserAtlasIndexService } from '../services/browser-atlas-index.service';
import { getBrowserLayoutIndexService } from '../services/browser-layout-index.service';
import { getUiFamilyCensusService } from '../services/ui-family-census.service';
import { getUiTemplateCatalogService } from '../services/ui-template-catalog.service';
import { getUiTemplateBindingIndexService } from '../services/ui-template-binding-index.service';
import { notFound } from '../utils/http';

const router = Router();

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json(getRenderContractService().getOverview());
  })
);

router.get(
  '/browser-atlas-index',
  asyncHandler(async (_req, res) => {
    res.json(getBrowserAtlasIndexService().getIndex());
  })
);

router.post(
  '/browser-atlas-entries',
  asyncHandler(async (req, res) => {
    const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
    res.json(getBrowserAtlasIndexService().getEntries(itemIds));
  })
);

router.get(
  '/browser-layout-index',
  asyncHandler(async (_req, res) => {
    res.json(getBrowserLayoutIndexService().getIndex());
  })
);

router.get(
  '/ui-family-census',
  asyncHandler(async (_req, res) => {
    res.json(getUiFamilyCensusService().getReport());
  })
);

router.get(
  '/ui-family-census/:familyKey',
  asyncHandler(async (req, res) => {
    const familyKey = String(req.params.familyKey || '').trim();
    const family = getUiFamilyCensusService().getFamilyByKey(familyKey);
    if (!family) {
      throw notFound(`UI family census entry not found: ${familyKey}`);
    }
    res.json(family);
  })
);

router.get(
  '/ui-template-catalog',
  asyncHandler(async (_req, res) => {
    res.json(getUiTemplateCatalogService().getReport());
  })
);

router.get(
  '/ui-template-catalog/:templateKey',
  asyncHandler(async (req, res) => {
    const templateKey = String(req.params.templateKey || '').trim();
    const template = getUiTemplateCatalogService().getTemplateByKey(templateKey);
    if (!template) {
      throw notFound(`UI template catalog entry not found: ${templateKey}`);
    }
    res.json(template);
  })
);

router.get(
  '/ui-template-binding-index',
  asyncHandler(async (_req, res) => {
    res.json(getUiTemplateBindingIndexService().getReport());
  })
);

router.get(
  '/ui-template-binding-index/:recipeId',
  asyncHandler(async (req, res) => {
    const recipeId = String(req.params.recipeId || '').trim();
    const binding = getUiTemplateBindingIndexService().getBindingByRecipeId(recipeId);
    if (!binding) {
      throw notFound(`UI template binding entry not found: ${recipeId}`);
    }
    res.json(binding);
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
  '/asset',
  asyncHandler(async (req, res) => {
    const assetId = String(req.query.assetId || '').trim();
    res.json(getRenderContractService().getRenderAssetEntry(assetId));
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
