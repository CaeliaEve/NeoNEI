import type { PageRichMediaManifest } from '../../services/api';
import {
  getAnimatedAtlasImageUrl,
  loadImageAsset,
  primeAnimatedAtlasManifest,
  primeRenderAnimationHintsFromUnknown,
} from '../../services/animationBudget';

export const RECIPE_PAGE_PREWARM_LOOKAHEAD = 6;
export const RECIPE_PAGE_PREWARM_LOOKBEHIND = 2;
export const RECIPE_PAGE_PREWARM_MAX_RECIPES = 18;
const RECIPE_MEDIA_MANIFEST_PREWARM_LIMIT = 8;

export function primeRecipePayloadMedia(payload: { mediaManifest?: PageRichMediaManifest | null } | unknown): void {
  primeRenderAnimationHintsFromUnknown(payload);
  const mediaManifest =
    payload && typeof payload === 'object' && 'mediaManifest' in payload
      ? ((payload as { mediaManifest?: PageRichMediaManifest | null }).mediaManifest ?? null)
      : null;
  primeAnimatedAtlasManifest(mediaManifest);
  const urls = Array.from(
    new Set(
      Object.values(mediaManifest?.animatedAtlases ?? {})
        .map((entry) => getAnimatedAtlasImageUrl(entry))
        .filter((url): url is string => Boolean(url)),
    ),
  ).slice(0, RECIPE_MEDIA_MANIFEST_PREWARM_LIMIT);
  for (const url of urls) {
    void loadImageAsset(url);
  }
}

export function buildCategoryPrewarmPageSequence(pageCount: number, currentPageIndex: number): number[] {
  if (pageCount <= 0) {
    return [];
  }
  const normalizedCurrent = Math.min(Math.max(1, currentPageIndex), pageCount);
  const pages: number[] = [];
  const pushPage = (page: number) => {
    if (page < 1 || page > pageCount || pages.includes(page)) {
      return;
    }
    pages.push(page);
  };

  pushPage(normalizedCurrent);
  for (let delta = 1; delta <= RECIPE_PAGE_PREWARM_LOOKAHEAD; delta += 1) {
    pushPage(normalizedCurrent + delta);
  }
  for (let delta = 1; delta <= RECIPE_PAGE_PREWARM_LOOKBEHIND; delta += 1) {
    pushPage(normalizedCurrent - delta);
  }

  return pages;
}
