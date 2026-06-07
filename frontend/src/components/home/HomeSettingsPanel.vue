<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

type HomeView = "items" | "patterns";

const props = defineProps<{
  modelValue: boolean;
  currentView: HomeView;
  itemSize: number;
  atlasResidentStatus: string;
  atlasResidentRunning: boolean;
  atlasResidentProgressTotal: number;
  atlasResidentProgressCurrent: number;
  atlasResidentPercent: number;
  atlasResidentItemCount: number;
  totalItems: number;
  historyCount: number;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "update:currentView": [value: HomeView];
  "update:itemSize": [value: number];
  "save-settings": [];
  "warm-resident-atlas": [];
  "refresh-atlas-resident-state": [];
  "open-runtime-health": [];
  "clear-history": [];
}>();

const isOpen = computed(() => props.modelValue);
const localItemSize = computed({
  get: () => props.itemSize,
  set: (value: number) => emit("update:itemSize", value),
});
const currentViewModel = computed({
  get: () => props.currentView,
  set: (value: HomeView) => emit("update:currentView", value),
});
const totalItemsText = computed(() => props.totalItems.toLocaleString());
const historyCountText = computed(() => props.historyCount.toLocaleString());

const settingsBgCanvas = ref<HTMLCanvasElement | null>(null);
const settingsUiRoot = ref<HTMLElement | null>(null);
const saveButtonRef = ref<HTMLButtonElement | null>(null);
let settingsAnimFrameId = 0;
let settingsResizeObs: ResizeObserver | null = null;

interface SettingsStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  phase: number;
  phaseSpeed: number;
}

const SETTINGS_STAR_COUNT = 28;
const SETTINGS_CONNECTION_DIST = 80;
let settingsStars: SettingsStar[] = [];
let settingsCW = 0;
let settingsCH = 0;

const toggleOpen = () => emit("update:modelValue", !props.modelValue);
const close = () => emit("update:modelValue", false);
const selectView = (view: HomeView) => {
  emit("update:currentView", view);
  close();
};
const emitWarmResidentAtlas = () => emit("warm-resident-atlas");
const emitRefreshAtlasResidentState = () => emit("refresh-atlas-resident-state");
const emitRuntimeHealth = () => emit("open-runtime-health");
const emitClearHistory = () => emit("clear-history");

const saveItemSize = () => {
  emit("save-settings");
  const button = saveButtonRef.value;
  if (!button) return;
  const originalText = button.textContent;
  button.textContent = "???";
  window.setTimeout(() => {
    button.textContent = originalText;
  }, 1500);
};

const initSettingsStars = () => {
  settingsStars = [];
  for (let i = 0; i < SETTINGS_STAR_COUNT; i += 1) {
    settingsStars.push({
      x: Math.random() * settingsCW,
      y: Math.random() * settingsCH,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      radius: 0.6 + Math.random() * 1.4,
      baseAlpha: 0.15 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.002 + Math.random() * 0.006,
    });
  }
};

const drawSettingsConstellations = () => {
  const canvas = settingsBgCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, settingsCW, settingsCH);
  const now = performance.now() * 0.001;

  for (const s of settingsStars) {
    s.phase += s.phaseSpeed;
    s.x += s.vx + Math.sin(s.phase) * 0.05;
    s.y += s.vy + Math.cos(s.phase * 0.7) * 0.04;

    if (s.x < -20) s.x = settingsCW + 20;
    if (s.x > settingsCW + 20) s.x = -20;
    if (s.y < -20) s.y = settingsCH + 20;
    if (s.y > settingsCH + 20) s.y = -20;
  }

  for (let i = 0; i < settingsStars.length; i += 1) {
    for (let j = i + 1; j < settingsStars.length; j += 1) {
      const a = settingsStars[i];
      const b = settingsStars[j];
      const ddx = a.x - b.x;
      const ddy = a.y - b.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < SETTINGS_CONNECTION_DIST) {
        const alpha = (1 - d / SETTINGS_CONNECTION_DIST) * 0.15;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(148, 180, 220, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  for (const s of settingsStars) {
    const twinkle = s.baseAlpha + Math.sin(now * 1.5 + s.phase) * 0.08;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180, 200, 230, ${twinkle})`;
    ctx.fill();
    if (s.radius > 1) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(148, 180, 220, ${twinkle * 0.12})`;
      ctx.fill();
    }
  }
  settingsAnimFrameId = requestAnimationFrame(drawSettingsConstellations);
};

