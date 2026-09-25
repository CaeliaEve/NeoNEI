import type { RecipeUiPayload } from '../../services/api';
import type { RecipePresentationProfile } from '../../services/uiTypeMapping';
import type { UiPackBinding } from '../../services/uiPackRuntime.ts';
import { isRegisteredRecipeComponent } from '../../components/recipe-display/recipeComponentRegistry';
import { resolveRecipePresentationProfileFromBinding } from './recipeRendererRegistry.ts';

const DEFAULT_SAMPLE_RECIPE_LIMIT = 5;
const UNKNOWN_FAMILY_KEY = 'unknown';

export type RecipePresentationCoverageGapKind =
  | 'missing-ui-binding-v2'
  | 'invalid-binding-renderer'
  | 'unregistered-binding-component';

export interface RecipePresentationCoverageEntry {
  recipeId?: string | null;
  uiPayload?: RecipeUiPayload | null;
  uiBinding?: UiPackBinding | null;
}

export interface RecipePresentationCoverageGap {
  kind: RecipePresentationCoverageGapKind;
  familyKey: string;
  recipeCount: number;
  sampleRecipeIds: string[];
  source: 'ui-binding-v2';
  uiType: string | null;
  component: string | null;
  reason: string;
  error: string;
}

export interface RecipePresentationCoverageSummary {
  familyKey: string;
  recipeCount: number;
  sampleRecipeIds: string[];
  source: 'ui-binding-v2';
  uiType: string | null;
  component: string | null;
  reason: string;
}

export interface RecipePresentationCoverageReport {
  totalRecords: number;
  auditedRecords: number;
  payloadRecords: number;
  coveredRecords: number;
  gapRecords: number;
  coveredFamilies: RecipePresentationCoverageSummary[];
  gaps: RecipePresentationCoverageGap[];
}

