type ManifestPayload = Record<string, unknown>;

export function countManifestAssets(payload: ManifestPayload | null): number {
  if (!payload) return 0;
  if (typeof payload.assetCount === 'number') return payload.assetCount;

  const assets = payload.assets;
  if (Array.isArray(assets)) return assets.length;

  const groups = payload.groups;
  if (!Array.isArray(groups)) return 0;
  return groups.reduce((total, group) => {
    if (!group || typeof group !== 'object') return total;
    const groupedAssets = (group as ManifestPayload).assets;
    return total + (Array.isArray(groupedAssets) ? groupedAssets.length : 0);
  }, 0);
}
