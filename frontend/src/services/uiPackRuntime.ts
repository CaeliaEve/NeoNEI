import {
  getNativeRuntimePackPayloadBuffer,
  loadNativeRuntimeManifest,
  parseNativeRuntimePackHeader,
} from "../native-surface/runtimeLoader.ts";
import {
  getNativeRuntimeFetchCache,
  normalizeNativeRuntimeManifestUrl,
  resolveManifestRelativeUrl,
} from "../native-surface/NativeRuntimeRequestPolicy.ts";
import {
  assertNativeUiRuntimeManifest,
} from "../native-surface/NativeRuntimeCapabilityGate.ts";
import type { NativeRuntimeManifest } from "../native-surface/NativeRuntimeManifest";
import {
  collectNativeUiExportAbiReportViolations,
  UI_BINDING_PACK_MAGIC,
  UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT,
  UI_BINDING_PACK_SCHEMA,
  UI_BINDING_PAYLOAD_VERSION,
  UI_BINDING_ROW_STRIDE_U32,
  UI_PACK_ABI_VALIDATION_SCHEMA_VERSION,
  UI_PRIMITIVE_ROW_STRIDE_U32,
  UI_RECT_ROW_STRIDE_U32,
  UI_SLOT_ROW_STRIDE_U32,
  UI_STRING_PACK_MAGIC,
  UI_STRING_PACK_PAYLOAD_MAGIC_REPORT,
  UI_STRING_PACK_SCHEMA,
  UI_STRING_PAYLOAD_VERSION,
  UI_TEMPLATE_PACK_MAGIC,
  UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT,
  UI_TEMPLATE_PACK_SCHEMA,
  UI_TEMPLATE_PAYLOAD_VERSION,
  UI_TEMPLATE_ROW_STRIDE_U32,
  UI_TEXT_ROW_STRIDE_U32,
} from "./nativeUiPackAbi.ts";
import {
  createEmptyUiPackRuntimeSummary,
  UI_PACK_RUNTIME_ENTRYPOINTS,
  UI_PACK_RUNTIME_REPORT_BY_ID,
  UI_PACK_RUNTIME_STATUS,
  type UiPackRuntimeEntrypoints,
  type UiPackRuntimeReportDescriptor,
  type UiPackRuntimeStatus,
  type UiPackRuntimeSummary,
} from "./uiPackRuntimeAbi.ts";
import {
  getManifestRuntimeFileBytes,
  normalizeRuntimePath,
  runtimeManifestDeclaresPath,
  runtimePathFromValue,
} from "./runtimeManifestPath.ts";

export interface UiPackSlot {
  role: string;
  startIndex: number;
  columns: number;
  rows: number;
  x: number;
  y: number;
  coordinateSpace: string;
  anchor: string;
  slotWidth: number;
  slotHeight: number;
  pitchX: number;
  pitchY: number;
}

export interface UiPackTextOverlay {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: string;
  anchor: string;
}

export interface UiPackDynamicPrimitive {
  kind: string;
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: string;
  anchor: string;
  orientation: "horizontal" | "vertical";
  source: string;
  trackColor: string;
  fillColor: string;
  borderColor: string;
}

export interface UiPackRect {
  id: string;
  kind: string;
  role: string;
  label: string;
  tooltip: string;
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: string;
  anchor: string;
  interactionKind: string;
  interactionTargetKind: string;
  interactionTargetId: string;
  interactionPayloadSchema: string;
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
  coordinateSpace: string;
  scaleMode: string;
  anchor: string;
  maxRecipesPerPage: number;
  imageResource: string;
  handlerCount: number;
  slotCount: number;
  slots: UiPackSlot[];
  textOverlays: UiPackTextOverlay[];
  dynamicPrimitives: UiPackDynamicPrimitive[];
  hotspots: UiPackRect[];
  viewports: UiPackRect[];
  nativeBackground: Record<string, unknown>;
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
  presentationSurface: string;
  layoutId: string;
  rendererId: string;
  bound: boolean;
}

