import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DIST_DATA_DIR } from '../config/runtime-paths';
import {
  loadElysiumCompiledArtifactDescriptor,
  type ElysiumCompiledArtifactDescriptor,
} from '../compiler-client/elysium-compiled-artifact-loader';
import {
  EXTERNAL_RUNTIME_GENERATION_SEAL_SCHEMA,
  EXTERNAL_RUNTIME_POINTER_SCHEMA,
  EXTERNAL_RUNTIME_PROMOTION_JOURNAL_SCHEMA,
  acquireExternalRuntimePromotionLock,
  clearExternalRuntimePromotionJournal,
  ensureExternalRuntimeAuthorityRoot,
  publishExternalRuntimeGenerationPointer,
  recoverExternalRuntimeArtifactPromotion,
  tryResolveCurrentExternalRuntimeGeneration,
  verifyExternalRuntimeGenerationSeal,
  writeExternalRuntimeGenerationSeal,
  writeExternalRuntimePromotionJournal,
  type ExternalRuntimeGenerationPointer,
  type ExternalRuntimeGenerationSealFile,
  type ExternalRuntimePromotionJournal,
} from './external-runtime-generation.service';
import type { ExternalRuntimeSourceIdentity } from './external-runtime-identity.service';

const PROMOTION_SCHEMA_VERSION = 'neonei/external-runtime-artifact-promotion/current' as const;
const DEFAULT_PROMOTION_REPORT = 'rust/external-runtime-artifact-promotion-report.json';

type JsonRecord = Record<string, unknown>;

export type ExternalRuntimeArtifactPromotionOptions = {
  artifactRoot: string;
  distDataDir?: string;
  promotedAt?: string;
  reportRelativePath?: string;
  sourceIdentity?: ExternalRuntimeSourceIdentity;
  sourceGenerationId?: string;
};

export type ExternalRuntimeArtifactPromotionFile = {
  key: string | null;
  path: string;
  bytes: number;
  sha256: string;
};

export type ExternalRuntimeArtifactPromotionResult = {
  schemaVersion: typeof PROMOTION_SCHEMA_VERSION;
  artifactRoot: string;
  authorityRoot: string;
  distDataDir: string;
  generationId: string;
  generationRoot: string;
  pointerPath: string;
  releaseHash: string;
  sourceGenerationId: string | null;
  runtimeId: string | null;
  runtimeManifestSchema: string | null;
  promotedAt: string;
  manifestPath: string;
  runtimeManifestPath: string;
  reportPath: string;
  sourceIdentity: ExternalRuntimeSourceIdentity | null;
  copiedFiles: ExternalRuntimeArtifactPromotionFile[];
};

function readJsonObject(filePath: string, label: string): JsonRecord {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`external runtime artifact ${label} must be a JSON object: ${filePath}`);
  }
  return parsed as JsonRecord;
}

function isPortableRelativePath(value: string): boolean {
  return Boolean(value)
    && !value.startsWith('/')
    && !value.includes('\\')
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.split('/').includes('..')
    && !value.split('/').includes('.');
}

function requirePortableRelativePath(value: string, label: string): string {
  const normalized = `${value ?? ''}`.trim().replace(/^\/+/, '');
  if (!isPortableRelativePath(normalized)) {
    throw new Error(`external runtime artifact ${label} must be a portable relative path: ${value}`);
  }
  return normalized;
}

function resolveUnderRoot(rootDir: string, relativePath: string, label: string): string {
  const portablePath = requirePortableRelativePath(relativePath, label);
  const root = path.resolve(rootDir);
  const absolutePath = path.resolve(root, ...portablePath.split('/'));
  const relativeFromRoot = path.relative(root, absolutePath);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    throw new Error(`external runtime artifact ${label} escapes root: ${relativePath}`);
  }
  return absolutePath;
}

function comparablePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function requireRealDirectoryIdentity(directoryPath: string, label: string): string {
  const resolved = path.resolve(directoryPath);
  const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`external runtime artifact ${label} must be a real directory: ${resolved}`);
  }
  const real = fs.realpathSync(resolved);
  if (comparablePath(real) !== comparablePath(resolved)) {
    throw new Error(`external runtime artifact ${label} must not be a symlink, junction, or reparse-point: ${resolved}`);
  }
  return resolved;
}

