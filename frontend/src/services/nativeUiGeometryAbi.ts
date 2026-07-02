export const NATIVE_UI_COORDINATE_SPACE = "nei_pixels";
export const NATIVE_UI_ANCHOR = "top-left";
export const NATIVE_UI_ICON_SIZE = 16;

export interface NativeUiSlotGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  pitchX: number;
  pitchY: number;
  iconX: number;
  iconY: number;
  iconWidth: number;
  iconHeight: number;
}

type NativeUiSlotGeometrySource = {
  coordinateSpace?: unknown;
  anchor?: unknown;
  x?: unknown;
  y?: unknown;
  slotWidth?: unknown;
  slotHeight?: unknown;
  pitchX?: unknown;
  pitchY?: unknown;
};

function requiredString(value: unknown, field: string, label: string): string {
  const normalized = `${value ?? ""}`.trim();
  if (!normalized) {
    throw new Error(`${label} missing required Native UI geometry field: ${field}`);
  }
  return normalized;
}

function requiredPositiveNumber(value: unknown, field: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} has invalid Native UI geometry field ${field}: ${String(value)}`);
  }
  return parsed;
}

function requiredNonNegativeNumber(value: unknown, field: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} has invalid Native UI geometry field ${field}: ${String(value)}`);
  }
  return parsed;
}

export function resolveNativeUiSlotGeometry(
  slot: NativeUiSlotGeometrySource,
  label = "Native UI slot",
): NativeUiSlotGeometry {
  const coordinateSpace = requiredString(slot.coordinateSpace, "coordinateSpace", label);
  if (coordinateSpace !== NATIVE_UI_COORDINATE_SPACE) {
    throw new Error(`${label} uses unsupported Native UI coordinateSpace: ${coordinateSpace}`);
  }
  const anchor = requiredString(slot.anchor, "anchor", label);
  if (anchor !== NATIVE_UI_ANCHOR) {
    throw new Error(`${label} uses unsupported Native UI anchor: ${anchor}`);
  }
  const x = requiredNonNegativeNumber(slot.x, "x", label);
  const y = requiredNonNegativeNumber(slot.y, "y", label);
  const width = requiredPositiveNumber(slot.slotWidth, "slotWidth", label);
  const height = requiredPositiveNumber(slot.slotHeight, "slotHeight", label);
  const pitchX = requiredPositiveNumber(slot.pitchX, "pitchX", label);
  const pitchY = requiredPositiveNumber(slot.pitchY, "pitchY", label);
  const iconWidth = Math.min(NATIVE_UI_ICON_SIZE, width);
  const iconHeight = Math.min(NATIVE_UI_ICON_SIZE, height);
  return {
    x,
    y,
    width,
    height,
    pitchX,
    pitchY,
    iconX: x + Math.floor((width - iconWidth) / 2),
    iconY: y + Math.floor((height - iconHeight) / 2),
    iconWidth,
    iconHeight,
  };
}
