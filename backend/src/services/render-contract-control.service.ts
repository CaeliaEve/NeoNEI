import { getBrowserAtlasIndexService } from './browser-atlas-index.service';
import { getBrowserLayoutIndexService } from './browser-layout-index.service';
import { getRenderContractService } from './render-contract.service';
import { getUiFamilyCensusService } from './ui-family-census.service';
import { getUiPayloadsService } from './ui-payloads.service';
import { getUiTemplateBindingIndexService } from './ui-template-binding-index.service';
import { getUiTemplateCatalogService } from './ui-template-catalog.service';
import { notFound } from '../utils/http';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  if (Array.isArray(value)) {
    return text(value[0]);
  }
  return String(value || '').trim();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export class RenderContractControlService {
  getOverview(): unknown {
    return getRenderContractService().getOverview();
  }

  getBrowserAtlasIndex(): unknown {
    return getBrowserAtlasIndexService().getIndex();
  }

  getBrowserAtlasEntries(body: unknown): unknown {
    return getBrowserAtlasIndexService().getEntries(stringArray(asRecord(body).itemIds));
  }

  getBrowserLayoutIndex(): unknown {
    return getBrowserLayoutIndexService().getIndex();
  }

  getUiFamilyCensus(): unknown {
    return getUiFamilyCensusService().getReport();
  }

  getUiFamily(familyKey: unknown): unknown {
    const normalized = text(familyKey);
    const family = getUiFamilyCensusService().getFamilyByKey(normalized);
    if (!family) {
      throw notFound(`UI family census entry not found: ${normalized}`);
    }
    return family;
  }

  getUiTemplateCatalog(): unknown {
    return getUiTemplateCatalogService().getReport();
  }

  getUiTemplate(templateKey: unknown): unknown {
    const normalized = text(templateKey);
    const template = getUiTemplateCatalogService().getTemplateByKey(normalized);
    if (!template) {
      throw notFound(`UI template catalog entry not found: ${normalized}`);
    }
    return template;
  }

  getUiTemplateBindingIndex(): unknown {
    return getUiTemplateBindingIndexService().getReport();
  }

  getUiTemplateBinding(recipeId: unknown): unknown {
    const normalized = text(recipeId);
    const binding = getUiTemplateBindingIndexService().getBindingByRecipeId(normalized);
    if (!binding) {
      throw notFound(`UI template binding entry not found: ${normalized}`);
    }
    return binding;
  }

  getAnimatedAtlasEntry(assetId: unknown): unknown {
    return getRenderContractService().getAnimatedAtlasEntry(text(assetId));
  }

  getRenderAssetEntry(assetId: unknown): unknown {
    return getRenderContractService().getRenderAssetEntry(text(assetId));
  }

  getUiPayload(recipeId: unknown): Promise<unknown> {
    return getUiPayloadsService().getByRecipeId(text(recipeId));
  }
}

export function createRenderContractControlService(): RenderContractControlService {
  return new RenderContractControlService();
}
