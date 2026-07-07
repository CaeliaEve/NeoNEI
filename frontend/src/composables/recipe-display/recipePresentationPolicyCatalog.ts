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
  | 'native-layout'
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

function nativeFrameRecordFromPayload(uiPayload: RecipeUiPayload | null | undefined): Record<string, unknown> | null {
  const payloadRecord = asRecord(uiPayload);
  return asRecord(payloadRecord?.nativeFrame)
    ?? asRecord(asRecord(payloadRecord?.metadata)?.nativeFrame)
    ?? asRecord(asRecord(payloadRecord?.additionalData)?.nativeFrame);
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

export function recipeUiPayloadNativeFrame(uiPayload: RecipeUiPayload | null | undefined): unknown | null {
  return nativeFrameRecordFromPayload(uiPayload);
}

function resolveRecipeUiPayloadAuthorityError(
  uiPayload: RecipeUiPayload | null | undefined,
  payloadProfile: RecipePresentationProfile | null,
): string | null {
  const payloadRecord = asRecord(uiPayload);
  if (
    !payloadRecord
    || (!hasOwnRecordProperty(payloadRecord, 'nativeLayout') && !hasOwnRecordProperty(payloadRecord, 'nativeFrame'))
  ) {
    return null;
  }

  const nativeFrame = nativeFrameRecordFromPayload(uiPayload);
  if (nativeFrame) {
    return null;
  }

  const nativeLayout = payloadRecord.nativeLayout;
  if (nativeLayout && typeof nativeLayout === 'object') {
    if (payloadProfile && isRegisteredRecipeComponent(payloadProfile.component)) {
      return null;
    }
    return `Native recipe UI payload for family "${uiPayload?.familyKey ?? 'unknown'}" is missing nativeFrame; refusing reconstructed nativeLayout canvas path.`;
  }

  if (payloadProfile && isRegisteredRecipeComponent(payloadProfile.component)) {
    return null;
  }

  if (!nativeFrame || typeof nativeFrame !== 'object') {
    return `Native recipe UI payload for family "${uiPayload?.familyKey ?? 'unknown'}" has no valid nativeFrame; refusing heuristic or reconstructed UI path.`;
  }

  if (!payloadProfile) {
    return `Native recipe UI payload family "${uiPayload?.familyKey ?? 'unknown'}" is not registered in the recipe presentation catalog; refusing heuristic UI path.`;
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
    && isRegisteredRecipeComponent(detectedProfile.component)
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
    accepts: ({ profile, uiPayload }) => (
      !recipeUiPayloadNativeFrame(uiPayload)
      && profile.renderMode === 'detailed_crafting'
    ),
  },
  {
    kind: 'native-layout',
    displayedComponentName: 'NativeNeiRecipeCanvas',
    resolveComponent: () => null,
    accepts: ({ uiPayload }) => Boolean(recipeUiPayloadNativeFrame(uiPayload)),
  },
  {
    kind: 'registered-component',
    displayedComponentName: ({ profile }) => profile.component,
    resolveComponent: ({ profile }) => resolveRegisteredRecipeComponent(profile.component),
    accepts: ({ profile, uiPayload }) => (
      !recipeUiPayloadNativeFrame(uiPayload)
      && isRegisteredRecipeComponent(profile.component)
    ),
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

function nativeFrameRoutingError({ uiPayload }: RecipePresentationRouteInput): string | null {
  const nativeLayout = recipeUiPayloadNativeLayout(uiPayload);
  const nativeFrame = recipeUiPayloadNativeFrame(uiPayload);
  if (nativeFrame) {
    return null;
  }
  if (!nativeLayout) {
    return null;
  }
  return null;
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

  const nativeError = nativeFrameRoutingError(input);
  if (nativeError) {
    return {
      kind: 'unregistered-component',
      displayedComponentName: `Unregistered:${input.profile.component}`,
      currentComponent: null,
      hasRegisteredComponent: false,
      error: nativeError,
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
  abi: 'neonei.recipe-presentation-policy.v1',
  routeKinds: Object.freeze(RECIPE_PRESENTATION_ROUTE_DESCRIPTORS.map((descriptor) => descriptor.kind)),
  nativePayloadAuthority: 'fail-closed-native-layout-authority',
});
