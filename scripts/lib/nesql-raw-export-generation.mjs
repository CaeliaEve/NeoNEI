import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const POINTER_SCHEMA = 'nesqlpp/raw-export-generation-pointer/v1';

function requireDirectory(filePath, label) {
  const stat = lstatSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a non-symlink directory: ${filePath}`);
}

function requireFile(filePath, label) {
  const stat = lstatSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a non-symlink regular file: ${filePath}`);
}

export function resolveNesqlRawExportGeneration(authorityInput) {
  const requestedRoot = resolve(authorityInput);
  requireDirectory(requestedRoot, 'NESQL raw-export authority');
  const authorityRoot = realpathSync(requestedRoot);
  const pointerPath = join(authorityRoot, 'current.json');
  requireFile(pointerPath, 'NESQL raw-export pointer');
  let pointer;
  try {
    pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
  } catch (error) {
    throw new Error(`failed to parse NESQL raw-export pointer ${pointerPath}: ${String(error)}`);
  }
  if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer) || pointer.schemaVersion !== POINTER_SCHEMA) {
    throw new Error(`unsupported NESQL raw-export pointer schema: ${String(pointer?.schemaVersion)}`);
  }
  const generationId = typeof pointer.generationId === 'string' ? pointer.generationId : '';
  if (!/^[a-z0-9][a-z0-9-]{8,80}$/.test(generationId)) throw new Error(`invalid NESQL raw-export generation id: ${generationId}`);
  const relativePath = `generations/${generationId}`;
  if (pointer.relativePath !== relativePath) throw new Error(`NESQL raw-export pointer relativePath must equal ${relativePath}`);
  const generationsPath = join(authorityRoot, 'generations');
  requireDirectory(generationsPath, 'NESQL raw-export generations');
  const generationsRoot = realpathSync(generationsPath);
  if (dirname(generationsRoot) !== authorityRoot) throw new Error(`NESQL raw-export generations directory escapes authority: ${generationsRoot}`);
  const generationPath = join(generationsRoot, generationId);
  requireDirectory(generationPath, 'NESQL current raw-export generation');
  const generationRoot = realpathSync(generationPath);
  if (dirname(generationRoot) !== generationsRoot || basename(generationRoot) !== generationId) {
    throw new Error(`NESQL current raw-export generation escapes generations directory: ${generationRoot}`);
  }
  requireFile(join(generationRoot, 'manifest.json'), 'NESQL current raw-export manifest');
  return Object.freeze({ authorityRoot, generationRoot, generationId, pointerPath });
}
