export const NATIVE_RUNTIME_CATALOG_ABI = Object.freeze({
  schema: "neonei/native-runtime-catalog/current",
  buildPolicy: "descriptor-table-runtime-abi-projection",
  failurePolicy: "fail-closed-native-runtime-abi",
  snapshotPolicy: "rcu-immutable-catalog-snapshot",
} as const);

type NativeRuntimePackCategory =
  | "surface-index"
  | "semantic-index"
  | "lookup-index"
  | "render-asset"
  | "localized-string";

type NativeRuntimePackDescriptorInput = Readonly<{
  name: string;
  schema: string;
  category: NativeRuntimePackCategory;
}>;

type NativeRuntimeUiPackDescriptorInput = Readonly<{
  name: string;
  schema: string;
  required: boolean;
}>;

type NativeRuntimeCapabilityDescriptorInput = Readonly<{
  name: string;
  domain: string;
  requiredForNativeUi?: boolean;
}>;

type NativeRuntimeProfileDescriptorInput = Readonly<{
  profile: string;
  packs: readonly NativeRuntimePackCatalogName[];
  capabilities: readonly NativeRuntimeCapabilityCatalogName[];
}>;

function defineNativeRuntimePack<const Descriptor extends NativeRuntimePackDescriptorInput>(
  descriptor: Descriptor,
): Descriptor {
  return Object.freeze({ ...descriptor }) as Descriptor;
}

function defineNativeRuntimeUiPack<const Descriptor extends NativeRuntimeUiPackDescriptorInput>(
  descriptor: Descriptor,
): Descriptor {
  return Object.freeze({ ...descriptor }) as Descriptor;
}

function defineNativeRuntimeCapability<const Descriptor extends NativeRuntimeCapabilityDescriptorInput>(
  descriptor: Descriptor,
): Descriptor {
  return Object.freeze({ ...descriptor }) as Descriptor;
}

function defineNativeRuntimeProfile<const Descriptor extends NativeRuntimeProfileDescriptorInput>(
  descriptor: Descriptor,
): Descriptor {
  return Object.freeze({
    ...descriptor,
    packs: freezeTuple(descriptor.packs),
    capabilities: freezeTuple(descriptor.capabilities),
  }) as Descriptor;
}

function freezeTuple<const Values extends readonly unknown[]>(values: Values): Values {
  return Object.freeze([...values]) as unknown as Values;
}

function validateRuntimePackDescriptors<const Descriptors extends readonly NativeRuntimePackDescriptorInput[]>(
  descriptors: Descriptors,
): Descriptors {
  requireNonEmptyCatalog("native runtime pack", descriptors);
  const names = new Set<string>();
  const schemas = new Set<string>();
  for (const descriptor of descriptors) {
    requireNonEmptyString("native runtime pack name", descriptor.name);
    requireSchemaString("native runtime pack schema", descriptor.schema);
    requireNonEmptyString("native runtime pack category", descriptor.category);
    requireUnique(names, descriptor.name, "native runtime pack name");
    requireUnique(schemas, descriptor.schema, "native runtime pack schema");
  }
  return freezeTuple(descriptors);
}

function validateRuntimeUiPackDescriptors<const Descriptors extends readonly NativeRuntimeUiPackDescriptorInput[]>(
  descriptors: Descriptors,
): Descriptors {
  requireNonEmptyCatalog("native UI runtime pack", descriptors);
  const names = new Set<string>();
  const schemas = new Set<string>();
  for (const descriptor of descriptors) {
    requireNonEmptyString("native UI runtime pack name", descriptor.name);
    requireSchemaString("native UI runtime pack schema", descriptor.schema);
    requireUnique(names, descriptor.name, "native UI runtime pack name");
    requireUnique(schemas, descriptor.schema, "native UI runtime pack schema");
  }
  if (!descriptors.some((descriptor) => descriptor.required)) {
    throw new Error("native UI runtime pack catalog must declare required entrypoints");
  }
  return freezeTuple(descriptors);
}

