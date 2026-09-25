import type { UiPackBinding } from '../../services/uiPackRuntime.ts';
import {
  resolveRecipePresentationProfileByRendererId,
  type RecipePresentationProfile,
  type UIPresentationSurface,
} from '../../services/uiTypeMapping.ts';

const PRESENTATION_SURFACES = new Set<string>([
  'workbench',
  'machine',
  'ritual',
  'research',
  'blueprint',
]);

const UI_BINDING_AUTHORITY_ERROR_PROFILE: RecipePresentationProfile = Object.freeze({
  uiConfig: Object.freeze({
    uiType: 'ui_binding_v2_unresolved',
    component: 'UiBindingV2Unresolved',
    presentation: Object.freeze({ family: 'crafting', surface: 'workbench', density: 'standard' }),
  }),
  component: 'UiBindingV2Unresolved',
  renderMode: 'component',
  reason: 'ui_binding_v2_unresolved',
  sourceUiType: 'ui_binding_v2_unresolved',
});

function requiredBindingValue(value: string, field: string, recipeId: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`UI binding v2 ${recipeId || '<missing recipeId>'} ${field} is missing`);
  }
  return normalized;
}

export function resolveRecipePresentationProfileFromBinding(
  binding: UiPackBinding,
  options?: Readonly<{ preferDetailedCrafting?: boolean }>,
): RecipePresentationProfile {
  const recipeId = requiredBindingValue(binding.recipeId, 'recipeId', binding.recipeId);
  if (!binding.bound) {
    throw new Error(`UI binding v2 ${recipeId} is not bound to a template`);
  }
  requiredBindingValue(binding.templateKey, 'templateKey', recipeId);
  requiredBindingValue(binding.familyKey, 'familyKey', recipeId);
  const presentationSurface = requiredBindingValue(
    binding.presentationSurface,
    'presentationSurface',
    recipeId,
  );
  if (!PRESENTATION_SURFACES.has(presentationSurface)) {
    throw new Error(`UI binding v2 ${recipeId} has unknown presentationSurface: ${presentationSurface}`);
  }
  const layoutId = requiredBindingValue(binding.layoutId, 'layoutId', recipeId);
  const rendererId = requiredBindingValue(binding.rendererId, 'rendererId', recipeId);
  const profile = resolveRecipePresentationProfileByRendererId(rendererId, {
    reason: `ui_binding_v2:${rendererId}:${layoutId}`,
    presentationOverrides: { surface: presentationSurface as UIPresentationSurface },
    preferDetailedCrafting: options?.preferDetailedCrafting,
  });
  if (!profile) {
    throw new Error(`Unknown recipe rendererId: ${rendererId}`);
  }
  return profile;
}

export function resolveRequiredRecipePresentationProfile(
  binding: UiPackBinding | null | undefined,
  resolutionError?: string | null,
  options?: Readonly<{ preferDetailedCrafting?: boolean }>,
): RecipePresentationProfile {
  if (!binding) {
    throw new Error(
      resolutionError?.trim()
      || 'Recipe presentation requires a UiPackBinding v2; no binding was resolved',
    );
  }
  return resolveRecipePresentationProfileFromBinding(binding, options);
}

export function bindingAuthorityErrorProfile(): RecipePresentationProfile {
  return UI_BINDING_AUTHORITY_ERROR_PROFILE;
}

export const RECIPE_RENDERER_REGISTRY = Object.freeze({
  abi: 'neonei.recipe-renderer-registry.v1',
  bindingAbi: 'neonei.ui-binding-pack.v2',
  resolutionPolicy: 'exact-renderer-id-only',
  unknownRendererPolicy: 'fail-closed',
});
