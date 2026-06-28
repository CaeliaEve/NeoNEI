import path from 'path';
import { NESQL_REPOSITORY_PATH } from '../config/runtime-paths';

export type AccelerationCompilerAuthority = 'internal-sqlite' | 'external-runtime';

const AUTHORITY_ENV = 'NEONEI_ACCELERATION_COMPILER_AUTHORITY';
const RAW_EXPORT_ROOT_ENV = 'NEONEI_EXTERNAL_RUNTIME_RAW_EXPORT_ROOT';

function normalizeEnv(value: string | undefined): string {
  return `${value ?? ''}`.trim().toLowerCase();
}

export function resolveAccelerationCompilerAuthority(): AccelerationCompilerAuthority {
  const value = normalizeEnv(process.env[AUTHORITY_ENV]);
  if (!value || value === 'internal' || value === 'internal-sqlite') {
    return 'internal-sqlite';
  }
  if (value === 'external' || value === 'external-runtime' || value === 'elysium-compiler') {
    return 'external-runtime';
  }
  throw new Error(
    `${AUTHORITY_ENV} must be one of internal-sqlite or external-runtime; received: ${process.env[AUTHORITY_ENV]}`,
  );
}

export function getExternalRuntimeRawExportRoot(): string {
  const explicit = `${process.env[RAW_EXPORT_ROOT_ENV] ?? ''}`.trim();
  const root = explicit || NESQL_REPOSITORY_PATH;
  if (!root) {
    throw new Error(`${RAW_EXPORT_ROOT_ENV} or NESQL_REPOSITORY_PATH is required for external-runtime compiler authority`);
  }
  return path.resolve(root);
}
