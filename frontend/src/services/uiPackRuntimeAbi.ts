import {
  NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
  UI_PACK_ABI_VALIDATION_REPORT_PATH,
} from "./nativeUiPackAbi.ts";

export const UI_PACK_RUNTIME_SCHEMA = "neonei/ui-pack-runtime/current" as const;

export const UI_PACK_RUNTIME_STATUS = Object.freeze({
  ready: "ready",
  error: "error",
} as const);

export type UiPackRuntimeStatus = typeof UI_PACK_RUNTIME_STATUS[keyof typeof UI_PACK_RUNTIME_STATUS];

export type UiPackRuntimeStatusDescriptor = Readonly<{
  status: UiPackRuntimeStatus;
  terminal: boolean;
  usable: boolean;
}>;

export const UI_PACK_RUNTIME_STATUS_DESCRIPTORS: readonly UiPackRuntimeStatusDescriptor[] =
  Object.freeze([
    Object.freeze({
      status: UI_PACK_RUNTIME_STATUS.ready,
      terminal: true,
      usable: true,
    }),
    Object.freeze({
      status: UI_PACK_RUNTIME_STATUS.error,
      terminal: true,
      usable: false,
    }),
  ]);

export const UI_PACK_RUNTIME_ENTRYPOINTS = Object.freeze({
  templates: "uiTemplates",
  bindings: "uiBindings",
  strings: "uiStrings",
} as const);

export type UiPackRuntimeEntrypoints = Readonly<{
  templates: string;
  bindings: string;
  strings: string;
  exportAbiReport: string;
  abiReport: string;
}>;

export interface UiPackRuntimeSummary {
  templateCount: number;
  bindingCount: number;
  boundRecipeCount: number;
  unboundRecipeCount: number;
  stringCount: number;
  slotCount: number;
  textOverlayCount: number;
  dynamicPrimitiveCount: number;
  hotspotCount: number;
  viewportCount: number;
  assetCount: number;
}

export function createEmptyUiPackRuntimeSummary(): UiPackRuntimeSummary {
  return {
    templateCount: 0,
    bindingCount: 0,
    boundRecipeCount: 0,
    unboundRecipeCount: 0,
    stringCount: 0,
    slotCount: 0,
    textOverlayCount: 0,
    dynamicPrimitiveCount: 0,
    hotspotCount: 0,
    viewportCount: 0,
    assetCount: 0,
  };
}

export type UiPackRuntimeReportId = "exportAbiReport" | "abiReport";

export type UiPackRuntimeReportDescriptor = Readonly<{
  id: UiPackRuntimeReportId;
  label: string;
  requiredPath: string;
}>;

export const UI_PACK_RUNTIME_REPORT_DESCRIPTORS: readonly UiPackRuntimeReportDescriptor[] =
  Object.freeze([
    Object.freeze({
      id: "exportAbiReport",
      label: "native UI export ABI validation report",
      requiredPath: NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
    }),
    Object.freeze({
      id: "abiReport",
      label: "native UI ABI validation report",
      requiredPath: UI_PACK_ABI_VALIDATION_REPORT_PATH,
    }),
  ]);

export const UI_PACK_RUNTIME_REPORT_BY_ID = Object.freeze(
  UI_PACK_RUNTIME_REPORT_DESCRIPTORS.reduce((result, descriptor) => {
    result[descriptor.id] = descriptor;
    return result;
  }, {} as Record<UiPackRuntimeReportId, UiPackRuntimeReportDescriptor>),
);

export const UI_PACK_RUNTIME_MODULE = Object.freeze({
  id: "uiPack.runtime",
  schema: UI_PACK_RUNTIME_SCHEMA,
  statusCount: UI_PACK_RUNTIME_STATUS_DESCRIPTORS.length,
  statuses: UI_PACK_RUNTIME_STATUS_DESCRIPTORS,
  entrypoints: UI_PACK_RUNTIME_ENTRYPOINTS,
  reports: UI_PACK_RUNTIME_REPORT_DESCRIPTORS,
  failurePolicy: "fail-closed",
} as const);
