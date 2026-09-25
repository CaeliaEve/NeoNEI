import {
  NATIVE_UI_ANCHOR,
  NATIVE_UI_COORDINATE_SPACE,
} from "./nativeUiGeometryAbi.ts";

export const NATIVE_UI_SCALE_MODE = "uniform-scale";
export const NATIVE_UI_GT_BACKGROUND_KIND = "gt-modular-ui";
export const NATIVE_UI_CANONICAL_NEI_BACKGROUND_KIND = "canonical-nei-template";
export const NATIVE_UI_BACKGROUND_KINDS = Object.freeze([
  NATIVE_UI_GT_BACKGROUND_KIND,
  NATIVE_UI_CANONICAL_NEI_BACKGROUND_KIND,
] as const);
export const NATIVE_UI_BACKGROUND_SCALING_NINE_SLICE = "nine-slice";

export type NativeUiBackgroundStatus = "captured" | "semantic";
export type NativeUiBackgroundKind = typeof NATIVE_UI_BACKGROUND_KINDS[number];

export interface NativeUiBackgroundTextureSpec {
  width: number;
  height: number;
  borderU: number;
  borderV: number;
}

export interface NativeUiBackgroundTargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeUiBackgroundContract {
  status: NativeUiBackgroundStatus;
  kind: NativeUiBackgroundKind;
  coordinateSpace: typeof NATIVE_UI_COORDINATE_SPACE;
  scaleMode: typeof NATIVE_UI_SCALE_MODE;
  anchor: typeof NATIVE_UI_ANCHOR;
  width: number;
  height: number;
  yShift: number;
  assetRef: string | null;
  resource: string | null;
  source: string | null;
  drawable: string | null;
  scaling: typeof NATIVE_UI_BACKGROUND_SCALING_NINE_SLICE;
  texture: NativeUiBackgroundTextureSpec;
  targetRect: NativeUiBackgroundTargetRect;
}

type NativeUiBackgroundSource = Record<string, unknown>;

export type NativeUiBackgroundLayoutSource = {
  width?: unknown;
  height?: unknown;
  nativeBackground?: unknown;
};

function asRecord(value: unknown): NativeUiBackgroundSource | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as NativeUiBackgroundSource
    : null;
}

function optionalString(value: unknown): string | null {
  const normalized = `${value ?? ""}`.trim();
  return normalized ? normalized : null;
}

function requiredString(value: unknown, field: string, label: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new Error(`${label} missing required Native UI background field: ${field}`);
  }
  return normalized;
}

function requiredEnum<T extends string>(
  value: unknown,
  field: string,
  label: string,
  allowed: readonly T[],
): T {
  const normalized = requiredString(value, field, label);
  if (!allowed.includes(normalized as T)) {
    throw new Error(`${label} uses unsupported Native UI background ${field}: ${normalized}`);
  }
  return normalized as T;
}

function requiredPositiveNumber(value: unknown, field: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} has invalid Native UI background field ${field}: ${String(value)}`);
  }
  return parsed;
}

function requiredNonNegativeNumber(value: unknown, field: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} has invalid Native UI background field ${field}: ${String(value)}`);
  }
  return parsed;
}

function requiredObject(value: unknown, field: string, label: string): NativeUiBackgroundSource {
  const record = asRecord(value);
  if (!record) {
    throw new Error(`${label} missing required Native UI background object: ${field}`);
  }
  return record;
}

function isNativeUiBackgroundContract(value: unknown): value is NativeUiBackgroundContract {
  const record = asRecord(value);
  return Boolean(
    record
    && typeof record.status === "string"
    && typeof record.kind === "string"
    && typeof record.coordinateSpace === "string"
    && typeof record.scaleMode === "string"
    && typeof record.anchor === "string"
    && typeof record.width === "number"
    && typeof record.height === "number"
    && typeof record.yShift === "number"
    && typeof record.scaling === "string"
    && asRecord(record.texture)
    && asRecord(record.targetRect)
  );
}