function requireDestinationParentIdentity(distDataDir: string): string {
  const parent = path.dirname(distDataDir);
  fs.mkdirSync(parent, { recursive: true });
  return requireRealDirectoryIdentity(parent, 'promotion destination parent');
}

function requireSafeDestinationState(distDataDir: string): void {
  const stat = fs.lstatSync(distDataDir, { throwIfNoEntry: false });
  if (!stat) return;
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`external runtime artifact promotion destination must be a real directory: ${distDataDir}`);
  }
  const real = fs.realpathSync(distDataDir);
  if (comparablePath(real) !== comparablePath(distDataDir)) {
    throw new Error(`external runtime artifact promotion destination must not be a symlink, junction, or reparse-point: ${distDataDir}`);
  }
}

function ensureExistingArtifactFile(artifactRoot: string, relativePath: string, label: string): string {
  const absolutePath = resolveUnderRoot(artifactRoot, relativePath, label);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`external runtime artifact ${label} is missing: ${relativePath}`);
  }
  return absolutePath;
}

function atomicCopyFile(sourcePath: string, targetPath: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  fs.copyFileSync(sourcePath, tempPath);
  fs.renameSync(tempPath, targetPath);
}

function atomicWriteJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function collectReleaseFiles(
  rootDir: string,
  excludedRelativePaths: ReadonlySet<string> = new Set<string>(),
): ExternalRuntimeGenerationSealFile[] {
  const root = requireRealDirectoryIdentity(rootDir, 'release root');
  const files: ExternalRuntimeGenerationSealFile[] = [];
  const stack = [''];
  while (stack.length > 0) {
    const relativeDirectory = stack.pop() ?? '';
    const absoluteDirectory = path.join(root, relativeDirectory);
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.posix.join(relativeDirectory.split(path.sep).join('/'), entry.name);
      const absolutePath = path.join(root, ...relativePath.split('/'));
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`external runtime release contains a symbolic link: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        const real = fs.realpathSync(absolutePath);
        if (comparablePath(real) !== comparablePath(absolutePath)) {
          throw new Error(`external runtime release contains a junction or reparse-point: ${relativePath}`);
        }
        stack.push(relativePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`external runtime release contains a non-regular entry: ${relativePath}`);
      }
      if (excludedRelativePaths.has(relativePath)) continue;
      files.push(Object.freeze({
        path: relativePath,
        bytes: stat.size,
        sha256: sha256File(absolutePath),
      }));
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

function hashReleaseFiles(files: readonly ExternalRuntimeGenerationSealFile[]): string {
  const hash = crypto.createHash('sha256');
  hash.update('neonei/external-runtime-release-hash/current\n');
  for (const file of files) {
    hash.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`);
  }
  return hash.digest('hex');
}

