import { BACKEND_BASE_URL } from './core/http';
import {
  extractThaumcraftAspectHash,
  getThaumcraftAspectTexturePath,
  parseAspectNameFromLocalized,
  resolveThaumcraftAspectNameFromHash,
} from '../thaumcraftAspects';
import { resolveDistDataAssetPath } from '../distDataRuntime';

const PLACEHOLDER_ITEM_IMAGE_PATH = 'minecraft/barrier~0.png';
const THAUMCRAFT_ASPECT_PLACEHOLDER_URL = '/placeholder.png';

function buildItemImageUrl(path: string): string {
  return `${BACKEND_BASE_URL}/images/item/${path}`;
}

function getPlaceholderItemImageUrl(): string {
  return buildItemImageUrl(PLACEHOLDER_ITEM_IMAGE_PATH);
}

function getBackendOrigin(): string {
  return BACKEND_BASE_URL.replace(/\/api\/?$/i, '');
}

function normalizeImageFileName(imageFileName: string): string {
  return imageFileName
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^[a-zA-Z]:\//, '')
    .replace(/^images\/item\//, '')
    .replace(/^api\/images\/item\//, '')
    .replace(/^.*?\/image\/item\//i, '')
    .replace(/^.*?\/image\//i, '');
}

function stripVariantSuffixFromImageFileName(imageFileName: string): string {
  const normalized = normalizeImageFileName(imageFileName);
  const parts = normalized.split('/');
  const fileName = parts.pop() || '';
  const match = fileName.match(/^(.+~\d+)~[^/]+\.(gif|png)$/i);
  if (!match) {
    return normalized;
  }
  const baseName = `${match[1]}.${match[2].toLowerCase()}`;
  return [...parts, baseName].join('/');
}

function getThaumcraftAspectHashFromItemId(itemId: string | null | undefined): string | null {
  return extractThaumcraftAspectHash(itemId);
}

function getThaumcraftAspectHashFromImageFileName(imageFileName: string | null | undefined): string | null {
  return extractThaumcraftAspectHash(imageFileName ? normalizeImageFileName(imageFileName) : null);
}

function getThaumcraftStaticAspectUrl(
  hash: string | null,
  localizedName?: string | null,
): string | null {
  const parsedName = parseAspectNameFromLocalized(localizedName ?? undefined);
  return getThaumcraftAspectTexturePath({
    hash,
    name: parsedName || resolveThaumcraftAspectNameFromHash(hash),
  });
}

function normalizeThaumcraftAspectImageFileName(imageFileName: string | null | undefined): string | null {
  const normalized = imageFileName ? normalizeImageFileName(imageFileName) : '';
  if (!normalized) return null;
  const match = normalized.match(/^(.*?thaumcraftneiplugin\/)Aspect~\d+~([^/]+)\.(?:png|gif)$/i);
  if (!match) return null;
  return `${match[1]}Aspect~0~${match[2]}.png`;
}

export function getImageUrl(itemId: string): string {
  const aspectHash = getThaumcraftAspectHashFromItemId(itemId);
  if (aspectHash) {
    const staticAspectUrl = getThaumcraftStaticAspectUrl(aspectHash);
    return staticAspectUrl || THAUMCRAFT_ASPECT_PLACEHOLDER_URL;
  }

  const parts = itemId.split('~');
  if (parts.length >= 4) {
    const modId = encodeURIComponent(parts[1]);
    const internalName = parts[2];
    const damage = parts[3];
    const nbt = parts[4] || null;
    if (nbt) {
      return buildItemImageUrl(`${modId}/${encodeURIComponent(`${internalName}~${damage}~${nbt}.png`)}`);
    }
    const imageFileName = `${internalName}~${damage}.png`;

    return buildItemImageUrl(`${modId}/${encodeURIComponent(imageFileName)}`);
  }

  return buildItemImageUrl(`${itemId}.png`);
}

export function getFluidImageUrl(fluidId: string): string {
  const parts = fluidId.split('~');
  if (parts.length >= 3) {
    const modId = encodeURIComponent(parts[1]);
    const internalName = encodeURIComponent(parts[2]);
    return `${BACKEND_BASE_URL}/images/fluid/${modId}/${internalName}.png`;
  }
  return `${BACKEND_BASE_URL}/images/fluid/${encodeURIComponent(fluidId)}.png`;
}

export function getFluidImageUrlFromFluid(fluid: {
  renderAssetRef?: string | null;
  fluidId?: string | null;
  preferredImageUrl?: string | null;
} | null | undefined): string | null {
  if (!fluid) return null;
  if (fluid.preferredImageUrl) {
    return fluid.preferredImageUrl;
  }
  if (fluid.renderAssetRef) {
    const renderAssetUrl = getImageUrlFromRenderAssetRef(fluid.renderAssetRef);
    if (renderAssetUrl) return renderAssetUrl;
  }
  if (fluid.fluidId) {
    return getFluidImageUrl(fluid.fluidId);
  }
  return null;
}

export function getItemImageUrlFromEntity(item: {
  preferredImageUrl?: string | null;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
  itemId?: string | null;
  localizedName?: string | null;
} | null | undefined): string {
  const aspectHash = getThaumcraftAspectHashFromItemId(item?.itemId);
  if (aspectHash) {
    const staticAspectUrl = getThaumcraftStaticAspectUrl(aspectHash, item?.localizedName);
    return staticAspectUrl || THAUMCRAFT_ASPECT_PLACEHOLDER_URL;
  }
  const aspectHashFromImage = getThaumcraftAspectHashFromImageFileName(item?.imageFileName);
  if (aspectHashFromImage) {
    const staticAspectUrl = getThaumcraftStaticAspectUrl(aspectHashFromImage, item?.localizedName);
    if (staticAspectUrl) return staticAspectUrl;
  }
  const aspectImageFileName = normalizeThaumcraftAspectImageFileName(item?.imageFileName);
  if (aspectImageFileName) {
    return getImageUrlFromFileName(aspectImageFileName);
  }
  if (item?.preferredImageUrl && item.preferredImageUrl.includes('/images/')) {
    return item.preferredImageUrl;
  }
  if (item?.imageFileName) {
    return getImageUrlFromFileName(item.imageFileName);
  }
  if (item?.renderAssetRef) {
    const renderAssetUrl = getImageUrlFromRenderAssetRef(item.renderAssetRef);
    if (renderAssetUrl) return renderAssetUrl;
  }
  if (item?.itemId) {
    return getImageUrl(item.itemId);
  }
  return getPlaceholderItemImageUrl();
}

export function getPreferredStaticImageUrlFromEntity(item: {
  preferredImageUrl?: string | null;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
  itemId?: string | null;
  localizedName?: string | null;
} | null | undefined): string {
  const aspectHash = getThaumcraftAspectHashFromItemId(item?.itemId);
  if (aspectHash) {
    const staticAspectUrl = getThaumcraftStaticAspectUrl(aspectHash, item?.localizedName);
    return staticAspectUrl || THAUMCRAFT_ASPECT_PLACEHOLDER_URL;
  }
  const aspectHashFromImage = getThaumcraftAspectHashFromImageFileName(item?.imageFileName);
  if (aspectHashFromImage) {
    const staticAspectUrl = getThaumcraftStaticAspectUrl(aspectHashFromImage, item?.localizedName);
    if (staticAspectUrl) return staticAspectUrl;
  }
  const aspectImageFileName = normalizeThaumcraftAspectImageFileName(item?.imageFileName);
  if (aspectImageFileName) {
    return getImageUrlFromFileName(aspectImageFileName);
  }
  if (item?.preferredImageUrl && item.preferredImageUrl.includes('/images/')) {
    return item.preferredImageUrl;
  }
  if (item?.imageFileName) {
    if (item.imageFileName.toLowerCase().endsWith('.gif')) {
      const strippedVariantPath = stripVariantSuffixFromImageFileName(item.imageFileName);
      if (strippedVariantPath !== normalizeImageFileName(item.imageFileName)) {
        return getImageUrlFromFileName(strippedVariantPath);
      }
      return getImageUrlFromFileName(item.imageFileName);
    }
    return getImageUrlFromFileName(item.imageFileName);
  }
  if (item?.renderAssetRef) {
    const renderAssetUrl = getImageUrlFromRenderAssetRef(item.renderAssetRef);
    if (renderAssetUrl) return renderAssetUrl;
  }
  if (item?.itemId) {
    return getImageUrl(item.itemId);
  }
  return getPlaceholderItemImageUrl();
}

export function getImageUrlFromRenderAssetRef(renderAssetRef: string): string | null {
  if (!renderAssetRef) return null;
  const match = renderAssetRef.match(/^nesqlpp:(item|fluid)\/(.+)$/);
  if (!match) return null;
  const family = match[1];
  const entityId = match[2];
  if (family === 'item') {
    return getImageUrl(entityId);
  }
  if (family === 'fluid') {
    return getFluidImageUrl(entityId);
  }
  return null;
}

export function getImageUrlFromFileName(imageFileName: string): string {
  if (!imageFileName) {
    return getPlaceholderItemImageUrl();
  }

  if (/^https?:\/\//i.test(imageFileName) || imageFileName.startsWith('/api/images/')) {
    return imageFileName;
  }

  const normalizedSafePath = normalizeImageFileName(imageFileName)
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part))
    .join('/');

  if (!normalizedSafePath) {
    return getPlaceholderItemImageUrl();
  }

  return buildItemImageUrl(normalizedSafePath);
}

export interface NativeSpriteMetadataFrame {
  timelineIndex?: number;
  frameIndex?: number;
  durationMs?: number;
  index?: number;
  path?: string;
}

export interface NativeSpriteMetadata {
  schemaVersion?: string;
  iconName?: string;
  iconClass?: string;
  atlasTexture?: string;
  atlasExportFile?: string;
  originX?: number;
  originY?: number;
  width?: number;
  height?: number;
  minU?: number;
  maxU?: number;
  minV?: number;
  maxV?: number;
  animated?: boolean;
  frameCount?: number;
  defaultFrameTime?: number;
  nativeSpriteAtlasFile?: string;
  timeline?: NativeSpriteMetadataFrame[];
}

export interface AnimatedAtlasFrameEntry {
  index: number;
  sourcePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnimatedAtlasTimelineEntry {
  timelineIndex: number;
  frameIndex: number;
  index: number;
  durationMs: number;
}

export interface AnimatedAtlasAssetEntry {
  assetId: string;
  variantKey: string;
  frameDurationMs: number | null;
  loopMode: string | null;
  frameCount: number;
  timeline: AnimatedAtlasTimelineEntry[];
  frames: AnimatedAtlasFrameEntry[];
  atlasFile: string;
  atlasGroup: string;
}

export function getSpriteMetadataUrlFromImageUrl(imageUrl: string): string {
  if (/\.sprite-atlas\.png(?:\?.*)?$/i.test(imageUrl)) {
    return imageUrl.replace(/\.sprite-atlas\.png(\?.*)?$/i, '.sprite.json$1');
  }
  return imageUrl.replace(/\.(png|gif)(\?.*)?$/i, '.sprite.json$2');
}

export function getSpriteAtlasUrlFromImageUrl(imageUrl: string): string {
  if (/\.sprite-atlas\.png(?:\?.*)?$/i.test(imageUrl)) {
    return imageUrl;
  }
  return imageUrl.replace(/\.(png|gif)(\?.*)?$/i, '.sprite-atlas.png$2');
}

export function resolveRenderRelativePath(relativePath?: string | null): string | null {
  if (!relativePath) return null;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  if (relativePath.startsWith('/')) return `${BACKEND_BASE_URL}${relativePath}`;
  return `${BACKEND_BASE_URL}/images/${relativePath.replace(/^\/+/, '')}`;
}

export function resolveCanonicalRelativePath(relativePath?: string | null): string | null {
  if (!relativePath) return null;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  const normalized = relativePath.replace(/^\/+/, '');
  const rawPath = normalized.startsWith('canonical/')
    ? normalized.slice('canonical/'.length)
    : normalized;
  const portablePath = rawPath.startsWith('assets/textures/')
    ? rawPath.slice('assets/'.length)
    : rawPath;
  const distPath = portablePath.startsWith('textures/')
    ? portablePath
    : `textures/atlas-assets/${portablePath}`;
  return resolveDistDataAssetPath(distPath);
}
