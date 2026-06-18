import {
  getNativeRuntimePackPayloadBuffer,
  loadNativeRuntimeManifest,
  parseNativeRuntimePackHeader,
} from "../native-surface/runtimeLoader.ts";
import type { NativeRuntimeManifest } from "../native-surface/NativeRuntimeManifest";

export interface UiPackSlot {
  role: string;
  startIndex: number;
  columns: number;
  rows: number;
  x: number;
  y: number;
}

export interface UiPackTextOverlay {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiPackTemplate {
  templateKey: string;
  templateSignature: string;
  familyKey: string;
  canonicalMachineFamily: string;
  layoutKind: string;
  width: number;
  height: number;
  yShift: number;
  maxRecipesPerPage: number;
  imageResource: string;
  handlerCount: number;
  slotCount: number;
  slots: UiPackSlot[];
  textOverlays: UiPackTextOverlay[];
}

export interface UiPackBinding {
  recipeId: string;
  path: string;
  payloadKey: string;
  familyKey: string;
  recipeType: string;
  machineType: string;
  templateKey: string;
  templateSignature: string;
  canonicalMachineFamily: string;
  layoutKind: string;
  bound: boolean;
}

export interface UiPackRuntimeSummary {
  templateCount: number;
  bindingCount: number;
  boundRecipeCount: number;
  unboundRecipeCount: number;
  stringCount: number;
  slotCount: number;
  textOverlayCount: number;
  assetCount: number;
}

export type UiPackRuntimeStatus = "ready" | "missing" | "error";

export interface UiPackRuntime {
  status: UiPackRuntimeStatus;
  manifestUrl: string;
  templates: UiPackTemplate[];
  bindings: UiPackBinding[];
  strings: string[];
  templatesByKey: Map<string, UiPackTemplate>;
  templatesByFamilyKey: Map<string, UiPackTemplate>;
  bindingsByRecipeId: Map<string, UiPackBinding>;
  summary: UiPackRuntimeSummary;
  error?: string;
}

const UI_PACK_REQUEST_CACHE = new Map<string, Promise<UiPackRuntime>>();

function isPortableRelativePath(path: string): boolean {
  return Boolean(path)
    && !path.startsWith("/")
    && !path.includes("\\")
    && !/^[A-Za-z]:[\\/]/.test(path)
    && !path.split("/").includes("..");
}

function isCurrentNativeRuntimeManifestUrl(manifestUrl: string): boolean {
  try {
    const pathname = new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/").pathname;
    return pathname.endsWith("/api/runtime/current/manifest")
      || pathname.endsWith("/api/native-runtime/current/manifest");
  } catch {
    return manifestUrl.includes("/api/runtime/current/manifest")
      || manifestUrl.includes("/api/native-runtime/current/manifest");
  }
}

function encodeRuntimeFilePath(relativePath: string): string {
  return relativePath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function resolveCurrentRuntimeAssetUrl(manifestUrl: string, relativePath: string): string {
  const encodedPath = encodeRuntimeFilePath(relativePath);
  try {
    const url = new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/");
    if (url.pathname.endsWith("/api/runtime/current/manifest")) {
      return new URL(`/api/runtime/current/asset/${encodedPath}`, url).toString();
    }
    return new URL(`/api/native-runtime/current/files/${encodedPath}`, url).toString();
  } catch {
    return manifestUrl.includes("/api/runtime/current/manifest")
      ? `/api/runtime/current/asset/${encodedPath}`
      : `/api/native-runtime/current/files/${encodedPath}`;
  }
}

function resolveManifestRelativeUrl(manifestUrl: string, relativePath: string): string {
  if (!isPortableRelativePath(relativePath)) {
    throw new Error(`UI pack path is not portable: ${relativePath}`);
  }
  if (isCurrentNativeRuntimeManifestUrl(manifestUrl)) {
    return resolveCurrentRuntimeAssetUrl(manifestUrl, relativePath);
  }
  return new URL(relativePath, manifestUrl).toString();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function readI32(view: DataView, offset: number): number {
  return view.getInt32(offset, true);
}

function decodeStringTable(payloadBuffer: ArrayBuffer): string[] {
  const view = new DataView(payloadBuffer);
  const magic = new TextDecoder("utf-8").decode(new Uint8Array(view.buffer, view.byteOffset, 8));
  if (magic !== "NEIUIS1\0") {
    throw new Error(`UI string pack has invalid magic: ${magic}`);
  }
  const version = readU32(view, 8);
  if (version !== 1) {
    throw new Error(`UI string pack has invalid version: ${version}`);
  }
  const stringCount = readU32(view, 12);
  const byteLength = readU32(view, 16);
  const offsetStart = 20;
  const offsets: number[] = [];
  for (let index = 0; index < stringCount; index += 1) {
    offsets.push(readU32(view, offsetStart + index * 4));
  }
  const byteStart = offsetStart + stringCount * 4;
  const bytes = new Uint8Array(payloadBuffer, byteStart, byteLength);
  const decoder = new TextDecoder("utf-8");
  return offsets.map((offset, index) => {
    const start = offset;
    const next = index + 1 < offsets.length ? offsets[index + 1] : bytes.length;
    const end = Math.max(start, next > 0 ? next - 1 : bytes.length);
    return decoder.decode(bytes.slice(start, end));
  });
}

function resolveString(strings: string[], index: number): string {
  return index >= 0 && index < strings.length ? strings[index] : "";
}

function parseUiTemplates(payloadBuffer: ArrayBuffer, strings: string[]): UiPackTemplate[] {
  const view = new DataView(payloadBuffer);
  const magic = new TextDecoder("utf-8").decode(new Uint8Array(view.buffer, view.byteOffset, 8));
  if (magic !== "NEIUIT1\0") {
    throw new Error(`UI template pack has invalid magic: ${magic}`);
  }
  const version = readU32(view, 8);
  if (version !== 1) {
    throw new Error(`UI template pack has invalid version: ${version}`);
  }
  const templateCount = readU32(view, 12);
  const slotCount = readU32(view, 16);
  const textCount = readU32(view, 20);
  const templateStride = readU32(view, 24);
  const slotStride = readU32(view, 28);
  const textStride = readU32(view, 32);
  if (templateStride !== 15 || slotStride !== 6 || textStride !== 5) {
    throw new Error(`UI template pack has unexpected strides: ${templateStride}/${slotStride}/${textStride}`);
  }
  const templateBytes = templateCount * templateStride * 4;
  const slotBytes = slotCount * slotStride * 4;
  const textBytes = textCount * textStride * 4;
  let cursor = 36;
  const templates: UiPackTemplate[] = [];
  const templateRows: Array<{
    templateKey: string;
    templateSignature: string;
    familyKey: string;
    canonicalMachineFamily: string;
    layoutKind: string;
    width: number;
    height: number;
    yShift: number;
    maxRecipesPerPage: number;
    imageResource: string;
    handlerCount: number;
    slotStart: number;
    slotCount: number;
    textStart: number;
    textCount: number;
  }> = [];
  for (let index = 0; index < templateCount; index += 1) {
    const rowOffset = cursor + index * templateStride * 4;
    templateRows.push({
      templateKey: resolveString(strings, readU32(view, rowOffset + 0)),
      templateSignature: resolveString(strings, readU32(view, rowOffset + 4)),
      familyKey: resolveString(strings, readU32(view, rowOffset + 8)),
      canonicalMachineFamily: resolveString(strings, readU32(view, rowOffset + 12)),
      layoutKind: resolveString(strings, readU32(view, rowOffset + 16)),
      width: readU32(view, rowOffset + 20),
      height: readU32(view, rowOffset + 24),
      yShift: readI32(view, rowOffset + 28),
      maxRecipesPerPage: readU32(view, rowOffset + 32),
      imageResource: resolveString(strings, readU32(view, rowOffset + 36)),
      handlerCount: readU32(view, rowOffset + 40),
      slotStart: readU32(view, rowOffset + 44),
      slotCount: readU32(view, rowOffset + 48),
      textStart: readU32(view, rowOffset + 52),
      textCount: readU32(view, rowOffset + 56),
    });
  }
  cursor += templateBytes;
  const slots: UiPackSlot[] = [];
  for (let index = 0; index < slotCount; index += 1) {
    const rowOffset = cursor + index * slotStride * 4;
    slots.push({
      role: resolveString(strings, readU32(view, rowOffset + 0)),
      startIndex: readU32(view, rowOffset + 4),
      columns: readU32(view, rowOffset + 8),
      rows: readU32(view, rowOffset + 12),
      x: readI32(view, rowOffset + 16),
      y: readI32(view, rowOffset + 20),
    });
  }
  cursor += slotBytes;
  const overlays: UiPackTextOverlay[] = [];
  for (let index = 0; index < textCount; index += 1) {
    const rowOffset = cursor + index * textStride * 4;
    overlays.push({
      text: resolveString(strings, readU32(view, rowOffset + 0)),
      x: readI32(view, rowOffset + 4),
      y: readI32(view, rowOffset + 8),
      width: readU32(view, rowOffset + 12),
      height: readU32(view, rowOffset + 16),
    });
  }

  return templateRows.map((templateRow) => ({
    templateKey: templateRow.templateKey,
    templateSignature: templateRow.templateSignature,
    familyKey: templateRow.familyKey,
    canonicalMachineFamily: templateRow.canonicalMachineFamily,
    layoutKind: templateRow.layoutKind,
    width: templateRow.width,
    height: templateRow.height,
    yShift: templateRow.yShift,
    maxRecipesPerPage: templateRow.maxRecipesPerPage,
    imageResource: templateRow.imageResource,
    handlerCount: templateRow.handlerCount,
    slotCount: templateRow.slotCount,
    slots: slots.slice(templateRow.slotStart, templateRow.slotStart + templateRow.slotCount),
    textOverlays: overlays.slice(templateRow.textStart, templateRow.textStart + templateRow.textCount),
  }));
}

function parseUiBindings(payloadBuffer: ArrayBuffer, strings: string[]): UiPackBinding[] {
  const view = new DataView(payloadBuffer);
  const magic = new TextDecoder("utf-8").decode(new Uint8Array(view.buffer, view.byteOffset, 8));
  if (magic !== "NEIUIB1\0") {
    throw new Error(`UI binding pack has invalid magic: ${magic}`);
  }
  const version = readU32(view, 8);
  if (version !== 1) {
    throw new Error(`UI binding pack has invalid version: ${version}`);
  }
  const bindingCount = readU32(view, 12);
  const rowStride = readU32(view, 16);
  if (rowStride !== 11) {
    throw new Error(`UI binding pack has unexpected row stride: ${rowStride}`);
  }
  const payloadOffset = 20;
  const bindings: UiPackBinding[] = [];
  for (let index = 0; index < bindingCount; index += 1) {
    const rowOffset = payloadOffset + index * rowStride * 4;
    const templateKey = resolveString(strings, readU32(view, rowOffset + 24));
    bindings.push({
      recipeId: resolveString(strings, readU32(view, rowOffset + 0)),
      path: resolveString(strings, readU32(view, rowOffset + 4)),
      payloadKey: resolveString(strings, readU32(view, rowOffset + 8)),
      familyKey: resolveString(strings, readU32(view, rowOffset + 12)),
      recipeType: resolveString(strings, readU32(view, rowOffset + 16)),
      machineType: resolveString(strings, readU32(view, rowOffset + 20)),
      templateKey,
      templateSignature: resolveString(strings, readU32(view, rowOffset + 28)),
      canonicalMachineFamily: resolveString(strings, readU32(view, rowOffset + 32)),
      layoutKind: resolveString(strings, readU32(view, rowOffset + 36)),
      bound: Boolean(templateKey),
    });
  }
  return bindings;
}

function parseUiPackManifest(manifest: NativeRuntimeManifest): { templates?: string; bindings?: string; strings?: string } | null {
  const source = manifest.entrypoints ?? (!Array.isArray(manifest.files) ? manifest.files : undefined) ?? {};
  const templates = asString(source.uiTemplates);
  const bindings = asString(source.uiBindings);
  const strings = asString(source.uiStrings);
  if (!templates || !bindings || !strings) {
    return null;
  }
  return { templates, bindings, strings };
}

async function fetchPackBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load UI pack artifact: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

function unwrapUiPackPayload(buffer: ArrayBuffer, expectedSchema: "neonei/ui-template-pack/current" | "neonei/ui-binding-pack/current" | "neonei/ui-string-pack/current"): ArrayBuffer {
  const header = parseNativeRuntimePackHeader(buffer, expectedSchema);
  return getNativeRuntimePackPayloadBuffer(buffer, header);
}

async function loadUiPackRuntimeInternal(normalizedManifestUrl: string): Promise<UiPackRuntime> {
  const manifest = await loadNativeRuntimeManifest(normalizedManifestUrl);
  const entrypoints = parseUiPackManifest(manifest);
  if (!entrypoints) {
    return {
      status: "missing",
      manifestUrl: normalizedManifestUrl,
      templates: [],
      bindings: [],
      strings: [],
      templatesByKey: new Map(),
      templatesByFamilyKey: new Map(),
      bindingsByRecipeId: new Map(),
      summary: {
        templateCount: 0,
        bindingCount: 0,
        boundRecipeCount: 0,
        unboundRecipeCount: 0,
        stringCount: 0,
        slotCount: 0,
        textOverlayCount: 0,
        assetCount: 0,
      },
      error: "UI pack entrypoints are unavailable on this runtime manifest.",
    };
  }

  try {
    const templateUrl = resolveManifestRelativeUrl(normalizedManifestUrl, entrypoints.templates);
    const bindingUrl = resolveManifestRelativeUrl(normalizedManifestUrl, entrypoints.bindings);
    const stringUrl = resolveManifestRelativeUrl(normalizedManifestUrl, entrypoints.strings);
    const [templateBuffer, bindingBuffer, stringBuffer] = await Promise.all([
      fetchPackBuffer(templateUrl),
      fetchPackBuffer(bindingUrl),
      fetchPackBuffer(stringUrl),
    ]);
    const templatePayload = unwrapUiPackPayload(templateBuffer, "neonei/ui-template-pack/current");
    const bindingPayload = unwrapUiPackPayload(bindingBuffer, "neonei/ui-binding-pack/current");
    const stringPayload = unwrapUiPackPayload(stringBuffer, "neonei/ui-string-pack/current");
    const strings = decodeStringTable(stringPayload);
    const templates = parseUiTemplates(templatePayload, strings);
    const bindings = parseUiBindings(bindingPayload, strings);
    const templatesByKey = new Map<string, UiPackTemplate>();
    const templatesByFamilyKey = new Map<string, UiPackTemplate>();
    const bindingsByRecipeId = new Map<string, UiPackBinding>();
    let boundRecipeCount = 0;
    for (const template of templates) {
      if (template.templateKey) templatesByKey.set(template.templateKey, template);
      if (template.familyKey) templatesByFamilyKey.set(template.familyKey, template);
    }
    for (const binding of bindings) {
      if (binding.recipeId) bindingsByRecipeId.set(binding.recipeId, binding);
      if (binding.bound) boundRecipeCount += 1;
    }
    return {
      status: "ready",
      manifestUrl: normalizedManifestUrl,
      templates,
      bindings,
      strings,
      templatesByKey,
      templatesByFamilyKey,
      bindingsByRecipeId,
      summary: {
        templateCount: templates.length,
        bindingCount: bindings.length,
        boundRecipeCount,
        unboundRecipeCount: Math.max(0, bindings.length - boundRecipeCount),
        stringCount: strings.length,
        slotCount: templates.reduce((total, template) => total + template.slots.length, 0),
        textOverlayCount: templates.reduce((total, template) => total + template.textOverlays.length, 0),
        assetCount: new Set(templates.map((template) => template.imageResource).filter(Boolean)).size,
      },
    };
  } catch (error) {
    return {
      status: "error",
      manifestUrl: normalizedManifestUrl,
      templates: [],
      bindings: [],
      strings: [],
      templatesByKey: new Map(),
      templatesByFamilyKey: new Map(),
      bindingsByRecipeId: new Map(),
      summary: {
        templateCount: 0,
        bindingCount: 0,
        boundRecipeCount: 0,
        unboundRecipeCount: 0,
        stringCount: 0,
        slotCount: 0,
        textOverlayCount: 0,
        assetCount: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function loadUiPackRuntime(manifestUrl = "/api/runtime/current/manifest"): Promise<UiPackRuntime> {
  const normalizedManifestUrl = new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/").toString();
  const existing = UI_PACK_REQUEST_CACHE.get(normalizedManifestUrl);
  if (existing) return existing;
  const request = loadUiPackRuntimeInternal(normalizedManifestUrl).catch((error) => ({
    status: "error" as const,
    manifestUrl: normalizedManifestUrl,
    templates: [],
    bindings: [],
    strings: [],
    templatesByKey: new Map(),
    templatesByFamilyKey: new Map(),
    bindingsByRecipeId: new Map(),
    summary: {
      templateCount: 0,
      bindingCount: 0,
      boundRecipeCount: 0,
      unboundRecipeCount: 0,
      stringCount: 0,
      slotCount: 0,
      textOverlayCount: 0,
      assetCount: 0,
    },
    error: error instanceof Error ? error.message : String(error),
  }));
  UI_PACK_REQUEST_CACHE.set(normalizedManifestUrl, request);
  return request;
}

export function clearUiPackRuntimeCache(): void {
  UI_PACK_REQUEST_CACHE.clear();
}