function createPromotionGenerationId(runtimeId: string | null): string {
  const runtimeSlug = `${runtimeId ?? 'runtime'}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'runtime';
  return `gen-${runtimeSlug}-${crypto.randomBytes(8).toString('hex')}`;
}

function collectManifestFiles(manifest: JsonRecord, runtimeManifest: JsonRecord): Map<string, string> {
  const files = new Map<string, string>();

  const manifestFiles = manifest.files;
  if (manifestFiles && typeof manifestFiles === 'object' && !Array.isArray(manifestFiles)) {
    for (const [key, value] of Object.entries(manifestFiles as JsonRecord)) {
      if (typeof value === 'string' && value.trim()) {
        files.set(key, requirePortableRelativePath(value, `manifest.files.${key}`));
      }
    }
  }

  const runtimeFiles = runtimeManifest.files;
  if (Array.isArray(runtimeFiles)) {
    for (const [index, entry] of runtimeFiles.entries()) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const relativePath = (entry as JsonRecord).path;
      if (typeof relativePath === 'string' && relativePath.trim()) {
        const portablePath = requirePortableRelativePath(relativePath, `runtimeManifest.files[${index}].path`);
        if (![...files.values()].includes(portablePath)) {
          files.set(`runtimeFile:${index}`, portablePath);
        }
      }
    }
  } else if (runtimeFiles && typeof runtimeFiles === 'object') {
    for (const [key, value] of Object.entries(runtimeFiles as JsonRecord)) {
      if (typeof value === 'string' && value.trim()) {
        const portablePath = requirePortableRelativePath(value, `runtimeManifest.files.${key}`);
        if (![...files.values()].includes(portablePath)) {
          files.set(`runtimeFile:${key}`, portablePath);
        }
      }
    }
  }

  files.set('rustRuntimeManifest', 'rust/runtime-manifest.json');
  return files;
}

function collectArtifactTreeFiles(artifactRoot: string, files: Map<string, string>): void {
  const root = requireRealDirectoryIdentity(artifactRoot, 'root');
  const declaredPaths = new Set(files.values());
  const stack = [''];
  let anonymousIndex = 0;

  while (stack.length > 0) {
    const relativeDirectory = stack.pop() ?? '';
    const absoluteDirectory = path.join(root, relativeDirectory);
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const relativePath = path.posix.join(
        relativeDirectory.split(path.sep).join('/'),
        entry.name,
      );
      const absolutePath = path.join(root, ...relativePath.split('/'));
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`external runtime artifact contains a symbolic link: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        stack.push(relativePath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`external runtime artifact contains a non-regular entry: ${relativePath}`);
      }
      if (relativePath === 'generation-seal.json' || declaredPaths.has(relativePath)) {
        continue;
      }
      requirePortableRelativePath(relativePath, `artifact file ${relativePath}`);
      files.set(`artifactFile:${anonymousIndex}`, relativePath);
      declaredPaths.add(relativePath);
      anonymousIndex += 1;
    }
  }
}

function materializeDistManifest(args: {
  distDataDir: string;
  artifactManifest: JsonRecord;
  descriptor: ElysiumCompiledArtifactDescriptor;
  reportRelativePath: string;
  promotedAt: string;
  sourceIdentity?: ExternalRuntimeSourceIdentity;
}): JsonRecord {
  const manifestPath = path.join(args.distDataDir, 'manifest.json');
  const existing = fs.existsSync(manifestPath) ? readJsonObject(manifestPath, 'dist manifest') : {};
  const artifactFiles = args.artifactManifest.files && typeof args.artifactManifest.files === 'object' && !Array.isArray(args.artifactManifest.files)
    ? args.artifactManifest.files as JsonRecord
    : {};
  return {
    ...existing,
    schemaVersion: typeof args.artifactManifest.schemaVersion === 'string'
      ? args.artifactManifest.schemaVersion
      : (existing.schemaVersion ?? 'neonei/dist-data/current'),
    source: 'elysium-compiler',
    generatedAt: args.promotedAt,
    runtimeCacheKey: [
      'elysium-compiler',
      args.descriptor.runtimeId ?? 'runtime-id-missing',
      args.descriptor.runtimeManifestSchema ?? 'runtime-schema-missing',
      args.sourceIdentity?.identity ?? 'source-identity-missing',
      args.promotedAt,
    ].join('::'),
    externalRuntimeSourceIdentity: args.sourceIdentity ?? null,
    files: {
      ...(existing.files && typeof existing.files === 'object' && !Array.isArray(existing.files) ? existing.files as JsonRecord : {}),
      ...artifactFiles,
      rustRuntimeManifest: 'rust/runtime-manifest.json',
      rustUiTemplatesBin: 'rust/ui-pack/ui_templates.bin',
      rustUiBindingsBin: 'rust/ui-pack/ui_bindings.bin',
      rustUiStringsBin: 'rust/ui-pack/ui_strings.bin',
      externalRuntimePromotionReport: args.reportRelativePath,
    },
    nativeRuntime: args.artifactManifest.nativeRuntime,
  };
}

function refreshCopiedFileMetadata(
  copiedFiles: ExternalRuntimeArtifactPromotionFile[],
  rootDir: string,
  relativePath: string,
): void {
  const filePath = resolveUnderRoot(rootDir, relativePath, `promoted file ${relativePath}`);
  const metadata = {
    bytes: fs.statSync(filePath).size,
    sha256: sha256File(filePath),
  };
  const existing = copiedFiles.find((entry) => entry.path === relativePath);
  if (existing) {
    existing.bytes = metadata.bytes;
    existing.sha256 = metadata.sha256;
    return;
  }
  copiedFiles.push({ key: null, path: relativePath, ...metadata });
}

