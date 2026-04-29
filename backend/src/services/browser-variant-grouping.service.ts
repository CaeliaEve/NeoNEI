import crypto from 'crypto';
import type { CollapsibleItemAssignment, CollapsibleItemCandidate } from './gtnh-collapsible-items.service';

export interface BrowserVariantCandidate extends CollapsibleItemCandidate {
  sourceOrder?: number | null;
}

export interface SyntheticBrowserGroupAssignment {
  itemId: string;
  groupKey: string;
  groupLabel: string | null;
  groupSize: number;
  representativeItemId: string;
}

function normalizeText(value: string | null | undefined): string {
  return `${value ?? ''}`.trim().toLowerCase();
}

function hasVariantPayload(itemId: string): boolean {
  return itemId.split('~').length > 4;
}

function buildVariantFamilyKey(candidate: BrowserVariantCandidate): string | null {
  const modId = normalizeText(candidate.modId);
  const internalName = normalizeText(candidate.internalName);
  const localizedName = normalizeText(candidate.localizedName);
  if (!modId || !internalName || !localizedName) {
    return null;
  }
  return `${modId}::${internalName}::${localizedName}`;
}

function buildInternalFamilyKey(candidate: BrowserVariantCandidate): string | null {
  const modId = normalizeText(candidate.modId);
  const internalName = normalizeText(candidate.internalName);
  if (!modId || !internalName) {
    return null;
  }
  return `${modId}::${internalName}`;
}

function compareRepresentativePriority(
  left: BrowserVariantCandidate,
  right: BrowserVariantCandidate,
): number {
  const leftHasVariantPayload = hasVariantPayload(left.itemId);
  const rightHasVariantPayload = hasVariantPayload(right.itemId);
  if (leftHasVariantPayload !== rightHasVariantPayload) {
    return leftHasVariantPayload ? 1 : -1;
  }

  const leftDamage = Number(left.damage ?? 0);
  const rightDamage = Number(right.damage ?? 0);
  const leftIsPristine = leftDamage === 0;
  const rightIsPristine = rightDamage === 0;
  if (leftIsPristine !== rightIsPristine) {
    return leftIsPristine ? -1 : 1;
  }

  if (leftDamage !== rightDamage) {
    return leftDamage - rightDamage;
  }

  const leftSourceOrder = Number.isFinite(left.sourceOrder) ? Number(left.sourceOrder) : Number.MAX_SAFE_INTEGER;
  const rightSourceOrder = Number.isFinite(right.sourceOrder) ? Number(right.sourceOrder) : Number.MAX_SAFE_INTEGER;
  if (leftSourceOrder !== rightSourceOrder) {
    return leftSourceOrder - rightSourceOrder;
  }

  return left.itemId.localeCompare(right.itemId);
}