function validateRuntimeCapabilityDescriptors<const Descriptors extends readonly NativeRuntimeCapabilityDescriptorInput[]>(
  descriptors: Descriptors,
): Descriptors {
  requireNonEmptyCatalog("native runtime capability", descriptors);
  const names = new Set<string>();
  for (const descriptor of descriptors) {
    requireNonEmptyString("native runtime capability name", descriptor.name);
    requireNonEmptyString("native runtime capability domain", descriptor.domain);
    requireUnique(names, descriptor.name, "native runtime capability name");
  }
  return freezeTuple(descriptors);
}

function validateRuntimeProfileDescriptors<const Descriptors extends readonly NativeRuntimeProfileDescriptorInput[]>(
  descriptors: Descriptors,
): Descriptors {
  requireNonEmptyCatalog("native runtime profile", descriptors);
  const profiles = new Set<string>();
  const packNames = new Set<string>(NATIVE_RUNTIME_PACK_NAMES);
  const capabilityNames = new Set<string>(NATIVE_RUNTIME_CAPABILITIES);
  for (const descriptor of descriptors) {
    requireNonEmptyString("native runtime profile", descriptor.profile);
    requireUnique(profiles, descriptor.profile, "native runtime profile");
    requireNonEmptyCatalog(`native runtime profile ${descriptor.profile} packs`, descriptor.packs);
    for (const packName of descriptor.packs) {
      if (!packNames.has(packName)) {
        throw new Error(`native runtime profile ${descriptor.profile} references unknown pack: ${packName}`);
      }
    }
    for (const capability of descriptor.capabilities) {
      if (!capabilityNames.has(capability)) {
        throw new Error(`native runtime profile ${descriptor.profile} references unknown capability: ${capability}`);
      }
    }
  }
  return freezeTuple(descriptors);
}

function projectNames<const Descriptors extends readonly { readonly name: string }[]>(
  descriptors: Descriptors,
): { readonly [Index in keyof Descriptors]: Descriptors[Index] extends { readonly name: infer Name extends string } ? Name : never } {
  return Object.freeze(descriptors.map((descriptor) => descriptor.name)) as unknown as {
    readonly [Index in keyof Descriptors]: Descriptors[Index] extends { readonly name: infer Name extends string } ? Name : never;
  };
}

function projectSchemaMap<const Descriptors extends readonly { readonly name: string; readonly schema: string }[]>(
  descriptors: Descriptors,
): { readonly [Descriptor in Descriptors[number] as Descriptor["name"]]: Descriptor["schema"] } {
  const schemas: Record<string, string> = {};
  for (const descriptor of descriptors) {
    schemas[descriptor.name] = descriptor.schema;
  }
  return Object.freeze(schemas) as {
    readonly [Descriptor in Descriptors[number] as Descriptor["name"]]: Descriptor["schema"];
  };
}

function projectRequiredNames<const Descriptors extends readonly { readonly name: string; readonly required?: boolean }[]>(
  descriptors: Descriptors,
): readonly Descriptors[number]["name"][] {
  return Object.freeze(
    descriptors
      .filter((descriptor) => descriptor.required === true)
      .map((descriptor) => descriptor.name),
  ) as readonly Descriptors[number]["name"][];
}

function projectRequiredCapabilities<
  const Descriptors extends readonly { readonly name: string; readonly requiredForNativeUi?: boolean }[],
>(descriptors: Descriptors): readonly Descriptors[number]["name"][] {
  return Object.freeze(
    descriptors
      .filter((descriptor) => descriptor.requiredForNativeUi === true)
      .map((descriptor) => descriptor.name),
  ) as readonly Descriptors[number]["name"][];
}

