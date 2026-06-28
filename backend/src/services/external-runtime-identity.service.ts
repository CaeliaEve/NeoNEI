import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DIST_DATA_DIR } from '../config/runtime-paths';

const IDENTITY_SCHEMA_VERSION = 'neonei/external-runtime-source-identity/current' as const;
const PROMOTION_REPORT_RELATIVE_PATH = 'rust/external-runtime-artifact-promotion-report.json';

type JsonRecord = Record<string, unknown>;

export type ExternalRuntimeSourceIdentityFile = {
  path: string;
  bytes: number;
  mtimeMs: number;
};

export type ExternalRuntimeSourceIdentity = {
  schemaVersion: typeof IDENTITY_SCHEMA_VERSION;
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

function listFilesRecursive(rootDir: string): ExternalRuntimeSourceIdentityFile[] {
  const root = path.resolve(rootDir);
  const stack = [''];
  const files: ExternalRuntimeSourceIdentityFile[] = [];

  while (stack.length > 0) {
    const relativeDir = stack.pop() ?? '';
    const absoluteDir = path.join(root, relativeDir);
    for (const name of fs.readdirSync(absoluteDir).sort()) {
      const absolutePath = path.join(absoluteDir, name);
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        stack.push(toPortableRelativePath(root, absolutePath));
        continue;
      }
      if (!stat.isFile()) {
        continue;
      }
      files.push({
        path: toPortableRelativePath(root, absolutePath),
        bytes: stat.size,
        mtimeMs: Math.floor(stat.mtimeMs),
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
    hash.update(file.path);
    hash.update(String(file.bytes));
    hash.update(String(file.mtimeMs));
  }
  return `sha256:${hash.digest('hex')}`;
}

export function computeExternalRuntimeSourceIdentity(rootDir: string): ExternalRuntimeSourceIdentity {
  const root = path.resolve(rootDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`external runtime raw export root is missing or not a directory: ${root}`);
  }
  const manifest = readJsonObject(path.join(root, 'manifest.json'));
  const manifestSchemaVersion = typeof manifest?.schemaVersion === 'string' ? manifest.schemaVersion : null;
  const files = listFilesRecursive(root);
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  return {
    schemaVersion: IDENTITY_SCHEMA_VERSION,
    rootDir: root,
    identity: buildIdentityHash({ rootDir: root, manifestSchemaVersion, files }),
    fileCount: files.length,
    totalBytes,
    manifestSchemaVersion,
    files,
  };
}

export function readExternalRuntimePromotionIdentity(distDataDir = DIST_DATA_DIR): ExternalRuntimePromotionIdentity {
  const reportPath = path.join(path.resolve(distDataDir), PROMOTION_REPORT_RELATIVE_PATH);
  const report = readJsonObject(reportPath);
  const sourceIdentity = report?.sourceIdentity;
  return {
    reportPath: fs.existsSync(reportPath) ? reportPath : null,
    sourceIdentity: sourceIdentity && typeof sourceIdentity === 'object' && !Array.isArray(sourceIdentity)
      ? sourceIdentity as ExternalRuntimeSourceIdentity
      : null,
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
    fresh: Boolean(promoted.sourceIdentity?.identity && promoted.sourceIdentity.identity === current.identity),
  };
}
