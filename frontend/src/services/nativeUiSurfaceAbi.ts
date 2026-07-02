import {
  NATIVE_UI_ANCHOR,
  NATIVE_UI_COORDINATE_SPACE,
} from "./nativeUiGeometryAbi.ts";
import { NATIVE_UI_SCALE_MODE } from "./nativeUiBackgroundAbi.ts";

export interface NativeUiSurfaceContract {
  width: number;
  height: number;
  coordinateSpace: typeof NATIVE_UI_COORDINATE_SPACE;
  scaleMode: typeof NATIVE_UI_SCALE_MODE;
  anchor: typeof NATIVE_UI_ANCHOR;
}

type NativeUiSurfaceSource = {
  width?: unknown;
  height?: unknown;
  coordinateSpace?: unknown;
  scaleMode?: unknown;
  anchor?: unknown;
};

function requiredString(value: unknown, field: string, label: string): string {
  const normalized = `${value ?? ""}`.trim();
  if (!normalized) {
    throw new Error(`${label} missing required Native UI surface field: ${field}`);
  }
  return normalized;
}

function requiredPositiveNumber(value: unknown, field: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} has invalid Native UI surface field ${field}: ${String(value)}`);
  }
  return parsed;
}

export function resolveNativeUiSurfaceContract(
  surface: NativeUiSurfaceSource,
  label = "Native UI surface",
): NativeUiSurfaceContract {
  const coordinateSpace = requiredString(surface.coordinateSpace, "coordinateSpace", label);
  if (coordinateSpace !== NATIVE_UI_COORDINATE_SPACE) {
    throw new Error(`${label} uses unsupported Native UI coordinateSpace: ${coordinateSpace}`);
  }
  const scaleMode = requiredString(surface.scaleMode, "scaleMode", label);
  if (scaleMode !== NATIVE_UI_SCALE_MODE) {
    throw new Error(`${label} uses unsupported Native UI scaleMode: ${scaleMode}`);
  }
  const anchor = requiredString(surface.anchor, "anchor", label);
  if (anchor !== NATIVE_UI_ANCHOR) {
    throw new Error(`${label} uses unsupported Native UI anchor: ${anchor}`);
  }
  return {
    width: requiredPositiveNumber(surface.width, "width", label),
    height: requiredPositiveNumber(surface.height, "height", label),
    coordinateSpace: NATIVE_UI_COORDINATE_SPACE,
    scaleMode: NATIVE_UI_SCALE_MODE,
    anchor: NATIVE_UI_ANCHOR,
  };
}
