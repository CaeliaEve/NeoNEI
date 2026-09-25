export const NATIVE_UI_INTERACTION_KIND_NONE = "none";
export const NATIVE_UI_INTERACTION_KIND_ITEM_CLICK = "item-click";
export const NATIVE_UI_INTERACTION_TARGET_NONE = "none";
export const NATIVE_UI_INTERACTION_TARGET_ITEM = "item";
export const NATIVE_UI_INTERACTION_PAYLOAD_SCHEMA = "neonei/native-ui-interaction/v1";

export type NativeUiInteractionKind =
  | typeof NATIVE_UI_INTERACTION_KIND_NONE
  | typeof NATIVE_UI_INTERACTION_KIND_ITEM_CLICK;

export type NativeUiInteractionTargetKind =
  | typeof NATIVE_UI_INTERACTION_TARGET_NONE
  | typeof NATIVE_UI_INTERACTION_TARGET_ITEM;

export interface NativeUiInteractionPayload {
  kind: NativeUiInteractionKind;
  targetKind: NativeUiInteractionTargetKind;
  targetId: string | null;
  payloadSchema: typeof NATIVE_UI_INTERACTION_PAYLOAD_SCHEMA;
}

type NativeUiInteractionSource = {
  interactionKind?: unknown;
  interactionTargetKind?: unknown;
  interactionTargetId?: unknown;
  interactionPayloadSchema?: unknown;
};

function requiredString(value: unknown, field: string, label: string): string {
  const normalized = `${value ?? ""}`.trim();
  if (!normalized) {
    throw new Error(`${label} missing required Native UI interaction field: ${field}`);
  }
  return normalized;
}

export function resolveNativeUiInteractionPayload(
  source: NativeUiInteractionSource,
  label = "Native UI interaction",
): NativeUiInteractionPayload {
  const payloadSchema = requiredString(source.interactionPayloadSchema, "interactionPayloadSchema", label);
  if (payloadSchema !== NATIVE_UI_INTERACTION_PAYLOAD_SCHEMA) {
    throw new Error(`${label} uses unsupported interactionPayloadSchema: ${payloadSchema}`);
  }
  const kind = requiredString(source.interactionKind, "interactionKind", label);
  const targetKind = requiredString(source.interactionTargetKind, "interactionTargetKind", label);
  const targetId = `${source.interactionTargetId ?? ""}`.trim();

  if (kind === NATIVE_UI_INTERACTION_KIND_NONE) {
    if (targetKind !== NATIVE_UI_INTERACTION_TARGET_NONE) {
      throw new Error(`${label} non-interactive payload must use interactionTargetKind=none`);
    }
    if (targetId) {
      throw new Error(`${label} non-interactive payload must not declare interactionTargetId`);
    }
    return {
      kind,
      targetKind,
      targetId: null,
      payloadSchema: NATIVE_UI_INTERACTION_PAYLOAD_SCHEMA,
    };
  }

  if (kind === NATIVE_UI_INTERACTION_KIND_ITEM_CLICK) {
    if (targetKind !== NATIVE_UI_INTERACTION_TARGET_ITEM) {
      throw new Error(`${label} item-click payload must use interactionTargetKind=item`);
    }
    if (!targetId) {
      throw new Error(`${label} item-click payload requires interactionTargetId`);
    }
    return {
      kind,
      targetKind,
      targetId,
      payloadSchema: NATIVE_UI_INTERACTION_PAYLOAD_SCHEMA,
    };
  }

  throw new Error(`${label} uses unsupported interactionKind: ${kind}`);
}
