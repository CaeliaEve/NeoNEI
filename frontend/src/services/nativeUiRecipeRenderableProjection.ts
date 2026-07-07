import type { FluidStack, Recipe, RecipeItem } from "./api";

export interface NativeUiRecipeRenderable {
  kind: "item" | "fluid";
  itemId: string;
  atlasLookupId: string;
  count: number;
  localizedName?: string | null;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
  extraLines?: string[];
}

export interface NativeUiRecipeRenderableSets {
  inputItems: NativeUiRecipeRenderable[];
  outputItems: NativeUiRecipeRenderable[];
  inputFluids: NativeUiRecipeRenderable[];
  outputFluids: NativeUiRecipeRenderable[];
}

export function nativeUiRenderAssetLookupId(renderAssetRef?: string | null): string | null {
  const normalized = `${renderAssetRef ?? ""}`.trim();
  const match = normalized.match(/^nesqlpp:(?:item|fluid)\/(.+)$/);
  return match?.[1]?.trim() || null;
}

export function nativeUiAtlasLookupId(itemId?: string | null, renderAssetRef?: string | null): string {
  const direct = `${itemId ?? ""}`.trim();
  if (direct) return direct;
  return nativeUiRenderAssetLookupId(renderAssetRef) ?? "";
}

export function toNativeUiItemRenderable(item: RecipeItem): NativeUiRecipeRenderable {
  const renderAssetRef = `${item.renderAssetRef ?? ""}`.trim() || null;
  const atlasLookupId = nativeUiAtlasLookupId(item.itemId, renderAssetRef);
  return {
    kind: "item",
    itemId: item.itemId,
    atlasLookupId: atlasLookupId || item.itemId,
    count: Math.max(1, Number(item.count ?? 1) || 1),
    localizedName: item.localizedName ?? null,
    renderAssetRef,
    imageFileName: item.imageFileName ?? null,
  };
}

export function toNativeUiFluidRenderable(stack: FluidStack): NativeUiRecipeRenderable {
  const renderAssetRef = `${stack.fluid.renderAssetRef ?? ""}`.trim() || null;
  const atlasLookupId = nativeUiAtlasLookupId("", renderAssetRef) || `${stack.fluid.fluidId ?? ""}`.trim();
  const itemId = atlasLookupId || `${stack.fluid.fluidId ?? stack.fluid.internalName ?? ""}`.trim();
  const amount = Math.max(0, Number(stack.amount ?? 0) || 0);
  return {
    kind: "fluid",
    itemId,
    atlasLookupId: itemId,
    count: Math.max(1, Number(stack.amount ?? 0) || 1),
    localizedName: stack.fluid.localizedName ?? stack.fluid.internalName ?? itemId,
    renderAssetRef,
    imageFileName: null,
    extraLines: [`${amount} mB`],
  };
}

export function projectNativeUiRecipeRenderables(recipe: Recipe): NativeUiRecipeRenderableSets {
  const inputItems: NativeUiRecipeRenderable[] = [];
  for (const row of recipe.inputs ?? []) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const item = Array.isArray(cell) ? cell[0] : cell;
      if (item?.itemId) inputItems.push(toNativeUiItemRenderable(item));
    }
  }

  const outputItems = (recipe.outputs ?? [])
    .filter((item): item is RecipeItem => Boolean(item?.itemId))
    .map(toNativeUiItemRenderable);

  const inputFluids = [...(recipe.fluidInputs ?? [])]
    .sort((left, right) => Number(left.slotIndex ?? 0) - Number(right.slotIndex ?? 0))
    .map((group) => group.fluids?.[0] ?? null)
    .filter((entry): entry is FluidStack => Boolean(entry?.fluid))
    .map(toNativeUiFluidRenderable);

  const outputFluids = (recipe.fluidOutputs ?? [])
    .filter((entry): entry is FluidStack => Boolean(entry?.fluid))
    .map(toNativeUiFluidRenderable);

  return {
    inputItems,
    outputItems,
    inputFluids,
    outputFluids,
  };
}

export function resolveNativeUiRenderablesForRole(
  role: string | undefined,
  renderables: NativeUiRecipeRenderableSets,
): NativeUiRecipeRenderable[] {
  const normalized = `${role ?? ""}`.toLowerCase();
  if (normalized.includes("fuel")) return [];
  if (normalized.includes("fluid")) {
    return normalized.includes("output") ? renderables.outputFluids : renderables.inputFluids;
  }
  if (normalized.includes("output")) return renderables.outputItems;
  return renderables.inputItems;
}
