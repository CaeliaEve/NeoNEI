type NativeLayoutRendererPolicy = 'static-layout' | 'dynamic-primitives';

type NativeLayoutRendererDescriptor = Readonly<{
  componentName: string;
  policy: NativeLayoutRendererPolicy;
}>;

const NATIVE_LAYOUT_RENDERER_DESCRIPTORS: readonly NativeLayoutRendererDescriptor[] = validateNativeLayoutRendererDescriptors([
  // Crafting / workbench style
  { componentName: 'StandardCraftingUI', policy: 'static-layout' },
  { componentName: 'AvaritiaExtremeCraftingUI', policy: 'static-layout' },
  { componentName: 'FurnaceUI', policy: 'static-layout' },
  // Static ritual / altar style
  { componentName: 'BotaniaPoolUI', policy: 'static-layout' },
  { componentName: 'BotaniaRuneAltarUI', policy: 'static-layout' },
  { componentName: 'BotaniaPureDaisyUI', policy: 'static-layout' },
  { componentName: 'BotaniaTerraPlateUI', policy: 'static-layout' },
  { componentName: 'BotaniaElvenTradeUI', policy: 'static-layout' },
  { componentName: 'ThaumcraftArcaneUI', policy: 'static-layout' },
  { componentName: 'ThaumcraftCrucibleUI', policy: 'static-layout' },
  { componentName: 'ThaumcraftAspectUI', policy: 'static-layout' },
  { componentName: 'ThaumcraftResearchUI', policy: 'static-layout' },
  { componentName: 'BloodMagicAltarUI', policy: 'static-layout' },
  { componentName: 'BloodAlchemyTableUI', policy: 'static-layout' },
  { componentName: 'BloodBindingRitualUI', policy: 'static-layout' },
  { componentName: 'BloodOrbCraftingUI', policy: 'static-layout' },
  { componentName: 'MultiblockBlueprintUI', policy: 'static-layout' },
  // Static metadata / document style
  { componentName: 'GTResearchStationUI', policy: 'static-layout' },
  // Dynamic machine canvases require native dynamic draw primitives.
  { componentName: 'GTUniversalMachineUI', policy: 'dynamic-primitives' },
  { componentName: 'GTAssemblyLineUI', policy: 'dynamic-primitives' },
  { componentName: 'GTChemicalReactorUI', policy: 'dynamic-primitives' },
]);

function validateNativeLayoutRendererDescriptors(
  descriptors: readonly NativeLayoutRendererDescriptor[],
): readonly NativeLayoutRendererDescriptor[] {
  const seenComponents = new Set<string>();
  for (const descriptor of descriptors) {
    if (!descriptor.componentName) {
      throw new Error('Native layout renderer descriptor must declare a componentName');
    }
    if (!seenComponents.add(descriptor.componentName)) {
      throw new Error(`Duplicate native layout renderer descriptor: ${descriptor.componentName}`);
    }
    if (descriptor.policy !== 'static-layout' && descriptor.policy !== 'dynamic-primitives') {
      throw new Error(`Invalid native layout renderer policy for ${descriptor.componentName}: ${descriptor.policy}`);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

export const NATIVE_LAYOUT_RENDERER_COMPONENTS = new Set(
  NATIVE_LAYOUT_RENDERER_DESCRIPTORS
    .filter((descriptor) => descriptor.policy === 'static-layout')
    .map((descriptor) => descriptor.componentName),
);

export const NATIVE_LAYOUT_DYNAMIC_RENDERER_COMPONENTS = new Set(
  NATIVE_LAYOUT_RENDERER_DESCRIPTORS
    .filter((descriptor) => descriptor.policy === 'dynamic-primitives')
    .map((descriptor) => descriptor.componentName),
);

const NATIVE_LAYOUT_RENDERER_DESCRIPTOR_BY_COMPONENT = new Map(
  NATIVE_LAYOUT_RENDERER_DESCRIPTORS.map((descriptor) => [descriptor.componentName, descriptor]),
);

function hasDrawableNativePrimitive(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const candidate = entry as Record<string, unknown>;
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    return Number.isFinite(width) && width > 0
      && Number.isFinite(height) && height > 0;
  });
}

export function hasNativeDynamicPrimitives(layout: unknown): boolean {
  if (!layout || typeof layout !== 'object') {
    return false;
  }
  const candidate = layout as Record<string, unknown>;
  return hasDrawableNativePrimitive(candidate.dynamicPrimitives)
    || hasDrawableNativePrimitive(candidate.progressBars)
    || hasDrawableNativePrimitive(candidate.fluidBars)
    || hasDrawableNativePrimitive(candidate.energyBars);
}

function hasCapturedNativeBackground(layout: unknown): boolean {
  if (!layout || typeof layout !== 'object') {
    return false;
  }
  const nativeBackground = (layout as Record<string, unknown>).nativeBackground;
  if (!nativeBackground || typeof nativeBackground !== 'object') {
    return false;
  }
  const candidate = nativeBackground as Record<string, unknown>;
  const status = `${candidate.status ?? ''}`.trim().toLowerCase();
  const assetRef = `${candidate.assetRef ?? ''}`.trim();
  return status === 'captured' && assetRef.length > 0;
}

export function isNativeLayoutRendererEligible(componentName: string, layout?: unknown): boolean {
  const descriptor = NATIVE_LAYOUT_RENDERER_DESCRIPTOR_BY_COMPONENT.get(componentName);
  if (!descriptor) {
    return false;
  }
  if (descriptor.policy === 'static-layout') {
    return true;
  }
  return hasNativeDynamicPrimitives(layout) || hasCapturedNativeBackground(layout);
}

export const NATIVE_LAYOUT_RENDERER_POLICY_CATALOG = Object.freeze({
  abi: 'neonei.native-layout-renderer-policy.v1',
  descriptors: NATIVE_LAYOUT_RENDERER_DESCRIPTORS,
});