function resolveTexture(background: NativeUiBackgroundSource, label: string): NativeUiBackgroundTextureSpec {
  const texture = requiredObject(background.texture, "texture", label);
  return {
    width: requiredPositiveNumber(texture.width, "texture.width", label),
    height: requiredPositiveNumber(texture.height, "texture.height", label),
    borderU: requiredNonNegativeNumber(texture.borderU, "texture.borderU", label),
    borderV: requiredNonNegativeNumber(texture.borderV, "texture.borderV", label),
  };
}

function resolveTargetRect(
  background: NativeUiBackgroundSource,
  surfaceWidth: number,
  surfaceHeight: number,
  label: string,
): NativeUiBackgroundTargetRect {
  const offset = requiredObject(background.recipeBackgroundOffset, "recipeBackgroundOffset", label);
  const size = requiredObject(background.recipeBackgroundSize, "recipeBackgroundSize", label);
  const target = {
    x: requiredNonNegativeNumber(offset.x, "recipeBackgroundOffset.x", label),
    y: requiredNonNegativeNumber(offset.y, "recipeBackgroundOffset.y", label),
    width: requiredPositiveNumber(size.width, "recipeBackgroundSize.width", label),
    height: requiredPositiveNumber(size.height, "recipeBackgroundSize.height", label),
  };
  if (target.x + target.width > surfaceWidth || target.y + target.height > surfaceHeight) {
    throw new Error(
      `${label} Native UI background target exceeds surface: `
      + `${target.x},${target.y} ${target.width}x${target.height} > ${surfaceWidth}x${surfaceHeight}`,
    );
  }
  return target;
}

export function resolveNativeUiBackgroundContract(
  layout: NativeUiBackgroundLayoutSource | null | undefined,
  label = "Native UI background",
): NativeUiBackgroundContract | null {
  if (isNativeUiBackgroundContract(layout?.nativeBackground)) {
    return layout.nativeBackground;
  }

  const background = asRecord(layout?.nativeBackground);
  if (!background) return null;

  const status = requiredEnum<NativeUiBackgroundStatus>(
    background.status,
    "status",
    label,
    ["captured", "semantic"],
  );
  const kind = requiredEnum<NativeUiBackgroundKind>(
    background.kind,
    "kind",
    label,
    NATIVE_UI_BACKGROUND_KINDS,
  );
  const coordinateSpace = requiredEnum(
    background.coordinateSpace,
    "coordinateSpace",
    label,
    [NATIVE_UI_COORDINATE_SPACE],
  );
  const scaleMode = requiredEnum(
    background.scaleMode,
    "scaleMode",
    label,
    [NATIVE_UI_SCALE_MODE],
  );
  const anchor = requiredEnum(
    background.anchor,
    "anchor",
    label,
    [NATIVE_UI_ANCHOR],
  );
  const surfaceWidth = requiredPositiveNumber(background.width ?? layout?.width, "width", label);
  const surfaceHeight = requiredPositiveNumber(background.height ?? layout?.height, "height", label);
  const scaling = requiredEnum(
    background.scaling,
    "scaling",
    label,
    [NATIVE_UI_BACKGROUND_SCALING_NINE_SLICE],
  );
  const texture = resolveTexture(background, label);
  const targetRect = resolveTargetRect(background, surfaceWidth, surfaceHeight, label);
  const assetRef = optionalString(background.assetRef);
  if (status === "captured" && !assetRef) {
    throw new Error(`${label} captured background requires assetRef`);
  }

  return {
    status,
    kind,
    coordinateSpace,
    scaleMode,
    anchor,
    width: surfaceWidth,
    height: surfaceHeight,
    yShift: requiredNonNegativeNumber(background.yShift ?? 0, "yShift", label),
    assetRef,
    resource: optionalString(background.resource),
    source: optionalString(background.source),
    drawable: optionalString(background.drawable),
    scaling,
    texture,
    targetRect,
  };
}