export function buildSyntheticBrowserVariantAssignments(
  candidates: BrowserVariantCandidate[],
  options?: { blockedItemIds?: ReadonlySet<string> },
): Map<string, SyntheticBrowserGroupAssignment> {
  const exactFamilies = new Map<string, BrowserVariantCandidate[]>();
  const internalFamilies = new Map<string, BrowserVariantCandidate[]>();
  for (const candidate of candidates) {
    const exactFamilyKey = buildVariantFamilyKey(candidate);
    if (exactFamilyKey) {
      const family = exactFamilies.get(exactFamilyKey) ?? [];
      family.push(candidate);
      exactFamilies.set(exactFamilyKey, family);
    }

    const internalFamilyKey = buildInternalFamilyKey(candidate);
    if (internalFamilyKey) {
      const family = internalFamilies.get(internalFamilyKey) ?? [];
      family.push(candidate);
      internalFamilies.set(internalFamilyKey, family);
    }
  }

  const blockedItemIds = options?.blockedItemIds;
  const assignments = new Map<string, SyntheticBrowserGroupAssignment>();

  const canGroupFamily = (family: BrowserVariantCandidate[]): boolean => {
    if (family.length <= 1) {
      return false;
    }

    if (blockedItemIds && family.some((candidate) => blockedItemIds.has(candidate.itemId))) {
      return false;
    }

    return true;
  };

  const assignFamily = (
    familyKey: string,
    family: BrowserVariantCandidate[],
    labelSeed?: string | null,
  ): void => {
    if (!canGroupFamily(family)) {
      return;
    }

    const representative = [...family].sort(compareRepresentativePriority)[0];
    if (!representative) {
      return;
    }

    const groupKey = `variant:${crypto.createHash('md5').update(familyKey).digest('hex')}`;
    const groupLabel = labelSeed ?? representative.localizedName ?? null;
    for (const candidate of family) {
      assignments.set(candidate.itemId, {
        itemId: candidate.itemId,
        groupKey,
        groupLabel,
        groupSize: family.length,
        representativeItemId: representative.itemId,
      });
    }
  };

  for (const [familyKey, family] of internalFamilies.entries()) {
    if (!canGroupFamily(family)) {
      continue;
    }

    const localizedCounts = new Map<string, number>();
    for (const candidate of family) {
      const label = `${candidate.localizedName ?? ''}`.trim();
      if (!label) {
        continue;
      }
      localizedCounts.set(label, (localizedCounts.get(label) ?? 0) + 1);
    }

    const dominantLabel = Array.from(localizedCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    if (!dominantLabel) {
      continue;
    }

    const [label, count] = dominantLabel;
    if (count < 2 || count / family.length < 0.6) {
      continue;
    }

    const dominantFamily = family.filter((candidate) => `${candidate.localizedName ?? ''}`.trim() === label);
    const dominantRepresentative = [...dominantFamily].sort(compareRepresentativePriority)[0];
    if (!dominantRepresentative) {
      continue;
    }

    const canonicalLabels = new Set(
      family
        .filter((candidate) => !hasVariantPayload(candidate.itemId))
        .map((candidate) => `${candidate.localizedName ?? ''}`.trim())
        .filter(Boolean),
    );
    if (canonicalLabels.size > 1) {
      continue;
    }

    if (!dominantFamily.some((candidate) => !hasVariantPayload(candidate.itemId) && Number(candidate.damage ?? 0) === 0)) {
      continue;
    }

    assignFamily(`internal::${familyKey}`, family, dominantRepresentative.localizedName ?? label);
  }

  for (const [familyKey, family] of exactFamilies.entries()) {
    const remainingFamily = family.filter((candidate) => !assignments.has(candidate.itemId));
    assignFamily(`exact::${familyKey}`, remainingFamily);
  }

  return assignments;
}

export function mergeBrowserGroupAssignments(
  candidates: BrowserVariantCandidate[],
  primaryAssignments: Map<string, CollapsibleItemAssignment>,
  secondaryAssignments?: Map<string, SyntheticBrowserGroupAssignment>,
): Map<string, CollapsibleItemAssignment> {
  const merged = new Map<string, CollapsibleItemAssignment>();
  const groupSortOrder = new Map<string, number>();
  let nextSortOrder = 0;

  for (const candidate of candidates) {
    const primary = primaryAssignments.get(candidate.itemId);
    const primaryIsGrouped = Boolean(primary?.groupKey) && Math.max(1, Number(primary?.groupSize ?? 1)) > 1;
    const secondary = !primaryIsGrouped ? secondaryAssignments?.get(candidate.itemId) : undefined;

    const groupKey = primaryIsGrouped
      ? primary?.groupKey ?? null
      : secondary?.groupKey ?? null;
    const groupLabel = primaryIsGrouped
      ? primary?.groupLabel ?? null
      : secondary?.groupLabel ?? null;
    const groupSize = primaryIsGrouped
      ? Math.max(1, Number(primary?.groupSize ?? 1))
      : Math.max(1, Number(secondary?.groupSize ?? 1));

    let resolvedSortOrder: number;
    if (groupKey && groupSize > 1) {
      if (!groupSortOrder.has(groupKey)) {
        groupSortOrder.set(groupKey, nextSortOrder++);
      }
      resolvedSortOrder = groupSortOrder.get(groupKey) ?? 0;
    } else {
      resolvedSortOrder = nextSortOrder++;
    }

    merged.set(candidate.itemId, {
      itemId: candidate.itemId,
      groupKey: groupKey && groupSize > 1 ? groupKey : null,
      groupLabel: groupKey && groupSize > 1 ? groupLabel : null,
      groupSize: groupKey && groupSize > 1 ? groupSize : 1,
      groupSortOrder: resolvedSortOrder,
    });
  }

  return merged;
}
