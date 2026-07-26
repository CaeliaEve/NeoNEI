import crypto from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep, posix } from 'node:path';

const POINTER_SCHEMA = 'elysium-compiler/output-generation-pointer/v1';
const SEAL_SCHEMA = 'elysium-compiler/output-generation-seal/v1';

function readJsonObject(filePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`failed to parse ${label} ${filePath}: ${String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object: ${filePath}`);
  }
  return parsed;
}

function requireDirectory(filePath, label) {
  const stat = lstatSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a non-symlink directory: ${filePath}`);
  }
}

function requireFile(filePath, label) {
  const stat = lstatSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a non-symlink regular file: ${filePath}`);
  }
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function comparablePath(value) {
  const normalized = resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function requireRealPathIdentity(filePath, label) {
  if (comparablePath(realpathSync(filePath)) !== comparablePath(filePath)) {
    throw new Error(`${label} must not be a symlink, junction, or reparse-point: ${filePath}`);
  }
}

function collectGenerationFiles(generationRoot) {
  const stack = [generationRoot];
  const files = [];
  while (stack.length) {
    const directory = stack.pop();
    requireRealPathIdentity(directory, 'Elysium output generation directory');
    for (const name of readdirSync(directory).sort()) {
      const absolutePath = join(directory, name);
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) throw new Error(`Elysium output generation contains a symlink: ${absolutePath}`);
      requireRealPathIdentity(absolutePath, 'Elysium output generation entry');
      if (stat.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (!stat.isFile()) throw new Error(`Elysium output generation contains a non-regular entry: ${absolutePath}`);
      const relativePath = relative(generationRoot, absolutePath).split(sep).join('/');
      if (relativePath === 'generation-seal.json') continue;
      files.push({ path: relativePath, bytes: stat.size, sha256: sha256(absolutePath) });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function parseSealedFiles(seal) {
  if (!Array.isArray(seal.files)) throw new Error('Elysium output generation seal files must be an array');
  const seen = new Set();
  const files = seal.files.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`seal files[${index}] must be an object`);
    const relativePath = typeof entry.path === 'string' ? entry.path : '';
    if (!relativePath || relativePath.includes('\\') || posix.isAbsolute(relativePath)
      || relativePath.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error(`seal files[${index}].path is not portable: ${relativePath}`);
    }
    if (relativePath === 'generation-seal.json' || seen.has(relativePath)) throw new Error(`duplicate/reserved seal path: ${relativePath}`);
    seen.add(relativePath);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[0-9a-f]{64}$/.test(`${entry.sha256 ?? ''}`)) {
      throw new Error(`invalid seal file descriptor: ${relativePath}`);
    }
    return { path: relativePath, bytes: entry.bytes, sha256: entry.sha256 };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (seal.fileCount !== files.length) throw new Error('Elysium output generation seal fileCount mismatch');
  if (seal.totalBytes !== files.reduce((sum, file) => sum + file.bytes, 0)) throw new Error('Elysium output generation seal totalBytes mismatch');
  return files;
}

export function resolveElysiumOutputGeneration(authorityInput) {
  const requestedRoot = resolve(authorityInput);
  requireDirectory(requestedRoot, 'Elysium output authority');
  const authorityRoot = realpathSync(requestedRoot);
  const generationsPath = join(authorityRoot, 'generations');
  requireDirectory(generationsPath, 'Elysium output generations');
  const generationsRoot = realpathSync(generationsPath);
  if (dirname(generationsRoot) !== authorityRoot) {
    throw new Error(`Elysium output generations directory escapes authority: ${generationsRoot}`);
  }
  const pointerPath = join(authorityRoot, 'current.json');
  requireFile(pointerPath, 'Elysium output pointer');
  const pointer = readJsonObject(pointerPath, 'Elysium output pointer');
  if (pointer.schemaVersion !== POINTER_SCHEMA) {
    throw new Error(`unsupported Elysium output pointer schema: ${String(pointer.schemaVersion)}`);
  }
  const generationId = typeof pointer.generationId === 'string' ? pointer.generationId : '';
  if (!/^[a-z0-9][a-z0-9-]{8,80}$/.test(generationId)) {
    throw new Error(`invalid Elysium output generation id: ${generationId}`);
  }
  const relativePath = `generations/${generationId}`;
  if (pointer.relativePath !== relativePath) {
    throw new Error(`Elysium output pointer relativePath must equal ${relativePath}`);
  }
  const generationPath = join(authorityRoot, 'generations', generationId);
  requireDirectory(generationPath, 'Elysium current output generation');
  const generationRoot = realpathSync(generationPath);
  if (dirname(generationRoot) !== generationsRoot || basename(generationRoot) !== generationId) {
    throw new Error(`Elysium current output generation escapes generations directory: ${generationRoot}`);
  }
  const sealPath = join(generationRoot, 'generation-seal.json');
  requireFile(sealPath, 'Elysium output generation seal');
  if (!/^[0-9a-f]{64}$/.test(`${pointer.sealSha256 ?? ''}`) || sha256(sealPath) !== pointer.sealSha256) {
    throw new Error('Elysium output generation seal hash mismatch');
  }
  const seal = readJsonObject(sealPath, 'Elysium output generation seal');
  if (seal.schemaVersion !== SEAL_SCHEMA || seal.generationId !== generationId || seal.runtimeId !== pointer.runtimeId) {
    throw new Error('Elysium output generation seal identity does not match current pointer');
  }
  const sealedFiles = parseSealedFiles(seal);
  const actualFiles = collectGenerationFiles(generationRoot);
  if (JSON.stringify(actualFiles) !== JSON.stringify(sealedFiles)) {
    throw new Error('Elysium output generation tree does not match generation seal');
  }
  return Object.freeze({ authorityRoot, generationRoot, generationId, runtimeId: pointer.runtimeId, pointerPath, sealPath });
}
