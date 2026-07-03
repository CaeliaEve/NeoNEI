export const NATIVE_UI_RENDER_RESOURCE_CATALOG_ABI = Object.freeze({
  schema: "neonei/native-ui-render-resource-catalog/current",
  buildPolicy: "descriptor-table-render-resource-projection",
  failurePolicy: "fail-closed-native-ui-resource-binding",
  snapshotPolicy: "rcu-immutable-render-resource-snapshot",
} as const);

export type NativeUiSlotTextureKind = "item-input" | "item-output" | "fluid-input" | "fluid-output";

export type NativeUiSlotTextureDescriptor = Readonly<{
  kind: NativeUiSlotTextureKind;
  roleTokens: readonly string[];
  default?: boolean;
  fillColor: string;
  accentColor: string;
  fluidIndicatorColor?: string;
  outputIndicatorColor?: string;
}>;

export type NativeUiDynamicPrimitiveDescriptor = Readonly<{
  kind: "fluid-bar" | "energy-bar" | "progress-bar" | "indicator";
  matchTokens: readonly string[];
  defaultFillColor: string;
  defaultForUnknownKind?: boolean;
}>;

type NativeUiDynamicPrimitiveColorSource = Readonly<{
  kind?: unknown;
  role?: unknown;
  trackColor?: unknown;
  fillColor?: unknown;
  borderColor?: unknown;
  fill?: unknown;
  ratio?: unknown;
  value?: unknown;
}>;

type NativeUiCanvas2D = CanvasRenderingContext2D;

function defineSlotTextureDescriptor<const Descriptor extends NativeUiSlotTextureDescriptor>(
  descriptor: Descriptor,
): Descriptor {
  return Object.freeze({
    ...descriptor,
    roleTokens: Object.freeze([...descriptor.roleTokens]),
  }) as Descriptor;
}

function defineDynamicPrimitiveDescriptor<const Descriptor extends NativeUiDynamicPrimitiveDescriptor>(
  descriptor: Descriptor,
): Descriptor {
  return Object.freeze({
    ...descriptor,
    matchTokens: Object.freeze([...descriptor.matchTokens]),
  }) as Descriptor;
}

function validateSlotTextureDescriptors<const Descriptors extends readonly NativeUiSlotTextureDescriptor[]>(
  descriptors: Descriptors,
): Descriptors {
  requireNonEmptyCatalog("native UI slot texture", descriptors);
  const kinds = new Set<string>();
  let defaults = 0;
  for (const descriptor of descriptors) {
    requireNonEmptyString("native UI slot texture kind", descriptor.kind);
    requireNonEmptyString("native UI slot texture fill color", descriptor.fillColor);
    requireNonEmptyString("native UI slot texture accent color", descriptor.accentColor);
    requireUnique(kinds, descriptor.kind, "native UI slot texture kind");
    if (descriptor.default) defaults += 1;
  }
  if (defaults !== 1) {
    throw new Error("native UI slot texture catalog must declare exactly one default descriptor");
  }
  return Object.freeze([...descriptors]) as unknown as Descriptors;
}