export function promoteExternalRuntimeArtifact(
  options: ExternalRuntimeArtifactPromotionOptions,
): ExternalRuntimeArtifactPromotionResult {
  const descriptor = loadElysiumCompiledArtifactDescriptor(options.artifactRoot);
  const authorityRoot = ensureExternalRuntimeAuthorityRoot(options.distDataDir ?? DIST_DATA_DIR);
  requireRealDirectoryIdentity(descriptor.rootDir, 'root');
  const reportRelativePath = requirePortableRelativePath(
    options.reportRelativePath ?? DEFAULT_PROMOTION_REPORT,
    'promotion report',
  );
  if (reportRelativePath === 'manifest.json' || reportRelativePath === 'rust/runtime-manifest.json') {
    throw new Error(`external runtime artifact promotion report path is reserved: ${reportRelativePath}`);
  }
  const promotedAt = options.promotedAt ?? new Date().toISOString();
  const artifactManifest = readJsonObject(descriptor.manifestPath, 'manifest');
  const runtimeManifest = readJsonObject(descriptor.runtimeManifestPath, 'runtime manifest');
  const generationId = createPromotionGenerationId(descriptor.runtimeId ?? null);
  const generationRelativePath = `generations/${generationId}`;
  const transactionId = `promotion-${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const stagingRelativePath = `generations/.staging-${transactionId}`;
  const generationsRoot = path.join(authorityRoot, 'generations');
  fs.mkdirSync(generationsRoot, { recursive: true });
  requireRealDirectoryIdentity(generationsRoot, 'promotion generations directory');
  const stagingDir = resolveUnderRoot(authorityRoot, stagingRelativePath, 'promotion staging directory');
  const generationRoot = resolveUnderRoot(authorityRoot, generationRelativePath, 'promotion generation directory');
  const pointerPath = path.join(authorityRoot, 'current.json');
  const lock = acquireExternalRuntimePromotionLock(authorityRoot, transactionId);
  let pointerPublished = false;
  try {
    recoverExternalRuntimeArtifactPromotion(authorityRoot, transactionId);
    if (fs.existsSync(stagingDir) || fs.existsSync(generationRoot)) {
      throw new Error(`external runtime promotion generation path already exists: ${generationRoot}`);
    }
    const previousPointer = tryResolveCurrentExternalRuntimeGeneration(authorityRoot)?.pointer ?? null;
    const provisionalPointer: ExternalRuntimeGenerationPointer = Object.freeze({
      schemaVersion: EXTERNAL_RUNTIME_POINTER_SCHEMA,
      generationId,
      relativePath: generationRelativePath,
      runtimeId: descriptor.runtimeId ?? null,
      runtimeManifestSchema: descriptor.runtimeManifestSchema ?? null,
      promotedAt,
      releaseHash: '0'.repeat(64),
    });
    const createJournal = (
      phase: ExternalRuntimePromotionJournal['phase'],
      targetPointer: ExternalRuntimeGenerationPointer,
    ): ExternalRuntimePromotionJournal => Object.freeze({
      schemaVersion: EXTERNAL_RUNTIME_PROMOTION_JOURNAL_SCHEMA,
      transactionId,
      phase,
      authorityRoot,
      stagingRelativePath,
      generationId,
      generationRelativePath,
      previousPointer,
      targetPointer,
      updatedAt: new Date().toISOString(),
    });
    writeExternalRuntimePromotionJournal(authorityRoot, createJournal('preparing', provisionalPointer));
    fs.mkdirSync(stagingDir);
    requireRealDirectoryIdentity(stagingDir, 'promotion staging directory');

    const files = collectManifestFiles(artifactManifest, runtimeManifest);
    collectArtifactTreeFiles(descriptor.rootDir, files);
    for (const [key, relativePath] of files) {
      if (relativePath === reportRelativePath || relativePath === 'generation-seal.json') files.delete(key);
    }
    const copiedFiles: ExternalRuntimeArtifactPromotionFile[] = [];
    for (const [key, relativePath] of files.entries()) {
      const sourcePath = ensureExistingArtifactFile(descriptor.rootDir, relativePath, key);
      const targetPath = resolveUnderRoot(stagingDir, relativePath, key);
      atomicCopyFile(sourcePath, targetPath);
      copiedFiles.push({
        key: key.startsWith('runtimeFile:') || key.startsWith('artifactFile:') ? null : key,
        path: relativePath,
        bytes: fs.statSync(targetPath).size,
        sha256: sha256File(targetPath),
      });
    }

    const distManifest = materializeDistManifest({
      distDataDir: stagingDir,
      artifactManifest,
      descriptor,
      reportRelativePath,
      promotedAt,
      sourceIdentity: options.sourceIdentity,
    });
    atomicWriteJson(path.join(stagingDir, 'manifest.json'), distManifest);
    refreshCopiedFileMetadata(copiedFiles, stagingDir, 'manifest.json');

    const coreReleaseFiles = collectReleaseFiles(
      stagingDir,
      new Set([reportRelativePath, 'generation-seal.json']),
    );
    const releaseHash = hashReleaseFiles(coreReleaseFiles);
    const pointer: ExternalRuntimeGenerationPointer = Object.freeze({
      ...provisionalPointer,
      releaseHash,
    });

    const result: ExternalRuntimeArtifactPromotionResult = {
      schemaVersion: PROMOTION_SCHEMA_VERSION,
      artifactRoot: descriptor.rootDir,
      authorityRoot,
      distDataDir: generationRoot,
      generationId,
      generationRoot,
      pointerPath,
      releaseHash,
      sourceGenerationId: options.sourceGenerationId?.trim() || null,
      runtimeId: descriptor.runtimeId ?? null,
      runtimeManifestSchema: descriptor.runtimeManifestSchema ?? null,
      promotedAt,
      manifestPath: path.join(generationRoot, 'manifest.json'),
      runtimeManifestPath: path.join(generationRoot, 'rust', 'runtime-manifest.json'),
      reportPath: resolveUnderRoot(generationRoot, reportRelativePath, 'promotion report'),
      sourceIdentity: options.sourceIdentity ?? null,
      copiedFiles: copiedFiles.sort((left, right) => left.path.localeCompare(right.path)),
    };
    atomicWriteJson(resolveUnderRoot(stagingDir, reportRelativePath, 'promotion report'), result);
    const sealedFiles = collectReleaseFiles(stagingDir, new Set(['generation-seal.json']));
    writeExternalRuntimeGenerationSeal(stagingDir, Object.freeze({
      schemaVersion: EXTERNAL_RUNTIME_GENERATION_SEAL_SCHEMA,
      generationId,
      runtimeId: descriptor.runtimeId ?? null,
      releaseHash,
      fileCount: sealedFiles.length,
      totalBytes: sealedFiles.reduce((total, file) => total + file.bytes, 0),
      files: Object.freeze(sealedFiles),
    }));
    verifyExternalRuntimeGenerationSeal(stagingDir, {
      generationId,
      runtimeId: descriptor.runtimeId ?? null,
      releaseHash,
    });

    fs.renameSync(stagingDir, generationRoot);
    writeExternalRuntimePromotionJournal(authorityRoot, createJournal('generation-sealed', pointer));
    publishExternalRuntimeGenerationPointer(authorityRoot, pointer);
    pointerPublished = true;
    try {
      writeExternalRuntimePromotionJournal(authorityRoot, createJournal('pointer-published', pointer));
      clearExternalRuntimePromotionJournal(authorityRoot);
    } catch {
      // The pointer is the commit record. Recovery will only clean bookkeeping.
    }
    return result;
  } catch (error) {
    if (!pointerPublished) {
      if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
      if (fs.existsSync(generationRoot)) fs.rmSync(generationRoot, { recursive: true, force: true });
      try {
        clearExternalRuntimePromotionJournal(authorityRoot);
      } catch {
        // A later startup recovery owns ambiguous journal cleanup.
      }
    }
    throw error;
  } finally {
    try {
      lock.release();
    } catch {
      // A stale lock is recoverable and must not turn an already-published pointer into a reported failure.
    }
  }
}