export type { UiPackRuntimeEntrypoints, UiPackRuntimeStatus, UiPackRuntimeSummary } from "./uiPackRuntimeAbi.ts";

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

type JsonRecord = Record<string, unknown>;

type UiPackArtifactContract = {
  logicalName: string;
  path: string;
  envelopeSchema: string;
  payloadMagic: string;
  version: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function parseNativeBackgroundJson(value: string, templateKey: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `UI template ${templateKey} nativeBackground JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const record = asRecord(parsed);
  if (!record) {
    throw new Error(`UI template ${templateKey} nativeBackground must be a JSON object`);
  }
  return record;
}

function runtimeManifestFilesDeclarePath(manifest: NativeRuntimeManifest, relativePath: string): boolean {
  return runtimeManifestDeclaresPath({ entrypoints: {}, files: manifest.files }, relativePath);
}

function resolveUiPackRuntimeReportPath(
  manifest: NativeRuntimeManifest,
  descriptor: UiPackRuntimeReportDescriptor,
): string {
  if (runtimeManifestFilesDeclarePath(manifest, descriptor.requiredPath)) {
    return descriptor.requiredPath;
  }

  throw new Error(
    `native UI runtime manifest does not declare required ${descriptor.label}: ${descriptor.requiredPath}`,
  );
}

function resolveUiPackAbiReportPath(manifest: NativeRuntimeManifest): string {
  return resolveUiPackRuntimeReportPath(manifest, UI_PACK_RUNTIME_REPORT_BY_ID.abiReport);
}

function resolveNativeUiExportAbiReportPath(manifest: NativeRuntimeManifest): string {
  return resolveUiPackRuntimeReportPath(manifest, UI_PACK_RUNTIME_REPORT_BY_ID.exportAbiReport);
}

function readU32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) {
    throw new Error(`UI pack u32 read out of bounds: offset=${offset}, bytes=${view.byteLength}`);
  }
  return view.getUint32(offset, true);
}

function readI32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) {
    throw new Error(`UI pack i32 read out of bounds: offset=${offset}, bytes=${view.byteLength}`);
  }
  return view.getInt32(offset, true);
}

function decodePayloadMagic(payloadBuffer: ArrayBuffer, label: string): string {
  if (payloadBuffer.byteLength < 8) {
    throw new Error(`${label} is too small: ${payloadBuffer.byteLength} bytes`);
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(payloadBuffer, 0, 8));
}

function assertPayloadLength(payloadBuffer: ArrayBuffer, expectedLength: number, label: string): void {
  if (payloadBuffer.byteLength !== expectedLength) {
    throw new Error(`${label} has invalid byte length: expected=${expectedLength}, actual=${payloadBuffer.byteLength}`);
  }
}

function checkedTableBytes(rowCount: number, strideU32: number, label: string): number {
  const bytes = rowCount * strideU32 * 4;
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error(`${label} section byte length overflow: rows=${rowCount}, stride=${strideU32}`);
  }
  return bytes;
}

function decodeStringTable(payloadBuffer: ArrayBuffer): string[] {
  const view = new DataView(payloadBuffer);
  const magic = decodePayloadMagic(payloadBuffer, "UI string pack");
  if (magic !== UI_STRING_PACK_MAGIC) {
    throw new Error(`UI string pack has invalid magic: ${magic}`);
  }
  const version = readU32(view, 8);
  if (version !== UI_STRING_PAYLOAD_VERSION) {
    throw new Error(`UI string pack has invalid version: ${version}`);
  }
  const stringCount = readU32(view, 12);
  const byteLength = readU32(view, 16);
  const offsetStart = 20;
  const byteStart = offsetStart + checkedTableBytes(stringCount, 1, "UI string offset");
  assertPayloadLength(payloadBuffer, byteStart + byteLength, "UI string pack");
  const offsets: number[] = [];
  let previousOffset = 0;
  for (let index = 0; index < stringCount; index += 1) {
    const offset = readU32(view, offsetStart + index * 4);
    if (offset > byteLength || (index > 0 && offset < previousOffset)) {
      throw new Error(`UI string pack has invalid string offset: index=${index}, offset=${offset}, bytes=${byteLength}`);
    }
    previousOffset = offset;
    offsets.push(offset);
  }
  const bytes = new Uint8Array(payloadBuffer, byteStart, byteLength);
  if (byteLength > 0 && bytes[byteLength - 1] !== 0) {
    throw new Error("UI string pack must be NUL-terminated");
  }
  const decoder = new TextDecoder("utf-8");
  return offsets.map((offset, index) => {
    const start = offset;
    const next = index + 1 < offsets.length ? offsets[index + 1] : bytes.length;
    const end = next > start && bytes[next - 1] === 0 ? next - 1 : next;
    return decoder.decode(bytes.slice(start, end));
  });
}

function resolveString(strings: string[], index: number): string {
  if (index < 0 || index >= strings.length) {
    throw new Error(`UI pack string reference out of bounds: index=${index}, stringCount=${strings.length}`);
  }
  return strings[index];
}

function assertRowRange(tableName: string, start: number, count: number, total: number): void {
  const end = start + count;
  if (start < 0 || count < 0 || end > total) {
    throw new Error(`${tableName} row range is out of bounds: start=${start}, count=${count}, total=${total}`);
  }
}

function sliceRows<T>(tableName: string, rows: T[], start: number, count: number): T[] {
  assertRowRange(tableName, start, count, rows.length);
  return rows.slice(start, start + count);
}

function parseUiTemplates(payloadBuffer: ArrayBuffer, strings: string[]): UiPackTemplate[] {
  const view = new DataView(payloadBuffer);
  const magic = decodePayloadMagic(payloadBuffer, "UI template pack");
  if (magic !== UI_TEMPLATE_PACK_MAGIC) {
    throw new Error(`UI template pack has invalid magic: ${magic}`);
  }
  const version = readU32(view, 8);
  if (version !== UI_TEMPLATE_PAYLOAD_VERSION) {
    throw new Error(`UI template pack has invalid version: ${version}`);
  }
  const templateCount = readU32(view, 12);
  const slotCount = readU32(view, 16);
  const textCount = readU32(view, 20);
  const primitiveCount = readU32(view, 24);
  const hotspotCount = readU32(view, 28);
  const viewportCount = readU32(view, 32);
  const templateStride = readU32(view, 36);
  const slotStride = readU32(view, 40);
  const textStride = readU32(view, 44);
  const primitiveStride = readU32(view, 48);
  const rectStride = readU32(view, 52);
  if (
    templateStride !== UI_TEMPLATE_ROW_STRIDE_U32
    || slotStride !== UI_SLOT_ROW_STRIDE_U32
    || textStride !== UI_TEXT_ROW_STRIDE_U32
    || primitiveStride !== UI_PRIMITIVE_ROW_STRIDE_U32
    || rectStride !== UI_RECT_ROW_STRIDE_U32
  ) {
    throw new Error(`UI template pack has unexpected strides: ${templateStride}/${slotStride}/${textStride}/${primitiveStride}/${rectStride}`);
  }
  const templateBytes = checkedTableBytes(templateCount, templateStride, "UI template");
  const slotBytes = checkedTableBytes(slotCount, slotStride, "UI slot");
  const textBytes = checkedTableBytes(textCount, textStride, "UI text");
  const primitiveBytes = checkedTableBytes(primitiveCount, primitiveStride, "UI dynamic primitive");
  const hotspotBytes = checkedTableBytes(hotspotCount, rectStride, "UI hotspot");
  const viewportBytes = checkedTableBytes(viewportCount, rectStride, "UI viewport");
  let cursor = 56;
  assertPayloadLength(payloadBuffer, cursor + templateBytes + slotBytes + textBytes + primitiveBytes + hotspotBytes + viewportBytes, "UI template pack");
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
    hotspotStart: number;
    hotspotCount: number;
    viewportStart: number;
    viewportCount: number;
    coordinateSpace: string;
    scaleMode: string;
    anchor: string;
    nativeBackground: JsonRecord;
    primitiveStart: number;
    primitiveCount: number;
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
      hotspotStart: readU32(view, rowOffset + 60),
      hotspotCount: readU32(view, rowOffset + 64),
      viewportStart: readU32(view, rowOffset + 68),
      viewportCount: readU32(view, rowOffset + 72),
      coordinateSpace: resolveString(strings, readU32(view, rowOffset + 76)),
      scaleMode: resolveString(strings, readU32(view, rowOffset + 80)),
      anchor: resolveString(strings, readU32(view, rowOffset + 84)),
      nativeBackground: parseNativeBackgroundJson(
        resolveString(strings, readU32(view, rowOffset + 88)),
        resolveString(strings, readU32(view, rowOffset + 0)),
      ),
      primitiveStart: readU32(view, rowOffset + 92),
      primitiveCount: readU32(view, rowOffset + 96),
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
      coordinateSpace: resolveString(strings, readU32(view, rowOffset + 24)),
      anchor: resolveString(strings, readU32(view, rowOffset + 28)),
      slotWidth: readU32(view, rowOffset + 32),
      slotHeight: readU32(view, rowOffset + 36),
      pitchX: readU32(view, rowOffset + 40),
      pitchY: readU32(view, rowOffset + 44),
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
      coordinateSpace: resolveString(strings, readU32(view, rowOffset + 20)),
      anchor: resolveString(strings, readU32(view, rowOffset + 24)),
    });
  }
  cursor += textBytes;
  const primitives: UiPackDynamicPrimitive[] = [];
  for (let index = 0; index < primitiveCount; index += 1) {
    const rowOffset = cursor + index * primitiveStride * 4;
    const orientation = resolveString(strings, readU32(view, rowOffset + 32));
    if (orientation !== "horizontal" && orientation !== "vertical") {
      throw new Error(`UI dynamic primitive has invalid orientation: ${orientation || "<missing>"}`);
    }
    primitives.push({
      kind: resolveString(strings, readU32(view, rowOffset + 0)),
      role: resolveString(strings, readU32(view, rowOffset + 4)),
      x: readI32(view, rowOffset + 8),
      y: readI32(view, rowOffset + 12),
      width: readU32(view, rowOffset + 16),
      height: readU32(view, rowOffset + 20),
      coordinateSpace: resolveString(strings, readU32(view, rowOffset + 24)),
      anchor: resolveString(strings, readU32(view, rowOffset + 28)),
      orientation,
      source: resolveString(strings, readU32(view, rowOffset + 36)),
      trackColor: resolveString(strings, readU32(view, rowOffset + 40)),
      fillColor: resolveString(strings, readU32(view, rowOffset + 44)),
      borderColor: resolveString(strings, readU32(view, rowOffset + 48)),
    });
  }
  cursor += primitiveBytes;
  const readRect = (rowOffset: number): UiPackRect => ({
    id: resolveString(strings, readU32(view, rowOffset + 0)),
    kind: resolveString(strings, readU32(view, rowOffset + 4)),
    role: resolveString(strings, readU32(view, rowOffset + 8)),
    label: resolveString(strings, readU32(view, rowOffset + 12)),
    tooltip: resolveString(strings, readU32(view, rowOffset + 16)),
    x: readI32(view, rowOffset + 20),
    y: readI32(view, rowOffset + 24),
    width: readU32(view, rowOffset + 28),
    height: readU32(view, rowOffset + 32),
    coordinateSpace: resolveString(strings, readU32(view, rowOffset + 36)),
    anchor: resolveString(strings, readU32(view, rowOffset + 40)),
    interactionKind: resolveString(strings, readU32(view, rowOffset + 44)),
    interactionTargetKind: resolveString(strings, readU32(view, rowOffset + 48)),
    interactionTargetId: resolveString(strings, readU32(view, rowOffset + 52)),
    interactionPayloadSchema: resolveString(strings, readU32(view, rowOffset + 56)),
  });
  const hotspots: UiPackRect[] = [];
  for (let index = 0; index < hotspotCount; index += 1) {
    hotspots.push(readRect(cursor + index * rectStride * 4));
  }
  cursor += hotspotBytes;
  const viewports: UiPackRect[] = [];
  for (let index = 0; index < viewportCount; index += 1) {
    viewports.push(readRect(cursor + index * rectStride * 4));
  }
  cursor += viewportBytes;

  return templateRows.map((templateRow) => ({
    templateKey: templateRow.templateKey,
    templateSignature: templateRow.templateSignature,
    familyKey: templateRow.familyKey,
    canonicalMachineFamily: templateRow.canonicalMachineFamily,
    layoutKind: templateRow.layoutKind,
    width: templateRow.width,
    height: templateRow.height,
    yShift: templateRow.yShift,
    coordinateSpace: templateRow.coordinateSpace,
    scaleMode: templateRow.scaleMode,
    anchor: templateRow.anchor,
    maxRecipesPerPage: templateRow.maxRecipesPerPage,
    imageResource: templateRow.imageResource,
    handlerCount: templateRow.handlerCount,
    slotCount: templateRow.slotCount,
    slots: sliceRows("UI template slots", slots, templateRow.slotStart, templateRow.slotCount),
    textOverlays: sliceRows("UI template text overlays", overlays, templateRow.textStart, templateRow.textCount),
    dynamicPrimitives: sliceRows("UI template dynamic primitives", primitives, templateRow.primitiveStart, templateRow.primitiveCount),
    hotspots: sliceRows("UI template hotspots", hotspots, templateRow.hotspotStart, templateRow.hotspotCount),
    viewports: sliceRows("UI template viewports", viewports, templateRow.viewportStart, templateRow.viewportCount),
    nativeBackground: templateRow.nativeBackground,
  }));
}

function parseUiBindings(payloadBuffer: ArrayBuffer, strings: string[]): UiPackBinding[] {
  const view = new DataView(payloadBuffer);
  const magic = decodePayloadMagic(payloadBuffer, "UI binding pack");
  if (magic !== UI_BINDING_PACK_MAGIC) {
    throw new Error(`UI binding pack has invalid magic: ${magic}`);
  }
  const version = readU32(view, 8);
  if (version !== UI_BINDING_PAYLOAD_VERSION) {
    throw new Error(`UI binding pack has invalid version: ${version}`);
  }
  const bindingCount = readU32(view, 12);
  const rowStride = readU32(view, 16);
  if (rowStride !== UI_BINDING_ROW_STRIDE_U32) {
    throw new Error(`UI binding pack has unexpected row stride: ${rowStride}`);
  }
  const payloadOffset = 20;
  assertPayloadLength(
    payloadBuffer,
    payloadOffset + checkedTableBytes(bindingCount, rowStride, "UI binding"),
    "UI binding pack",
  );
  const bindings: UiPackBinding[] = [];
  const recipeIds = new Set<string>();
  for (let index = 0; index < bindingCount; index += 1) {
    const rowOffset = payloadOffset + index * rowStride * 4;
    const templateKey = resolveString(strings, readU32(view, rowOffset + 24));
    const flags = readU32(view, rowOffset + 52);
    if (flags !== 0 && flags !== 1) {
      throw new Error(`UI binding ${index} has invalid flags: ${flags}`);
    }
    const binding: UiPackBinding = {
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
      presentationSurface: resolveString(strings, readU32(view, rowOffset + 40)),
      layoutId: resolveString(strings, readU32(view, rowOffset + 44)),
      rendererId: resolveString(strings, readU32(view, rowOffset + 48)),
      bound: flags === 1,
    };
    if (!binding.recipeId || !binding.path || !binding.payloadKey) {
      throw new Error(`UI binding ${index} is missing recipe identity or payload path`);
    }
    if (!recipeIds.add(binding.recipeId)) {
      throw new Error(`UI binding pack has duplicate recipeId: ${binding.recipeId}`);
    }
    if (binding.bound !== Boolean(templateKey)) {
      throw new Error(`UI binding ${binding.recipeId} has inconsistent bound flag and templateKey`);
    }
    if (binding.bound && (
      !binding.familyKey
      || !binding.templateSignature
      || !binding.canonicalMachineFamily
      || !binding.layoutKind
      || !binding.presentationSurface
      || !binding.layoutId
      || !binding.rendererId
    )) {
      throw new Error(`UI binding ${binding.recipeId} is missing required v2 presentation metadata`);
    }
    bindings.push(binding);
  }
  return bindings;
}

function parseUiPackManifest(manifest: NativeRuntimeManifest): UiPackRuntimeEntrypoints {
  const entrypoints = assertNativeUiRuntimeManifest(manifest);
  const exportAbiReport = resolveNativeUiExportAbiReportPath(manifest);
  const abiReport = resolveUiPackAbiReportPath(manifest);
  if (!runtimeManifestFilesDeclarePath(manifest, exportAbiReport)) {
    throw new Error(`native UI export ABI validation report is not declared by runtime manifest files: ${exportAbiReport}`);
  }
  if (!runtimeManifestFilesDeclarePath(manifest, abiReport)) {
    throw new Error(`native UI ABI validation report is not declared by runtime manifest files: ${abiReport}`);
  }
  return {
    templates: asString(entrypoints[UI_PACK_RUNTIME_ENTRYPOINTS.templates]),
    bindings: asString(entrypoints[UI_PACK_RUNTIME_ENTRYPOINTS.bindings]),
    strings: asString(entrypoints[UI_PACK_RUNTIME_ENTRYPOINTS.strings]),
    exportAbiReport,
    abiReport,
  };
}

async function fetchPackBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: getNativeRuntimeFetchCache("pack") });
  if (!response.ok) {
    throw new Error(`Failed to load UI pack artifact: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

async function fetchJsonRecord(url: string, label: string): Promise<JsonRecord> {
  const response = await fetch(url, { cache: getNativeRuntimeFetchCache("report") });
  if (!response.ok) {
    throw new Error(`Failed to load ${label}: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json() as unknown;
  const record = asRecord(payload);
  if (!record) {
    throw new Error(`${label} is not a JSON object`);
  }
  return record;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => `${item ?? ""}`.trim()).filter(Boolean) : [];
}

function asFiniteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function buildUiPackArtifactContracts(entrypoints: UiPackRuntimeEntrypoints): UiPackArtifactContract[] {
  return [
    {
      logicalName: "rustUiTemplatesBin",
      path: entrypoints.templates,
      envelopeSchema: UI_TEMPLATE_PACK_SCHEMA,
      payloadMagic: UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT,
      version: UI_TEMPLATE_PAYLOAD_VERSION,
    },
    {
      logicalName: "rustUiBindingsBin",
      path: entrypoints.bindings,
      envelopeSchema: UI_BINDING_PACK_SCHEMA,
      payloadMagic: UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT,
      version: UI_BINDING_PAYLOAD_VERSION,
    },
    {
      logicalName: "rustUiStringsBin",
      path: entrypoints.strings,
      envelopeSchema: UI_STRING_PACK_SCHEMA,
      payloadMagic: UI_STRING_PACK_PAYLOAD_MAGIC_REPORT,
      version: UI_STRING_PAYLOAD_VERSION,
    },
  ];
}

function assertUiPackAbiValidationReport(
  report: JsonRecord,
  manifest: NativeRuntimeManifest,
  entrypoints: UiPackRuntimeEntrypoints,
): void {
  const schemaVersion = asString(report.schemaVersion);
  if (schemaVersion !== UI_PACK_ABI_VALIDATION_SCHEMA_VERSION) {
    throw new Error(`native UI ABI validation report schema mismatch: expected ${UI_PACK_ABI_VALIDATION_SCHEMA_VERSION}, got ${schemaVersion || "<missing>"}`);
  }
  const status = asString(report.status);
  if (status !== "ok") {
    throw new Error(`native UI ABI validation report is not ok: ${status || "<missing>"}`);
  }
  const policy = asRecord(report.policy);
  if (asString(policy?.legacyFallback) !== "forbidden") {
    throw new Error("native UI ABI validation report must forbid legacyFallback");
  }
  const missingRequiredArtifacts = asStringArray(report.missingRequiredArtifacts);
  if (missingRequiredArtifacts.length > 0) {
    throw new Error(`native UI ABI validation report declares missing artifacts: ${missingRequiredArtifacts.join(", ")}`);
  }
  const sectionViolations = asStringArray(report.sectionViolations);
  if (sectionViolations.length > 0) {
    throw new Error(`native UI ABI validation report declares section violations: ${sectionViolations.join("; ")}`);
  }

  const artifacts = Array.isArray(report.artifacts)
    ? report.artifacts.map(asRecord).filter((value): value is JsonRecord => Boolean(value))
    : [];
  const byLogicalName = new Map<string, JsonRecord>();
  const byPath = new Map<string, JsonRecord>();
  for (const artifact of artifacts) {
    const logicalName = asString(artifact.logicalName);
    const path = runtimePathFromValue(artifact.path);
    if (logicalName) byLogicalName.set(logicalName, artifact);
    if (path) byPath.set(path, artifact);
  }

  for (const contract of buildUiPackArtifactContracts(entrypoints)) {
    const normalizedPath = normalizeRuntimePath(contract.path);
    const artifact = byLogicalName.get(contract.logicalName) ?? byPath.get(normalizedPath);
    if (!artifact) {
      throw new Error(`native UI ABI validation report is missing artifact contract: ${contract.logicalName}`);
    }
    const artifactPath = runtimePathFromValue(artifact.path);
    if (artifactPath !== normalizedPath) {
      throw new Error(`native UI ABI artifact path mismatch for ${contract.logicalName}: expected ${normalizedPath}, got ${artifactPath || "<missing>"}`);
    }
    if (asString(artifact.status) !== "present") {
      throw new Error(`native UI ABI artifact is not present: ${contract.logicalName}`);
    }
    if (asString(artifact.envelopeSchema) !== contract.envelopeSchema) {
      throw new Error(`native UI ABI envelope schema mismatch for ${contract.logicalName}`);
    }
    if (asString(artifact.payloadMagic) !== contract.payloadMagic) {
      throw new Error(`native UI ABI payload magic mismatch for ${contract.logicalName}`);
    }
    if (asFiniteNumber(artifact.version) !== contract.version) {
      throw new Error(`native UI ABI payload version mismatch for ${contract.logicalName}`);
    }
    const reportBytes = asFiniteNumber(artifact.bytes);
    const manifestBytes = getManifestRuntimeFileBytes(manifest.files, normalizedPath);
    if (reportBytes !== null && manifestBytes !== null && reportBytes !== manifestBytes) {
      throw new Error(`native UI ABI artifact byte mismatch for ${contract.logicalName}: report=${reportBytes}, manifest=${manifestBytes}`);
    }
  }
}

function assertNativeUiExportAbiValidationReport(report: JsonRecord): void {
  const violations = collectNativeUiExportAbiReportViolations(report);
  if (violations.length > 0) throw new Error(violations[0]);
}

function unwrapUiPackPayload(buffer: ArrayBuffer, expectedSchema: typeof UI_TEMPLATE_PACK_SCHEMA | typeof UI_BINDING_PACK_SCHEMA | typeof UI_STRING_PACK_SCHEMA): ArrayBuffer {
  const header = parseNativeRuntimePackHeader(buffer, expectedSchema);
  return getNativeRuntimePackPayloadBuffer(buffer, header);
}

async function loadUiPackRuntimeInternal(normalizedManifestUrl: string): Promise<UiPackRuntime> {
  const manifest = await loadNativeRuntimeManifest(normalizedManifestUrl);
  const entrypoints = parseUiPackManifest(manifest);

  const exportAbiReportUrl = resolveManifestRelativeUrl(normalizedManifestUrl, entrypoints.exportAbiReport);
  const abiReportUrl = resolveManifestRelativeUrl(normalizedManifestUrl, entrypoints.abiReport);
  const [exportAbiReport, abiReport] = await Promise.all([
    fetchJsonRecord(exportAbiReportUrl, "native UI export ABI validation report"),
    fetchJsonRecord(abiReportUrl, "native UI ABI validation report"),
  ]);
  assertNativeUiExportAbiValidationReport(exportAbiReport);
  assertUiPackAbiValidationReport(abiReport, manifest, entrypoints);

  const templateUrl = resolveManifestRelativeUrl(normalizedManifestUrl, entrypoints.templates);
  const bindingUrl = resolveManifestRelativeUrl(normalizedManifestUrl, entrypoints.bindings);
  const stringUrl = resolveManifestRelativeUrl(normalizedManifestUrl, entrypoints.strings);
  const [templateBuffer, bindingBuffer, stringBuffer] = await Promise.all([
    fetchPackBuffer(templateUrl),
    fetchPackBuffer(bindingUrl),
    fetchPackBuffer(stringUrl),
  ]);
  const templatePayload = unwrapUiPackPayload(templateBuffer, UI_TEMPLATE_PACK_SCHEMA);
  const bindingPayload = unwrapUiPackPayload(bindingBuffer, UI_BINDING_PACK_SCHEMA);
  const stringPayload = unwrapUiPackPayload(stringBuffer, UI_STRING_PACK_SCHEMA);
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
    status: UI_PACK_RUNTIME_STATUS.ready,
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
      dynamicPrimitiveCount: templates.reduce((total, template) => total + template.dynamicPrimitives.length, 0),
      hotspotCount: templates.reduce((total, template) => total + template.hotspots.length, 0),
      viewportCount: templates.reduce((total, template) => total + template.viewports.length, 0),
      assetCount: new Set(templates.map((template) => template.imageResource).filter(Boolean)).size,
    },
  };
}

function createErrorRuntime(manifestUrl: string, error: unknown): UiPackRuntime {
  return {
    status: UI_PACK_RUNTIME_STATUS.error,
    manifestUrl,
    templates: [],
    bindings: [],
    strings: [],
    templatesByKey: new Map(),
    templatesByFamilyKey: new Map(),
    bindingsByRecipeId: new Map(),
    summary: createEmptyUiPackRuntimeSummary(),
    error: error instanceof Error ? error.message : String(error),
  };
}

export function loadUiPackRuntime(manifestUrl = "/api/runtime/current/manifest"): Promise<UiPackRuntime> {
  const normalizedManifestUrl = normalizeNativeRuntimeManifestUrl(manifestUrl);
  const existing = UI_PACK_REQUEST_CACHE.get(normalizedManifestUrl);
  if (existing) return existing;
  const request = loadUiPackRuntimeInternal(normalizedManifestUrl)
    .catch((error) => createErrorRuntime(normalizedManifestUrl, error));
  UI_PACK_REQUEST_CACHE.set(normalizedManifestUrl, request);
  return request;
}

export function clearUiPackRuntimeCache(): void {
  UI_PACK_REQUEST_CACHE.clear();
}
