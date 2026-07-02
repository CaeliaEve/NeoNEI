import type { Request, Response } from 'express';
import { createRenderContractControlService } from '../services/render-contract-control.service';
import type { RenderContractEndpointKey } from './render-contract-endpoint-registry';

export type RenderContractEndpointHandler = (req: Request, res: Response) => Promise<void>;

function sendRenderContractJson(res: Response, payload: unknown): void {
  res.json(payload);
}

export const RENDER_CONTRACT_ENDPOINT_HANDLERS: Record<RenderContractEndpointKey, RenderContractEndpointHandler> = Object.freeze({
  overview: async (_req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getOverview());
  },
  'browser-atlas-index': async (_req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getBrowserAtlasIndex());
  },
  'browser-atlas-entries': async (req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getBrowserAtlasEntries(req.body));
  },
  'browser-layout-index': async (_req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getBrowserLayoutIndex());
  },
  'ui-family-census': async (_req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getUiFamilyCensus());
  },
  'ui-family-census-entry': async (req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getUiFamily(req.params.familyKey));
  },
  'ui-template-catalog': async (_req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getUiTemplateCatalog());
  },
  'ui-template-catalog-entry': async (req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getUiTemplate(req.params.templateKey));
  },
  'ui-template-binding-index': async (_req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getUiTemplateBindingIndex());
  },
  'ui-template-binding-entry': async (req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getUiTemplateBinding(req.params.recipeId));
  },
  'animated-atlas': async (req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getAnimatedAtlasEntry(req.query.assetId));
  },
  asset: async (req, res) => {
    sendRenderContractJson(res, createRenderContractControlService().getRenderAssetEntry(req.query.assetId));
  },
  'ui-payload': async (req, res) => {
    sendRenderContractJson(res, await createRenderContractControlService().getUiPayload(req.query.recipeId));
  },
});
