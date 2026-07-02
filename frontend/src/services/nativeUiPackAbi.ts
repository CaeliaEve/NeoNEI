/**
 * Native UI runtime pack ABI catalog.
 *
 * Keep the compact UI pack wire contract in one frontend module so runtime
 * parsing, tests, and production gates do not drift from the compiler's
 * versioned ABI catalog.
 */

export const UI_PACK_ABI_VALIDATION_REPORT_PATH = "rust/ui-pack-abi-validation-report.json";
export const UI_PACK_ABI_VALIDATION_SCHEMA_VERSION = "elysium-compiler/ui-pack-abi-validation/v1";
export const NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH = "rust/native-ui-export-abi-validation-report.json";
export const NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION = "elysium-compiler/native-ui-export-abi-validation/v1";
export const NATIVE_UI_EXPORT_RAW_REPORT_SCHEMA_VERSION = "nesqlpp/raw-export/alpha1/native-ui-validation";

export const UI_TEMPLATE_PACK_SCHEMA = "neonei/ui-template-pack/current";
export const UI_BINDING_PACK_SCHEMA = "neonei/ui-binding-pack/current";
export const UI_STRING_PACK_SCHEMA = "neonei/ui-string-pack/current";

export const UI_TEMPLATE_PACK_MAGIC = "NEIUIT1\0";
export const UI_BINDING_PACK_MAGIC = "NEIUIB1\0";
export const UI_STRING_PACK_MAGIC = "NEIUIS1\0";
export const UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT = "NEIUIT1_NUL";
export const UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT = "NEIUIB1_NUL";
export const UI_STRING_PACK_PAYLOAD_MAGIC_REPORT = "NEIUIS1_NUL";

export const UI_TEMPLATE_PAYLOAD_VERSION = 9;
export const UI_BINDING_PAYLOAD_VERSION = 1;
export const UI_STRING_PAYLOAD_VERSION = 1;

export const UI_TEMPLATE_ROW_STRIDE_U32 = 25;
export const UI_SLOT_ROW_STRIDE_U32 = 12;
export const UI_TEXT_ROW_STRIDE_U32 = 7;
export const UI_PRIMITIVE_ROW_STRIDE_U32 = 13;
export const UI_RECT_ROW_STRIDE_U32 = 15;
export const UI_BINDING_ROW_STRIDE_U32 = 11;

export const UI_PACK_SURFACE_CONTRACT_FIELDS = Object.freeze([
  "coordinateSpace",
  "scaleMode",
  "anchor",
]);
export const UI_PACK_SLOT_GEOMETRY_FIELDS = Object.freeze([
  "coordinateSpace",
  "anchor",
  "slotWidth",
  "slotHeight",
  "pitchX",
  "pitchY",
]);
export const UI_PACK_TEMPLATE_DYNAMIC_PRIMITIVE_FIELDS = Object.freeze([
  "dynamicPrimitives",
]);
export const UI_PACK_DYNAMIC_PRIMITIVE_GEOMETRY_FIELDS = Object.freeze([
  "kind",
  "role",
  "x",
  "y",
  "width",
  "height",
  "coordinateSpace",
  "anchor",
  "orientation",
  "source",
  "trackColor",
  "fillColor",
  "borderColor",
]);
export const UI_PACK_RECT_GEOMETRY_FIELDS = Object.freeze([
  "coordinateSpace",
  "anchor",
]);
export const UI_PACK_INTERACTION_CONTRACT_FIELDS = Object.freeze([
  "interactionKind",
  "interactionTargetKind",
  "interactionTargetId",
  "interactionPayloadSchema",
]);
export const UI_PACK_BACKGROUND_CONTRACT_FIELDS = Object.freeze([
  "coordinateSpace",
  "scaleMode",
  "anchor",
  "status",
  "kind",
  "scaling",
  "texture",
  "recipeBackgroundOffset",
  "recipeBackgroundSize",
]);
export const UI_PACK_TEMPLATE_BACKGROUND_FIELD = "nativeBackground";