const handleSettingsCanvasResize = () => {
  const el = settingsUiRoot.value;
  const canvas = settingsBgCanvas.value;
  if (!el || !canvas) return;
  const rect = el.getBoundingClientRect();
  const oldW = settingsCW;
  settingsCW = rect.width;
  settingsCH = rect.height;
  canvas.width = settingsCW;
  canvas.height = settingsCH;
  if (settingsStars.length === 0 || (oldW === 0 && settingsCW > 0)) initSettingsStars();
};

const startSettingsAnimation = () => {
  nextTick(() => {
    handleSettingsCanvasResize();
    if (!settingsResizeObs && settingsUiRoot.value) {
      settingsResizeObs = new ResizeObserver(handleSettingsCanvasResize);
      settingsResizeObs.observe(settingsUiRoot.value);
    }
    cancelAnimationFrame(settingsAnimFrameId);
    settingsAnimFrameId = requestAnimationFrame(drawSettingsConstellations);
  });
};

const stopSettingsAnimation = () => {
  cancelAnimationFrame(settingsAnimFrameId);
  if (settingsResizeObs) {
    settingsResizeObs.disconnect();
    settingsResizeObs = null;
  }
};

watch(isOpen, (newVal) => {
  if (newVal) {
    startSettingsAnimation();
  } else {
    stopSettingsAnimation();
  }
});

onBeforeUnmount(() => {
  stopSettingsAnimation();
});
</script>

