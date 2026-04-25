export interface GtnhBrowserSortable {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  damage: number;
  tooltip?: string | null;
  sourceOrder?: number | null;
}

function normalizeText(value: string | null | undefined): string {
  return `${value ?? ''}`.trim().toLowerCase();
}

function compareText(left: string | null | undefined, right: string | null | undefined): number {
  return normalizeText(left).localeCompare(normalizeText(right));
}

function parseTooltipNumericId(tooltip: string | null | undefined): number | null {
  const match = `${tooltip ?? ''}`.match(/#(\d+)(?:\/\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  return left - right;
}

export function compareGtnhBrowserOrder(
  left: GtnhBrowserSortable,
  right: GtnhBrowserSortable,
): number {
  const leftMinecraft = normalizeText(left.modId) === 'minecraft' ? 0 : 1;
  const rightMinecraft = normalizeText(right.modId) === 'minecraft' ? 0 : 1;
  if (leftMinecraft !== rightMinecraft) {
    return leftMinecraft - rightMinecraft;
  }

  const modCompare = compareText(left.modId, right.modId);
  if (modCompare !== 0) {
    return modCompare;
  }

  const tooltipIdCompare = compareNullableNumbers(
    parseTooltipNumericId(left.tooltip),
    parseTooltipNumericId(right.tooltip),
  );
  if (tooltipIdCompare !== 0) {
    return tooltipIdCompare;
  }

  const sourceOrderCompare = compareNullableNumbers(
    left.sourceOrder != null ? Number(left.sourceOrder) : null,
    right.sourceOrder != null ? Number(right.sourceOrder) : null,
  );
  if (sourceOrderCompare !== 0) {
    return sourceOrderCompare;
  }

  const internalNameCompare = compareText(left.internalName, right.internalName);
  if (internalNameCompare !== 0) {
    return internalNameCompare;
  }

  const damageCompare = Number(left.damage ?? 0) - Number(right.damage ?? 0);
  if (damageCompare !== 0) {
    return damageCompare;
  }

  const localizedNameCompare = compareText(left.localizedName, right.localizedName);
  if (localizedNameCompare !== 0) {
    return localizedNameCompare;
  }

  return compareText(left.itemId, right.itemId);
}

export function buildGtnhBrowserOrderBySql(alias?: string): string {
  const prefix = alias ? `${alias}.` : '';
  return `
    CASE WHEN LOWER(${prefix}mod_id) = 'minecraft' THEN 0 ELSE 1 END ASC,
    ${prefix}mod_id COLLATE NOCASE ASC,
    ${prefix}internal_name COLLATE NOCASE ASC,
    ${prefix}damage ASC,
    ${prefix}localized_name COLLATE NOCASE ASC,
    ${prefix}item_id COLLATE NOCASE ASC
  `;
}
