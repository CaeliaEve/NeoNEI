import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend.ts";
import type { NativeUiDynamicPrimitive } from "./nativeUiRuntimeRegistry.ts";
import {
  nativeUiDynamicPrimitiveColors,
  nativeUiSolidTextureKey,
} from "./nativeUiRenderCommandBuilder.ts";

export type NativeUiSlotTextureKind = "item-input" | "item-output" | "fluid-input" | "fluid-output";

type CanvasSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

export function nativeUiTextureKindForRole(role: string): NativeUiSlotTextureKind {
  const normalized = role.toLowerCase();
  if (normalized.includes("fluid") && normalized.includes("output")) return "fluid-output";
  if (normalized.includes("fluid")) return "fluid-input";
  if (normalized.includes("output")) return "item-output";
  return "item-input";
}

export function nativeUiSlotTextureKey(role: string, dpr: number): string {
  return `recipe-slot:${nativeUiTextureKindForRole(role)}:${dpr}`;
}

function normalizedDpr(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function createNativeUiSlotTexture(kind: NativeUiSlotTextureKind, dprValue: number, slotSize = 18): HTMLCanvasElement {
  const dpr = normalizedDpr(dprValue);
  const canvas = createCanvas(slotSize * dpr, slotSize * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const accent = kind.includes("fluid")
    ? "rgba(90, 203, 255, 0.62)"
    : kind.includes("output")
      ? "rgba(248, 181, 92, 0.66)"
      : "rgba(160, 178, 198, 0.34)";
  const fill = kind.includes("fluid")
    ? "rgba(10, 25, 38, 0.92)"
    : "rgba(13, 18, 25, 0.94)";
  drawRoundedRect(ctx, 1, 1, slotSize - 2, slotSize - 2, 4);
  ctx.fillStyle = fill;
  ctx.fill();
  const gradient = ctx.createLinearGradient(0, 0, slotSize, slotSize);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.09)");
  gradient.addColorStop(0.52, "rgba(255, 255, 255, 0.015)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.26)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = accent;
  ctx.stroke();
  if (kind.includes("fluid")) {
    ctx.fillStyle = "rgba(90, 203, 255, 0.18)";
    drawRoundedRect(ctx, 4, 5, 3, slotSize - 10, 1.5);
    ctx.fill();
  }
  if (kind.includes("output")) {
    ctx.fillStyle = "rgba(248, 181, 92, 0.16)";
    drawRoundedRect(ctx, slotSize - 7, 5, 3, slotSize - 10, 1.5);
    ctx.fill();
  }
  return canvas;
}

export function createNativeUiSolidColorTexture(color: string): HTMLCanvasElement {
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return canvas;
}

export function createNativeUiGtModularBackgroundTexture(width: number, height: number, dprValue: number): HTMLCanvasElement {
  const dpr = normalizedDpr(dprValue);
  const logicalWidth = Math.max(1, Math.round(width));
  const logicalHeight = Math.max(1, Math.round(height));
  const canvas = createCanvas(logicalWidth * dpr, logicalHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "#0f1115";
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  const panelX = 3;
  const panelY = 3;
  const panelWidth = Math.max(1, logicalWidth - 6);
  const panelHeight = Math.max(1, logicalHeight - 6);
  const gradient = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight);
  gradient.addColorStop(0, "#4b4f55");
  gradient.addColorStop(0.48, "#34383e");
  gradient.addColorStop(1, "#24282e");
  ctx.fillStyle = gradient;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);

  ctx.strokeStyle = "#8f969f";
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);
  ctx.strokeStyle = "#171a1f";
  ctx.strokeRect(panelX + 1.5, panelY + 1.5, panelWidth - 3, panelHeight - 3);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(panelX + 2, panelY + 2, Math.max(0, panelWidth - 4), 1);
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.fillRect(panelX + 2, panelY + panelHeight - 3, Math.max(0, panelWidth - 4), 1);
  return canvas;
}

export class NativeUiTextureRegistry {
  private readonly registeredTextureKeys = new Set<string>();

  clear(): void {
    this.registeredTextureKeys.clear();
  }

  has(key: string): boolean {
    return this.registeredTextureKeys.has(key);
  }

  register(renderer: NativeRendererBackend, key: string, source: CanvasSource): boolean {
    if (!key) return false;
    if (this.registeredTextureKeys.has(key)) return true;
    if (renderer.registerTexture(key, source)) {
      this.registeredTextureKeys.add(key);
      return true;
    }
    return false;
  }

  registerSlotTextures(renderer: NativeRendererBackend, dprValue: number, slotSize = 18): void {
    const dpr = normalizedDpr(dprValue);
    const kinds: NativeUiSlotTextureKind[] = ["item-input", "item-output", "fluid-input", "fluid-output"];
    for (const kind of kinds) {
      this.register(renderer, `recipe-slot:${kind}:${dpr}`, createNativeUiSlotTexture(kind, dpr, slotSize));
    }
  }

  registerSolidTexture(renderer: NativeRendererBackend, color: string): void {
    this.register(renderer, nativeUiSolidTextureKey(color), createNativeUiSolidColorTexture(color));
  }

  registerDynamicPrimitiveTextures(
    renderer: NativeRendererBackend,
    primitives: readonly NativeUiDynamicPrimitive[],
  ): void {
    for (const primitive of primitives) {
      for (const color of nativeUiDynamicPrimitiveColors(primitive)) {
        this.registerSolidTexture(renderer, color);
      }
    }
  }
}
