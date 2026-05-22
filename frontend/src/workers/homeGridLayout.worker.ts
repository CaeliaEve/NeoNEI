type LayoutEntry = {
  key: string;
  kind: 'item' | 'group-collapsed' | 'group-header';
  itemId: string;
  renderAssetRef?: string | null;
};

type LayoutRequest = {
  type: 'layout';
  id: number;
  payload: {
    entries: LayoutEntry[];
    columns: number;
    cardSize: number;
    gap: number;
    iconSize: number;
    canvasWidth: number;
    canvasHeight: number;
    layoutKey: string;
    offscreenCanvasSupported: boolean;
  };
};

type LayoutResult = {
  id: number;
  layoutKey: string;
  canvasWidth: number;
  canvasHeight: number;
  itemIds: string[];
  renderAssetRefs: string[];
  drawCommands: Array<{
    key: string;
    kind: LayoutEntry['kind'];
    entryIndex: number;
    itemId: string;
    x: number;
    y: number;
    size: number;
    iconX: number;
    iconY: number;
    iconSize: number;
  }>;
  offscreenCanvasSupported: boolean;
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => `${value ?? ''}`.trim()).filter(Boolean)));
}

function buildLayoutResult(message: LayoutRequest): LayoutResult {
  const { entries, columns, cardSize, gap, iconSize, canvasWidth, canvasHeight, layoutKey, offscreenCanvasSupported } = message.payload;
  const safeColumns = Math.max(1, Math.floor(columns || 1));
  const safeCardSize = Math.max(1, Math.floor(cardSize || 1));
  const safeGap = Math.max(0, Math.floor(gap || 0));
  const safeIconSize = Math.max(1, Math.floor(iconSize || 1));
  const drawCommands = entries.map((entry, index) => {
    const col = index % safeColumns;
    const row = Math.floor(index / safeColumns);
    const x = col * (safeCardSize + safeGap);
    const y = row * (safeCardSize + safeGap);
    return {
      key: entry.key,
      kind: entry.kind,
      entryIndex: index,
      itemId: entry.itemId,
      x,
      y,
      size: safeCardSize,
      iconX: x + Math.round((safeCardSize - safeIconSize) / 2),
      iconY: y + Math.round((safeCardSize - safeIconSize) / 2),
      iconSize: safeIconSize,
    };
  });

  return {
    id: message.id,
    layoutKey,
    canvasWidth,
    canvasHeight,
    itemIds: unique(entries.map((entry) => entry.itemId)),
    renderAssetRefs: unique(entries.map((entry) => entry.renderAssetRef ?? '')),
    drawCommands,
    offscreenCanvasSupported,
  };
}

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const message = event.data;
  if (message?.type !== 'layout') {
    return;
  }
  self.postMessage(buildLayoutResult(message));
};