import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DIST_DATA_DIR } from '../config/runtime-paths';

export const EXTERNAL_RUNTIME_POINTER_SCHEMA = 'neonei/runtime-artifact-generation-pointer/current' as const;
export const EXTERNAL_RUNTIME_PROMOTION_JOURNAL_SCHEMA = 'neonei/external-runtime-promotion-journal/current' as const;
export const EXTERNAL_RUNTIME_PROMOTION_LOCK_SCHEMA = 'neonei/external-runtime-promotion-lock/current' as const;
export const EXTERNAL_RUNTIME_GENERATION_SEAL_SCHEMA = 'neonei/external-runtime-generation-seal/current' as const;

const GENERATIONS_DIRECTORY = 'generations';
const CURRENT_POINTER_FILE = 'current.json';
const PROMOTION_JOURNAL_FILE = '.promotion-journal.json';
const PROMOTION_LOCK_FILE = '.promotion.lock';
const GENERATION_SEAL_FILE = 'generation-seal.json';

type JsonRecord = Record<string, unknown>;

export type ExternalRuntimeGenerationPointer = Readonly<{
  schemaVersion: typeof EXTERNAL_RUNTIME_POINTER_SCHEMA;
  generationId: string;
  relativePath: string;
  runtimeId: string | null;
  runtimeManifestSchema: string | null;
  promotedAt: string;
  releaseHash: string;
}>;

export type ExternalRuntimeGenerationSealFile = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

export type ExternalRuntimeGenerationSeal = Readonly<{
  schemaVersion: typeof EXTERNAL_RUNTIME_GENERATION_SEAL_SCHEMA;
  generationId: string;
  runtimeId: string | null;
  releaseHash: string;
  fileCount: number;
  totalBytes: number;
  files: readonly ExternalRuntimeGenerationSealFile[];
}>;

export type CurrentExternalRuntimeGeneration = Readonly<{
  authorityRoot: string;
  generationsRoot: string;
  pointerPath: string;
  generationId: string;
  generationRoot: string;
  pointer: ExternalRuntimeGenerationPointer;
}>;

export type ExternalRuntimePromotionJournal = Readonly<{
  schemaVersion: typeof EXTERNAL_RUNTIME_PROMOTION_JOURNAL_SCHEMA;
  transactionId: string;
  phase: 'preparing' | 'generation-sealed' | 'pointer-published';
  authorityRoot: string;
  stagingRelativePath: string;
  generationId: string;
  generationRelativePath: string;
  previousPointer: ExternalRuntimeGenerationPointer | null;
  targetPointer: ExternalRuntimeGenerationPointer;
  updatedAt: string;
}>;

export type ExternalRuntimePromotionRecovery = Readonly<{
  status: 'clean' | 'stale-lock-removed' | 'rolled-back' | 'completed';
  transactionId: string | null;
  generationId: string | null;
}>;

export type ExternalRuntimePromotionLock = Readonly<{
  transactionId: string;
  release: () => void;
}>;

function comparablePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function readJsonObject(filePath: string, label: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`${label} is missing or invalid JSON: ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object: ${filePath}`);
  }
  return parsed as JsonRecord;
}

function atomicWriteJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(tempPath, 'wx');
    fs.writeFileSync(descriptor, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(tempPath, filePath);
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  }
}

function requireRealDirectory(directoryPath: string, label: string, create = false): string {
  const resolved = path.resolve(directoryPath);
  if (create) fs.mkdirSync(resolved, { recursive: true });
  const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${resolved}`);
  }
  const real = fs.realpathSync(resolved);
  if (comparablePath(real) !== comparablePath(resolved)) {
    throw new Error(`${label} must not be a symlink, junction, or reparse-point: ${resolved}`);
  }
  return resolved;
}

function requireRegularFile(filePath: string, label: string): void {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a non-symlink regular file: ${filePath}`);
  }
  const real = fs.realpathSync(filePath);
  if (comparablePath(real) !== comparablePath(filePath)) {
    throw new Error(`${label} must not be a symlink, junction, or reparse-point: ${filePath}`);
  }
}

