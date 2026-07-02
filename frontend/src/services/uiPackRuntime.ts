import {
  getNativeRuntimePackPayloadBuffer,
  loadNativeRuntimeManifest,
  parseNativeRuntimePackHeader,
} from "../native-surface/runtimeLoader.ts";
import {
  assertNativeUiRuntimeManifest,
  getNativeRuntimeEntrypointSource,
} from "../native-surface/NativeRuntimeCapabilityGate.ts";
import type { NativeRuntimeManifest } from "../native-surface/NativeRuntimeManifest";
import {
  getManifestRuntimeFileBytes,
  normalizeRuntimePath,
  runtimeManifestDeclaresPath,
  runtimeManifestFileRecord,
  runtimePathFromValue,
} from "./runtimeManifestPath.ts";

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

export interface UiPackRect {
  id: string;
  kind: string;
  role: string;
  label: string;
  tooltip: string;
  action: string;
  itemId: string;
  payloadKey: string;
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
  hotspots: UiPackRect[];
  viewports: UiPackRect[];
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
  hotspotCount: number;
  viewportCount: number;
  assetCount: number;
}

export type UiPackRuntimeStatus = "ready" | "error";

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
const UI_PACK_ABI_VALIDATION_REPORT_PATH = "rust/ui-pack-abi-validation-report.json";
const UI_PACK_ABI_VALIDATION_SCHEMA_VERSION = "elysium-compiler/ui-pack-abi-validation/v1";
const UI_TEMPLATE_PACK_SCHEMA = "neonei/ui-template-pack/current";
const UI_BINDING_PACK_SCHEMA = "neonei/ui-binding-pack/current";
const UI_STRING_PACK_SCHEMA = "neonei/ui-string-pack/current";
const UI_TEMPLATE_PACK_MAGIC = "NEIUIT1\0";
const UI_BINDING_PACK_MAGIC = "NEIUIB1\0";
const UI_STRING_PACK_MAGIC = "NEIUIS1\0";
const UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT = "NEIUIT1_NUL";
const UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT = "NEIUIB1_NUL";
const UI_STRING_PACK_PAYLOAD_MAGIC_REPORT = "NEIUIS1_NUL";
const UI_TEMPLATE_PAYLOAD_VERSION = 3;
const UI_BINDING_PAYLOAD_VERSION = 1;
const UI_STRING_PAYLOAD_VERSION = 1;
const UI_TEMPLATE_ROW_STRIDE_U32 = 19;
const UI_SLOT_ROW_STRIDE_U32 = 6;
const UI_TEXT_ROW_STRIDE_U32 = 5;
const UI_RECT_ROW_STRIDE_U32 = 12;
const UI_BINDING_ROW_STRIDE_U32 = 11;

type UiPackEntrypoints = {
  templates: string;
  bindings: string;
  strings: string;
  abiReport: string;
};

type JsonRecord = Record<string, unknown>;

type UiPackArtifactContract = {
  logicalName: string;
  path: string;
  envelopeSchema: string;
  payloadMagic: string;
  version: number;
};

function isPortableRelativePath(path: string): boolean {
  return Boolean(path)
    && !path.startsWith("/")
    && !path.includes("\\")
    && !/^[A-Za-z]:[\\/]/.test(path)
    && !path.split("/").includes("..");
}

function isCurrentRuntimeManifestUrl(manifestUrl: string): boolean {
  try {
    const pathname = new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/").pathname;
    return pathname.endsWith("/api/runtime/current/manifest");
  } catch {
    return manifestUrl.includes("/api/runtime/current/manifest");
  }
}

