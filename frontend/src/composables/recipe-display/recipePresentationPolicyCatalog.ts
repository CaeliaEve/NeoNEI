import type { Component } from 'vue';
import type { Recipe, RecipeUiPayload } from '../../services/api';
import type { RecipePresentationProfile } from '../../services/uiTypeMapping';
import {
  isRegisteredRecipeComponent,
  resolveRegisteredRecipeComponent,
} from '../../components/recipe-display/recipeComponentRegistry';
import type { UiPackBinding } from '../../services/uiPackRuntime.ts';
import {
  bindingAuthorityErrorProfile,
  resolveRequiredRecipePresentationProfile,
} from './recipeRendererRegistry.ts';

type RecipePresentationRouteKind =
  | 'detailed-crafting'
  | 'registered-component'
  | 'unregistered-component';

export interface RecipePresentationDecision {
  profile: RecipePresentationProfile;
  source: 'ui-binding-v2';
  payloadError: string | null;
}

export interface RecipePresentationRoute {
  kind: RecipePresentationRouteKind;
  displayedComponentName: string;
  currentComponent: Component | null;
  hasRegisteredComponent: boolean;
  error: string | null;
}

interface RecipePresentationDecisionInput {
  uiBinding?: UiPackBinding | null;
  uiBindingError?: string | null;
  preferDetailedCrafting?: boolean;
}

interface RecipePresentationRouteInput {
  profile: RecipePresentationProfile;
  uiPayload: RecipeUiPayload | null | undefined;
  payloadError?: string | null;
}

type RecipePresentationRouteDescriptor = Readonly<{
  kind: Exclude<RecipePresentationRouteKind, 'unregistered-component'>;
  displayedComponentName: string | ((input: RecipePresentationRouteInput) => string);
  resolveComponent: (input: RecipePresentationRouteInput) => Component | null;
  accepts: (input: RecipePresentationRouteInput) => boolean;
}>;

function hasOwnRecordProperty(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function isWebAuthoredRecipeComponent(componentName: string): boolean {
  return isRegisteredRecipeComponent(componentName);
}

export function resolveInlineRecipeUiPayload(recipe: Pick<Recipe, 'additionalData'>): RecipeUiPayload | null {
  const additionalData = asRecord(recipe.additionalData);
  const candidate = asRecord(additionalData?.uiPayload);
  if (!candidate || typeof candidate.recipeId !== 'string' || typeof candidate.captureKey !== 'string') {
    return null;
  }
  return candidate as unknown as RecipeUiPayload;
}

export function recipeUiPayloadNativeLayout(uiPayload: RecipeUiPayload | null | undefined): unknown | null {
  const payloadRecord = asRecord(uiPayload);
  if (!payloadRecord || !hasOwnRecordProperty(payloadRecord, 'nativeLayout')) {
    return null;
  }
  return payloadRecord.nativeLayout ?? null;
}

export function resolveRecipePresentationDecision({
  uiBinding,
  uiBindingError,
  preferDetailedCrafting,
}: RecipePresentationDecisionInput): RecipePresentationDecision {
  try {
    return {
      profile: resolveRequiredRecipePresentationProfile(uiBinding, uiBindingError, { preferDetailedCrafting }),
      source: 'ui-binding-v2',
      payloadError: null,
    };
  } catch (error) {
    return {
      profile: bindingAuthorityErrorProfile(),
      source: 'ui-binding-v2',
      payloadError: error instanceof Error ? error.message : String(error),
    };
  }
}

const RECIPE_PRESENTATION_ROUTE_DESCRIPTORS: readonly RecipePresentationRouteDescriptor[] = validateRecipePresentationRouteDescriptors([
  {
    kind: 'detailed-crafting',
    displayedComponentName: 'NEIRecipeDisplay',
    resolveComponent: () => null,
    accepts: ({ profile }) => profile.renderMode === 'detailed_crafting',
  },
  {
    kind: 'registered-component',
    displayedComponentName: ({ profile }) => profile.component,
    resolveComponent: ({ profile }) => resolveRegisteredRecipeComponent(profile.component),
    accepts: ({ profile }) => isWebAuthoredRecipeComponent(profile.component),
  },
]);

function validateRecipePresentationRouteDescriptors(
  descriptors: readonly RecipePresentationRouteDescriptor[],
): readonly RecipePresentationRouteDescriptor[] {
  const seenKinds = new Set<string>();
  for (const descriptor of descriptors) {
    if (!seenKinds.add(descriptor.kind)) {
      throw new Error(`Duplicate recipe presentation route descriptor: ${descriptor.kind}`);
    }
    if (typeof descriptor.accepts !== 'function' || typeof descriptor.resolveComponent !== 'function') {
      throw new Error(`Recipe presentation route descriptor is missing ops: ${descriptor.kind}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function componentRegistrationError(profile: RecipePresentationProfile): string {
  return `Recipe display component "${profile.component}" is not registered for UI type "${profile.uiConfig.uiType}".`;
}

export function resolveRecipePresentationRoute(input: RecipePresentationRouteInput): RecipePresentationRoute {
  if (input.payloadError) {
    return {
      kind: 'unregistered-component',
      displayedComponentName: `Unregistered:${input.profile.component}`,
      currentComponent: null,
      hasRegisteredComponent: false,
      error: input.payloadError,
    };
  }

  for (const descriptor of RECIPE_PRESENTATION_ROUTE_DESCRIPTORS) {
    if (!descriptor.accepts(input)) {
      continue;
    }
    const displayedComponentName = typeof descriptor.displayedComponentName === 'function'
      ? descriptor.displayedComponentName(input)
      : descriptor.displayedComponentName;
    return {
      kind: descriptor.kind,
      displayedComponentName,
      currentComponent: descriptor.resolveComponent(input),
      hasRegisteredComponent: descriptor.kind === 'registered-component',
      error: null,
    };
  }

  return {
    kind: 'unregistered-component',
    displayedComponentName: `Unregistered:${input.profile.component}`,
    currentComponent: null,
    hasRegisteredComponent: false,
    error: componentRegistrationError(input.profile),
  };
}

export const RECIPE_PRESENTATION_POLICY_CATALOG = Object.freeze({
  abi: 'neonei.recipe-presentation-policy.v2',
  routeKinds: Object.freeze(RECIPE_PRESENTATION_ROUTE_DESCRIPTORS.map((descriptor) => descriptor.kind)),
  presentationAuthority: 'ui-binding-v2-renderer-id-only',
  missingBindingPolicy: 'fail-closed',
  retiredNativeArtifacts: Object.freeze(['nei-frame-png', 'nei-background-png']),
});