function sha256RegularFile(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function portableRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function collectExternalRuntimeGenerationFiles(
  generationRoot: string,
): ExternalRuntimeGenerationSealFile[] {
  const root = requireRealDirectory(generationRoot, 'external runtime generation verification root');
  const files: ExternalRuntimeGenerationSealFile[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop() as string;
    requireRealDirectory(directory, 'external runtime generation verification directory');
    for (const name of fs.readdirSync(directory).sort()) {
      const absolutePath = path.join(directory, name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`external runtime generation contains a symbolic link: ${absolutePath}`);
      }
      if (stat.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`external runtime generation contains a non-regular entry: ${absolutePath}`);
      }
      requireRegularFile(absolutePath, 'external runtime generation file');
      const relativePath = portableRelativePath(root, absolutePath);
      if (relativePath === GENERATION_SEAL_FILE) continue;
      files.push(Object.freeze({
        path: relativePath,
        bytes: stat.size,
        sha256: sha256RegularFile(absolutePath),
      }));
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function parseExternalRuntimeGenerationSealFiles(
  generationRoot: string,
  rawFiles: unknown,
): ExternalRuntimeGenerationSealFile[] {
  if (!Array.isArray(rawFiles)) {
    throw new Error('external runtime generation seal files must be an array');
  }
  const seen = new Set<string>();
  return rawFiles.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`external runtime generation seal files[${index}] must be an object`);
    }
    const record = entry as JsonRecord;
    const relativePath = `${record.path ?? ''}`;
    resolveRelativeUnderRoot(
      generationRoot,
      relativePath,
      `external runtime generation seal files[${index}].path`,
    );
    if (relativePath === GENERATION_SEAL_FILE || seen.has(relativePath)) {
      throw new Error(`external runtime generation seal contains a duplicate or reserved path: ${relativePath}`);
    }
    seen.add(relativePath);
    const bytes = Number(record.bytes);
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error(`external runtime generation seal files[${index}].bytes must be a non-negative integer`);
    }
    const sha256 = `${record.sha256 ?? ''}`;
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error(`external runtime generation seal files[${index}].sha256 must be a lowercase SHA-256 digest`);
    }
    return Object.freeze({ path: relativePath, bytes, sha256 });
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function requireGenerationId(value: unknown): string {
  const generationId = `${value ?? ''}`.trim();
  if (!/^gen-[a-z0-9-]{1,96}-[0-9a-f]{16}$/.test(generationId)) {
    throw new Error(`invalid external runtime generation id: ${generationId}`);
  }
  return generationId;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requirePointer(record: JsonRecord, label: string): ExternalRuntimeGenerationPointer {
  if (record.schemaVersion !== EXTERNAL_RUNTIME_POINTER_SCHEMA) {
    throw new Error(`unsupported ${label} schema: ${String(record.schemaVersion)}`);
  }
  const generationId = requireGenerationId(record.generationId);
  const relativePath = `${record.relativePath ?? ''}`;
  const expectedRelativePath = `${GENERATIONS_DIRECTORY}/${generationId}`;
  if (relativePath !== expectedRelativePath) {
    throw new Error(`${label} relativePath must equal ${expectedRelativePath}; found ${relativePath}`);
  }
  const promotedAt = `${record.promotedAt ?? ''}`.trim();
  if (!promotedAt || Number.isNaN(Date.parse(promotedAt))) {
    throw new Error(`${label} promotedAt must be an ISO timestamp`);
  }
  const releaseHash = `${record.releaseHash ?? ''}`.trim();
  if (!/^[0-9a-f]{64}$/.test(releaseHash)) {
    throw new Error(`${label} releaseHash must be a lowercase SHA-256 digest`);
  }
  return Object.freeze({
    schemaVersion: EXTERNAL_RUNTIME_POINTER_SCHEMA,
    generationId,
    relativePath,
    runtimeId: nullableString(record.runtimeId),
    runtimeManifestSchema: nullableString(record.runtimeManifestSchema),
    promotedAt,
    releaseHash,
  });
}

function pointersEqual(
  left: ExternalRuntimeGenerationPointer | null,
  right: ExternalRuntimeGenerationPointer | null,
): boolean {
  if (!left || !right) return left === right;
  return left.generationId === right.generationId
    && left.relativePath === right.relativePath
    && left.releaseHash === right.releaseHash;
}

function resolveRelativeUnderRoot(rootDir: string, relativePath: string, label: string): string {
  if (!relativePath || relativePath.includes('\\') || path.isAbsolute(relativePath)
    || /^[A-Za-z]:[\\/]/.test(relativePath)
    || relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} must be a portable relative path: ${relativePath}`);
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes authority root: ${relativePath}`);
  }
  return resolved;
}

