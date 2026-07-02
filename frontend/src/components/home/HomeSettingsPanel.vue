<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useSettingsConstellationCanvas } from "../../composables/home/useSettingsConstellationCanvas";
import {
  clearRuntimeServiceWorkerCache,
  getRuntimeServiceWorkerStatus,
  type RuntimeServiceWorkerStatus,
} from "../../services/runtimeServiceWorker";

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
  patternControlEnabled: boolean;
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

const saveButtonRef = ref<HTMLButtonElement | null>(null);
const { settingsBgCanvas, settingsUiRoot } = useSettingsConstellationCanvas(isOpen);
const runtimeCacheStatus = ref<RuntimeServiceWorkerStatus>({
  supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
  registered: false,
  controllerReady: false,
});
const runtimeCacheLoading = ref(false);
const runtimeCacheError = ref<string | null>(null);

const runtimeCacheStateLabel = computed(() => {
  if (!runtimeCacheStatus.value.supported) return "UNSUPPORTED";
  if (runtimeCacheStatus.value.error || runtimeCacheError.value) return "ERROR";
  if (!runtimeCacheStatus.value.registered) return "DEV OFF";
  if (!runtimeCacheStatus.value.controllerReady) return "INSTALLING";
  return "ACTIVE";
});
const runtimeCacheStateClass = computed(() => {
  if (runtimeCacheStateLabel.value === "ACTIVE") return "bg-emerald-500/5 border-emerald-500/20 text-emerald-400";
  if (runtimeCacheStateLabel.value === "ERROR") return "bg-rose-500/5 border-rose-500/20 text-rose-400";
  return "bg-amber-500/5 border-amber-500/20 text-amber-400";
});
const runtimeCacheSizeText = computed(() => {
  const bytes = runtimeCacheStatus.value.approxBytes ?? 0;
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
});
const runtimeCacheEntryText = computed(() => (runtimeCacheStatus.value.entryCount ?? 0).toLocaleString());
const runtimeCacheHashText = computed(() => runtimeCacheStatus.value.manifestHash?.slice(0, 8) ?? "pending");

const toggleOpen = () => emit("update:modelValue", !props.modelValue);
const close = () => emit("update:modelValue", false);
const selectView = (view: HomeView) => {
  if (view === "patterns" && !props.patternControlEnabled) {
    return;
  }
  emit("update:currentView", view);
  close();
};
const emitWarmResidentAtlas = () => emit("warm-resident-atlas");
const emitRefreshAtlasResidentState = () => emit("refresh-atlas-resident-state");
const emitRuntimeHealth = () => emit("open-runtime-health");
const emitClearHistory = () => emit("clear-history");

const refreshRuntimeCacheStatus = async () => {
  runtimeCacheLoading.value = true;
  runtimeCacheError.value = null;
  try {
    runtimeCacheStatus.value = await getRuntimeServiceWorkerStatus();
  } catch (error) {
    runtimeCacheError.value = error instanceof Error ? error.message : String(error);
  } finally {
    runtimeCacheLoading.value = false;
  }
};

const clearRuntimeCache = async () => {
  runtimeCacheLoading.value = true;
  runtimeCacheError.value = null;
  try {
    runtimeCacheStatus.value = await clearRuntimeServiceWorkerCache();
  } catch (error) {
    runtimeCacheError.value = error instanceof Error ? error.message : String(error);
  } finally {
    runtimeCacheLoading.value = false;
  }
};

const saveItemSize = () => {
  emit("save-settings");
  const button = saveButtonRef.value;
  if (!button) return;
  const originalText = button.textContent;
  button.textContent = "已保存";
  window.setTimeout(() => {
    button.textContent = originalText;
  }, 1500);
};

watch(
  isOpen,
  (open) => {
    if (open) void refreshRuntimeCacheStatus();
  },
  { immediate: false },
);

</script>