function projectProfileMap<const Descriptors extends readonly NativeRuntimeProfileDescriptorInput[]>(
  descriptors: Descriptors,
): { readonly [Descriptor in Descriptors[number] as Descriptor["profile"]]: Descriptor } {
  const policies: Record<string, NativeRuntimeProfileDescriptorInput> = {};
  for (const descriptor of descriptors) {
    policies[descriptor.profile] = descriptor;
  }
  return Object.freeze(policies) as {
    readonly [Descriptor in Descriptors[number] as Descriptor["profile"]]: Descriptor;
  };
}

function requireNonEmptyCatalog(label: string, values: readonly unknown[]): void {
  if (values.length === 0) {
    throw new Error(`${label} catalog must not be empty`);
  }
}

function requireNonEmptyString(label: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
}

function requireSchemaString(label: string, value: string): void {
  requireNonEmptyString(label, value);
  if (!value.includes("/")) {
    throw new Error(`${label} must include a schema namespace: ${value}`);
  }
}

function requireUnique(values: Set<string>, value: string, label: string): void {
  if (values.has(value)) {
    throw new Error(`duplicate ${label}: ${value}`);
  }
  values.add(value);
}

export const NATIVE_RUNTIME_PACK_DESCRIPTOR_LIST = validateRuntimePackDescriptors([
  defineNativeRuntimePack({
    name: "browser",
    schema: "neonei/browser-pack/current",
    category: "surface-index",
  }),
  defineNativeRuntimePack({
    name: "groups",
    schema: "neonei/group-pack/current",
    category: "semantic-index",
  }),
  defineNativeRuntimePack({
    name: "search",
    schema: "neonei/search-pack/current",
    category: "surface-index",
  }),
  defineNativeRuntimePack({
    name: "recipes",
    schema: "neonei/recipe-pack/current",
    category: "lookup-index",
  }),
  defineNativeRuntimePack({
    name: "textures",
    schema: "neonei/texture-pack/current",
    category: "render-asset",
  }),
  defineNativeRuntimePack({
    name: "animations",
    schema: "neonei/animation-pack/current",
    category: "render-asset",
  }),
  defineNativeRuntimePack({
    name: "stringsZhCn",
    schema: "neonei/string-pack/current",
    category: "localized-string",
  }),
] as const);

export const NATIVE_RUNTIME_PACK_NAMES = projectNames(NATIVE_RUNTIME_PACK_DESCRIPTOR_LIST);

export type NativeRuntimePackCatalogName = typeof NATIVE_RUNTIME_PACK_NAMES[number];

export const NATIVE_RUNTIME_PACK_SCHEMAS = projectSchemaMap(NATIVE_RUNTIME_PACK_DESCRIPTOR_LIST);

export type NativeRuntimePackCatalogSchema =
  typeof NATIVE_RUNTIME_PACK_SCHEMAS[keyof typeof NATIVE_RUNTIME_PACK_SCHEMAS];

export const NATIVE_RUNTIME_UI_PACK_DESCRIPTOR_LIST = validateRuntimeUiPackDescriptors([
  defineNativeRuntimeUiPack({
    name: "uiTemplates",
    schema: "neonei/ui-template-pack/current",
    required: true,
  }),
  defineNativeRuntimeUiPack({
    name: "uiBindings",
    schema: "neonei/ui-binding-pack/current",
    required: true,
  }),
  defineNativeRuntimeUiPack({
    name: "uiStrings",
    schema: "neonei/ui-string-pack/current",
    required: true,
  }),
] as const);

export const NATIVE_RUNTIME_UI_PACK_SCHEMAS = projectSchemaMap(NATIVE_RUNTIME_UI_PACK_DESCRIPTOR_LIST);

export type NativeRuntimeUiPackCatalogSchema =
  typeof NATIVE_RUNTIME_UI_PACK_SCHEMAS[keyof typeof NATIVE_RUNTIME_UI_PACK_SCHEMAS];

export const NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS = projectRequiredNames(NATIVE_RUNTIME_UI_PACK_DESCRIPTOR_LIST);

export type NativeUiRuntimeEntrypointCatalogName = typeof NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS[number];