function tryReadPointer(authorityRoot: string): ExternalRuntimeGenerationPointer | null {
  const pointerPath = path.join(authorityRoot, CURRENT_POINTER_FILE);
  if (!fs.existsSync(pointerPath)) return null;
  requireRegularFile(pointerPath, 'external runtime current pointer');
  return requirePointer(readJsonObject(pointerPath, 'external runtime current pointer'), 'external runtime current pointer');
}

function validateGenerationRoot(
  authorityRoot: string,
  pointer: ExternalRuntimeGenerationPointer,
): CurrentExternalRuntimeGeneration {
  const generationsRoot = requireRealDirectory(
    path.join(authorityRoot, GENERATIONS_DIRECTORY),
    'external runtime generations directory',
  );
  const generationRoot = resolveRelativeUnderRoot(authorityRoot, pointer.relativePath, 'external runtime generation path');
  requireRealDirectory(generationRoot, 'external runtime generation');
  if (comparablePath(path.dirname(generationRoot)) !== comparablePath(generationsRoot)) {
    throw new Error(`external runtime generation escapes generations directory: ${generationRoot}`);
  }
  requireRegularFile(path.join(generationRoot, 'manifest.json'), 'external runtime generation manifest');
  requireRegularFile(path.join(generationRoot, 'rust', 'runtime-manifest.json'), 'external runtime generation runtime manifest');
  const sealPath = path.join(generationRoot, GENERATION_SEAL_FILE);
  requireRegularFile(sealPath, 'external runtime generation seal');
  const seal = readJsonObject(sealPath, 'external runtime generation seal');
  if (seal.schemaVersion !== EXTERNAL_RUNTIME_GENERATION_SEAL_SCHEMA
    || seal.generationId !== pointer.generationId
    || seal.releaseHash !== pointer.releaseHash
    || nullableString(seal.runtimeId) !== pointer.runtimeId
    || !Number.isSafeInteger(seal.fileCount) || Number(seal.fileCount) <= 0
    || !Number.isSafeInteger(seal.totalBytes) || Number(seal.totalBytes) <= 0
    || !Array.isArray(seal.files) || seal.files.length !== seal.fileCount) {
    throw new Error(`external runtime generation seal does not match current pointer: ${sealPath}`);
  }
  return Object.freeze({
    authorityRoot,
    generationsRoot,
    pointerPath: path.join(authorityRoot, CURRENT_POINTER_FILE),
    generationId: pointer.generationId,
    generationRoot,
    pointer,
  });
}

export function ensureExternalRuntimeAuthorityRoot(authorityRoot = DIST_DATA_DIR): string {
  return requireRealDirectory(authorityRoot, 'external runtime authority root', true);
}

export function tryResolveCurrentExternalRuntimeGeneration(
  authorityRoot = DIST_DATA_DIR,
): CurrentExternalRuntimeGeneration | null {
  const root = ensureExternalRuntimeAuthorityRoot(authorityRoot);
  const pointer = tryReadPointer(root);
  return pointer ? validateGenerationRoot(root, pointer) : null;
}

export function resolveCurrentExternalRuntimeGeneration(
  authorityRoot = DIST_DATA_DIR,
): CurrentExternalRuntimeGeneration {
  const resolved = tryResolveCurrentExternalRuntimeGeneration(authorityRoot);
  if (!resolved) {
    throw new Error(`external runtime authority is missing required ${CURRENT_POINTER_FILE}: ${path.resolve(authorityRoot)}`);
  }
  return resolved;
}

export function resolveCurrentExternalRuntimeFile(
  relativePath: string,
  authorityRoot = DIST_DATA_DIR,
): string {
  const current = resolveCurrentExternalRuntimeGeneration(authorityRoot);
  return resolveRelativeUnderRoot(current.generationRoot, relativePath, 'external runtime artifact path');
}

