import type { RecipeUiPayload } from "./api";
import {
  preserveEncodedDistDataFileNamePath,
  resolveDistDataAssetPath,
} from "./distDataRuntimeAssetResolver.ts";

export interface NativeNeiRecipeFrame {
  status: "captured";
  assetRef: string;
  width: number;
  height: number;
  coordinateSpace: "nei_pixels";
  source?: string | null;
  handlerKey?: string | null;
  handlerClass?: string | null;
  recipeIndex?: number | null;
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function nativeNeiFrameRecordFromPayload(
  payload: RecipeUiPayload | null | undefined,
): Record<string, unknown> | null {
  const payloadRecord = asRecord(payload);
  return asRecord(payloadRecord?.nativeFrame)
    ?? asRecord(asRecord(payloadRecord?.metadata)?.nativeFrame)
    ?? asRecord(asRecord(payloadRecord?.additionalData)?.nativeFrame);
}

function positiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.ceil(numeric);
}

export function nativeNeiFrameFromPayload(
  payload: RecipeUiPayload | null | undefined,
): NativeNeiRecipeFrame | null {
  const frameRecord = nativeNeiFrameRecordFromPayload(payload);
  if (!frameRecord) {
    return null;
  }

  const status = `${frameRecord.status ?? ""}`.trim().toLowerCase();
  const assetRef = `${frameRecord.assetRef ?? ""}`.trim();
  const coordinateSpace = `${frameRecord.coordinateSpace ?? ""}`.trim();
  const width = positiveInteger(frameRecord.width);
  const height = positiveInteger(frameRecord.height);
  if (
    status !== "captured"
    || !assetRef
    || coordinateSpace !== "nei_pixels"
    || width === null
    || height === null
  ) {
    return null;
  }

  return {
    ...frameRecord,
    status: "captured",
    assetRef,
    width,
    height,
    coordinateSpace: "nei_pixels",
    source: typeof frameRecord.source === "string" ? frameRecord.source : null,
    handlerKey: typeof frameRecord.handlerKey === "string" ? frameRecord.handlerKey : null,
    handlerClass: typeof frameRecord.handlerClass === "string" ? frameRecord.handlerClass : null,
    recipeIndex: Number.isFinite(Number(frameRecord.recipeIndex)) ? Number(frameRecord.recipeIndex) : null,
  };
}

export function nativeNeiFrameValidationError(
  payload: RecipeUiPayload | null | undefined,
): string | null {
  const frameRecord = nativeNeiFrameRecordFromPayload(payload);
  if (!frameRecord) {
    return "Native recipe UI frame is missing; export must provide nativeFrame captured from in-game NEI; refusing heuristic canvas path.";
  }

  const status = `${frameRecord.status ?? ""}`.trim().toLowerCase();
  if (status !== "captured") {
    return `Native recipe UI frame status must be "captured", got "${status || "missing"}".`;
  }
  if (!`${frameRecord.assetRef ?? ""}`.trim()) {
    return "Native recipe UI frame is captured but assetRef is missing.";
  }
  if (`${frameRecord.coordinateSpace ?? ""}`.trim() !== "nei_pixels") {
    return "Native recipe UI frame coordinateSpace must be nei_pixels.";
  }
  if (positiveInteger(frameRecord.width) === null || positiveInteger(frameRecord.height) === null) {
    return "Native recipe UI frame must declare positive width and height.";
  }
  return null;
}

export function nativeNeiFrameAssetUrl(frame: NativeNeiRecipeFrame | null): string | null {
  if (!frame) {
    return null;
  }
  return resolveDistDataAssetPath(preserveEncodedDistDataFileNamePath(frame.assetRef));
}