function validateDynamicPrimitiveDescriptors<const Descriptors extends readonly NativeUiDynamicPrimitiveDescriptor[]>(
  descriptors: Descriptors,
): Descriptors {
  requireNonEmptyCatalog("native UI dynamic primitive", descriptors);
  const kinds = new Set<string>();
  let unknownKindDefaults = 0;
  for (const descriptor of descriptors) {
    requireNonEmptyString("native UI dynamic primitive kind", descriptor.kind);
    requireNonEmptyString("native UI dynamic primitive fill color", descriptor.defaultFillColor);
    requireUnique(kinds, descriptor.kind, "native UI dynamic primitive kind");
    if (descriptor.defaultForUnknownKind) unknownKindDefaults += 1;
  }
  if (unknownKindDefaults !== 1) {
    throw new Error("native UI dynamic primitive catalog must declare exactly one unknown-kind default descriptor");
  }
  return Object.freeze([...descriptors]) as unknown as Descriptors;
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

function requireUnique(values: Set<string>, value: string, label: string): void {
  if (values.has(value)) {
    throw new Error(`duplicate ${label}: ${value}`);
  }
  values.add(value);
}

export const NATIVE_UI_SLOT_TEXTURE_DESCRIPTOR_LIST = validateSlotTextureDescriptors([
  defineSlotTextureDescriptor({
    kind: "fluid-output",
    roleTokens: ["fluid", "output"],
    fillColor: "rgba(10, 25, 38, 0.92)",
    accentColor: "rgba(90, 203, 255, 0.62)",
    fluidIndicatorColor: "rgba(90, 203, 255, 0.18)",
    outputIndicatorColor: "rgba(248, 181, 92, 0.16)",
  }),
  defineSlotTextureDescriptor({
    kind: "fluid-input",
    roleTokens: ["fluid"],
    fillColor: "rgba(10, 25, 38, 0.92)",
    accentColor: "rgba(90, 203, 255, 0.62)",
    fluidIndicatorColor: "rgba(90, 203, 255, 0.18)",
  }),
  defineSlotTextureDescriptor({
    kind: "item-output",
    roleTokens: ["output"],
    fillColor: "rgba(13, 18, 25, 0.94)",
    accentColor: "rgba(248, 181, 92, 0.66)",
    outputIndicatorColor: "rgba(248, 181, 92, 0.16)",
  }),
  defineSlotTextureDescriptor({
    kind: "item-input",
    roleTokens: [],
    default: true,
    fillColor: "rgba(13, 18, 25, 0.94)",
    accentColor: "rgba(160, 178, 198, 0.34)",
  }),
] as const);

export const NATIVE_UI_DYNAMIC_PRIMITIVE_DESCRIPTOR_LIST = validateDynamicPrimitiveDescriptors([
  defineDynamicPrimitiveDescriptor({
    kind: "fluid-bar",
    matchTokens: ["fluid"],
    defaultFillColor: "rgba(82, 189, 255, 0.78)",
  }),
  defineDynamicPrimitiveDescriptor({
    kind: "energy-bar",
    matchTokens: ["energy", "eu"],
    defaultFillColor: "rgba(118, 232, 147, 0.78)",
  }),
  defineDynamicPrimitiveDescriptor({
    kind: "progress-bar",
    matchTokens: ["progress", "arrow"],
    defaultFillColor: "rgba(247, 182, 72, 0.86)",
  }),
  defineDynamicPrimitiveDescriptor({
    kind: "indicator",
    matchTokens: [],
    defaultFillColor: "rgba(247, 182, 72, 0.86)",
    defaultForUnknownKind: true,
  }),
] as const);

export const NATIVE_UI_DYNAMIC_PRIMITIVE_COLORS = Object.freeze({
  track: "rgba(5, 9, 14, 0.72)",
  border: "rgba(238, 244, 252, 0.22)",
} as const);

export const NATIVE_UI_SOLID_TEXTURE_DESCRIPTOR = Object.freeze({
  keyPrefix: "native-dynamic-solid",
  size: 1,
} as const);

export const NATIVE_UI_GT_MODULAR_BACKGROUND_DESCRIPTOR = Object.freeze({
  baseFill: "#0f1115",
  panelInset: 3,
  gradientTop: "#4b4f55",
  gradientMiddle: "#34383e",
  gradientBottom: "#24282e",
  outerStroke: "#8f969f",
  innerStroke: "#171a1f",
  highlight: "rgba(255,255,255,0.08)",
  shadow: "rgba(0,0,0,0.24)",
} as const);

const SLOT_TEXTURE_DESCRIPTOR_BY_KIND = Object.freeze(
  Object.fromEntries(NATIVE_UI_SLOT_TEXTURE_DESCRIPTOR_LIST.map((descriptor) => [descriptor.kind, descriptor])),
) as unknown as Readonly<Record<NativeUiSlotTextureKind, NativeUiSlotTextureDescriptor>>;

function defaultSlotTextureDescriptor(): NativeUiSlotTextureDescriptor {
  const descriptor = NATIVE_UI_SLOT_TEXTURE_DESCRIPTOR_LIST.find((entry) => "default" in entry && entry.default === true);
  if (!descriptor) {
    throw new Error("native UI slot texture catalog default descriptor is missing");
  }
  return descriptor;
}

function roleMatchesDescriptor(role: string, descriptor: NativeUiSlotTextureDescriptor): boolean {
  return descriptor.roleTokens.length > 0
    && descriptor.roleTokens.every((token) => role.includes(token));
}

export function resolveNativeUiSlotTextureDescriptor(role: string): NativeUiSlotTextureDescriptor {
  const normalized = role.toLowerCase();
  return NATIVE_UI_SLOT_TEXTURE_DESCRIPTOR_LIST.find((descriptor) => roleMatchesDescriptor(normalized, descriptor))
    ?? defaultSlotTextureDescriptor();
}

export function nativeUiTextureKindForRole(role: string): NativeUiSlotTextureKind {
  return resolveNativeUiSlotTextureDescriptor(role).kind;
}

export function nativeUiSlotTextureKey(role: string, dpr: number, width: number, height: number): string {
  return `recipe-slot:${nativeUiTextureKindForRole(role)}:${normalizeNativeUiDpr(dpr)}:${Math.max(1, Math.round(width))}x${Math.max(1, Math.round(height))}`;
}

export function normalizeNativeUiDpr(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function clampNativeUiRatio(value: unknown, defaultValue = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(0, Math.min(1, parsed));
}

export function normalizeNativeUiDynamicPrimitiveKind(primitive: NativeUiDynamicPrimitiveColorSource): string {
  const kind = `${primitive.kind ?? primitive.role ?? ""}`.trim().toLowerCase();
  const descriptor = resolveNativeUiDynamicPrimitiveDescriptor(primitive);
  return "defaultForUnknownKind" in descriptor && descriptor.defaultForUnknownKind === true
    ? kind || descriptor.kind
    : descriptor.kind;
}

export function resolveNativeUiDynamicPrimitiveDescriptor(
  primitive: NativeUiDynamicPrimitiveColorSource,
): NativeUiDynamicPrimitiveDescriptor {
  const kind = `${primitive.kind ?? primitive.role ?? ""}`.trim().toLowerCase();
  return NATIVE_UI_DYNAMIC_PRIMITIVE_DESCRIPTOR_LIST.find((descriptor) => (
    descriptor.matchTokens.length > 0
      && descriptor.matchTokens.some((token) => kind.includes(token))
  )) ?? unknownKindDefaultDynamicPrimitiveDescriptor();
}

function unknownKindDefaultDynamicPrimitiveDescriptor(): NativeUiDynamicPrimitiveDescriptor {
  const descriptor = NATIVE_UI_DYNAMIC_PRIMITIVE_DESCRIPTOR_LIST.find((entry) => (
    "defaultForUnknownKind" in entry && entry.defaultForUnknownKind === true
  ));
  if (!descriptor) {
    throw new Error("native UI dynamic primitive catalog unknown-kind default descriptor is missing");
  }
  return descriptor;
}

export function nativeUiPrimitiveFillRatio(primitive: NativeUiDynamicPrimitiveColorSource): number {
  return clampNativeUiRatio(primitive.fill ?? primitive.ratio ?? primitive.value, 1);
}

export function nativeUiSolidTextureKey(color: string): string {
  return `${NATIVE_UI_SOLID_TEXTURE_DESCRIPTOR.keyPrefix}:${color}`;
}

export function nativeUiDynamicPrimitiveColors(primitive: NativeUiDynamicPrimitiveColorSource): string[] {
  const descriptor = resolveNativeUiDynamicPrimitiveDescriptor(primitive);
  return [
    `${primitive.trackColor ?? NATIVE_UI_DYNAMIC_PRIMITIVE_COLORS.track}`,
    `${primitive.fillColor ?? descriptor.defaultFillColor}`,
    `${primitive.borderColor ?? NATIVE_UI_DYNAMIC_PRIMITIVE_COLORS.border}`,
  ];
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function drawRoundedRect(ctx: NativeUiCanvas2D, x: number, y: number, w: number, h: number, r: number): void {
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

function drawSlotIndicator(
  ctx: NativeUiCanvas2D,
  color: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (!color) return;
  ctx.fillStyle = color;
  drawRoundedRect(ctx, x, y, width, height, 1.5);
  ctx.fill();
}

export function createNativeUiSlotTexture(
  kind: NativeUiSlotTextureKind,
  dprValue: number,
  slotWidth: number,
  slotHeight: number,
): HTMLCanvasElement {
  const dpr = normalizeNativeUiDpr(dprValue);
  const width = Math.max(1, Math.round(slotWidth));
  const height = Math.max(1, Math.round(slotHeight));
  const descriptor = SLOT_TEXTURE_DESCRIPTOR_BY_KIND[kind];
  if (!descriptor) {
    throw new Error(`Unknown native UI slot texture kind: ${kind}`);
  }
  const canvas = createCanvas(width * dpr, height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  drawRoundedRect(ctx, 1, 1, width - 2, height - 2, Math.min(4, width / 2, height / 2));
  ctx.fillStyle = descriptor.fillColor;
  ctx.fill();
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.09)");
  gradient.addColorStop(0.52, "rgba(255, 255, 255, 0.015)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.26)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = descriptor.accentColor;
  ctx.stroke();
  drawSlotIndicator(
    ctx,
    descriptor.fluidIndicatorColor,
    Math.min(4, width - 3),
    5,
    3,
    Math.max(1, height - 10),
  );
  drawSlotIndicator(
    ctx,
    descriptor.outputIndicatorColor,
    Math.max(1, width - 7),
    5,
    3,
    Math.max(1, height - 10),
  );
  return canvas;
}

export function createNativeUiSolidColorTexture(color: string): HTMLCanvasElement {
  const canvas = createCanvas(NATIVE_UI_SOLID_TEXTURE_DESCRIPTOR.size, NATIVE_UI_SOLID_TEXTURE_DESCRIPTOR.size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, NATIVE_UI_SOLID_TEXTURE_DESCRIPTOR.size, NATIVE_UI_SOLID_TEXTURE_DESCRIPTOR.size);
  return canvas;
}

export function createNativeUiGtModularBackgroundTexture(
  width: number,
  height: number,
  dprValue: number,
): HTMLCanvasElement {
  const dpr = normalizeNativeUiDpr(dprValue);
  const logicalWidth = Math.max(1, Math.round(width));
  const logicalHeight = Math.max(1, Math.round(height));
  const descriptor = NATIVE_UI_GT_MODULAR_BACKGROUND_DESCRIPTOR;
  const canvas = createCanvas(logicalWidth * dpr, logicalHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = descriptor.baseFill;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  const panelX = descriptor.panelInset;
  const panelY = descriptor.panelInset;
  const panelWidth = Math.max(1, logicalWidth - descriptor.panelInset * 2);
  const panelHeight = Math.max(1, logicalHeight - descriptor.panelInset * 2);
  const gradient = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight);
  gradient.addColorStop(0, descriptor.gradientTop);
  gradient.addColorStop(0.48, descriptor.gradientMiddle);
  gradient.addColorStop(1, descriptor.gradientBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);

  ctx.strokeStyle = descriptor.outerStroke;
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);
  ctx.strokeStyle = descriptor.innerStroke;
  ctx.strokeRect(panelX + 1.5, panelY + 1.5, panelWidth - 3, panelHeight - 3);

  ctx.fillStyle = descriptor.highlight;
  ctx.fillRect(panelX + 2, panelY + 2, Math.max(0, panelWidth - 4), 1);
  ctx.fillStyle = descriptor.shadow;
  ctx.fillRect(panelX + 2, panelY + panelHeight - 3, Math.max(0, panelWidth - 4), 1);
  return canvas;
}