function encodeRuntimeFilePath(relativePath: string): string {
  return relativePath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function resolveCurrentRuntimeAssetUrl(manifestUrl: string, relativePath: string): string {
  const encodedPath = encodeRuntimeFilePath(relativePath);
  try {
    return new URL(`/api/runtime/current/asset/${encodedPath}`, new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/")).toString();
  } catch {
    return `/api/runtime/current/asset/${encodedPath}`;
  }
}

function resolveManifestRelativeUrl(manifestUrl: string, relativePath: string): string {
  if (!isPortableRelativePath(relativePath)) {
    throw new Error(`UI pack path is not portable: ${relativePath}`);
  }
  if (isCurrentRuntimeManifestUrl(manifestUrl)) {
    return resolveCurrentRuntimeAssetUrl(manifestUrl, relativePath);
  }
  return new URL(relativePath, manifestUrl).toString();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function resolveUiPackAbiReportPath(manifest: NativeRuntimeManifest): string {
  const entrypoints = getNativeRuntimeEntrypointSource(manifest);
  const explicitEntrypoint = runtimePathFromValue(
    entrypoints.rustUiPackAbiValidationReport
      ?? entrypoints.uiPackAbiValidationReport
      ?? entrypoints.uiPackAbiReport,
  );
  if (explicitEntrypoint) return explicitEntrypoint;

  const fileRecord = runtimeManifestFileRecord(manifest.files);
  const explicitFile = runtimePathFromValue(
    fileRecord?.rustUiPackAbiValidationReport
      ?? fileRecord?.uiPackAbiValidationReport
      ?? fileRecord?.uiPackAbiReport,
  );
  if (explicitFile) return explicitFile;

  if (runtimeManifestDeclaresPath({ entrypoints, files: manifest.files }, UI_PACK_ABI_VALIDATION_REPORT_PATH)) {
    return UI_PACK_ABI_VALIDATION_REPORT_PATH;
  }

  throw new Error(
    `native UI runtime manifest does not declare required ABI validation report: ${UI_PACK_ABI_VALIDATION_REPORT_PATH}`,
  );
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
  const hotspotCount = readU32(view, 24);
  const viewportCount = readU32(view, 28);
  const templateStride = readU32(view, 32);
  const slotStride = readU32(view, 36);
  const textStride = readU32(view, 40);
  const rectStride = readU32(view, 44);
  if (
    templateStride !== UI_TEMPLATE_ROW_STRIDE_U32
    || slotStride !== UI_SLOT_ROW_STRIDE_U32
    || textStride !== UI_TEXT_ROW_STRIDE_U32
    || rectStride !== UI_RECT_ROW_STRIDE_U32
  ) {
    throw new Error(`UI template pack has unexpected strides: ${templateStride}/${slotStride}/${textStride}/${rectStride}`);
  }
  const templateBytes = checkedTableBytes(templateCount, templateStride, "UI template");
  const slotBytes = checkedTableBytes(slotCount, slotStride, "UI slot");
  const textBytes = checkedTableBytes(textCount, textStride, "UI text");
  const hotspotBytes = checkedTableBytes(hotspotCount, rectStride, "UI hotspot");
  const viewportBytes = checkedTableBytes(viewportCount, rectStride, "UI viewport");
  let cursor = 48;
  assertPayloadLength(payloadBuffer, cursor + templateBytes + slotBytes + textBytes + hotspotBytes + viewportBytes, "UI template pack");
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
  cursor += textBytes;
  const readRect = (rowOffset: number): UiPackRect => ({
    id: resolveString(strings, readU32(view, rowOffset + 0)),
    kind: resolveString(strings, readU32(view, rowOffset + 4)),
    role: resolveString(strings, readU32(view, rowOffset + 8)),
    label: resolveString(strings, readU32(view, rowOffset + 12)),
    tooltip: resolveString(strings, readU32(view, rowOffset + 16)),
    action: resolveString(strings, readU32(view, rowOffset + 20)),
    itemId: resolveString(strings, readU32(view, rowOffset + 24)),
    payloadKey: resolveString(strings, readU32(view, rowOffset + 28)),
    x: readI32(view, rowOffset + 32),
    y: readI32(view, rowOffset + 36),
    width: readU32(view, rowOffset + 40),
    height: readU32(view, rowOffset + 44),
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
    maxRecipesPerPage: templateRow.maxRecipesPerPage,
    imageResource: templateRow.imageResource,
    handlerCount: templateRow.handlerCount,
    slotCount: templateRow.slotCount,
    slots: sliceRows("UI template slots", slots, templateRow.slotStart, templateRow.slotCount),
    textOverlays: sliceRows("UI template text overlays", overlays, templateRow.textStart, templateRow.textCount),
    hotspots: sliceRows("UI template hotspots", hotspots, templateRow.hotspotStart, templateRow.hotspotCount),
    viewports: sliceRows("UI template viewports", viewports, templateRow.viewportStart, templateRow.viewportCount),
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

function parseUiPackManifest(manifest: NativeRuntimeManifest): UiPackEntrypoints {
  const entrypoints = assertNativeUiRuntimeManifest(manifest);
  const abiReport = resolveUiPackAbiReportPath(manifest);
  if (!runtimeManifestDeclaresPath({ entrypoints, files: manifest.files }, abiReport)) {
    throw new Error(`native UI ABI validation report is not declared by runtime manifest files: ${abiReport}`);
  }
  return {
    templates: asString(entrypoints.uiTemplates),
    bindings: asString(entrypoints.uiBindings),
    strings: asString(entrypoints.uiStrings),
    abiReport,
  };
}

async function fetchPackBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load UI pack artifact: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

async function fetchJsonRecord(url: string, label: string): Promise<JsonRecord> {
  const response = await fetch(url, { cache: "no-cache" });
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

function buildUiPackArtifactContracts(entrypoints: UiPackEntrypoints): UiPackArtifactContract[] {
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
  entrypoints: UiPackEntrypoints,
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

function unwrapUiPackPayload(buffer: ArrayBuffer, expectedSchema: typeof UI_TEMPLATE_PACK_SCHEMA | typeof UI_BINDING_PACK_SCHEMA | typeof UI_STRING_PACK_SCHEMA): ArrayBuffer {
  const header = parseNativeRuntimePackHeader(buffer, expectedSchema);
  return getNativeRuntimePackPayloadBuffer(buffer, header);
}

async function loadUiPackRuntimeInternal(normalizedManifestUrl: string): Promise<UiPackRuntime> {
  const manifest = await loadNativeRuntimeManifest(normalizedManifestUrl);
  const entrypoints = parseUiPackManifest(manifest);

  const abiReportUrl = resolveManifestRelativeUrl(normalizedManifestUrl, entrypoints.abiReport);
  const abiReport = await fetchJsonRecord(abiReportUrl, "native UI ABI validation report");
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
      hotspotCount: templates.reduce((total, template) => total + template.hotspots.length, 0),
      viewportCount: templates.reduce((total, template) => total + template.viewports.length, 0),
      assetCount: new Set(templates.map((template) => template.imageResource).filter(Boolean)).size,
    },
  };
}

function createErrorRuntime(manifestUrl: string, error: unknown): UiPackRuntime {
  return {
    status: "error",
    manifestUrl,
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
      hotspotCount: 0,
      viewportCount: 0,
      assetCount: 0,
    },
    error: error instanceof Error ? error.message : String(error),
  };
}

export function loadUiPackRuntime(manifestUrl = "/api/runtime/current/manifest"): Promise<UiPackRuntime> {
  const normalizedManifestUrl = new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/").toString();
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
