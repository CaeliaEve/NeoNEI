import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DIST_DATA_DIR } from '../config/runtime-paths';
import {
  loadElysiumCompiledArtifactDescriptor,
  type ElysiumCompiledArtifactDescriptor,
} from '../compiler-client/elysium-compiled-artifact-loader';

const PROMOTION_SCHEMA_VERSION = 'neonei/external-runtime-artifact-promotion/current' as const;
const DEFAULT_PROMOTION_REPORT = 'rust/external-runtime-artifact-promotion-report.json';

type JsonRecord = Record<string, unknown>;

export type ExternalRuntimeArtifactPromotionOptions = {
  artifactRoot: string;
  distDataDir?: string;
  promotedAt?: string;
  reportRelativePath?: string;
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
  distDataDir: string;
  runtimeId: string | null;
  runtimeManifestSchema: string | null;
  promotedAt: string;
  manifestPath: string;
  runtimeManifestPath: string;
  reportPath: string;
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

function materializeDistManifest(args: {
  distDataDir: string;
  artifactManifest: JsonRecord;
  descriptor: ElysiumCompiledArtifactDescriptor;
  reportRelativePath: string;
  promotedAt: string;
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
      args.promotedAt,
    ].join('::'),
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

export function promoteExternalRuntimeArtifact(
  options: ExternalRuntimeArtifactPromotionOptions,
): ExternalRuntimeArtifactPromotionResult {
  const descriptor = loadElysiumCompiledArtifactDescriptor(options.artifactRoot);
  const distDataDir = path.resolve(options.distDataDir ?? DIST_DATA_DIR);
  const reportRelativePath = requirePortableRelativePath(
    options.reportRelativePath ?? DEFAULT_PROMOTION_REPORT,
    'promotion report',
  );
  const promotedAt = options.promotedAt ?? new Date().toISOString();
  const artifactManifest = readJsonObject(descriptor.manifestPath, 'manifest');
  const runtimeManifest = readJsonObject(descriptor.runtimeManifestPath, 'runtime manifest');
  const files = collectManifestFiles(artifactManifest, runtimeManifest);
  const copiedFiles: ExternalRuntimeArtifactPromotionFile[] = [];

  fs.mkdirSync(distDataDir, { recursive: true });
  for (const [key, relativePath] of files.entries()) {
    const sourcePath = ensureExistingArtifactFile(descriptor.rootDir, relativePath, key);
    const targetPath = resolveUnderRoot(distDataDir, relativePath, key);
    atomicCopyFile(sourcePath, targetPath);
    copiedFiles.push({
      key: key.startsWith('runtimeFile:') ? null : key,
      path: relativePath,
      bytes: fs.statSync(targetPath).size,
      sha256: sha256File(targetPath),
    });
  }

  const distManifest = materializeDistManifest({
    distDataDir,
    artifactManifest,
    descriptor,
    reportRelativePath,
    promotedAt,
  });
  atomicWriteJson(path.join(distDataDir, 'manifest.json'), distManifest);

  const result: ExternalRuntimeArtifactPromotionResult = {
    schemaVersion: PROMOTION_SCHEMA_VERSION,
    artifactRoot: descriptor.rootDir,
    distDataDir,
    runtimeId: descriptor.runtimeId ?? null,
    runtimeManifestSchema: descriptor.runtimeManifestSchema ?? null,
    promotedAt,
    manifestPath: path.join(distDataDir, 'manifest.json'),
    runtimeManifestPath: path.join(distDataDir, 'rust', 'runtime-manifest.json'),
    reportPath: resolveUnderRoot(distDataDir, reportRelativePath, 'promotion report'),
    copiedFiles: copiedFiles.sort((left, right) => left.path.localeCompare(right.path)),
  };
  atomicWriteJson(result.reportPath, result);
  return result;
}
