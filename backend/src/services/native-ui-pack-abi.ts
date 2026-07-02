/**
 * Backend Native UI pack ABI catalog.
 *
 * Runtime proof checks must validate the same versioned pack contract as the
 * frontend parser and compiler gates. Keep these constants centralized instead
 * of embedding historical ABI versions in proof services.
 */

export const UI_PACK_ABI_VALIDATION_REPORT_PATH = 'rust/ui-pack-abi-validation-report.json';
export const UI_PACK_ABI_VALIDATION_SCHEMA_VERSION = 'elysium-compiler/ui-pack-abi-validation/v1';
export const NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH = 'rust/native-ui-export-abi-validation-report.json';
export const NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION = 'elysium-compiler/native-ui-export-abi-validation/v1';
export const NATIVE_UI_EXPORT_RAW_REPORT_SCHEMA_VERSION = 'nesqlpp/raw-export/alpha1/native-ui-validation';

export const UI_TEMPLATE_PACK_SCHEMA = 'neonei/ui-template-pack/current';
export const UI_BINDING_PACK_SCHEMA = 'neonei/ui-binding-pack/current';
export const UI_STRING_PACK_SCHEMA = 'neonei/ui-string-pack/current';

export const UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT = 'NEIUIT1_NUL';
export const UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT = 'NEIUIB1_NUL';
export const UI_STRING_PACK_PAYLOAD_MAGIC_REPORT = 'NEIUIS1_NUL';

export const UI_TEMPLATE_PAYLOAD_VERSION = 9;
export const UI_BINDING_PAYLOAD_VERSION = 1;
export const UI_STRING_PAYLOAD_VERSION = 1;

