import type { NativeUiRect, NativeUiSlotCell, NativeUiTextOverlay } from "./nativeUiRuntimeRegistry.ts";

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
  cell: Pick<NativeUiSlotCell<TEntry>, "x" | "y">,
  slotSize: number,
): NativeUiBoxStyle {
  const size = nonNegativeNumber(slotSize) || 1;
  return {
    left: px(cell.x),
    top: px(cell.y),
    width: `${size}px`,
    height: `${size}px`,
  };
}

export function nativeUiTextOverlayStyle(overlay: Partial<NativeUiTextOverlay>): NativeUiBoxStyle {
  return {
    left: px(overlay.x),
    top: px(overlay.y),
    width: px(overlay.width),
    height: px(overlay.height),
  };
}

export function nativeUiRectStyle(rect: Partial<NativeUiRect>): NativeUiBoxStyle {
  return {
    left: px(rect.x),
    top: px(rect.y),
    width: px(rect.width),
    height: px(rect.height),
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
      key: cell.key,
      role: cell.role,
      x: cell.x,
      y: cell.y,
      entry: cell.entry as NonNullable<TEntry>,
    });
  }
  return hitCells;
}
