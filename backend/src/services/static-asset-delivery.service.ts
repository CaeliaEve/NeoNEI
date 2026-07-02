import fs from 'fs';
import path from 'path';
import { IMAGES_PATH } from '../config/runtime-paths';

export type ImageArtifactFamily = 'item' | 'fluid' | 'entity';
export type PublishSidecarEncoding = 'br' | 'gzip';

type RequestedArtifactDescriptor = {
  stem: string;
  extension: string;
  variantRegexes: RegExp[];
};

export type RawStaticAssetDelivery = Readonly<{
  absolutePath: string;
  relativePath: string;
}>;

export type PublishStaticAssetDelivery = RawStaticAssetDelivery & Readonly<{
  responsePath: string;
  contentTypeExtension: string;
  contentEncoding: PublishSidecarEncoding | null;
  varyAcceptEncoding: boolean;
  mutable: boolean;
}>;

const PUBLISH_STATIC_SIDECAR_VARIANTS = Object.freeze([
  Object.freeze({ encoding: 'br' as const, extension: '.br' as const }),
  Object.freeze({ encoding: 'gzip' as const, extension: '.gz' as const }),
]);

function isSafeUnderRoot(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

function isExistingFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function parseRequestedArtifact(fileName: string): RequestedArtifactDescriptor | null {
  const match = fileName.match(/^(.*?)(\.sprite-atlas\.png|\.sprite\.json|\.render\.json|\.png|\.gif)$/i);
  if (!match) {
    return null;
  }

  const stem = match[1];
  const extension = match[2].toLowerCase();
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variantRegexes =
    extension === '.png' || extension === '.gif'
      ? [
          new RegExp(`^${escapedStem}~.+${extension.replace('.', '\\.')}$`, 'i'),
          new RegExp(`^${escapedStem}~.+\\.sprite-atlas\\.png$`, 'i'),
        ]
      : [new RegExp(`^${escapedStem}~.+${extension.replace('.', '\\.')}$`, 'i')];
  return {
    stem,
    extension,
    variantRegexes,
  };
}

function safeDecodeURIComponent(value: string | undefined): string {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return '';
  }
}

function normalizeRequestRelativePath(requestUrl: string | undefined): { relativePath: string; segments: string[] } | null {
  const rawPath = `${requestUrl ?? ''}`.split('?')[0] || '/';
  const relativePath = rawPath.replace(/^\/+/, '');
  if (!relativePath) {
    return null;
  }

  const segments = relativePath.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  return { relativePath, segments };
}

function acceptsEncoding(rawHeader: string | string[] | undefined, encoding: PublishSidecarEncoding): boolean {
  const header = Array.isArray(rawHeader) ? rawHeader.join(',') : `${rawHeader ?? ''}`;
  return header
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .some((token) => token === encoding || token.startsWith(`${encoding};`) || token === '*');
}

function canServePrecompressedPublishAsset(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith('.json');
}

function isPublishMutableArtifact(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  return normalized === 'manifest.json'
    || normalized === 'build-report.json'
    || normalized === 'build-report.html'
    || normalized.endsWith('/manifest.json');
}

export function staticDirectoryExists(rootDir: string): boolean {
  try {
    return fs.statSync(rootDir).isDirectory();
  } catch {
    return false;
  }
}

