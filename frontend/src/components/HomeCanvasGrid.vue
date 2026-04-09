<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { getPreferredStaticImageUrlFromEntity, type Item } from "../services/api";
import type { PageAtlasResult, PageAtlasSpriteEntry } from "../services/pageAtlas";

const props = withDefaults(defineProps<{
  items: Item[];
  itemSize?: number;
  atlas?: PageAtlasResult | null;
}>(), {
  itemSize: 50,
  atlas: null,
});

const emit = defineEmits<{
  click: [item: Item];
  contextmenu: [item: Item, event: MouseEvent];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const hostRef = ref<HTMLDivElement | null>(null);
const loadedImages = new Map<string, HTMLImageElement>();
const pendingLoads = new Map<string, Promise<HTMLImageElement>>();
const itemRects = ref<Array<{ item: Item; x: number; y: number; size: number }>>([]);
const hostWidth = ref(0);

const gap = 4;
const drawSize = computed(() => Math.max(24, Math.floor(props.itemSize)));
const columns = computed(() => {
  const availableWidth = Math.max(hostWidth.value, drawSize.value);
  return Math.max(1, Math.floor((availableWidth + gap) / (drawSize.value + gap)));
});
const rows = computed(() => Math.max(1, Math.ceil(props.items.length / columns.value)));
const canvasWidth = computed(() => Math.max(columns.value * (drawSize.value + gap) - gap, drawSize.value));
const canvasHeight = computed(() => Math.max(rows.value * (drawSize.value + gap) - gap, drawSize.value));

function updateHostWidth() {
  hostWidth.value = hostRef.value?.clientWidth ?? 0;
}

async function ensureImage(item: Item): Promise<HTMLImageElement | null> {
  const src = getPreferredStaticImageUrlFromEntity(item);
  if (loadedImages.has(src)) {
    return loadedImages.get(src)!;
  }
  const pending = pendingLoads.get(src);
  if (pending) {
    return pending;
  }

  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      loadedImages.set(src, img);
      pendingLoads.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      pendingLoads.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };
    img.src = src;
  });

  pendingLoads.set(src, request);
  try {
    return await request;
  } catch {
    return null;
  }
}

async function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = canvasWidth.value;
  canvas.height = canvasHeight.value;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  const nextRects: Array<{ item: Item; x: number; y: number; size: number }> = [];

  for (let index = 0; index < props.items.length; index += 1) {
    const item = props.items[index];
    const col = index % columns.value;
    const row = Math.floor(index / columns.value);
    const x = col * (drawSize.value + gap);
    const y = row * (drawSize.value + gap);
    nextRects.push({ item, x, y, size: drawSize.value });

    const atlasEntry: PageAtlasSpriteEntry | undefined = props.atlas?.entries?.[item.itemId];
    if (atlasEntry) {
      const atlasImg = await ensureImage({
        ...item,
        preferredImageUrl: atlasEntry.atlasUrl,
      } as Item);
      if (atlasImg) {
        ctx.drawImage(
          atlasImg,
          atlasEntry.x,
          atlasEntry.y,
          atlasEntry.slotSize,
          atlasEntry.slotSize,
          x,
          y,
          drawSize.value,
          drawSize.value,
        );
        continue;
      }
    }

    const img = await ensureImage(item);
    if (img) {
      ctx.drawImage(img, x, y, drawSize.value, drawSize.value);
    }
  }

  itemRects.value = nextRects;
}

function findItemAt(clientX: number, clientY: number): Item | null {
  const host = hostRef.value;
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const hit = itemRects.value.find((entry) => x >= entry.x && x <= entry.x + entry.size && y >= entry.y && y <= entry.y + entry.size);
  return hit?.item ?? null;
}

function handleClick(event: MouseEvent) {
  const item = findItemAt(event.clientX, event.clientY);
  if (item) {
    emit("click", item);
  }
}

function handleContextMenu(event: MouseEvent) {
  const item = findItemAt(event.clientX, event.clientY);
  if (item) {
    event.preventDefault();
    emit("contextmenu", item, event);
  }
}

watch(
  () => [props.items.map((item) => item.itemId).join("|"), props.itemSize, props.atlas?.atlasUrl ?? ""],
  () => {
    void render();
  },
);

onMounted(() => {
  updateHostWidth();
  window.addEventListener("resize", updateHostWidth, { passive: true });
  void render();
});

onUnmounted(() => {
  window.removeEventListener("resize", updateHostWidth);
});
</script>

<template>
  <div ref="hostRef" class="home-canvas-grid w-full h-full overflow-auto" @click="handleClick" @contextmenu="handleContextMenu">
    <canvas ref="canvasRef" class="home-canvas-grid__canvas" />
  </div>
</template>

<style scoped>
.home-canvas-grid {
  position: relative;
}

.home-canvas-grid__canvas {
  display: block;
  image-rendering: pixelated;
}
</style>
