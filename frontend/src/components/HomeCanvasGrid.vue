<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { getPreferredStaticImageUrlFromEntity, type BrowserGridEntry, type Item } from "../services/api";
import type { PageAtlasResult, PageAtlasSpriteEntry } from "../services/pageAtlas";
import {
  getSharedAnimationNowMs,
  loadImageAsset,
  resolveTimelineFrameIndex,
} from "../services/animationBudget";
import {
  getGlobalBrowserAtlasEntry,
  getLoadedGlobalAtlasImages,
  getLoadedGlobalAtlasImage,
  getStaticPlacement,
  hasGlobalBrowserAtlas,
  normalizeFrames,
  normalizeTimeline,
  warmGlobalBrowserAtlasForItemsDetailed,
  type BrowserAtlasItemEntry,
} from "../services/globalBrowserAtlas";
import {
  BrowserWebglAtlasRenderer,
  type BrowserWebglAtlasDrawCommand,
} from "../services/browserWebglAtlasRenderer";
import {
  computeHomeGridLayout,
  type HomeGridLayoutCommand,
} from "../services/homeGridLayoutWorker";

type GridRect = {
  entry: BrowserGridEntry;
  item: Item;
  x: number;
  y: number;
  size: number;
};

type BrowserGroupEntry = Extract<BrowserGridEntry, { kind: "group-collapsed" | "group-header" }>;

type PreparedGlobalAnimation = {
  atlasFile: string;
  frames: Array<{ index: number; x: number; y: number; width: number; height: number }>;
  timeline: Array<{ frameIndex: number; durationMs: number }>;
  frameBitmaps: Map<string, ImageBitmap>;
  pendingFrameBitmaps: Set<string>;
};

const props = withDefaults(defineProps<{
  entries: BrowserGridEntry[];
  itemSize?: number;
  atlas?: PageAtlasResult | null;
  enableAnimation?: boolean;
  preferAtlas?: boolean;
}>(), {
  itemSize: 50,
  atlas: null,
  enableAnimation: true,
  preferAtlas: false,
});