<template>
    <!-- Settings Button -->
    <div class="fixed bottom-3 left-6 z-50">
      <button
        @click="toggleOpen"
        class="gear-btn settings-launcher w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300"
        :class="
          isOpen
            ? 'settings-launcher--active text-white'
            : 'surface-glass text-slate-300 hover:text-white border border-slate-200/20'
        "
        title="设置"
        aria-label="打开设置中心"
        :aria-expanded="isOpen"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.1-1.64-2-3.46-2.47 1a7.2 7.2 0 0 0-1.7-.98L15 3.28h-4l-.36 2.66c-.6.23-1.17.56-1.7.98l-2.47-1-2 3.46 2.1 1.64c-.04.32-.07.65-.07.98s-.02.66.07.98l-2.1 1.64 2 3.46 2.47-1c.53.42 1.1.75 1.7.98L11 20.72h4l.36-2.66c.6-.23 1.17-.56 1.7-.98l2.47 1 2-3.46-2.1-1.64Z" />
        </svg>
      </button>
    </div>

    <!-- Centered Modal Settings Container -->
    <Transition name="settings-modal-fade">
      <div
        v-if="isOpen"
        class="settings-modal-overlay fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6"
      >
        <!-- Scrim / Backdrop -->
        <div
          class="settings-panel-scrim absolute inset-0"
          aria-hidden="true"
          @click="close"
          @contextmenu.prevent
        />

        <!-- Settings Dialog -->
        <section
          ref="settingsUiRoot"
          class="gear-menu settings-panel relative z-[201] overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="NeoNEI 设置中心"
          @click.stop
          @contextmenu.prevent
        >
          <!-- Star Galaxy background layers (Crafting Table / Furnace style) -->
          <div class="matte-backdrop" aria-hidden="true" />
          <canvas ref="settingsBgCanvas" class="constellation-canvas" aria-hidden="true" />
          <div class="ambient-field" aria-hidden="true">
            <span class="ambient-orb ambient-orb-a" />
            <span class="ambient-orb ambient-orb-b" />
            <span class="ambient-orb ambient-orb-c" />
          </div>
          <div class="volumetric-rays" aria-hidden="true">
            <span class="light-ray ray-1" />
            <span class="light-ray ray-2" />
            <span class="light-ray ray-3" />
            <span class="light-ray ray-4" />
          </div>

          <!-- Close Button -->
          <button
            class="settings-close-btn absolute top-5 right-5 flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white transition-all duration-200 z-[202]"
            type="button"
            aria-label="关闭设置中心"
            @click="close"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <!-- Minimalist Content Area -->
          <div class="settings-panel__content p-8 md:p-10 relative z-10">
            <!-- Header Block -->
            <header class="settings-header border-b border-white/5 pb-5 mb-6 flex justify-between items-end">
              <div>
                <span class="settings-kicker block text-[9px] font-mono tracking-[0.25em] text-cyan-400/80 uppercase">NEONEI SYSTEM CONFIG</span>
                <h2 class="settings-title text-xl font-light text-slate-100 tracking-wide mt-1">控制与设置</h2>
              </div>
              <span class="font-mono text-[9px] text-slate-500 uppercase tracking-widest">v2.1 / DECK</span>
            </header>

            <!-- Flat Rows Settings List -->
            <div class="settings-rows flex flex-col divide-y divide-white/5">
              
              <!-- Row 01: Workspace View -->
              <div class="settings-row py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div class="md:col-span-6">
                  <div class="flex items-center gap-2.5">
                    <span class="font-mono text-[9px] text-cyan-400/70 border border-cyan-400/20 px-1.5 py-0.5 rounded bg-cyan-950/10">01</span>
                    <h3 class="text-sm font-medium text-slate-200">工作区视图</h3>
                  </div>
                  <p class="text-xs text-slate-450 mt-1 leading-relaxed max-w-md">切换主页渲染核心以编辑配方或查找样板管理项。</p>
                </div>
                <div class="md:col-span-6 flex justify-end">
                  <div class="settings-segment flex bg-white/[0.02] border border-white/5 p-1 rounded-lg w-full max-w-[260px]">
                    <button
                      type="button"
                      @click="
                        selectView('items');
                      "
                      :class="['settings-segment__btn flex-1 py-1.5 px-3 text-xs rounded transition-all duration-300 flex items-center justify-center gap-1.5', currentViewModel === 'items' ? 'settings-segment__btn--active' : 'settings-segment__btn--inactive']"
                    >
                      <span class="btn-indicator w-1 h-1 rounded-full" />
                      物品浏览
                    </button>
                    <button
                      type="button"
                      @click="
                        selectView('patterns');
                      "
                      :class="['settings-segment__btn flex-1 py-1.5 px-3 text-xs rounded transition-all duration-300 flex items-center justify-center gap-1.5', currentViewModel === 'patterns' ? 'settings-segment__btn--active settings-segment__btn--violet' : 'settings-segment__btn--inactive']"
                    >
                      <span class="btn-indicator w-1 h-1 rounded-full" />
                      样板管理
                    </button>
                  </div>
                </div>
              </div>

              <!-- Row 02: Grid Icon Size Density -->
              <div class="settings-row py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div class="md:col-span-6">
                  <div class="flex items-center gap-2.5">
                    <span class="font-mono text-[9px] text-cyan-400/70 border border-cyan-400/20 px-1.5 py-0.5 rounded bg-cyan-950/10">02</span>
                    <h3 class="text-sm font-medium text-slate-200">网格图标大小</h3>
                  </div>
                  <p class="text-xs text-slate-450 mt-1 leading-relaxed max-w-md">动态调整主页网格和历史记录的渲染边长。</p>
                </div>
                <div class="md:col-span-6 flex flex-col sm:flex-row items-center gap-6 justify-end w-full">
                  <div class="flex-1 w-full max-w-[240px]">
                    <div class="flex justify-between items-center mb-1">
                      <span class="text-[9px] font-mono text-slate-500 uppercase">GRID SCALE</span>
                      <span class="text-xs font-mono text-cyan-450">{{ localItemSize }}px</span>
                    </div>
                    <input
                      v-model.number="localItemSize"
                      type="range"
                      min="24"
                      max="128"
                      step="4"
                      class="settings-slider w-full h-0.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      aria-label="网格图标大小"
                    />
                    <div class="flex justify-between text-[8px] text-slate-600 font-mono mt-1">
                      <span>Compact</span>
                      <span>Standard</span>
                      <span>Large</span>
                    </div>
                  </div>
                  
                  <div class="flex items-center gap-4">
                    <!-- Minimal Slot Preview -->
                    <div class="w-10 h-10 flex items-center justify-center relative overflow-hidden bg-white/[0.01] border border-white/5 rounded-lg" aria-hidden="true">
                      <div
                        class="preview-nebula-orb rounded-full"
                        :style="{ width: Math.min(22, localItemSize / 4.5) + 'px', height: Math.min(22, localItemSize / 4.5) + 'px' }"
                      />
                    </div>
                    <button ref="saveButtonRef" type="button" @click="saveItemSize" class="settings-primary-btn text-xs font-medium rounded-lg bg-cyan-500 hover:bg-cyan-450 text-slate-950 px-4 py-2 shadow-sm transition-all duration-200">
                      保存配置
                    </button>
                  </div>
                </div>
              </div>

              <!-- Row 03: WebGL Texture Atlas Cache -->
              <div class="settings-row py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div class="md:col-span-6">
                  <div class="flex items-center gap-2.5">
                    <span class="font-mono text-[9px] text-cyan-400/70 border border-cyan-400/20 px-1.5 py-0.5 rounded bg-cyan-950/10">03</span>
                    <h3 class="text-sm font-medium text-slate-200">WebGL 图集预温</h3>
                  </div>
                  <p class="text-xs text-slate-455 mt-1 leading-relaxed max-w-md">预先合并图集缓存，消除物品翻页时的图像闪烁白块。</p>
                </div>
                <div class="md:col-span-6 flex justify-end w-full">
                  <div class="bg-white/[0.01] border border-white/5 p-4 rounded-xl w-full max-w-[380px] flex flex-col gap-3">
                    <div class="flex justify-between items-center">
                      <span class="text-[10px] text-slate-450 font-mono leading-none">{{ atlasResidentStatus }}</span>
                      <span
                        class="text-[9px] font-mono px-2 py-0.5 rounded border leading-none"
                        :class="atlasResidentProgressTotal > 0 && atlasResidentProgressCurrent >= atlasResidentProgressTotal
                          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/5 border-amber-500/20 text-amber-400 animate-pulse'"
                      >
                        {{ atlasResidentRunning ? "WARMING" : "READY" }}
                      </span>
                    </div>
                    
                    <div class="flex items-center gap-3">
                      <div class="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-cyan-450 transition-all duration-300"
                          :style="{ width: atlasResidentPercent + '%' }"
                        />
                      </div>
                      <span class="text-xs font-mono text-cyan-400 w-8 text-right leading-none">{{ atlasResidentPercent }}%</span>
                    </div>
                    
                    <div class="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-0.5 leading-none">
                      <span>已载入: {{ atlasResidentItemCount.toLocaleString() }} 项</span>
                      <div class="flex gap-2.5">
                        <button type="button" @click="emitWarmResidentAtlas" :disabled="atlasResidentRunning" class="text-cyan-400 hover:text-cyan-300 disabled:opacity-40">重载图集</button>
                        <span class="text-slate-700">|</span>
                        <button type="button" @click="emitRefreshAtlasResidentState" class="text-slate-400 hover:text-slate-350">校验状态</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Row 04: Maintenance & Diagnostics -->
              <div class="settings-row py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div class="md:col-span-6">
                  <div class="flex items-center gap-2.5">
                    <span class="font-mono text-[9px] text-cyan-400/70 border border-cyan-400/20 px-1.5 py-0.5 rounded bg-cyan-950/10">04</span>
                    <h3 class="text-sm font-medium text-slate-200">系统诊断维护</h3>
                  </div>
                  <p class="text-xs text-slate-455 mt-1 leading-relaxed max-w-md">核心数据契约监控与重置本地历史浏览轨迹缓存。</p>
                </div>
                <div class="md:col-span-6 flex justify-end w-full">
                  <div class="bg-white/[0.01] border border-white/5 p-4 rounded-xl w-full max-w-[380px] flex items-center justify-between">
                    <div class="flex flex-col">
                      <span class="text-[9px] font-mono text-slate-500 uppercase leading-none">DATABASE / HISTORY</span>
                      <span class="text-xs font-mono text-slate-300 mt-1 leading-none">DB: {{ totalItemsText }} / Cache: {{ historyCountText }}</span>
                    </div>
                    <div class="flex gap-2">
                      <button type="button" @click="emitRuntimeHealth" class="settings-secondary-btn px-3 py-1.5 text-xs rounded-lg border border-white/5 text-slate-350 hover:text-slate-200 hover:bg-white/5 transition-all duration-200">健康面板</button>
                      <button type="button" @click="emitClearHistory" class="settings-danger-btn px-3 py-1.5 text-xs rounded-lg border border-rose-500/10 text-rose-400 hover:bg-rose-500/10 transition-all duration-200">清除轨迹</button>
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </section>
      </div>
    </Transition>