export function verifyExternalRuntimeGenerationSeal(
  generationRoot: string,
  expected: Readonly<{
    generationId?: string | null;
    runtimeId?: string | null;
    releaseHash?: string | null;
  }> = {},
): ExternalRuntimeGenerationSeal {
  const root = requireRealDirectory(generationRoot, 'external runtime generation verification root');
  const sealPath = path.join(root, GENERATION_SEAL_FILE);
  requireRegularFile(sealPath, 'external runtime generation seal');
  const record = readJsonObject(sealPath, 'external runtime generation seal');
  if (record.schemaVersion !== EXTERNAL_RUNTIME_GENERATION_SEAL_SCHEMA) {
    throw new Error(`unsupported external runtime generation seal schema: ${String(record.schemaVersion)}`);
  }
  const generationId = requireGenerationId(record.generationId);
  const runtimeId = nullableString(record.runtimeId);
  const releaseHash = `${record.releaseHash ?? ''}`;
  if (!/^[0-9a-f]{64}$/.test(releaseHash)) {
    throw new Error('external runtime generation seal releaseHash must be a lowercase SHA-256 digest');
  }
  const sealedFiles = parseExternalRuntimeGenerationSealFiles(root, record.files);
  if (record.fileCount !== sealedFiles.length) {
    throw new Error(`external runtime generation seal fileCount mismatch: declared=${String(record.fileCount)}, actual=${sealedFiles.length}`);
  }
  const totalBytes = sealedFiles.reduce((total, file) => total + file.bytes, 0);
  if (record.totalBytes !== totalBytes) {
    throw new Error(`external runtime generation seal totalBytes mismatch: declared=${String(record.totalBytes)}, actual=${totalBytes}`);
  }
  if (expected.generationId != null && generationId !== expected.generationId) {
    throw new Error(`external runtime generation seal generationId mismatch: expected=${expected.generationId}, actual=${generationId}`);
  }
  if (expected.runtimeId !== undefined && runtimeId !== expected.runtimeId) {
    throw new Error(`external runtime generation seal runtimeId mismatch: expected=${String(expected.runtimeId)}, actual=${String(runtimeId)}`);
  }
  if (expected.releaseHash != null && releaseHash !== expected.releaseHash) {
    throw new Error(`external runtime generation seal releaseHash mismatch: expected=${expected.releaseHash}, actual=${releaseHash}`);
  }
  const actualFiles = collectExternalRuntimeGenerationFiles(root);
  if (JSON.stringify(actualFiles) !== JSON.stringify(sealedFiles)) {
    throw new Error(`external runtime generation tree does not match generation seal: ${root}`);
  }
  return Object.freeze({
    schemaVersion: EXTERNAL_RUNTIME_GENERATION_SEAL_SCHEMA,
    generationId,
    runtimeId,
    releaseHash,
    fileCount: sealedFiles.length,
    totalBytes,
    files: Object.freeze(sealedFiles),
  });
}

export function verifyCurrentExternalRuntimeGenerationSeal(
  authorityRoot = DIST_DATA_DIR,
): ExternalRuntimeGenerationSeal | null {
  const current = tryResolveCurrentExternalRuntimeGeneration(authorityRoot);
  if (!current) return null;
  return verifyExternalRuntimeGenerationSeal(current.generationRoot, {
    generationId: current.generationId,
    runtimeId: current.pointer.runtimeId,
    releaseHash: current.pointer.releaseHash,
  });
}

export function publishExternalRuntimeGenerationPointer(
  authorityRoot: string,
  pointer: ExternalRuntimeGenerationPointer,
): void {
  const root = ensureExternalRuntimeAuthorityRoot(authorityRoot);
  requirePointer(pointer as unknown as JsonRecord, 'external runtime target pointer');
  validateGenerationRoot(root, pointer);
  atomicWriteJson(path.join(root, CURRENT_POINTER_FILE), pointer);
}

export function writeExternalRuntimePromotionJournal(
  authorityRoot: string,
  journal: ExternalRuntimePromotionJournal,
): void {
  const root = ensureExternalRuntimeAuthorityRoot(authorityRoot);
  atomicWriteJson(path.join(root, PROMOTION_JOURNAL_FILE), journal);
}