export function resolveImageFamilyArtifact(
  family: ImageArtifactFamily,
  rawModId: string | undefined,
  rawFileName: string | undefined,
): string | null {
  const modId = safeDecodeURIComponent(rawModId);
  const fileName = safeDecodeURIComponent(rawFileName);
  if (!modId || !fileName || modId.includes('..') || fileName.includes('..')) {
    return null;
  }

  const familyRoot = path.resolve(IMAGES_PATH, family);
  const familyDir = path.resolve(familyRoot, modId);
  const direct = path.resolve(familyDir, fileName);

  if (!isSafeUnderRoot(familyRoot, direct) || !isSafeUnderRoot(familyRoot, familyDir)) {
    return null;
  }

  if (isExistingFile(direct)) {
    return direct;
  }

  const descriptor = parseRequestedArtifact(fileName);
  if (!descriptor) {
    return null;
  }

  if (descriptor.extension === '.png' || descriptor.extension === '.gif') {
    const alternateExtension = descriptor.extension === '.png' ? '.gif' : '.png';
    const alternateDirect = path.resolve(familyDir, `${descriptor.stem}${alternateExtension}`);
    if (isSafeUnderRoot(familyRoot, alternateDirect) && isExistingFile(alternateDirect)) {
      return alternateDirect;
    }

    const spriteAtlasDirect = path.resolve(familyDir, `${descriptor.stem}.sprite-atlas.png`);
    if (isSafeUnderRoot(familyRoot, spriteAtlasDirect) && isExistingFile(spriteAtlasDirect)) {
      return spriteAtlasDirect;
    }
  }

  if (!staticDirectoryExists(familyDir)) {
    return null;
  }

  const siblings = fs.readdirSync(familyDir);
  const variantCandidates = siblings.filter((name) =>
    descriptor.variantRegexes.some((regex) => regex.test(name)),
  );
  if (variantCandidates.length > 0) {
    variantCandidates.sort((left, right) => left.localeCompare(right));
    const sameExtension =
      variantCandidates.find((name) => !name.toLowerCase().includes('.sprite-atlas.') && name.toLowerCase().endsWith(descriptor.extension))
      ?? variantCandidates.find((name) => name.toLowerCase().endsWith('.gif'))
      ?? variantCandidates.find((name) => name.toLowerCase().endsWith('.sprite-atlas.png'));
    const chosen = sameExtension ?? variantCandidates[0];
    const resolved = path.resolve(familyDir, chosen);
    if (isSafeUnderRoot(familyRoot, resolved) && isExistingFile(resolved)) {
      return resolved;
    }
  }

  const baseNbtMatch = fileName.match(/^(.+~\d+)~.+(\.png|\.gif)$/i);
  if (baseNbtMatch) {
    const fallback = path.resolve(familyDir, `${baseNbtMatch[1]}${baseNbtMatch[2]}`);
    if (isSafeUnderRoot(familyRoot, fallback) && isExistingFile(fallback)) {
      return fallback;
    }
  }

  return null;
}

export function resolveRawStaticAsset(rootDir: string, requestUrl: string | undefined): RawStaticAssetDelivery | null {
  const requestPath = normalizeRequestRelativePath(requestUrl);
  if (!requestPath) {
    return null;
  }

  const resolvedRoot = path.resolve(rootDir);
  const absolutePath = path.resolve(resolvedRoot, ...requestPath.segments);
  if (!isSafeUnderRoot(resolvedRoot, absolutePath) || !isExistingFile(absolutePath)) {
    return null;
  }

  return Object.freeze({
    absolutePath,
    relativePath: requestPath.relativePath,
  });
}

export function resolvePublishStaticAsset(options: {
  rootDir: string;
  requestUrl: string | undefined;
  acceptEncoding: string | string[] | undefined;
  bypassCompression: boolean;
}): PublishStaticAssetDelivery | null {
  const baseAsset = resolveRawStaticAsset(options.rootDir, options.requestUrl);
  if (!baseAsset) {
    return null;
  }

  let responsePath = baseAsset.absolutePath;
  let contentEncoding: PublishSidecarEncoding | null = null;
  const varyAcceptEncoding = canServePrecompressedPublishAsset(baseAsset.relativePath);

  if (!options.bypassCompression && varyAcceptEncoding) {
    for (const variant of PUBLISH_STATIC_SIDECAR_VARIANTS) {
      const candidatePath = `${baseAsset.absolutePath}${variant.extension}`;
      if (acceptsEncoding(options.acceptEncoding, variant.encoding) && isExistingFile(candidatePath)) {
        responsePath = candidatePath;
        contentEncoding = variant.encoding;
        break;
      }
    }
  }

  return Object.freeze({
    ...baseAsset,
    responsePath,
    contentTypeExtension: path.extname(baseAsset.absolutePath),
    contentEncoding,
    varyAcceptEncoding,
    mutable: isPublishMutableArtifact(baseAsset.relativePath),
  });
}
