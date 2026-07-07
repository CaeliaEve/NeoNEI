import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend.ts";
import type { NativeUiDynamicPrimitive, NativeUiSlotCell } from "./nativeUiRuntimeRegistry.ts";
import {
  createNativeUiCanonicalNeiBackgroundTexture,
  createNativeUiDynamicPrimitiveTexture,
  createNativeUiGtModularBackgroundTexture,
  createNativeUiSlotTexture,
  createNativeUiSolidColorTexture,
  nativeUiDynamicPrimitiveColors,
  nativeUiDynamicPrimitiveTextureKey,
  nativeUiDynamicPrimitiveTextureVariant,
  nativeUiSlotTextureKey,
  nativeUiSolidTextureKey,
  nativeUiTextureKindForRole,
  normalizeNativeUiDpr,
  type NativeUiSlotTextureKind,
} from "./nativeUiRenderResourceCatalog.ts";

export {
  createNativeUiCanonicalNeiBackgroundTexture,
  createNativeUiDynamicPrimitiveTexture,
  createNativeUiGtModularBackgroundTexture,
  createNativeUiSlotTexture,
  createNativeUiSolidColorTexture,
  nativeUiDynamicPrimitiveTextureKey,
  nativeUiDynamicPrimitiveTextureVariant,
  nativeUiSlotTextureKey,
  nativeUiTextureKindForRole,
  type NativeUiSlotTextureKind,
} from "./nativeUiRenderResourceCatalog.ts";

type CanvasSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

function assertNativeUiTextureRegistered(registered: boolean, key: string): void {
  if (!registered) {
    throw new Error(`Native UI texture registration failed: ${key}`);
  }
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

  registerSlotTextures<TEntry>(
    renderer: NativeRendererBackend,
    dprValue: number,
    slotCells: readonly Pick<NativeUiSlotCell<TEntry>, "role" | "width" | "height">[],
  ): void {
    const dpr = normalizeNativeUiDpr(dprValue);
    const slotsByKey = new Map<string, { kind: NativeUiSlotTextureKind; width: number; height: number }>();
    for (const cell of slotCells) {
      const width = Math.max(1, Number(cell.width));
      const height = Math.max(1, Number(cell.height));
      const kind = nativeUiTextureKindForRole(cell.role);
      slotsByKey.set(nativeUiSlotTextureKey(cell.role, dpr, width, height), { kind, width, height });
    }
    for (const [key, slot] of slotsByKey) {
      assertNativeUiTextureRegistered(
        this.register(renderer, key, createNativeUiSlotTexture(slot.kind, dpr, slot.width, slot.height)),
        key,
      );
    }
  }

  registerSolidTexture(renderer: NativeRendererBackend, color: string): void {
    const key = nativeUiSolidTextureKey(color);
    assertNativeUiTextureRegistered(
      this.register(renderer, key, createNativeUiSolidColorTexture(color)),
      key,
    );
  }

  registerDynamicPrimitiveTextures(
    renderer: NativeRendererBackend,
    dprValue: number,
    primitives: readonly NativeUiDynamicPrimitive[],
  ): void {
    const dpr = normalizeNativeUiDpr(dprValue);
    for (const primitive of primitives) {
      const variant = nativeUiDynamicPrimitiveTextureVariant(primitive);
      const textureKey = nativeUiDynamicPrimitiveTextureKey(primitive, dpr);
      if (variant && textureKey) {
        assertNativeUiTextureRegistered(
          this.register(renderer, textureKey, createNativeUiDynamicPrimitiveTexture(variant, dpr)),
          textureKey,
        );
        continue;
      }
      for (const color of nativeUiDynamicPrimitiveColors(primitive)) {
        this.registerSolidTexture(renderer, color);
      }
    }
  }
}
