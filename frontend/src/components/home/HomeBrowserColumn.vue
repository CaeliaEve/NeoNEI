<script setup lang="ts">
import type { StyleValue } from "vue";
import type { BrowserGridEntry, BrowserVariantGroup, Item } from "../../services/api";
import type { PageAtlasResult } from "../../services/pageAtlas";
import { resolveDistDataNativeRuntimeManifestPath } from "../../services/distDataRuntime";
import NativeBrowserSurface from "../native-surface/NativeBrowserSurface.vue";

defineProps<{
  itemColumnStyle: StyleValue;
  totalPages: number;
  currentPage: number;
  itemSize: number;
  loading: boolean;
  items: Item[];
  loadError: string;
  itemGridEmptySubtitle: string;
  browserGridEntries: BrowserGridEntry[];
  currentPageAtlas: PageAtlasResult | null | undefined;
  expandedGroupFilterPanels: BrowserVariantGroup[];
  expandedGroupFacetFilters: Record<string, string>;
  hasExpandedGroupFacetFilters: boolean;
  showTransitionOverlay: boolean;
  selectedItemId?: string | null;
}>();

const emit = defineEmits<{
  itemsWheel: [event: WheelEvent];
  pageChange: [page: number];
  reload: [];
  resetFilters: [];
  itemClick: [item: Item];
  itemContextmenu: [item: Item, event: MouseEvent];
  groupClick: [group: BrowserVariantGroup];
  groupContextmenu: [group: BrowserVariantGroup, event: MouseEvent];
  expandedGroupFacetInput: [groupKey: string, event: Event];
  clearExpandedGroupFacetFilters: [];
  gridViewportResize: [element: HTMLElement | null];
}>();

const bindGridViewportRef = (element: HTMLElement | null) => {
  emit("gridViewportResize", element);
};

const nativeRuntimeManifestUrl = resolveDistDataNativeRuntimeManifestPath();
</script>