</template>

<style scoped>
/* Centered Settings Modal Overlay */
.settings-modal-overlay {
  background: rgba(3, 5, 12, 0.72);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
}

.settings-panel-scrim {
  position: absolute;
  inset: 0;
  cursor: pointer;
}

/* Modal Fade Transitions */
.settings-modal-fade-enter-active,
.settings-modal-fade-leave-active {
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-modal-fade-enter-active .settings-panel,
.settings-modal-fade-leave-active .settings-panel {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-modal-fade-enter-from,
.settings-modal-fade-leave-to {
  opacity: 0;
}

.settings-modal-fade-enter-from .settings-panel,
.settings-modal-fade-leave-to .settings-panel {
  transform: scale(0.95) translateY(12px);
  opacity: 0;
}

/* Settings Panel (Premium Galaxy Workbench Style) */
.gear-menu.settings-panel {
  width: 90vw;
  max-width: 820px;
  background: 
    radial-gradient(ellipse at 50% 50%, rgba(20, 28, 42, 0.48) 0%, rgba(10, 14, 20, 0.52) 45%, rgba(6, 8, 12, 0.6) 100%),
    linear-gradient(180deg, rgba(13, 18, 28, 0.75), rgba(8, 10, 16, 0.85));
  border: 1px solid rgba(148, 163, 184, 0.08);
  border-radius: 20px;
  box-shadow: 
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 24px 64px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
}

/* Custom Scrollbar */
.gear-menu.settings-panel::-webkit-scrollbar {
  width: 4px;
}
.gear-menu.settings-panel::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
}
.gear-menu.settings-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
}
.gear-menu.settings-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 255, 247, 0.25);
}

