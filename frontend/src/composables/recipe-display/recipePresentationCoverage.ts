import type { RecipeUiPayload } from '../../services/api';
import {
  resolveRecipePresentationProfileFromUiPayload,
  type RecipePresentationProfile,
} from '../../services/uiTypeMapping';
import { isRegisteredRecipeComponent } from '../../components/recipe-display/recipeComponentRegistry';

const DEFAULT_SAMPLE_RECIPE_LIMIT = 5;
const UNKNOWN_FAMILY_KEY = 'unknown';
const DETECTED_PROFILE_FAMILY_KEY = 'detected-profile';

export type RecipePresentationCoverageGapKind =
  | 'unmapped-ui-payload-family'
  | 'unregistered-ui-payload-component'
  | 'unregistered-detected-component';

export interface RecipePresentationCoverageEntry {
  recipeId?: string | null;
  uiPayload?: RecipeUiPayload | null;
  profile?: RecipePresentationProfile | null;
}

export interface RecipePresentationCoverageGap {
  kind: RecipePresentationCoverageGapKind;
  familyKey: string;
  recipeCount: number;
  sampleRecipeIds: string[];
  source: 'ui-payload' | 'detected-profile';
  uiType: string | null;
  component: string | null;
  reason: string;
  error: string;
}

export interface RecipePresentationCoverageSummary {
  familyKey: string;
  recipeCount: number;
  sampleRecipeIds: string[];
  source: 'ui-payload' | 'detected-profile';
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
  const payloadRecipeId = typeof uiPayload?.recipeId === 'string' ? uiPayload.recipeId.trim() : '';
  return payloadRecipeId || null;
}

function normalizeFamilyKey(uiPayload: RecipeUiPayload | null | undefined): string | null {
  const familyKey = typeof uiPayload?.familyKey === 'string' ? uiPayload.familyKey.trim() : '';
  if (familyKey) {
    return familyKey;
  }
  const payloadRecord = asRecord(uiPayload);
  return payloadRecord && Object.prototype.hasOwnProperty.call(payloadRecord, 'nativeLayout')
    ? UNKNOWN_FAMILY_KEY
    : null;
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

function createUnmappedUiPayloadFamilyError(familyKey: string): string {
  return `Native recipe UI payload family "${familyKey}" is not registered in the web-authored recipe presentation catalog; NEI frame/background PNG rendering is retired; refusing heuristic UI path.`;
}

function createUnregisteredComponentError(profile: RecipePresentationProfile): string {
  return `Recipe display component "${profile.component}" is not registered for UI type "${profile.uiConfig.uiType}".`;
}

function summarizeKey(input: {
  kind?: RecipePresentationCoverageGapKind;
  familyKey: string;
  source: 'ui-payload' | 'detected-profile';
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
    source: 'ui-payload' | 'detected-profile';
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
    source: 'ui-payload' | 'detected-profile';
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
    const familyKey = normalizeFamilyKey(uiPayload);
    const recipeId = normalizeRecipeId(entry, uiPayload);
    const payloadProfile = resolveRecipePresentationProfileFromUiPayload(uiPayload);
    const profile = payloadProfile ?? entry.profile ?? null;
    const source = payloadProfile ? 'ui-payload' : 'detected-profile';

    if (familyKey) {
      payloadRecords += 1;
    }
    if (!familyKey && !profile) {
      continue;
    }
    auditedRecords += 1;

    if (profile?.renderMode === 'detailed_crafting') {
      coveredRecords += 1;
      recordCovered({
        familyKey: familyKey ?? DETECTED_PROFILE_FAMILY_KEY,
        recipeId,
        source,
        profile,
      });
      continue;
    }

    if (familyKey && !payloadProfile) {
      gapRecords += 1;
      recordGap({
        kind: 'unmapped-ui-payload-family',
        familyKey,
        recipeId,
        source: 'ui-payload',
        uiType: null,
        component: null,
        reason: 'ui_payload_family_unmapped',
        error: createUnmappedUiPayloadFamilyError(familyKey),
      });
      continue;
    }

    if (profile && !isRegisteredRecipeComponent(profile.component)) {
      gapRecords += 1;
      recordGap({
        kind: payloadProfile ? 'unregistered-ui-payload-component' : 'unregistered-detected-component',
        familyKey: familyKey ?? DETECTED_PROFILE_FAMILY_KEY,
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
        familyKey: familyKey ?? DETECTED_PROFILE_FAMILY_KEY,
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
