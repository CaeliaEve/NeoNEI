import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DIST_DATA_DIR } from '../config/runtime-paths';
import {
  resolveExternalRuntimeRawExportInput,
  type ExternalRuntimeRawExportInput,
} from './acceleration-runtime-compiler-authority.service';
import { resolveCurrentExternalRuntimeGeneration } from './external-runtime-generation.service';

const IDENTITY_SCHEMA_VERSION = 'neonei/external-runtime-source-identity/current' as const;
const PROMOTION_REPORT_RELATIVE_PATH = 'rust/external-runtime-artifact-promotion-report.json';

type JsonRecord = Record<string, unknown>;

export type ExternalRuntimeSourceIdentityFile = {
  path: string;
  bytes: number;
  mtimeMs: number;
  sha256: string;
};

export type ExternalRuntimeSourceIdentity = {
  schemaVersion: typeof IDENTITY_SCHEMA_VERSION;
  authorityRoot: string;
  authority: 'generation-pointer';
  rootDir: string;
  identity: string;
  fileCount: number;
  totalBytes: number;
  manifestSchemaVersion: string | null;
  files: ExternalRuntimeSourceIdentityFile[];
};

export type ExternalRuntimePromotionIdentity = {
  sourceIdentity: ExternalRuntimeSourceIdentity | null;
  reportPath: string | null;
  valid: boolean;
  errors: string[];
};

export type ExternalRuntimeIdentityProbe = {
  fresh: boolean;
  current: ExternalRuntimeSourceIdentity;
  promoted: ExternalRuntimePromotionIdentity;
};

function readJsonObject(filePath: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : null;
  } catch {
    return null;
  }
}

function toPortableRelativePath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function comparablePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPortableRelativePath(value: string): boolean {
  return Boolean(value)
    && !value.startsWith('/')
    && !value.includes('\\')
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.split('/').some((segment) => !segment || segment === '.' || segment === '..');
}

function requireRealPathIdentity(rootDir: string, filePath: string, label: string): void {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(filePath);
  const realPath = fs.realpathSync(resolvedPath);
  if (comparablePath(realPath) !== comparablePath(resolvedPath)) {
    throw new Error(`${label} must not be a symlink, junction, or reparse-point: ${resolvedPath}`);
  }
  const relative = path.relative(resolvedRoot, realPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes root: ${resolvedPath}`);
  }
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listFilesRecursive(rootDir: string): ExternalRuntimeSourceIdentityFile[] {
  const root = path.resolve(rootDir);
  const stack = [''];
  const files: ExternalRuntimeSourceIdentityFile[] = [];

  while (stack.length > 0) {
    const relativeDir = stack.pop() ?? '';
    const absoluteDir = path.join(root, relativeDir);
    const directoryStat = fs.lstatSync(absoluteDir);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error(`external runtime source directory must be a real directory: ${absoluteDir}`);
    }
    requireRealPathIdentity(root, absoluteDir, 'external runtime source directory');
    for (const name of fs.readdirSync(absoluteDir).sort()) {
      const absolutePath = path.join(absoluteDir, name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`external runtime source contains a symbolic link: ${absolutePath}`);
      }
      requireRealPathIdentity(root, absolutePath, 'external runtime source entry');
      if (stat.isDirectory()) {
        stack.push(toPortableRelativePath(root, absolutePath));
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`external runtime source contains a non-regular entry: ${absolutePath}`);
      }
      files.push({
        path: toPortableRelativePath(root, absolutePath),
        bytes: stat.size,
        mtimeMs: Math.floor(stat.mtimeMs),
        sha256: sha256File(absolutePath),
      });
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

function buildIdentityHash(args: {
  rootDir: string;
  manifestSchemaVersion: string | null;
  files: ExternalRuntimeSourceIdentityFile[];
}): string {
  const hash = crypto.createHash('sha256');
  hash.update(IDENTITY_SCHEMA_VERSION);
  hash.update(args.manifestSchemaVersion ?? 'manifest-schema-missing');
  for (const file of args.files) {
    hash.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`);
  }
  return `sha256:${hash.digest('hex')}`;
}

export function computeExternalRuntimeSourceIdentityFromResolvedInput(
  resolved: ExternalRuntimeRawExportInput,
): ExternalRuntimeSourceIdentity {
  const root = resolved.generationRoot;
  const manifest = readJsonObject(path.join(root, 'manifest.json'));
  const manifestSchemaVersion = typeof manifest?.schemaVersion === 'string' ? manifest.schemaVersion : null;
  const files = listFilesRecursive(root);
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  return {
    schemaVersion: IDENTITY_SCHEMA_VERSION,
    authorityRoot: resolved.authorityRoot,
    authority: resolved.authority,
    rootDir: root,
    identity: buildIdentityHash({ rootDir: root, manifestSchemaVersion, files }),
    fileCount: files.length,
    totalBytes,
    manifestSchemaVersion,
    files,
  };
}