export function writeExternalRuntimeGenerationSeal(
  generationRoot: string,
  seal: ExternalRuntimeGenerationSeal,
): void {
  const root = requireRealDirectory(generationRoot, 'external runtime generation staging directory');
  atomicWriteJson(path.join(root, GENERATION_SEAL_FILE), seal);
}

export function clearExternalRuntimePromotionJournal(authorityRoot: string): void {
  fs.rmSync(path.join(path.resolve(authorityRoot), PROMOTION_JOURNAL_FILE), { force: true });
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === 'object' && 'code' in error
      && `${(error as { code?: unknown }).code ?? ''}` === 'EPERM');
  }
}

function readLock(lockPath: string): JsonRecord | null {
  try {
    return readJsonObject(lockPath, 'external runtime promotion lock');
  } catch {
    return null;
  }
}

function removeStalePromotionLock(authorityRoot: string): boolean {
  const lockPath = path.join(authorityRoot, PROMOTION_LOCK_FILE);
  if (!fs.existsSync(lockPath)) return false;
  const lock = readLock(lockPath);
  const lockHost = `${lock?.hostname ?? ''}`;
  const pid = Number(lock?.pid ?? 0);
  if (lock?.schemaVersion === EXTERNAL_RUNTIME_PROMOTION_LOCK_SCHEMA
    && lockHost === os.hostname()
    && isProcessAlive(pid)) {
    throw new Error(`external runtime promotion writer lock is active: pid=${pid}, transaction=${String(lock.transactionId)}`);
  }
  if (lock?.schemaVersion === EXTERNAL_RUNTIME_PROMOTION_LOCK_SCHEMA
    && lockHost
    && lockHost !== os.hostname()) {
    throw new Error(`external runtime promotion writer lock belongs to another host: ${lockHost}`);
  }
  fs.rmSync(lockPath, { force: true });
  return true;
}

export function acquireExternalRuntimePromotionLock(
  authorityRoot: string,
  transactionId: string,
): ExternalRuntimePromotionLock {
  const root = ensureExternalRuntimeAuthorityRoot(authorityRoot);
  const lockPath = path.join(root, PROMOTION_LOCK_FILE);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let descriptor: number | null = null;
    try {
      descriptor = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(descriptor, `${JSON.stringify({
        schemaVersion: EXTERNAL_RUNTIME_PROMOTION_LOCK_SCHEMA,
        pid: process.pid,
        hostname: os.hostname(),
        transactionId,
        acquiredAt: new Date().toISOString(),
      }, null, 2)}\n`, 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = null;
      return Object.freeze({
        transactionId,
        release: () => {
          if (!fs.existsSync(lockPath)) return;
          const lock = readLock(lockPath);
          if (`${lock?.transactionId ?? ''}` !== transactionId) {
            throw new Error(`external runtime promotion lock ownership changed: ${lockPath}`);
          }
          fs.rmSync(lockPath, { force: true });
        },
      });
    } catch (error) {
      if (descriptor !== null) fs.closeSync(descriptor);
      if (!(error && typeof error === 'object' && 'code' in error
        && `${(error as { code?: unknown }).code ?? ''}` === 'EEXIST')) {
        throw error;
      }
      removeStalePromotionLock(root);
    }
  }
  throw new Error(`failed to acquire external runtime promotion writer lock: ${lockPath}`);
}

