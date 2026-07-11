import type { Component } from 'vue';
import type { Recipe, RecipeUiPayload } from '../../services/api';
import {
  resolveRecipePresentationProfileFromUiPayload,
  type RecipePresentationProfile,
} from '../../services/uiTypeMapping';
import {
  isRegisteredRecipeComponent,
  resolveRegisteredRecipeComponent,
} from '../../components/recipe-display/recipeComponentRegistry';

type RecipePresentationRouteKind =
  | 'detailed-crafting'
  | 'registered-component'
  | 'unregistered-component';

export interface RecipePresentationDecision {
  profile: RecipePresentationProfile;
  source: 'ui-payload' | 'detected-profile';
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
  detectedProfile: RecipePresentationProfile;
  uiPayload: RecipeUiPayload | null | undefined;
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
  if (!candidate || typeof candidate.recipeId !== 'string' || typeof candidate.familyKey !== 'string') {
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

function resolveRecipeUiPayloadAuthorityError(
  uiPayload: RecipeUiPayload | null | undefined,
  payloadProfile: RecipePresentationProfile | null,
): string | null {
  const payloadRecord = asRecord(uiPayload);
  if (!payloadRecord) {
    return null;
  }

  if (payloadProfile && isWebAuthoredRecipeComponent(payloadProfile.component)) {
    return null;
  }

  if (hasOwnRecordProperty(payloadRecord, 'nativeLayout') || hasOwnRecordProperty(payloadRecord, 'familyKey')) {
    return `Native recipe UI payload family "${uiPayload?.familyKey ?? 'unknown'}" is not registered in the web-authored recipe presentation catalog; NEI frame/background PNG rendering is retired; refusing heuristic UI path.`;
  }

  return null;
}

export function resolveRecipePresentationDecision({
  detectedProfile,
  uiPayload,
}: RecipePresentationDecisionInput): RecipePresentationDecision {
  const payloadProfile = resolveRecipePresentationProfileFromUiPayload(uiPayload);
  const payloadError = resolveRecipeUiPayloadAuthorityError(uiPayload, payloadProfile);
  const resolvedPayloadError = payloadError
    && !payloadProfile
    && isWebAuthoredRecipeComponent(detectedProfile.component)
    ? null
    : payloadError;

  if (payloadProfile) {
    return {
      profile: payloadProfile,
      source: 'ui-payload',
      payloadError: resolvedPayloadError,
    };
  }

  return {
    profile: detectedProfile,
    source: 'detected-profile',
    payloadError: resolvedPayloadError,
  };
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
  nativePayloadAuthority: 'web-authored-ui-only',
  retiredNativeArtifacts: Object.freeze(['nei-frame-png', 'nei-background-png']),
});