export interface RecipePresentationCoverageOptions {
  sampleRecipeLimit?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function normalizeRecipeId(
  entry: RecipePresentationCoverageEntry,
  uiPayload: RecipeUiPayload | null | undefined,
): string | null {
  const explicitRecipeId = typeof entry.recipeId === 'string' ? entry.recipeId.trim() : '';
  if (explicitRecipeId) {
    return explicitRecipeId;
  }
  const bindingRecipeId = typeof entry.uiBinding?.recipeId === 'string'
    ? entry.uiBinding.recipeId.trim()
    : '';
  if (bindingRecipeId) {
    return bindingRecipeId;
  }
  const payloadRecipeId = typeof uiPayload?.recipeId === 'string' ? uiPayload.recipeId.trim() : '';
  return payloadRecipeId || null;
}

function pushSampleRecipeId(
  sampleRecipeIds: string[],
  recipeId: string | null,
  sampleRecipeLimit: number,
): void {
  if (!recipeId || sampleRecipeIds.length >= sampleRecipeLimit || sampleRecipeIds.includes(recipeId)) {
    return;
  }
  sampleRecipeIds.push(recipeId);
}

function createUnregisteredComponentError(profile: RecipePresentationProfile): string {
  return `Recipe display component "${profile.component}" is not registered for UI type "${profile.uiConfig.uiType}".`;
}

function summarizeKey(input: {
  kind?: RecipePresentationCoverageGapKind;
  familyKey: string;
  source: 'ui-binding-v2';
  uiType: string | null;
  component: string | null;
  reason: string;
}): string {
  return [
    input.kind ?? 'covered',
    input.familyKey,
    input.source,
    input.uiType ?? '',
    input.component ?? '',
    input.reason,
  ].join('\u0000');
}

function sortByRecipeCountThenFamily<T extends { recipeCount: number; familyKey: string }>(entries: T[]): T[] {
  return entries.sort((left, right) => (
    right.recipeCount - left.recipeCount
    || left.familyKey.localeCompare(right.familyKey)
  ));
}

export function collectRecipePresentationCoverageReport(
  entries: readonly RecipePresentationCoverageEntry[],
  options: RecipePresentationCoverageOptions = {},
): RecipePresentationCoverageReport {
  const sampleRecipeLimit = Math.max(1, options.sampleRecipeLimit ?? DEFAULT_SAMPLE_RECIPE_LIMIT);
  const coveredByKey = new Map<string, RecipePresentationCoverageSummary>();
  const gapsByKey = new Map<string, RecipePresentationCoverageGap>();
  let auditedRecords = 0;
  let payloadRecords = 0;
  let coveredRecords = 0;
  let gapRecords = 0;

  function recordCovered(input: {
    familyKey: string;
    recipeId: string | null;
    source: 'ui-binding-v2';
    profile: RecipePresentationProfile;
  }): void {
    const key = summarizeKey({
      familyKey: input.familyKey,
      source: input.source,
      uiType: input.profile.uiConfig.uiType,
      component: input.profile.component,
      reason: input.profile.reason,
    });
    let summary = coveredByKey.get(key);
    if (!summary) {
      summary = {
        familyKey: input.familyKey,
        recipeCount: 0,
        sampleRecipeIds: [],
        source: input.source,
        uiType: input.profile.uiConfig.uiType,
        component: input.profile.component,
        reason: input.profile.reason,
      };
      coveredByKey.set(key, summary);
    }
    summary.recipeCount += 1;
    pushSampleRecipeId(summary.sampleRecipeIds, input.recipeId, sampleRecipeLimit);
  }

  function recordGap(input: {
    kind: RecipePresentationCoverageGapKind;
    familyKey: string;
    recipeId: string | null;
    source: 'ui-binding-v2';
    uiType: string | null;
    component: string | null;
    reason: string;
    error: string;
  }): void {
    const key = summarizeKey(input);
    let gap = gapsByKey.get(key);
    if (!gap) {
      gap = {
        kind: input.kind,
        familyKey: input.familyKey,
        recipeCount: 0,
        sampleRecipeIds: [],
        source: input.source,
        uiType: input.uiType,
        component: input.component,
        reason: input.reason,
        error: input.error,
      };
      gapsByKey.set(key, gap);
    }
    gap.recipeCount += 1;
    pushSampleRecipeId(gap.sampleRecipeIds, input.recipeId, sampleRecipeLimit);
  }

  for (const entry of entries) {
    const uiPayload = entry.uiPayload ?? null;
    const uiBinding = entry.uiBinding ?? null;
    const bindingFamilyKey = typeof uiBinding?.familyKey === 'string' ? uiBinding.familyKey.trim() : '';
    const familyKey = bindingFamilyKey || UNKNOWN_FAMILY_KEY;
    const recipeId = normalizeRecipeId(entry, uiPayload);
    let profile: RecipePresentationProfile | null = null;
    let bindingError: string | null = null;
    if (uiBinding) {
      try {
        profile = resolveRecipePresentationProfileFromBinding(uiBinding);
      } catch (error) {
        bindingError = error instanceof Error ? error.message : String(error);
      }
    }
    const source = 'ui-binding-v2' as const;

    if (uiPayload) {
      payloadRecords += 1;
    }
    auditedRecords += 1;

    if (!uiBinding) {
      gapRecords += 1;
      recordGap({
        kind: 'missing-ui-binding-v2',
        familyKey,
        recipeId,
        source,
        uiType: null,
        component: null,
        reason: 'ui_binding_v2_missing',
        error: `UiPackBinding v2 is missing for recipeId: ${recipeId || '<missing>'}`,
      });
      continue;
    }

    if (bindingError || !profile) {
      gapRecords += 1;
      recordGap({
        kind: 'invalid-binding-renderer',
        familyKey,
        recipeId,
        source,
        uiType: null,
        component: null,
        reason: 'ui_binding_v2_invalid_renderer',
        error: bindingError || 'UiPackBinding v2 renderer resolution failed',
      });
      continue;
    }

    if (profile && !isRegisteredRecipeComponent(profile.component)) {
      gapRecords += 1;
      recordGap({
        kind: 'unregistered-binding-component',
        familyKey,
        recipeId,
        source,
        uiType: profile.uiConfig.uiType,
        component: profile.component,
        reason: profile.reason,
        error: createUnregisteredComponentError(profile),
      });
      continue;
    }

    if (profile) {
      coveredRecords += 1;
      recordCovered({
        familyKey,
        recipeId,
        source,
        profile,
      });
    }
  }

  return {
    totalRecords: entries.length,
    auditedRecords,
    payloadRecords,
    coveredRecords,
    gapRecords,
    coveredFamilies: sortByRecipeCountThenFamily(Array.from(coveredByKey.values())),
    gaps: sortByRecipeCountThenFamily(Array.from(gapsByKey.values())),
  };
}

export function collectRecipePresentationCoverageGaps(
  entries: readonly RecipePresentationCoverageEntry[],
  options: RecipePresentationCoverageOptions = {},
): RecipePresentationCoverageGap[] {
  return collectRecipePresentationCoverageReport(entries, options).gaps;
}