/* Star Galaxy background layers (Crafting Table / Furnace style) */
.matte-backdrop {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.02) 0%, transparent 45%),
    linear-gradient(180deg, rgba(10, 15, 22, 0.25), rgba(8, 12, 18, 0.42));
  pointer-events: none;
  z-index: 1;
}

.matte-backdrop::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.025) 1px, transparent 1px);
  background-size: 28px 28px;
  opacity: 0.35;
  mask-image: radial-gradient(ellipse at center, black 16%, transparent 72%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 16%, transparent 72%);
  pointer-events: none;
}

.constellation-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}

.ambient-field {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}

.ambient-orb {
  position: absolute;
  display: block;
  pointer-events: none;
  border-radius: 50%;
  opacity: 0.24;
  will-change: transform, opacity;
  animation: settingsAmbientDrift 14s ease-in-out infinite alternate;
}

.ambient-orb-a {
  top: 15%; left: 10%;
  width: 220px; height: 220px;
  background: radial-gradient(circle, rgba(96, 165, 250, 0.06) 0%, transparent 55%);
}

.ambient-orb-b {
  right: 15%; bottom: 15%;
  width: 200px; height: 200px;
  background: radial-gradient(circle, rgba(245, 158, 11, 0.05) 0%, transparent 55%);
  animation-delay: -4s;
}

.ambient-orb-c {
  top: 40%; left: 45%;
  width: 160px; height: 160px;
  background: radial-gradient(circle, rgba(148, 163, 184, 0.04) 0%, transparent 55%);
  animation-delay: -8s;
}

.volumetric-rays {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 2;
}

.light-ray {
  position: absolute;
  top: 50%; left: 50%;
  width: 4px;
  height: 160px;
  transform-origin: center bottom;
  background: linear-gradient(0deg, rgba(245, 158, 11, 0.03), transparent 85%);
  opacity: 0;
  will-change: opacity;
}

.ray-1 {
  transform: translate(-50%, -100%) rotate(-25deg);
  animation: settings-ray-pulse-1 8s ease-in-out infinite;
  animation-delay: 0s;
}
.ray-2 {
  transform: translate(-50%, -100%) rotate(12deg);
  animation: settings-ray-pulse-2 8s ease-in-out infinite;
  animation-delay: 2s;
  height: 120px;
}
.ray-3 {
  transform: translate(-50%, -100%) rotate(-8deg);
  animation: settings-ray-pulse-3 8s ease-in-out infinite;
  animation-delay: 4.5s;
  height: 140px;
}
.ray-4 {
  transform: translate(-50%, -100%) rotate(30deg);
  animation: settings-ray-pulse-4 8s ease-in-out infinite;
  animation-delay: 6s;
  height: 100px;
}

@keyframes settingsAmbientDrift {
  0% { transform: translate(0, 0) scale(1); opacity: 0.24; }
  50% { transform: translate(5%, 7%) scale(1.05); opacity: 0.32; }
  100% { transform: translate(-4%, -5%) scale(0.97); opacity: 0.24; }
}