function requireJournal(record: JsonRecord, authorityRoot: string): ExternalRuntimePromotionJournal {
  if (record.schemaVersion !== EXTERNAL_RUNTIME_PROMOTION_JOURNAL_SCHEMA) {
    throw new Error(`unsupported external runtime promotion journal schema: ${String(record.schemaVersion)}`);
  }
  const transactionId = `${record.transactionId ?? ''}`.trim();
  if (!/^[a-z0-9-]{8,160}$/.test(transactionId)) {
    throw new Error(`invalid external runtime promotion transaction id: ${transactionId}`);
  }
  const phase = `${record.phase ?? ''}` as ExternalRuntimePromotionJournal['phase'];
  if (!['preparing', 'generation-sealed', 'pointer-published'].includes(phase)) {
    throw new Error(`invalid external runtime promotion journal phase: ${phase}`);
  }
  if (comparablePath(`${record.authorityRoot ?? ''}`) !== comparablePath(authorityRoot)) {
    throw new Error('external runtime promotion journal authority root mismatch');
  }
  const generationId = requireGenerationId(record.generationId);
  const generationRelativePath = `${record.generationRelativePath ?? ''}`;
  if (generationRelativePath !== `${GENERATIONS_DIRECTORY}/${generationId}`) {
    throw new Error('external runtime promotion journal generation path mismatch');
  }
  const stagingRelativePath = `${record.stagingRelativePath ?? ''}`;
  if (!stagingRelativePath.startsWith(`${GENERATIONS_DIRECTORY}/.staging-`)) {
    throw new Error('external runtime promotion journal staging path is invalid');
  }
  resolveRelativeUnderRoot(authorityRoot, stagingRelativePath, 'external runtime promotion staging path');
  const rawPrevious = record.previousPointer;
  const previousPointer = rawPrevious && typeof rawPrevious === 'object' && !Array.isArray(rawPrevious)
    ? requirePointer(rawPrevious as JsonRecord, 'external runtime previous pointer')
    : null;
  const rawTarget = record.targetPointer;
  if (!rawTarget || typeof rawTarget !== 'object' || Array.isArray(rawTarget)) {
    throw new Error('external runtime promotion journal target pointer is missing');
  }
  const targetPointer = requirePointer(rawTarget as JsonRecord, 'external runtime target pointer');
  if (targetPointer.generationId !== generationId) {
    throw new Error('external runtime promotion journal target pointer generation mismatch');
  }
  return Object.freeze({
    schemaVersion: EXTERNAL_RUNTIME_PROMOTION_JOURNAL_SCHEMA,
    transactionId,
    phase,
    authorityRoot,
    stagingRelativePath,
    generationId,
    generationRelativePath,
    previousPointer,
    targetPointer,
    updatedAt: `${record.updatedAt ?? ''}`,
  });
}

export function recoverExternalRuntimeArtifactPromotion(
  authorityRoot = DIST_DATA_DIR,
  ownedTransactionId?: string,
): ExternalRuntimePromotionRecovery {
  const root = ensureExternalRuntimeAuthorityRoot(authorityRoot);
  let staleLockRemoved = false;
  if (ownedTransactionId) {
    const lock = readLock(path.join(root, PROMOTION_LOCK_FILE));
    if (`${lock?.transactionId ?? ''}` !== ownedTransactionId) {
      throw new Error('external runtime promotion recovery does not own the writer lock');
    }
  } else {
    staleLockRemoved = removeStalePromotionLock(root);
  }
  const journalPath = path.join(root, PROMOTION_JOURNAL_FILE);
  if (!fs.existsSync(journalPath)) {
    return Object.freeze({
      status: staleLockRemoved ? 'stale-lock-removed' : 'clean',
      transactionId: null,
      generationId: null,
    });
  }
  requireRegularFile(journalPath, 'external runtime promotion journal');
  const journal = requireJournal(readJsonObject(journalPath, 'external runtime promotion journal'), root);
  const currentPointer = tryReadPointer(root);
  const stagingRoot = resolveRelativeUnderRoot(root, journal.stagingRelativePath, 'external runtime promotion staging path');
  const generationRoot = resolveRelativeUnderRoot(root, journal.generationRelativePath, 'external runtime promotion generation path');

  if (pointersEqual(currentPointer, journal.targetPointer)) {
    if (fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
    const current = validateGenerationRoot(root, journal.targetPointer);
    verifyExternalRuntimeGenerationSeal(current.generationRoot, {
      generationId: journal.targetPointer.generationId,
      runtimeId: journal.targetPointer.runtimeId,
      releaseHash: journal.targetPointer.releaseHash,
    });
    fs.rmSync(journalPath, { force: true });
    return Object.freeze({
      status: 'completed',
      transactionId: journal.transactionId,
      generationId: journal.generationId,
    });
  }

  if (!pointersEqual(currentPointer, journal.previousPointer)) {
    throw new Error('external runtime promotion recovery found an unexpected current pointer; refusing automatic recovery');
  }
  if (fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
  if (fs.existsSync(generationRoot)) fs.rmSync(generationRoot, { recursive: true, force: true });
  fs.rmSync(journalPath, { force: true });
  return Object.freeze({
    status: 'rolled-back',
    transactionId: journal.transactionId,
    generationId: journal.generationId,
  });
}