export function computeExternalRuntimeSourceIdentity(rootDir: string): ExternalRuntimeSourceIdentity {
  return computeExternalRuntimeSourceIdentityFromResolvedInput(resolveExternalRuntimeRawExportInput(rootDir));
}

export function readExternalRuntimePromotionIdentity(distDataDir = DIST_DATA_DIR): ExternalRuntimePromotionIdentity {
  let root: string;
  try {
    root = resolveCurrentExternalRuntimeGeneration(distDataDir).generationRoot;
  } catch (error) {
    return {
      reportPath: null,
      sourceIdentity: null,
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
  const reportPath = path.join(root, PROMOTION_REPORT_RELATIVE_PATH);
  const report = readJsonObject(reportPath);
  const errors: string[] = [];
  if (!report) errors.push('promotion report is missing or invalid JSON');
  if (report?.schemaVersion !== 'neonei/external-runtime-artifact-promotion/current') {
    errors.push(`unsupported promotion report schema: ${String(report?.schemaVersion)}`);
  }
  const rawSourceIdentity = report?.sourceIdentity;
  const sourceIdentity = rawSourceIdentity && typeof rawSourceIdentity === 'object' && !Array.isArray(rawSourceIdentity)
    ? rawSourceIdentity as ExternalRuntimeSourceIdentity
    : null;
  if (!sourceIdentity) {
    errors.push('promotion report source identity is missing');
  } else {
    if (sourceIdentity.schemaVersion !== IDENTITY_SCHEMA_VERSION) errors.push('promotion source identity schema mismatch');
    if (sourceIdentity.authority !== 'generation-pointer') errors.push('promotion source identity authority mismatch');
    if (!/^sha256:[0-9a-f]{64}$/.test(`${sourceIdentity.identity ?? ''}`)) errors.push('promotion source identity hash is invalid');
    if (!Array.isArray(sourceIdentity.files)
      || sourceIdentity.fileCount !== sourceIdentity.files.length
      || sourceIdentity.totalBytes !== sourceIdentity.files.reduce((sum, file) => sum + Number(file?.bytes ?? 0), 0)
      || sourceIdentity.files.some((file) => !isPortableRelativePath(`${file?.path ?? ''}`)
        || !Number.isSafeInteger(file?.bytes) || file.bytes < 0
        || !/^[0-9a-f]{64}$/.test(`${file?.sha256 ?? ''}`))) {
      errors.push('promotion source identity file catalog is invalid');
    }
  }

  const copiedFiles = report?.copiedFiles;
  if (!Array.isArray(copiedFiles)) {
    errors.push('promotion copied file catalog is missing');
  } else {
    for (const [index, entry] of copiedFiles.entries()) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`promotion copiedFiles[${index}] is invalid`);
        continue;
      }
      const record = entry as JsonRecord;
      const relativePath = `${record.path ?? ''}`;
      const bytes = record.bytes;
      const expectedSha256 = `${record.sha256 ?? ''}`;
      if (!isPortableRelativePath(relativePath)
        || !Number.isSafeInteger(bytes) || (bytes as number) < 0
        || !/^[0-9a-f]{64}$/.test(expectedSha256)) {
        errors.push(`promotion copiedFiles[${index}] descriptor is invalid`);
        continue;
      }
      const absolutePath = path.resolve(root, ...relativePath.split('/'));
      const relativeFromRoot = path.relative(root, absolutePath);
      const stat = fs.lstatSync(absolutePath, { throwIfNoEntry: false });
      if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)
        || !stat?.isFile() || stat.isSymbolicLink()) {
        errors.push(`promoted file is missing or invalid: ${relativePath}`);
        continue;
      }
      try {
        requireRealPathIdentity(root, absolutePath, 'promoted runtime file');
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        continue;
      }
      if (stat.size !== bytes || sha256File(absolutePath) !== expectedSha256) {
        errors.push(`promoted file content mismatch: ${relativePath}`);
      }
    }
  }
  return {
    reportPath: fs.existsSync(reportPath) ? reportPath : null,
    sourceIdentity,
    valid: errors.length === 0,
    errors,
  };
}

export function probeExternalRuntimeIdentityFreshness(input: {
  rawExportRoot: string;
  distDataDir?: string;
}): ExternalRuntimeIdentityProbe {
  const current = computeExternalRuntimeSourceIdentity(input.rawExportRoot);
  const promoted = readExternalRuntimePromotionIdentity(input.distDataDir);
  return {
    current,
    promoted,
    fresh: Boolean(promoted.valid
      && promoted.sourceIdentity?.identity
      && promoted.sourceIdentity.identity === current.identity),
  };
}