const emit = defineEmits<{
  itemClick: [item: Item];
  itemContextmenu: [item: Item, event: MouseEvent];
  groupClick: [group: BrowserGroupEntry["group"]];
  groupContextmenu: [group: BrowserGroupEntry["group"], event: MouseEvent];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const webglCanvasRef = ref<HTMLCanvasElement | null>(null);
const hostWidth = ref(0);
let itemRects: GridRect[] = [];
let animatedItemRects: GridRect[] = [];
const hoveredRect = ref<GridRect | null>(null);
const hoveredPointer = ref({ x: 0, y: 0 });
const atlasImage = ref<HTMLImageElement | null>(null);
const atlasLoadError = ref(false);
const allowFallbackBeforeAtlas = ref(false);
const layoutCommands = ref<HomeGridLayoutCommand[] | null>(null);
const activeLayoutKey = ref("");

const staticImages = new Map<string, HTMLImageElement>();
const pendingStaticImages = new Map<string, Promise<HTMLImageElement | null>>();
const preparedGlobalAnimations = new Map<string, PreparedGlobalAnimation>();
const slotChromeCache = new Map<string, HTMLCanvasElement>();

let resizeObserver: ResizeObserver | null = null;
let renderFrameHandle: number | null = null;
let animationLoopHandle: number | null = null;
let animationResumeTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let lastEntriesChangedAt = 0;
let atlasLoadSeq = 0;
let globalAtlasWarmTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let globalAtlasTextureWarmTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let webglAtlasRenderer: BrowserWebglAtlasRenderer | null = null;
let layoutRequestSeq = 0;
let lastDrawHadAnimatedFrame = false;
const gap = 4;
const cardSize = computed(() => Math.max(28, Math.floor(props.itemSize)));
const iconSize = computed(() => Math.max(24, Math.floor(cardSize.value * 0.9)));
const columns = computed(() => {
  const width = Math.max(hostWidth.value, cardSize.value);
  return Math.max(1, Math.floor((width + gap) / (cardSize.value + gap)));
});
const rows = computed(() => Math.max(1, Math.ceil(props.entries.length / columns.value)));
const canvasWidth = computed(() => Math.max(columns.value * (cardSize.value + gap) - gap, cardSize.value));
const canvasHeight = computed(() => Math.max(rows.value * (cardSize.value + gap) - gap, cardSize.value));
const layoutKey = computed(() => [
  props.entries.map((entry) => entry.key).join("|"),
  columns.value,
  cardSize.value,
  iconSize.value,
  canvasWidth.value,
  canvasHeight.value,
].join("::"));
const atlasReady = computed(() => Boolean(props.atlas?.atlasUrl && atlasImage.value && !atlasLoadError.value));
const hasAtlasSource = computed(
  () => props.preferAtlas && (props.atlas === undefined || Boolean(props.atlas?.atlasUrl)),
);
const shouldHoldFallbackImages = computed(
  () => hasAtlasSource.value && !atlasReady.value && !atlasLoadError.value && !allowFallbackBeforeAtlas.value,
);

function updateHostWidth() {
  hostWidth.value = hostRef.value?.clientWidth ?? 0;
}

function syncAtlasFallbackGate() {
  if (hasAtlasSource.value && !atlasReady.value && !atlasLoadError.value) {
    allowFallbackBeforeAtlas.value = false;
    return;
  }

  allowFallbackBeforeAtlas.value = true;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function scheduleRender() {
  if (renderFrameHandle !== null) {
    cancelAnimationFrame(renderFrameHandle);
  }
  renderFrameHandle = requestAnimationFrame(() => {
    renderFrameHandle = null;
    draw();
  });
}

function canRunAnimatedOverlay(): boolean {
  return props.enableAnimation && performance.now() - lastEntriesChangedAt > 650;
}

function scheduleAnimationResume() {
  if (animationResumeTimer !== null) {
    clearTimeout(animationResumeTimer);
  }
  animationResumeTimer = globalThis.setTimeout(() => {
    animationResumeTimer = null;
    scheduleRender();
  }, 720);
}

async function refreshHomeGridLayout() {
  const requestSeq = ++layoutRequestSeq;
  const requestedLayoutKey = layoutKey.value;
  const result = await computeHomeGridLayout({
    entries: props.entries,
    columns: columns.value,
    cardSize: cardSize.value,
    gap,
    iconSize: iconSize.value,
    canvasWidth: canvasWidth.value,
    canvasHeight: canvasHeight.value,
    layoutKey: requestedLayoutKey,
  }).catch(() => null);

  if (!result || requestSeq !== layoutRequestSeq || result.layoutKey !== layoutKey.value) {
    return;
  }

  layoutCommands.value = result.drawCommands;
  activeLayoutKey.value = result.layoutKey;
  scheduleRender();
}

function startAnimationLoop() {
  if (animationLoopHandle !== null) {
    return;
  }

  const tick = () => {
    animationLoopHandle = requestAnimationFrame(() => {
      animationLoopHandle = null;
      drawAnimationOverlay();
      if (lastDrawHadAnimatedFrame && animatedItemRects.length > 0) {
        tick();
      }
    });
  };

  tick();
}

function stopAnimationLoop() {
  if (animationLoopHandle !== null) {
    cancelAnimationFrame(animationLoopHandle);
    animationLoopHandle = null;
  }

  clearAnimationOverlay();
}

function scheduleGlobalAtlasTextureWarm(delayMs = 0) {
  if (!webglAtlasRenderer || !hasGlobalBrowserAtlas()) {
    return;
  }
  if (globalAtlasTextureWarmTimer !== null) {
    clearTimeout(globalAtlasTextureWarmTimer);
    globalAtlasTextureWarmTimer = null;
  }
  globalAtlasTextureWarmTimer = globalThis.setTimeout(() => {
    globalAtlasTextureWarmTimer = null;
    const images = getLoadedGlobalAtlasImages();
    if (images.length > 0) {
      webglAtlasRenderer?.warmImages(images);
    }
  }, delayMs);
}

function ensureGlobalAtlasResident() {
  if (!props.preferAtlas || !hasGlobalBrowserAtlas()) {
    return;
  }
  scheduleGlobalAtlasTextureWarm(0);
}

function getItemForEntry(entry: BrowserGridEntry): Item {
  return entry.kind === "item" ? entry.item : entry.group.representative;
}

function shouldUseDirectStaticCorrection(item: Item): boolean {
  void item;
  // Homepage item rendering is atlas-authoritative. Direct `/images/item/*`
  // corrections reintroduce slow per-texture requests and hide NESQL++ atlas
  // coverage defects, so missing GT machine textures must be fixed in the
  // exported browser atlas instead.
  return false;
}

function getStaticImageSrc(item: Item): string {
  if (shouldUseDirectStaticCorrection(item) && item.imageFileName) {
    return `/images/item/${item.imageFileName.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/")}`;
  }
  return getPreferredStaticImageUrlFromEntity(item);
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, rect: GridRect) {
  const inset = 4;
  const size = rect.size - inset * 2;
  ctx.save();
  roundRect(ctx, rect.x + inset, rect.y + inset, size, size, 10);
  ctx.fillStyle = "rgba(14, 20, 29, 0.92)";
  ctx.fill();
  ctx.restore();
}

function getSlotChromeKind(rect: GridRect): string {
  return rect.entry.kind === "item" ? "item" : rect.entry.kind;
}

function buildSlotChrome(size: number, kind: string, hovered: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.save();
  roundRect(ctx, 0, 0, size, size, 12);
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "rgba(16, 20, 27, 0.94)");
  gradient.addColorStop(1, "rgba(8, 11, 16, 0.98)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = hovered
    ? "rgba(125, 211, 252, 0.55)"
    : kind === "item"
      ? "rgba(148, 163, 184, 0.16)"
      : "rgba(96, 165, 250, 0.28)";
  ctx.lineWidth = hovered ? 1.4 : 1;
  ctx.stroke();

  if (kind !== "item") {
    const halo = ctx.createRadialGradient(
      size * 0.5,
      size * 0.28,
      0,
      size * 0.5,
      size * 0.28,
      size * 0.55,
    );
    halo.addColorStop(0, kind === "group-header" ? "rgba(96, 165, 250, 0.18)" : "rgba(125, 211, 252, 0.16)");
    halo.addColorStop(1, "rgba(125, 211, 252, 0)");
    ctx.fillStyle = halo;
    roundRect(ctx, 0, 0, size, size, 12);
    ctx.fill();
  }

  if (hovered) {
    ctx.shadowColor = "rgba(56, 189, 248, 0.3)";
    ctx.shadowBlur = 10;
    roundRect(ctx, 1, 1, size - 2, size - 2, 11);
    ctx.strokeStyle = "rgba(125, 211, 252, 0.28)";
    ctx.stroke();
  }
  ctx.restore();
  return canvas;
}

function drawSlotChrome(ctx: CanvasRenderingContext2D, rect: GridRect, hovered: boolean) {
  const kind = getSlotChromeKind(rect);
  const cacheKey = `${rect.size}:${kind}:${hovered ? 1 : 0}`;
  let chrome = slotChromeCache.get(cacheKey);
  if (!chrome) {
    chrome = buildSlotChrome(rect.size, kind, hovered);
    slotChromeCache.set(cacheKey, chrome);
  }
  ctx.drawImage(chrome, rect.x, rect.y);
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  options?: { minWidth?: number; fillStyle?: string; strokeStyle?: string; textStyle?: string; paddingX?: number },
) {
  ctx.save();
  ctx.font = "600 10px Inter, Segoe UI, sans-serif";
  const paddingX = options?.paddingX ?? 5;
  const textWidth = ctx.measureText(text).width;
  const width = Math.max(options?.minWidth ?? 18, Math.ceil(textWidth + paddingX * 2));
  const height = 18;
  roundRect(ctx, x, y, width, height, 9);
  ctx.fillStyle = options?.fillStyle ?? "rgba(8, 12, 18, 0.86)";
  ctx.fill();
  ctx.strokeStyle = options?.strokeStyle ?? "rgba(148, 163, 184, 0.24)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = options?.textStyle ?? "rgba(226, 232, 240, 0.98)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y + height / 2 + 0.5);
  ctx.restore();
}

function drawGroupOverlay(ctx: CanvasRenderingContext2D, rect: GridRect) {
  if (rect.entry.kind === "item") return;
  drawBadge(ctx, rect.x + rect.size - 24, rect.y + 5, String(rect.entry.group.size), {
    minWidth: 19,
  });
  drawBadge(ctx, rect.x + 6, rect.y + rect.size - 24, rect.entry.kind === "group-header" ? "OPEN" : "GROUP", {
    fillStyle: "rgba(8, 12, 18, 0.82)",
    strokeStyle: "rgba(148, 163, 184, 0.2)",
    textStyle: "rgba(191, 219, 254, 0.98)",
    paddingX: 6,
  });
}
function drawAtlasSprite(
  ctx: CanvasRenderingContext2D,
  atlas: HTMLImageElement,
  sprite: PageAtlasSpriteEntry,
  rect: GridRect,
) {
  const drawX = rect.x + Math.round((rect.size - iconSize.value) / 2);
  const drawY = rect.y + Math.round((rect.size - iconSize.value) / 2);
  ctx.drawImage(
    atlas,
    sprite.x,
    sprite.y,
    sprite.slotSize,
    sprite.slotSize,
    drawX,
    drawY,
    iconSize.value,
    iconSize.value,
  );
}

function drawGlobalStaticSprite(
  ctx: CanvasRenderingContext2D,
  atlas: HTMLImageElement,
  entry: BrowserAtlasItemEntry,
  rect: GridRect,
): boolean {
  const placement = getStaticPlacement(entry);
  if (!placement) return false;
  const sourceWidth = Math.max(1, Number(placement.width ?? 0));
  const sourceHeight = Math.max(1, Number(placement.height ?? 0));
  const sourceX = Math.max(0, Number(placement.x ?? 0));
  const sourceY = Math.max(0, Number(placement.y ?? 0));
  if (!sourceWidth || !sourceHeight) return false;

  const drawX = rect.x + Math.round((rect.size - iconSize.value) / 2);
  const drawY = rect.y + Math.round((rect.size - iconSize.value) / 2);
  ctx.drawImage(
    atlas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    drawX,
    drawY,
    iconSize.value,
    iconSize.value,
  );
  return true;
}

function getIconDrawRect(rect: GridRect) {
  return {
    x: rect.x + Math.round((rect.size - iconSize.value) / 2),
    y: rect.y + Math.round((rect.size - iconSize.value) / 2),
    size: iconSize.value,
  };
}

function queueGlobalStaticSprite(
  commands: BrowserWebglAtlasDrawCommand[],
  atlas: HTMLImageElement,
  entry: BrowserAtlasItemEntry,
  rect: GridRect,
): boolean {
  if (!webglAtlasRenderer?.canDrawImage(atlas)) return false;
  const placement = getStaticPlacement(entry);
  if (!placement) return false;
  const sourceWidth = Math.max(1, Number(placement.width ?? 0));
  const sourceHeight = Math.max(1, Number(placement.height ?? 0));
  const sourceX = Math.max(0, Number(placement.x ?? 0));
  const sourceY = Math.max(0, Number(placement.y ?? 0));
  if (!sourceWidth || !sourceHeight) return false;

  const drawRect = getIconDrawRect(rect);
  commands.push({
    image: atlas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    destX: drawRect.x,
    destY: drawRect.y,
    destWidth: drawRect.size,
    destHeight: drawRect.size,
  });
  return true;
}

function getPreparedGlobalAnimation(itemId: string, entry: BrowserAtlasItemEntry): PreparedGlobalAnimation | null {
  const atlasFile = `${entry.animatedAtlas?.atlasFile ?? ""}`.trim();
  if (!atlasFile) return null;

  const cached = preparedGlobalAnimations.get(itemId);
  if (cached?.atlasFile === atlasFile) {
    return cached;
  }

  const frames = normalizeFrames(entry.animatedAtlas?.frames);
  const timeline = normalizeTimeline(entry.animatedAtlas?.timeline, entry.animatedAtlas?.frameDurationMs);
  if (frames.length === 0 || timeline.length === 0) {
    return null;
  }

  const prepared = { atlasFile, frames, timeline, frameBitmaps: new Map<string, ImageBitmap>(), pendingFrameBitmaps: new Set<string>() };
  preparedGlobalAnimations.set(itemId, prepared);
  return prepared;
}

function drawGlobalAnimation(
  ctx: CanvasRenderingContext2D,
  entry: BrowserAtlasItemEntry,
  rect: GridRect,
  now: number,
): boolean {
  const prepared = getPreparedGlobalAnimation(rect.item.itemId, entry);
  if (!prepared) return false;
  const atlas = getLoadedGlobalAtlasImage(prepared.atlasFile);
  if (!atlas) return false;
  const frameIndex = resolveTimelineFrameIndex(prepared.timeline, now);
  const frame = prepared.frames.find((candidate) => candidate.index === frameIndex) ?? prepared.frames[0];
  if (!frame) return false;

  const drawX = rect.x + Math.round((rect.size - iconSize.value) / 2);
  const drawY = rect.y + Math.round((rect.size - iconSize.value) / 2);
  const frameCacheKey = `${frame.index}`;
  const bitmap = prepared.frameBitmaps.get(frameCacheKey);
  if (bitmap) {
    ctx.drawImage(bitmap, drawX, drawY, iconSize.value, iconSize.value);
    return true;
  }
  if (typeof createImageBitmap === "function" && !prepared.pendingFrameBitmaps.has(frameCacheKey)) {
    prepared.pendingFrameBitmaps.add(frameCacheKey);
    void createImageBitmap(atlas, frame.x, frame.y, frame.width, frame.height)
      .then((nextBitmap) => {
        prepared.frameBitmaps.set(frameCacheKey, nextBitmap);
        scheduleRender();
      })
      .catch(() => undefined)
      .finally(() => {
        prepared.pendingFrameBitmaps.delete(frameCacheKey);
      });
  }
  return false;
}

function queueGlobalAnimation(
  commands: BrowserWebglAtlasDrawCommand[],
  entry: BrowserAtlasItemEntry,
  rect: GridRect,
  now: number,
): boolean {
  const prepared = getPreparedGlobalAnimation(rect.item.itemId, entry);
  if (!prepared) return false;
  const atlas = getLoadedGlobalAtlasImage(prepared.atlasFile);
  if (!atlas) return false;

  const frameIndex = resolveTimelineFrameIndex(prepared.timeline, now);
  const frame = prepared.frames.find((candidate) => candidate.index === frameIndex) ?? prepared.frames[0];
  if (!frame) return false;

  const drawRect = getIconDrawRect(rect);
  commands.push({
    image: atlas,
    sourceX: frame.x,
    sourceY: frame.y,
    sourceWidth: frame.width,
    sourceHeight: frame.height,
    destX: drawRect.x,
    destY: drawRect.y,
    destWidth: drawRect.size,
    destHeight: drawRect.size,
  });
  return true;
}

function drawStaticImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: GridRect,
) {
  const drawX = rect.x + Math.round((rect.size - iconSize.value) / 2);
  const drawY = rect.y + Math.round((rect.size - iconSize.value) / 2);
  ctx.drawImage(image, drawX, drawY, iconSize.value, iconSize.value);
}