<template>
        <!-- Items Container (38% width, right aligned) -->
        <div
          class="items-column ml-auto flex flex-col overflow-hidden border-l border-slate-200/40"
          :style="itemColumnStyle"
          @wheel="emit('itemsWheel', $event)"
        >
          <!-- Top Pagination Control -->
          <div
            v-if="totalPages > 1"
            class="pagination-top py-1 px-2"
          >
            <div class="flex items-center justify-between gap-1">
              <!-- 上一页按钮 - 最左侧 -->
              <button
                @click="emit('pageChange', currentPage - 1)"
                class="pager-btn rounded flex-shrink-0 flex items-center justify-center transition-colors"
                :style="{
                  width: itemSize + 'px',
                  height: itemSize + 'px',
                  fontSize: itemSize * 0.5 + 'px',
                }"
                title="上一页"
                aria-label="上一页"
              >
                ◀
              </button>

              <!-- 页码显示 - 中间 -->
              <div
                class="flex items-center gap-1 px-2 py-1 pager-indicator rounded text-xs flex-shrink-0"
              >
                <span class="text-slate-200">{{ currentPage }}</span>
                <span class="text-slate-200/60">/</span>
                <span class="text-white">{{ totalPages }}</span>
              </div>

              <!-- 下一页按钮 - 最右侧 -->
              <button
                @click="emit('pageChange', currentPage + 1)"
                class="pager-btn rounded flex-shrink-0 flex items-center justify-center transition-colors"
                :style="{
                  width: itemSize + 'px',
                  height: itemSize + 'px',
                  fontSize: itemSize * 0.5 + 'px',
                }"
                title="下一页"
                aria-label="下一页"
              >
                ▶
              </button>
            </div>
          </div>

          <!-- Items Grid Container -->
          <div class="items-grid-container flex-1 min-h-0 pt-1 flex flex-col">
            <div
              :ref="bindGridViewportRef"
              class="item-grid-shell w-full p-4 flex-1 min-h-0 overflow-hidden"
            >
              <div v-if="loading && items.length === 0" class="state-panel list-state-panel">
                <div class="state-spinner"></div>
                <p class="state-title">加载数据中...</p>
                <p class="state-subtitle">正在同步物品列表，请稍候。</p>
              </div>

              <div v-else-if="loadError && items.length === 0" class="state-panel list-state-panel state-panel-error">
                <p class="state-title">{{ loadError }}</p>
                <p class="state-subtitle">可立即重试，或重置筛选条件后重新加载。</p>
                <div class="state-actions">
                  <button class="mini-pager-btn" @click="emit('reload')">重试</button>
                  <button class="mini-pager-btn" @click="emit('resetFilters')">重置筛选</button>
                </div>
              </div>

              <div v-else-if="items.length === 0" class="state-panel list-state-panel">
                <p class="state-title">暂无可显示物品</p>
                <p class="state-subtitle">{{ itemGridEmptySubtitle }}</p>
                <div class="state-actions">
                  <button class="mini-pager-btn" @click="emit('reload')">重新加载</button>
                  <button class="mini-pager-btn" @click="emit('resetFilters')">重置筛选</button>
                </div>
              </div>

              <div v-else class="relative h-full w-full">
                <NativeBrowserSurface
                  surface-id="browser"
                  viewport-role="browser"
                  :entries="browserGridEntries"
                  :item-size="itemSize"
                  :atlas="currentPageAtlas"
                  :manifest-url="nativeRuntimeManifestUrl"
                  :enable-animation="true"
                  :prefer-atlas="true"
                  :selected-item-id="selectedItemId"
                  @item-click="emit('itemClick', $event)"
                  @item-contextmenu="(item, event) => emit('itemContextmenu', item, event)"
                  @group-click="emit('groupClick', $event)"
                  @group-contextmenu="(group, event) => emit('groupContextmenu', group, event)"
                  @viewport-resize="emit('gridViewportResize', $event)"
                />

                <div
                  v-if="expandedGroupFilterPanels.length > 0"
                  class="expanded-group-filter-panel absolute left-3 top-3 z-20 flex max-w-[min(520px,calc(100%-1.5rem))] flex-col gap-2"
                >
                  <div
                    v-for="group in expandedGroupFilterPanels"
                    :key="group.key"
                    class="expanded-group-filter-row"
                  >
                    <div class="min-w-0 flex-1">
                      <p class="expanded-group-filter-label">{{ group.label || group.representative.localizedName }}</p>
                      <p class="expanded-group-filter-meta">{{ group.semanticFamily || group.groupSource || 'semantic group' }} · {{ group.visibleCount || group.size }} 项</p>
                    </div>
                    <input
                      class="expanded-group-filter-input"
                      :value="expandedGroupFacetFilters[group.key] || ''"
                      placeholder="筛选材质 / 方块 / 实体 / 流体"
                      @input="emit('expandedGroupFacetInput', group.key, $event)"
                    />
                  </div>
                  <button
                    v-if="hasExpandedGroupFacetFilters"
                    class="expanded-group-filter-clear"
                    type="button"
                    @click="emit('clearExpandedGroupFacetFilters')"
                  >
                    清除筛选
                  </button>
                </div>

                <div
                  v-if="showTransitionOverlay"
                  class="pointer-events-none absolute right-3 top-3 z-20 rounded-xl border border-cyan-300/25 bg-slate-950/82 px-3 py-2 text-xs text-cyan-100 shadow-[0_10px_30px_rgba(15,23,42,0.45)] backdrop-blur-md"
                >
                  正在切换到第 {{ currentPage }} 页...
                </div>

                <div
                  v-else-if="loadError && items.length > 0"
                  class="absolute inset-x-3 top-3 z-20"
                >
                  <div class="state-panel list-state-panel state-panel-error !px-3 !py-2">
                    <p class="state-title text-xs">{{ loadError }}</p>
                    <p class="state-subtitle">上一页内容已保留，可立即重试当前页加载。</p>
                    <div class="state-actions">
                      <button class="mini-pager-btn" @click="emit('reload')">重试当前页</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <slot name="history" />

          </div>
        </div>
</template>
