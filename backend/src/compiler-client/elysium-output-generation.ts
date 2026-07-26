import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const POINTER_SCHEMA = 'elysium-compiler/output-generation-pointer/v1';
const SEAL_SCHEMA = 'elysium-compiler/output-generation-seal/v1';
const GENERATIONS_DIRECTORY = 'generations';
const SEAL_FILE = 'generation-seal.json';

type JsonRecord = Record<string, unknown>;

type GenerationFile = {
  path: string;
  bytes: number;
  sha256: string;
};

export type ResolvedElysiumOutputGeneration = Readonly<{
  authorityRoot: string;
  generationRoot: string;
  generationId: string;
  runtimeId: string;
  sealPath: string;
}>;

function readJsonObject(filePath: string, label: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`failed to parse ${label} ${filePath}: ${String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object: ${filePath}`);
  }
  return parsed as JsonRecord;
}

function requireNonSymlinkFile(filePath: string, label: string): void {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a non-symlink regular file: ${filePath}`);
  }
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function requireSha256(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value : '';
  if (!/^[0-9a-f]{64}$/.test(text)) {
    throw new Error(`${label} must be a lowercase SHA-256 hex digest`);
  }
  return text;
}

function comparablePath(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function portableRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function requireRealPathIdentity(filePath: string, label: string): void {
  const real = fs.realpathSync(filePath);
  if (comparablePath(real) !== comparablePath(filePath)) {
    throw new Error(`${label} must not be a symlink, junction, or reparse-point: ${filePath}`);
  }
}

function collectGenerationFiles(generationRoot: string): GenerationFile[] {
  const stack = [generationRoot];
  const files: GenerationFile[] = [];
  while (stack.length > 0) {
    const directory = stack.pop() as string;
    requireRealPathIdentity(directory, 'Elysium output generation directory');
    for (const name of fs.readdirSync(directory).sort()) {
      const absolutePath = path.join(directory, name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Elysium output generation contains a symlink: ${absolutePath}`);
      }
      requireRealPathIdentity(absolutePath, 'Elysium output generation entry');
      if (stat.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`Elysium output generation contains a non-regular entry: ${absolutePath}`);
      }
      const relativePath = portableRelativePath(generationRoot, absolutePath);
      if (relativePath === SEAL_FILE) continue;
      files.push({ path: relativePath, bytes: stat.size, sha256: sha256File(absolutePath) });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function parseSealedFiles(seal: JsonRecord): GenerationFile[] {
  if (!Array.isArray(seal.files)) {
    throw new Error('Elysium output generation seal files must be an array');
  }
  const seen = new Set<string>();
  const files = seal.files.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Elysium output generation seal files[${index}] must be an object`);
    }
    const record = entry as JsonRecord;
    const relativePath = typeof record.path === 'string' ? record.path : '';
    if (!relativePath || relativePath.includes('\\') || path.posix.isAbsolute(relativePath)
      || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error(`Elysium output generation seal files[${index}].path is not portable: ${relativePath}`);
    }
    if (relativePath === SEAL_FILE || seen.has(relativePath)) {
      throw new Error(`Elysium output generation seal contains duplicate/reserved path: ${relativePath}`);
    }
    seen.add(relativePath);
    const bytes = record.bytes;
    if (!Number.isSafeInteger(bytes) || (bytes as number) < 0) {
      throw new Error(`Elysium output generation seal files[${index}].bytes must be a non-negative integer`);
    }
    return { path: relativePath, bytes: bytes as number, sha256: requireSha256(record.sha256, `seal files[${index}].sha256`) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (seal.fileCount !== files.length) {
    throw new Error(`Elysium output generation seal fileCount mismatch: declared=${String(seal.fileCount)}, actual=${files.length}`);
  }
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (seal.totalBytes !== totalBytes) {
    throw new Error(`Elysium output generation seal totalBytes mismatch: declared=${String(seal.totalBytes)}, actual=${totalBytes}`);
  }
  return files;
}

export function resolveElysiumOutputGeneration(authorityInput: string): ResolvedElysiumOutputGeneration {
  const requestedRoot = path.resolve(authorityInput);
  const authorityStat = fs.lstatSync(requestedRoot, { throwIfNoEntry: false });
  if (!authorityStat?.isDirectory() || authorityStat.isSymbolicLink()) {
    throw new Error(`Elysium output authority must be a non-symlink directory: ${requestedRoot}`);
  }
  const authorityRoot = fs.realpathSync(requestedRoot);
  const generationsPath = path.join(authorityRoot, GENERATIONS_DIRECTORY);
  const generationsStat = fs.lstatSync(generationsPath, { throwIfNoEntry: false });
  if (!generationsStat?.isDirectory() || generationsStat.isSymbolicLink()) {
    throw new Error(`Elysium output generations must be a non-symlink directory: ${generationsPath}`);
  }
  const generationsRoot = fs.realpathSync(generationsPath);
  if (path.dirname(generationsRoot) !== authorityRoot) {
    throw new Error(`Elysium output generations directory escapes authority: ${generationsRoot}`);
  }

  const pointerPath = path.join(authorityRoot, 'current.json');
  requireNonSymlinkFile(pointerPath, 'Elysium output pointer');
  const pointer = readJsonObject(pointerPath, 'Elysium output pointer');
  if (pointer.schemaVersion !== POINTER_SCHEMA) {
    throw new Error(`unsupported Elysium output pointer schema: ${String(pointer.schemaVersion)}`);
  }
  const generationId = typeof pointer.generationId === 'string' ? pointer.generationId : '';
  if (!/^[a-z0-9][a-z0-9-]{8,80}$/.test(generationId)) {
    throw new Error(`invalid Elysium output generation id: ${generationId}`);
  }
  const expectedRelativePath = `${GENERATIONS_DIRECTORY}/${generationId}`;
  if (pointer.relativePath !== expectedRelativePath) {
    throw new Error(`Elysium output pointer relativePath must equal ${expectedRelativePath}`);
  }
  const runtimeId = typeof pointer.runtimeId === 'string' ? pointer.runtimeId.trim() : '';
  if (!runtimeId) {
    throw new Error('Elysium output pointer runtimeId must be non-empty');
  }
  const expectedSealSha256 = requireSha256(pointer.sealSha256, 'Elysium output pointer sealSha256');

  const generationPath = path.join(authorityRoot, ...expectedRelativePath.split('/'));
  const generationStat = fs.lstatSync(generationPath, { throwIfNoEntry: false });
  if (!generationStat?.isDirectory() || generationStat.isSymbolicLink()) {
    throw new Error(`Elysium current output generation is missing or invalid: ${generationPath}`);
  }
  const generationRoot = fs.realpathSync(generationPath);
  if (path.dirname(generationRoot) !== generationsRoot || path.basename(generationRoot) !== generationId) {
    throw new Error(`Elysium current output generation escapes generations directory: ${generationRoot}`);
  }

  const sealPath = path.join(generationRoot, SEAL_FILE);
  requireNonSymlinkFile(sealPath, 'Elysium output generation seal');
  const actualSealSha256 = sha256File(sealPath);
  if (actualSealSha256 !== expectedSealSha256) {
    throw new Error(`Elysium output generation seal hash mismatch: expected=${expectedSealSha256}, actual=${actualSealSha256}`);
  }
  const seal = readJsonObject(sealPath, 'Elysium output generation seal');
  if (seal.schemaVersion !== SEAL_SCHEMA) {
    throw new Error(`unsupported Elysium output generation seal schema: ${String(seal.schemaVersion)}`);
  }
  if (seal.generationId !== generationId || seal.runtimeId !== runtimeId) {
    throw new Error('Elysium output generation seal identity does not match current pointer');
  }
  const sealedFiles = parseSealedFiles(seal);
  const actualFiles = collectGenerationFiles(generationRoot);
  if (JSON.stringify(actualFiles) !== JSON.stringify(sealedFiles)) {
    throw new Error('Elysium output generation tree does not match generation seal');
  }

  return Object.freeze({ authorityRoot, generationRoot, generationId, runtimeId, sealPath });
}
