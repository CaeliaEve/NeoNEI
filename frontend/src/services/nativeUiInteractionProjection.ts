import type { NativeUiRect, NativeUiSlotCell, NativeUiTextOverlay } from "./nativeUiRuntimeRegistry.ts";
import { resolveNativeUiRectGeometry } from "./nativeUiGeometryAbi.ts";
import {
  NATIVE_UI_INTERACTION_KIND_ITEM_CLICK,
  resolveNativeUiInteractionPayload,
} from "./nativeUiInteractionAbi.ts";

export interface NativeUiBoxStyle {
  left: string;
  top: string;
  width: string;
  height: string;
  [key: `--${string}`]: string | number | undefined;
}

export type NativeUiHitCell<TEntry> = Omit<NativeUiSlotCell<TEntry>, "entry"> & {
  entry: NonNullable<TEntry>;
};

type NativeUiLabeledRect = Partial<Pick<NativeUiRect, "label" | "tooltip" | "role" | "kind" | "id">>;
type NativeUiHotspotRect = Partial<Pick<
  NativeUiRect,
  "interactionKind" | "interactionTargetKind" | "interactionTargetId" | "interactionPayloadSchema"
>>;
type NativeUiLabeledEntry = {
  localizedName?: string | null;
  itemId?: string | null;
  count?: number | null;
};

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function px(value: unknown): string {
  return `${nonNegativeNumber(value)}px`;
}

export function nativeUiSlotCellStyle<TEntry>(
  cell: Pick<NativeUiSlotCell<TEntry>, "x" | "y" | "width" | "height">,
): NativeUiBoxStyle {
  return {
    left: px(cell.x),
    top: px(cell.y),
    width: px(cell.width),
    height: px(cell.height),
  };
}

export function nativeUiTextOverlayStyle(overlay: NativeUiTextOverlay): NativeUiBoxStyle {
  const geometry = resolveNativeUiRectGeometry(overlay, "Native UI text overlay style");
  return {
    left: px(geometry.x),
    top: px(geometry.y),
    width: px(geometry.width),
    height: px(geometry.height),
  };
}

export function nativeUiRectStyle(rect: NativeUiRect): NativeUiBoxStyle {
  const geometry = resolveNativeUiRectGeometry(rect, "Native UI rect style");
  return {
    left: px(geometry.x),
    top: px(geometry.y),
    width: px(geometry.width),
    height: px(geometry.height),
  };
}

export function nativeUiRectLabel(rect: NativeUiLabeledRect, defaultLabel: string): string {
  for (const value of [rect.label, rect.tooltip, rect.role, rect.kind, rect.id]) {
    const normalized = `${value ?? ""}`.trim();
    if (normalized) return normalized;
  }
  return defaultLabel;
}

export function nativeUiHotspotInteractionKind(rect: NativeUiHotspotRect): string {
  return resolveNativeUiInteractionPayload(rect, "Native UI hotspot").kind;
}

export function nativeUiHotspotItemId(rect: NativeUiHotspotRect): string | null {
  const interaction = resolveNativeUiInteractionPayload(rect, "Native UI hotspot");
  if (interaction.kind !== NATIVE_UI_INTERACTION_KIND_ITEM_CLICK) return null;
  return interaction.targetId;
}

export function isNativeUiHotspotInteractive(rect: NativeUiHotspotRect): boolean {
  return nativeUiHotspotItemId(rect) !== null;
}

export function nativeUiHitCellEntryLabel(entry: NativeUiLabeledEntry): string {
  const base = `${entry.localizedName || entry.itemId || ""}`.trim();
  const count = Math.max(1, Number(entry.count ?? 1) || 1);
  return count > 1 && base ? `${base} x${count}` : base;
}

export function projectNativeUiHitCells<TEntry>(
  cells: readonly NativeUiSlotCell<TEntry>[],
): NativeUiHitCell<TEntry>[] {
  const hitCells: NativeUiHitCell<TEntry>[] = [];
  for (const cell of cells) {
    if (cell.entry == null) continue;
    hitCells.push({
      ...cell,
      key: cell.key,
      role: cell.role,
      x: cell.x,
      y: cell.y,
      entry: cell.entry as NonNullable<TEntry>,
    });
  }
  return hitCells;
}