@keyframes settings-ray-pulse-1 {
  0%, 100% { opacity: 0; transform: translate(-50%, -100%) scaleY(0.85) rotate(-25deg); }
  50% { opacity: 0.22; transform: translate(-50%, -100%) scaleY(1.1) rotate(-25deg); }
}
@keyframes settings-ray-pulse-2 {
  0%, 100% { opacity: 0; transform: translate(-50%, -100%) scaleY(0.85) rotate(12deg); }
  50% { opacity: 0.22; transform: translate(-50%, -100%) scaleY(1.1) rotate(12deg); }
}
@keyframes settings-ray-pulse-3 {
  0%, 100% { opacity: 0; transform: translate(-50%, -100%) scaleY(0.85) rotate(-8deg); }
  50% { opacity: 0.22; transform: translate(-50%, -100%) scaleY(1.1) rotate(-8deg); }
}
@keyframes settings-ray-pulse-4 {
  0%, 100% { opacity: 0; transform: translate(-50%, -100%) scaleY(0.85) rotate(30deg); }
  50% { opacity: 0.22; transform: translate(-50%, -100%) scaleY(1.1) rotate(30deg); }
}

/* Close Button */
.settings-close-btn {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.4);
}
.settings-close-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

/* Header Text / Kicker */
.settings-kicker {
  font-family: 'Space Mono', 'Fira Code', monospace;
  text-shadow: 0 0 8px rgba(0, 255, 247, 0.25);
}
.settings-title {
  font-family: 'Outfit', 'Inter', sans-serif;
  letter-spacing: -0.01em;
}

/* Settings Segment Buttons (Premium segmented pill styling) */
.settings-segment__btn {
  font-family: 'Inter', sans-serif;
}

.settings-segment__btn--active {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}

.settings-segment__btn--active .btn-indicator {
  background-color: #00fff7;
  box-shadow: 0 0 6px #00fff7;
}

.settings-segment__btn--violet.settings-segment__btn--active {
  color: rgba(255, 255, 255, 0.9);
}

.settings-segment__btn--violet.settings-segment__btn--active .btn-indicator {
  background-color: #d946ef;
  box-shadow: 0 0 6px #d946ef;
}

.settings-segment__btn--inactive {
  background: transparent;
  border-color: transparent;
  color: rgba(255, 255, 255, 0.35);
}

.settings-segment__btn--inactive:hover {
  color: rgba(255, 255, 255, 0.65);
}

.settings-segment__btn--inactive .btn-indicator {
  background-color: transparent;
}

/* Settings Slider Range Styling */
.settings-slider {
  background: rgba(255, 255, 255, 0.06);
  border: none;
}

.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #cbd5e1;
  border: 1px solid #0f172a;
  transition: transform 0.1s ease, background-color 0.1s ease;
}

.settings-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  background-color: #00fff7;
}

/* Preview Nebula Orb (glowing star style inside slot) */
.preview-nebula-orb {
  background: radial-gradient(circle, #00fff7 0%, rgba(59, 130, 246, 0.6) 45%, transparent 75%);
  filter: drop-shadow(0 0 8px rgba(0, 255, 247, 0.45));
  animation: pulse-star 3s ease-in-out infinite;
}

@keyframes pulse-star {
  0%, 100% {
    transform: scale(0.95);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}

/* Button & Card utilities inside panels */
.settings-secondary-btn {
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.02);
  color: rgba(255, 255, 255, 0.65);
  transition: all 0.2s ease;
}

.settings-secondary-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.settings-danger-btn {
  border: 1px solid rgba(244, 63, 94, 0.12);
  background: rgba(244, 63, 94, 0.02);
  color: #f43f5e;
  transition: all 0.2s ease;
}

.settings-danger-btn:hover {
  background: rgba(244, 63, 94, 0.08);
  border-color: rgba(244, 63, 94, 0.25);
  color: #fda4af;
}

.settings-primary-btn {
  background: #cbd5e1;
  color: #0f172a;
}
.settings-primary-btn:hover {
  background: #00fff7;
  color: #080a10;
  box-shadow: 0 0 12px rgba(0, 255, 247, 0.3);
}

/* Row-style Flat List items */
.settings-row {
  border-color: rgba(255, 255, 255, 0.04);
}
.settings-row:first-child {
  border-top: none;
}
.settings-row:last-child {
  border-bottom: none;
}

</style>