<template>
    <!-- Settings Button -->
    <div class="fixed bottom-3 left-6 z-50">
      <button
        @click="toggleOpen"
        data-native-benchmark="settings-open"
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
        v-show="isOpen"
        class="settings-modal-overlay fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6"
        data-native-benchmark="settings-overlay"
        :aria-hidden="!isOpen"
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
            data-native-benchmark="settings-close"
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
                      :disabled="!patternControlEnabled"
                      :title="patternControlEnabled ? '样板管理' : '样板管理属于 ops/admin control，只在开发/控制模式启用'"
                      @click="
                        selectView('patterns');
                      "
                      :class="['settings-segment__btn flex-1 py-1.5 px-3 text-xs rounded transition-all duration-300 flex items-center justify-center gap-1.5', currentViewModel === 'patterns' ? 'settings-segment__btn--active settings-segment__btn--violet' : 'settings-segment__btn--inactive', !patternControlEnabled ? 'opacity-40 cursor-not-allowed' : '']"
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

              <!-- Row 04: Runtime Cache -->
              <div class="settings-row py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div class="md:col-span-6">
                  <div class="flex items-center gap-2.5">
                    <span class="font-mono text-[9px] text-cyan-400/70 border border-cyan-400/20 px-1.5 py-0.5 rounded bg-cyan-950/10">04</span>
                    <h3 class="text-sm font-medium text-slate-200">运行时缓存</h3>
                  </div>
                  <p class="text-xs text-slate-455 mt-1 leading-relaxed max-w-md">Service Worker 缓存二进制包、图集与 WASM 引擎，用于公共站二次打开与 CDN 加速。</p>
                </div>
                <div class="md:col-span-6 flex justify-end w-full">
                  <div class="bg-white/[0.01] border border-white/5 p-4 rounded-xl w-full max-w-[380px] flex flex-col gap-3">
                    <div class="flex justify-between items-center">
                      <div class="flex flex-col">
                        <span class="text-[9px] font-mono text-slate-500 uppercase leading-none">SERVICE WORKER / CDN CACHE</span>
                        <span class="text-xs font-mono text-slate-300 mt-1 leading-none">{{ runtimeCacheEntryText }} files / {{ runtimeCacheSizeText }} / {{ runtimeCacheHashText }}</span>
                      </div>
                      <span class="text-[9px] font-mono px-2 py-0.5 rounded border leading-none" :class="runtimeCacheStateClass">
                        {{ runtimeCacheStateLabel }}
                      </span>
                    </div>
                    <div v-if="runtimeCacheError || runtimeCacheStatus.error" class="text-[10px] text-rose-300/80 font-mono leading-snug truncate">
                      {{ runtimeCacheError || runtimeCacheStatus.error }}
                    </div>
                    <div class="flex justify-end gap-2 text-[10px] font-mono leading-none">
                      <button type="button" @click="refreshRuntimeCacheStatus" :disabled="runtimeCacheLoading" class="text-cyan-400 hover:text-cyan-300 disabled:opacity-40">刷新状态</button>
                      <span class="text-slate-700">|</span>
                      <button type="button" @click="clearRuntimeCache" :disabled="runtimeCacheLoading" class="text-rose-400 hover:text-rose-300 disabled:opacity-40">清理缓存</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Row 05: Maintenance & Diagnostics -->
              <div class="settings-row py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div class="md:col-span-6">
                  <div class="flex items-center gap-2.5">
                    <span class="font-mono text-[9px] text-cyan-400/70 border border-cyan-400/20 px-1.5 py-0.5 rounded bg-cyan-950/10">05</span>
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
  background:
    radial-gradient(circle at 50% 42%, rgba(8, 18, 30, 0.52), rgba(3, 5, 12, 0.78) 62%),
    rgba(3, 5, 12, 0.72);
  isolation: isolate;
  contain: layout paint style;
}

.settings-panel-scrim {
  position: absolute;
  inset: 0;
  cursor: pointer;
}

/* Modal Fade Transitions */
.settings-modal-fade-enter-active,
.settings-modal-fade-leave-active {
  transition: opacity 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-modal-fade-enter-active .settings-panel,
.settings-modal-fade-leave-active .settings-panel {
  transition: transform 0.14s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-modal-fade-enter-from,
.settings-modal-fade-leave-to {
  opacity: 0;
}

.settings-modal-fade-enter-from .settings-panel,
.settings-modal-fade-leave-to .settings-panel {
  transform: scale(0.985) translateY(4px);
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
  backdrop-filter: blur(8px) saturate(1.05);
  -webkit-backdrop-filter: blur(8px) saturate(1.05);
  display: flex;
  flex-direction: column;
  contain: layout paint style;
  isolation: isolate;
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
  animation: settingsAmbientDrift 20s ease-in-out infinite alternate;
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

.settings-panel__content {
  max-height: min(82vh, 760px);
  overflow-y: auto;
  scrollbar-gutter: stable;
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
