import fs from 'fs';
import path from 'path';

export const REQUIRED_EXTERNAL_RUNTIME_ENTRYPOINTS = Object.freeze([
  'manifest',
  'runtimeManifest',
  'uiTemplates',
  'uiBindings',
  'uiStrings',
]);

export type ElysiumCompiledArtifactDescriptor = {
  rootDir: string;
  manifestPath: string;
  runtimeManifestPath: string;
  uiTemplatesPath: string;
  uiBindingsPath: string;
  uiStringsPath: string;
  runtimeManifestSchema?: string;
  runtimeId?: string;
};

function isPortableRelativePath(value: string): boolean {
  return Boolean(value)
    && !value.startsWith('/')
    && !value.includes('\\')
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.split('/').includes('..')
    && !value.split('/').includes('.');
}

function readJsonObject(filePath: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`elysium compiled artifact ${label} must be a JSON object: ${filePath}`);
  }
  return parsed as Record<string, unknown>;
}

function requireExistingFile(rootDir: string, relativePath: string, label: string): string {
  if (!isPortableRelativePath(relativePath)) {
    throw new Error(`elysium compiled artifact ${label} must be a portable relative path: ${relativePath}`);
  }
  const absolutePath = path.resolve(rootDir, relativePath);
  const relativeFromRoot = path.relative(rootDir, absolutePath);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    throw new Error(`elysium compiled artifact ${label} escapes artifact root: ${relativePath}`);
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`elysium compiled artifact ${label} is missing: ${relativePath}`);
  }
  return absolutePath;
}

function entrypointFromManifest(manifest: Record<string, unknown>, key: string): string | null {
  const entrypoints = manifest.entrypoints;
  if (entrypoints && typeof entrypoints === 'object' && !Array.isArray(entrypoints)) {
    const value = (entrypoints as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const files = manifest.files;
  if (files && typeof files === 'object' && !Array.isArray(files)) {
    const value = (files as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function loadElysiumCompiledArtifactDescriptor(rootDir: string): ElysiumCompiledArtifactDescriptor {
  const artifactRoot = path.resolve(rootDir);
  const manifestPath = requireExistingFile(artifactRoot, 'manifest.json', 'manifest');
  const runtimeManifestPath = requireExistingFile(artifactRoot, 'rust/runtime-manifest.json', 'runtime manifest');
  const runtimeManifest = readJsonObject(runtimeManifestPath, 'runtime manifest');

  const uiTemplates = entrypointFromManifest(runtimeManifest, 'uiTemplates') ?? 'rust/ui-pack/ui_templates.bin';
  const uiBindings = entrypointFromManifest(runtimeManifest, 'uiBindings') ?? 'rust/ui-pack/ui_bindings.bin';
  const uiStrings = entrypointFromManifest(runtimeManifest, 'uiStrings') ?? 'rust/ui-pack/ui_strings.bin';

  return {
    rootDir: artifactRoot,
    manifestPath,
    runtimeManifestPath,
    uiTemplatesPath: requireExistingFile(artifactRoot, uiTemplates, 'uiTemplates'),
    uiBindingsPath: requireExistingFile(artifactRoot, uiBindings, 'uiBindings'),
    uiStringsPath: requireExistingFile(artifactRoot, uiStrings, 'uiStrings'),
    runtimeManifestSchema: typeof runtimeManifest.schemaVersion === 'string' ? runtimeManifest.schemaVersion : undefined,
    runtimeId: typeof runtimeManifest.runtimeId === 'string' ? runtimeManifest.runtimeId : undefined,
  };
}
