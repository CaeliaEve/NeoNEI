/** Current runtime snapshot ABI catalog. */

export const CURRENT_RUNTIME_SNAPSHOT_DEFAULTS = Object.freeze({
  missingRuntimeId: 'runtime-missing',
  unknownSchemaRevision: 'runtime.unknown',
} as const);

export const CURRENT_RUNTIME_MANIFEST_FIELDS = Object.freeze({
  schemaRevision: 'schemaRevision',
  schema: 'schema',
  runtimeId: 'runtimeId',
  capabilities: 'capabilities',
} as const);
