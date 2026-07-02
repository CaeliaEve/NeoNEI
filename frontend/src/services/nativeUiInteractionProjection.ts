import type { NativeUiRect, NativeUiSlotCell, NativeUiTextOverlay } from "./nativeUiRuntimeRegistry.ts";
import { resolveNativeUiRectGeometry } from "./nativeUiGeometryAbi.ts";

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
type NativeUiHotspotRect = Partial<Pick<NativeUiRect, "action" | "kind" | "role" | "itemId">>;
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

export function nativeUiRectLabel(rect: NativeUiLabeledRect, fallback: string): string {
  for (const value of [rect.label, rect.tooltip, rect.role, rect.kind, rect.id]) {
    const normalized = `${value ?? ""}`.trim();
    if (normalized) return normalized;
  }
  return fallback;
}

export function nativeUiHotspotAction(rect: NativeUiHotspotRect): string {
  return `${rect.action ?? rect.kind ?? rect.role ?? ""}`.trim().toLowerCase();
}

export function nativeUiHotspotItemId(rect: NativeUiHotspotRect): string | null {
  const itemId = `${rect.itemId ?? ""}`.trim();
  if (!itemId || nativeUiHotspotAction(rect) !== "item-click") return null;
  return itemId;
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
