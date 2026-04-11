import type { IndexedItem, IndexedRecipeMetadata } from './recipes-indexed.service';

const STANDARD_METADATA_DEFAULTS = {
  voltageTier: null,
  voltage: null,
  amperage: null,
  duration: null,
  totalEU: null,
  requiresCleanroom: null,
  requiresLowGravity: null,
  additionalInfo: null,
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function transformRecipeMetadata(
  raw: Record<string, unknown> | null,
  transformSpecialItem?: (entry: unknown) => IndexedItem,
): IndexedRecipeMetadata | null {
  if (!raw) return null;

  const metadata: IndexedRecipeMetadata = {
    ...raw,
    voltageTier: typeof raw.voltageTier === 'string' ? raw.voltageTier : STANDARD_METADATA_DEFAULTS.voltageTier,
    voltage: typeof raw.voltage === 'number' ? raw.voltage : STANDARD_METADATA_DEFAULTS.voltage,
    amperage: typeof raw.amperage === 'number' ? raw.amperage : STANDARD_METADATA_DEFAULTS.amperage,
    duration: typeof raw.duration === 'number' ? raw.duration : STANDARD_METADATA_DEFAULTS.duration,
    totalEU: typeof raw.totalEU === 'number' ? raw.totalEU : STANDARD_METADATA_DEFAULTS.totalEU,
    requiresCleanroom: typeof raw.requiresCleanroom === 'boolean' ? raw.requiresCleanroom : STANDARD_METADATA_DEFAULTS.requiresCleanroom,
    requiresLowGravity: typeof raw.requiresLowGravity === 'boolean' ? raw.requiresLowGravity : STANDARD_METADATA_DEFAULTS.requiresLowGravity,
    additionalInfo: typeof raw.additionalInfo === 'string' ? raw.additionalInfo : STANDARD_METADATA_DEFAULTS.additionalInfo,
    specialItems:
      Array.isArray(raw.specialItems) && transformSpecialItem
        ? raw.specialItems.map((entry) => transformSpecialItem(entry))
        : undefined,
  };

  if (!isPlainObject(raw.aspects)) {
    delete metadata.aspects;
  }
  if (!Array.isArray(raw.componentSlotOrder)) {
    delete metadata.componentSlotOrder;
  }

  return metadata;
}