function ensureOverlayCanvasSize(canvas: HTMLCanvasElement) {
  if (canvas.width !== canvasWidth.value) {
    canvas.width = canvasWidth.value;
  }
  if (canvas.height !== canvasHeight.value) {
    canvas.height = canvasHeight.value;
  }
}

function clearAnimationOverlay() {
  const canvas = webglCanvasRef.value;
  if (!canvas) return;
  ensureOverlayCanvasSize(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawAnimationOverlay() {
  if (!canRunAnimatedOverlay()) {
    lastDrawHadAnimatedFrame = false;
    clearAnimationOverlay();
    return;
  }
  const canvas = webglCanvasRef.value;
  if (!canvas) return;
  ensureOverlayCanvasSize(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const now = getSharedAnimationNowMs();
  let drewFrame = false;
  if (webglAtlasRenderer) {
    const commands: BrowserWebglAtlasDrawCommand[] = [];
    for (const rect of animatedItemRects) {
      const globalEntry = hasGlobalBrowserAtlas() ? getGlobalBrowserAtlasEntry(rect.item.itemId) : null;
      if (props.enableAnimation && globalEntry && queueGlobalAnimation(commands, globalEntry, rect, now)) {
        drewFrame = true;
      }
    }
    if (commands.length > 0) {
      webglAtlasRenderer.draw(canvasWidth.value, canvasHeight.value, commands);
      lastDrawHadAnimatedFrame = drewFrame;
      return;
    }
  }

  for (const rect of animatedItemRects) {
    const globalEntry = hasGlobalBrowserAtlas() ? getGlobalBrowserAtlasEntry(rect.item.itemId) : null;
    if (props.enableAnimation && globalEntry && drawGlobalAnimation(ctx, globalEntry, rect, now)) {
      drawGroupOverlay(ctx, rect);
      drewFrame = true;
      continue;
    }

  }
  lastDrawHadAnimatedFrame = drewFrame;
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (canvas.width !== canvasWidth.value) {
    canvas.width = canvasWidth.value;
  }
  if (canvas.height !== canvasHeight.value) {
    canvas.height = canvasHeight.value;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  const nextRects: GridRect[] = [];
  const nextAnimatedRects: GridRect[] = [];
  const now = getSharedAnimationNowMs();
  let drewAnimatedFrame = false;
  const allowAnimatedOverlay = canRunAnimatedOverlay();
  const webglCommands: BrowserWebglAtlasDrawCommand[] = [];
  // Keep the homepage on the stable Canvas2D resident-atlas path for now.
  // The experimental WebGL overlay can fail to present some atlas shards while
  // still short-circuiting the Canvas fallback, which makes the browser look
  // like textures are missing. Canvas2D still uses the global atlas and avoids
  // per-item PNG loads, so it preserves the NEI-style fast path safely.
  const canUseWebglAtlas = false;
  const activeCommands = activeLayoutKey.value === layoutKey.value ? layoutCommands.value : null;
  const commandsByEntryIndex = new Map<number, HomeGridLayoutCommand>();
  activeCommands?.forEach((command) => {
    if (Number.isInteger(command.entryIndex) && command.entryIndex >= 0) {
      commandsByEntryIndex.set(command.entryIndex, command);
    }
  });

  for (let index = 0; index < props.entries.length; index += 1) {
    const command = commandsByEntryIndex.get(index) ?? null;
    const entry = props.entries[index];
    if (!entry) {
      continue;
    }
    const col = index % columns.value;
    const row = Math.floor(index / columns.value);
    const rect: GridRect = {
      entry,
      item: getItemForEntry(entry),
      x: command?.x ?? col * (cardSize.value + gap),
      y: command?.y ?? row * (cardSize.value + gap),
      size: command?.size ?? cardSize.value,
    };
    nextRects.push(rect);
    drawSlotChrome(ctx, rect, hoveredRect.value?.entry.key === entry.key);

    const itemId = rect.item.itemId;
    const globalEntry = hasGlobalBrowserAtlas() ? getGlobalBrowserAtlasEntry(itemId) : null;
    const sprite = props.atlas?.entries?.[itemId];
    if (sprite && atlasReady.value && atlasImage.value) {
      drawAtlasSprite(ctx, atlasImage.value, sprite, rect);
      if (allowAnimatedOverlay && globalEntry && getPreparedGlobalAnimation(itemId, globalEntry) && getLoadedGlobalAtlasImage(globalEntry.animatedAtlas?.atlasFile)) {
        nextAnimatedRects.push(rect);
        drewAnimatedFrame = true;
      }
      drawGroupOverlay(ctx, rect);
      continue;
    }

    if (allowAnimatedOverlay && canUseWebglAtlas && globalEntry && queueGlobalAnimation(webglCommands, globalEntry, rect, now)) {
      drewAnimatedFrame = true;
      drawGroupOverlay(ctx, rect);
      continue;
    }

    const webglGlobalStaticAtlas = canUseWebglAtlas
      ? getLoadedGlobalAtlasImage(globalEntry?.staticAtlas?.atlasFile)
      : null;
    if (
      canUseWebglAtlas
      && globalEntry
      && webglGlobalStaticAtlas
      && queueGlobalStaticSprite(webglCommands, webglGlobalStaticAtlas, globalEntry, rect)
    ) {
      drawGroupOverlay(ctx, rect);
      continue;
    }

    const globalStaticAtlas = getLoadedGlobalAtlasImage(globalEntry?.staticAtlas?.atlasFile);
    if (globalEntry && globalStaticAtlas && drawGlobalStaticSprite(ctx, globalStaticAtlas, globalEntry, rect)) {
      if (allowAnimatedOverlay && getPreparedGlobalAnimation(itemId, globalEntry) && getLoadedGlobalAtlasImage(globalEntry.animatedAtlas?.atlasFile)) {
        nextAnimatedRects.push(rect);
        drewAnimatedFrame = true;
      }
      drawGroupOverlay(ctx, rect);
      continue;
    }

    if (globalEntry && drawGlobalAnimation(ctx, globalEntry, rect, now)) {
      if (allowAnimatedOverlay) {
        nextAnimatedRects.push(rect);
        drewAnimatedFrame = true;
      }
      drawGroupOverlay(ctx, rect);
      continue;
    }

    if (hasGlobalBrowserAtlas()) {
      drawPlaceholder(ctx, rect);
      drawGroupOverlay(ctx, rect);
      continue;
    }



    const src = getStaticImageSrc(rect.item);
    const staticImage = staticImages.get(src);
    if ((!props.atlas?.atlasUrl || shouldUseDirectStaticCorrection(rect.item)) && staticImage) {
      drawStaticImage(ctx, staticImage, rect);
      drawGroupOverlay(ctx, rect);
      continue;
    }

    if (staticImage) {
      drawStaticImage(ctx, staticImage, rect);
      drawGroupOverlay(ctx, rect);
      continue;
    }

    drawPlaceholder(ctx, rect);
    drawGroupOverlay(ctx, rect);
  }

  itemRects = nextRects;
  animatedItemRects = nextAnimatedRects;
  lastDrawHadAnimatedFrame = drewAnimatedFrame;
  if (canUseWebglAtlas) {
    webglAtlasRenderer?.draw(canvasWidth.value, canvasHeight.value, webglCommands);
  }
  if (drewAnimatedFrame) {
    drawAnimationOverlay();
    startAnimationLoop();
  } else {
    animatedItemRects = [];
    clearAnimationOverlay();
    stopAnimationLoop();
  }
}

function findRectAt(clientX: number, clientY: number): GridRect | null {
  const host = hostRef.value;
  if (!host) return null;
  const bounds = host.getBoundingClientRect();
  const x = clientX - bounds.left;
  const y = clientY - bounds.top;
  return itemRects.find((rect) => x >= rect.x && x <= rect.x + rect.size && y >= rect.y && y <= rect.y + rect.size) ?? null;
}

async function ensureStaticImage(item: Item): Promise<HTMLImageElement | null> {
  if (hasGlobalBrowserAtlas() && getGlobalBrowserAtlasEntry(item.itemId)) {
    return null;
  }
  if (hasGlobalBrowserAtlas()) {
    return null;
  }
  const globalEntry = hasGlobalBrowserAtlas() ? getGlobalBrowserAtlasEntry(item.itemId) : null;
  if (!shouldUseDirectStaticCorrection(item) && globalEntry && getLoadedGlobalAtlasImage(globalEntry.staticAtlas?.atlasFile)) {
    return null;
  }
  const src = getStaticImageSrc(item);
  if (!src) return null;
  const cached = staticImages.get(src);
  if (cached) return cached;
  const existing = pendingStaticImages.get(src);
  if (existing) return existing;

  const request = loadImageAsset(src)
    .then((image) => {
      staticImages.set(src, image);
      scheduleRender();
      return image;
    })
    .catch(() => null)
    .finally(() => {
      pendingStaticImages.delete(src);
    });

  pendingStaticImages.set(src, request);
  return request;
}

async function loadAtlas() {
  const atlasUrl = props.atlas?.atlasUrl;
  const sequence = ++atlasLoadSeq;
  atlasImage.value = null;
  atlasLoadError.value = false;

  if (props.preferAtlas && hasGlobalBrowserAtlas()) {
    allowFallbackBeforeAtlas.value = false;
    const itemIds = Array.from(
      new Set(
        props.entries
          .map((entry) => getItemForEntry(entry)?.itemId)
          .filter((itemId): itemId is string => Boolean(itemId)),
      ),
    );
    if (globalAtlasWarmTimer !== null) {
      clearTimeout(globalAtlasWarmTimer);
      globalAtlasWarmTimer = null;
    }
    if (itemIds.length > 0) {
      globalAtlasWarmTimer = globalThis.setTimeout(() => {
        globalAtlasWarmTimer = null;
        void warmGlobalBrowserAtlasForItemsDetailed(itemIds).finally(() => {
          if (sequence === atlasLoadSeq) {
            scheduleRender();
          }
        });
      }, 0);
    }
    scheduleRender();
    return;
  }

  if (!atlasUrl) {
    scheduleRender();
    return;
  }

  try {
    const image = await loadImageAsset(atlasUrl);
    if (sequence !== atlasLoadSeq) return;
    atlasImage.value = image;
  } catch {
    if (sequence !== atlasLoadSeq) return;
    atlasLoadError.value = true;
    warmStaticImages();
  } finally {
    if (sequence === atlasLoadSeq) {
      scheduleRender();
    }
  }
}

function warmStaticImages() {
  if (hasGlobalBrowserAtlas()) {
    return;
  }
  if (shouldHoldFallbackImages.value) {
    return;
  }
  // The homepage browser's intended steady state is resident atlas drawImage/WebGL.
  // Letting per-item PNG requests race the atlas on first paint or fast page flips
  // recreates the slow "one by one texture fill-in" behavior, so only use this
  // legacy path when the page atlas/global atlas path has actually failed.
  if (hasAtlasSource.value && !atlasLoadError.value) {
    return;
  }
  props.entries.forEach((entry) => {
    const item = getItemForEntry(entry);
    if (hasGlobalBrowserAtlas() && getGlobalBrowserAtlasEntry(item.itemId)) {
      return;
    }
    if (shouldUseDirectStaticCorrection(item)) {
      void ensureStaticImage(item);
      return;
    }
    const globalEntry = hasGlobalBrowserAtlas() ? getGlobalBrowserAtlasEntry(item.itemId) : null;
    if (globalEntry && getLoadedGlobalAtlasImage(globalEntry.staticAtlas?.atlasFile)) {
      return;
    }
    const sprite = props.atlas?.entries?.[item.itemId];
    if (sprite && atlasReady.value) {
      return;
    }
    void ensureStaticImage(item);
  });
}

function warmGlobalAtlasImages() {
  const itemIds = Array.from(
    new Set(
      props.entries
        .map((entry) => getItemForEntry(entry)?.itemId)
        .filter((itemId): itemId is string => Boolean(itemId)),
    ),
  );
  if (itemIds.length === 0) {
    return;
  }
  if (globalAtlasWarmTimer !== null) {
    clearTimeout(globalAtlasWarmTimer);
  }
  globalAtlasWarmTimer = globalThis.setTimeout(() => {
    globalAtlasWarmTimer = null;
    void warmGlobalBrowserAtlasForItemsDetailed(itemIds).finally(() => {
      scheduleRender();
    });
  }, 0);
}

function handleClick(event: MouseEvent) {
  const rect = findRectAt(event.clientX, event.clientY);
  if (!rect) return;
  if (rect.entry.kind === "item") {
    emit("itemClick", rect.item);
    return;
  }
  emit("groupClick", rect.entry.group);
}

function handleContextMenu(event: MouseEvent) {
  const rect = findRectAt(event.clientX, event.clientY);
  if (!rect) return;
  event.preventDefault();
  if (rect.entry.kind === "item") {
    emit("itemContextmenu", rect.item, event);
    return;
  }
  emit("groupContextmenu", rect.entry.group, event);
}

function getRectIdentity(rect: GridRect | null): string {
  return rect?.entry.key ?? "";
}

function handleMouseMove(event: MouseEvent) {
  const nextHoveredRect = findRectAt(event.clientX, event.clientY);
  const hoverChanged = getRectIdentity(nextHoveredRect) !== getRectIdentity(hoveredRect.value);
  if (!hoverChanged) {
    return;
  }
  hoveredPointer.value = {
    x: event.offsetX,
    y: event.offsetY,
  };
  hoveredRect.value = nextHoveredRect;
  if (hostRef.value) {
    hostRef.value.style.cursor = hoveredRect.value ? "pointer" : "default";
  }
  scheduleRender();
}

function handleMouseLeave() {
  hoveredRect.value = null;
  if (hostRef.value) {
    hostRef.value.style.cursor = "default";
  }
  scheduleRender();
}

const tooltipTitle = computed(() => {
  const rect = hoveredRect.value;
  if (!rect) return "";
  if (rect.entry.kind === "item") {
    return rect.item.localizedName || rect.item.internalName || rect.item.itemId;
  }
  return rect.entry.group.label || rect.item.localizedName || rect.item.internalName || rect.item.itemId;
});

const tooltipSubtitle = computed(() => {
  const rect = hoveredRect.value;
  if (!rect) return "";
  if (rect.entry.kind === "item") {
    return "Left click: recipes · Right click: uses";
  }
  return `Group ${rect.entry.group.size} items · Left click: expand/collapse · Right click: uses`;
});
const tooltipStyle = computed<Record<string, string> | null>(() => {
  if (!hoveredRect.value) return null;
  const host = hostRef.value;
  if (!host) return null;

  const hostWidthValue = host.clientWidth;
  const maxWidth = 260;
  const left = Math.min(Math.max(hoveredPointer.value.x + 14, 8), Math.max(8, hostWidthValue - maxWidth - 8));
  const top = Math.max(8, hoveredPointer.value.y + 14);
  return {
    transform: `translate3d(${left}px, ${top}px, 0)`,
  };
});

watch(
  () => props.atlas?.atlasUrl ?? "",
  () => {
    syncAtlasFallbackGate();
    void loadAtlas();
  },
  { immediate: true },
);

watch(
  () => layoutKey.value,
  () => {
    layoutCommands.value = null;
    activeLayoutKey.value = "";
    void refreshHomeGridLayout();
  },
  { immediate: true },
);

watch(
  () => [props.entries.map((entry) => entry.key).join("|"), props.itemSize, props.atlas?.atlasUrl ?? "", shouldHoldFallbackImages.value].join("::"),
  () => {
    lastEntriesChangedAt = performance.now();
    stopAnimationLoop();
    scheduleAnimationResume();
    syncAtlasFallbackGate();
    warmGlobalAtlasImages();
    warmStaticImages();
    scheduleRender();
  },
  { immediate: true },
);

watch(
  () => props.enableAnimation,
  (enabled) => {
    if (enabled) {
        return;
    }    stopAnimationLoop();
    scheduleRender();
  },
);

onMounted(() => {
  updateHostWidth();
  if (webglCanvasRef.value) {
    webglAtlasRenderer = BrowserWebglAtlasRenderer.create(webglCanvasRef.value);
  }
  resizeObserver = new ResizeObserver(() => {
    updateHostWidth();
    scheduleRender();
  });
  if (hostRef.value) {
    resizeObserver.observe(hostRef.value);
  }
  // Static browsing remains Canvas2D/page-atlas; WebGL is used only for the
  // animated overlay so large native animated atlases do not block Canvas2D.
  window.addEventListener("resize", updateHostWidth, { passive: true });
  ensureGlobalAtlasResident();
  scheduleRender();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener("resize", updateHostWidth);
  if (renderFrameHandle !== null) {
    cancelAnimationFrame(renderFrameHandle);
    renderFrameHandle = null;
  }
  stopAnimationLoop();
  if (globalAtlasWarmTimer !== null) {
    clearTimeout(globalAtlasWarmTimer);
    globalAtlasWarmTimer = null;
  }
  if (animationResumeTimer !== null) {
    clearTimeout(animationResumeTimer);
    animationResumeTimer = null;
  }
  if (globalAtlasTextureWarmTimer !== null) {
    clearTimeout(globalAtlasTextureWarmTimer);
    globalAtlasTextureWarmTimer = null;
  }
  webglAtlasRenderer?.dispose();
  webglAtlasRenderer = null;
});
</script>

<template>
  <div
    ref="hostRef"
    class="home-canvas-grid"
    @click="handleClick"
    @contextmenu="handleContextMenu"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <canvas ref="canvasRef" class="home-canvas-grid__canvas" />
    <canvas ref="webglCanvasRef" class="home-canvas-grid__canvas home-canvas-grid__webgl" />
    <div v-if="hoveredRect && tooltipStyle" class="home-canvas-grid__tooltip" :style="tooltipStyle">
      <div class="home-canvas-grid__tooltip-title">{{ tooltipTitle }}</div>
      <div class="home-canvas-grid__tooltip-subtitle">{{ tooltipSubtitle }}</div>
    </div>
  </div>
</template>

<style scoped>
.home-canvas-grid {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  user-select: none;
}

.home-canvas-grid__canvas {
  display: block;
  image-rendering: pixelated;
}

.home-canvas-grid__webgl {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.home-canvas-grid__tooltip {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 12;
  max-width: 260px;
  pointer-events: none;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(5, 9, 14, 0.94);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
  padding: 10px 12px;
  backdrop-filter: blur(10px);
  will-change: transform;
}

.home-canvas-grid__tooltip-title {
  color: rgba(248, 250, 252, 0.98);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
}

.home-canvas-grid__tooltip-subtitle {
  margin-top: 4px;
  color: rgba(148, 163, 184, 0.92);
  font-size: 11px;
  line-height: 1.4;
}
</style>
