import fs from 'fs';
import path from 'path';

export type AccelerationCompilerAuthority = 'internal-sqlite' | 'external-runtime';

const AUTHORITY_ENV = 'NEONEI_ACCELERATION_COMPILER_AUTHORITY';
const RAW_EXPORT_ROOT_ENV = 'NEONEI_EXTERNAL_RUNTIME_RAW_EXPORT_ROOT';
const POINTER_FILE = 'current.json';
const POINTER_SCHEMA = 'nesqlpp/raw-export-generation-pointer/v1';
const GENERATIONS_DIRECTORY = 'generations';

export type ExternalRuntimeRawExportInput = Readonly<{
  authorityRoot: string;
  generationRoot: string;
  authority: 'generation-pointer';
}>;

function normalizeEnv(value: string | undefined): string {
  return `${value ?? ''}`.trim().toLowerCase();
}

function isNonSymlinkFile(filePath: string): boolean {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
  return Boolean(stat?.isFile() && !stat.isSymbolicLink());
}

export function resolveAccelerationCompilerAuthority(): AccelerationCompilerAuthority {
  const value = normalizeEnv(process.env[AUTHORITY_ENV]);
  if (!value) {
    return 'external-runtime';
  }
  if (value === 'internal' || value === 'internal-sqlite') {
    if (normalizeEnv(process.env.NODE_ENV) === 'production') {
      throw new Error(`${AUTHORITY_ENV}=internal-sqlite is retired from the production runtime`);
    }
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
  if (!explicit) {
    throw new Error(`${RAW_EXPORT_ROOT_ENV} is required for external-runtime compiler authority`);
  }
  return path.resolve(explicit);
}

export function resolveExternalRuntimeRawExportInput(input: string): ExternalRuntimeRawExportInput {
  const requestedRoot = path.resolve(input);
  const rootStat = fs.lstatSync(requestedRoot, { throwIfNoEntry: false });
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`external runtime raw-export authority must be a non-symlink directory: ${requestedRoot}`);
  }
  const authorityRoot = fs.realpathSync(requestedRoot);
  const pointerPath = path.join(authorityRoot, POINTER_FILE);
  if (!fs.existsSync(pointerPath)) {
    throw new Error(`external runtime raw-export authority is missing required ${POINTER_FILE}: ${authorityRoot}`);
  }
  const pointerStat = fs.lstatSync(pointerPath);
  if (!pointerStat.isFile() || pointerStat.isSymbolicLink()) {
    throw new Error(`external runtime raw-export pointer must be a non-symlink regular file: ${pointerPath}`);
  }
  let pointer: unknown;
  try {
    pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
  } catch (error) {
    throw new Error(`failed to parse external runtime raw-export pointer ${pointerPath}: ${String(error)}`);
  }
  if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer)) {
    throw new Error(`external runtime raw-export pointer must be a JSON object: ${pointerPath}`);
  }
  const record = pointer as Record<string, unknown>;
  if (record.schemaVersion !== POINTER_SCHEMA) {
    throw new Error(`unsupported external runtime raw-export pointer schema: ${String(record.schemaVersion)}`);
  }
  const generationId = typeof record.generationId === 'string' ? record.generationId : '';
  if (!/^[a-z0-9][a-z0-9-]{8,80}$/.test(generationId)) {
    throw new Error(`invalid external runtime raw-export generation id: ${generationId}`);
  }
  const expectedRelativePath = `${GENERATIONS_DIRECTORY}/${generationId}`;
  if (record.relativePath !== expectedRelativePath) {
    throw new Error(
      `external runtime raw-export pointer relativePath must equal ${expectedRelativePath}; found ${String(record.relativePath)}`,
    );
  }
  const generationsPath = path.join(authorityRoot, GENERATIONS_DIRECTORY);
  const generationsStat = fs.lstatSync(generationsPath, { throwIfNoEntry: false });
  if (!generationsStat?.isDirectory() || generationsStat.isSymbolicLink()) {
    throw new Error(`external runtime raw-export generations must be a non-symlink directory: ${generationsPath}`);
  }
  const generationsRoot = fs.realpathSync(generationsPath);
  if (path.dirname(generationsRoot) !== authorityRoot) {
    throw new Error(`external runtime raw-export generations directory escapes authority: ${generationsRoot}`);
  }
  const generationPath = path.join(authorityRoot, ...expectedRelativePath.split('/'));
  const generationStat = fs.lstatSync(generationPath, { throwIfNoEntry: false });
  if (!generationStat?.isDirectory() || generationStat.isSymbolicLink()) {
    throw new Error(`external runtime raw-export current generation is missing or invalid: ${generationPath}`);
  }
  const generationRoot = fs.realpathSync(generationPath);
  if (path.dirname(generationRoot) !== generationsRoot) {
    throw new Error(`external runtime raw-export current generation escapes generations directory: ${generationRoot}`);
  }
  if (!isNonSymlinkFile(path.join(generationRoot, 'manifest.json'))) {
    throw new Error(`external runtime raw-export current generation manifest is missing: ${generationRoot}`);
  }
  return Object.freeze({ authorityRoot, generationRoot, authority: 'generation-pointer' });
}