export const NATIVE_RUNTIME_CAPABILITY_DESCRIPTOR_LIST = validateRuntimeCapabilityDescriptors([
  defineNativeRuntimeCapability({ name: "atlas.static", domain: "atlas" }),
  defineNativeRuntimeCapability({ name: "atlas.animated", domain: "atlas" }),
  defineNativeRuntimeCapability({ name: "groups.collapse", domain: "groups" }),
  defineNativeRuntimeCapability({ name: "groups.semantic-nbt", domain: "groups" }),
  defineNativeRuntimeCapability({
    name: "recipes.native-ui-layout",
    domain: "recipes",
    requiredForNativeUi: true,
  }),
  defineNativeRuntimeCapability({ name: "recipes.lookup", domain: "recipes" }),
  defineNativeRuntimeCapability({
    name: "recipes.ui-pack",
    domain: "recipes",
    requiredForNativeUi: true,
  }),
  defineNativeRuntimeCapability({ name: "search.zh-cn", domain: "search" }),
  defineNativeRuntimeCapability({ name: "strings.zh-cn", domain: "strings" }),
  defineNativeRuntimeCapability({ name: "native_ui.surface", domain: "native_ui" }),
  defineNativeRuntimeCapability({ name: "native_ui.design_space_coordinates", domain: "native_ui" }),
  defineNativeRuntimeCapability({ name: "native_ui.semantic_layout", domain: "native_ui" }),
  defineNativeRuntimeCapability({
    name: "native-render.webgl2",
    domain: "native-render",
    requiredForNativeUi: true,
  }),
  defineNativeRuntimeCapability({ name: "native-render.webgpu", domain: "native-render" }),
] as const);

export const NATIVE_RUNTIME_CAPABILITIES = projectNames(NATIVE_RUNTIME_CAPABILITY_DESCRIPTOR_LIST);

export type NativeRuntimeCapabilityCatalogName = typeof NATIVE_RUNTIME_CAPABILITIES[number];

export const NATIVE_RUNTIME_REQUIRED_CAPABILITIES = projectRequiredCapabilities(
  NATIVE_RUNTIME_CAPABILITY_DESCRIPTOR_LIST,
);

export const NATIVE_RUNTIME_PROFILE_POLICY_DESCRIPTOR_LIST = validateRuntimeProfileDescriptors([
  defineNativeRuntimeProfile({
    profile: "browser-surface",
    packs: ["browser", "groups", "search", "textures", "animations", "stringsZhCn"],
    capabilities: ["groups.collapse", "search.zh-cn", "strings.zh-cn", "native-render.webgl2"],
  }),
  defineNativeRuntimeProfile({
    profile: "history-surface",
    packs: ["browser", "textures", "animations", "stringsZhCn"],
    capabilities: ["strings.zh-cn", "native-render.webgl2"],
  }),
  defineNativeRuntimeProfile({
    profile: "search",
    packs: ["browser", "groups", "search", "stringsZhCn"],
    capabilities: ["groups.collapse", "search.zh-cn", "strings.zh-cn"],
  }),
  defineNativeRuntimeProfile({
    profile: "recipe",
    packs: ["recipes", "textures", "animations", "stringsZhCn"],
    capabilities: ["recipes.lookup", "strings.zh-cn"],
  }),
  defineNativeRuntimeProfile({
    profile: "full",
    packs: ["browser", "groups", "search", "recipes", "textures", "animations", "stringsZhCn"],
    capabilities: ["groups.collapse", "recipes.lookup", "search.zh-cn", "strings.zh-cn", "native-render.webgl2"],
  }),
] as const);

export type NativeRuntimeProfilePolicyDescriptor = typeof NATIVE_RUNTIME_PROFILE_POLICY_DESCRIPTOR_LIST[number];
export type NativeRuntimePackProfileName = NativeRuntimeProfilePolicyDescriptor["profile"];

export const NATIVE_RUNTIME_PROFILE_POLICY_MAP = projectProfileMap(
  NATIVE_RUNTIME_PROFILE_POLICY_DESCRIPTOR_LIST,
);
