<script setup lang="ts">
import type { StyleValue } from "vue";
import type { BrowserVariantGroup, Item } from "../../services/api";
import type { NativeSurfaceFrameProjectionMetrics } from "../../native-surface/contracts";
import { resolveDistDataNativeRuntimeManifestPath } from "../../services/distDataRuntime";
import NativeBrowserSurface from "../native-surface/NativeBrowserSurface.vue";

defineProps<{
  itemColumnStyle: StyleValue;
  totalPages: number;
  currentPage: number;
  itemSize: number;
  searchQuery: string;
  selectedMod: string;
  loading: boolean;
  items: Item[];
  loadError: string;
  itemGridEmptySubtitle: string;
  expandedGroupKeys: string[];
  expandedGroupFilterPanels: BrowserVariantGroup[];
  expandedGroupFacetFilters: Record<string, string>;
  hasExpandedGroupFacetFilters: boolean;
  hasBrowserGroups: boolean;
  allBrowserGroupsExpanded: boolean;
  groupToggleBusy: boolean;
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
  runtimeProjectionUpdate: [metrics: NativeSurfaceFrameProjectionMetrics];
  toggleAllGroups: [];
  openRecipe: [];
}>();

const bindGridViewportRef = (element: HTMLElement | null) => {
  emit("gridViewportResize", element);
};

const nativeRuntimeManifestUrl = resolveDistDataNativeRuntimeManifestPath();
</script>

<template>
        <div
          class="items-column ml-auto flex flex-col overflow-hidden"
          :style="itemColumnStyle"
          @wheel="emit('itemsWheel', $event)"
        >
          <!-- Top Controls & Pagination -->
          <div
            class="pagination-top flex justify-center items-center py-2 px-4 gap-3"
          >
            <!-- Recipe 跳转按钮 -->
            <button
              @click="emit('openRecipe')"
              class="recipe-entry-btn-browser"
              title="进入 Recipe 界面"
            >
              Recipe
            </button>

            <div
              v-if="totalPages > 1"
              class="pager-capsule flex items-center px-2 py-0.5 gap-3 select-none"
            >
              <!-- 上一页按钮 -->
              <button
                @click="emit('pageChange', currentPage - 1)"
                class="pager-arrow-btn pager-arrow-btn--prev rounded-full"
                title="上一页"
                aria-label="上一页"
              >
                <svg
                  class="w-3.5 h-3.5 stroke-current"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke-width="1.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <!-- 页码显示 (星微之光排版) -->
              <div class="font-mono text-[10px] tracking-wider flex items-center">
                <span class="pager-num-current text-white font-medium">{{ String(currentPage).padStart(2, '0') }}</span>
                <span class="pager-divider mx-2">/</span>
                <span class="pager-num-total">{{ String(totalPages).padStart(2, '0') }}</span>
              </div>

              <!-- 下一页按钮 -->
              <button
                @click="emit('pageChange', currentPage + 1)"
                class="pager-arrow-btn pager-arrow-btn--next rounded-full"
                title="下一页"
                aria-label="下一页"
              >
                <svg
                  class="w-3.5 h-3.5 stroke-current"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke-width="1.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <!-- "组" 按钮 -->
            <button
              @click="emit('toggleAllGroups')"
              class="group-toggle-btn"
              :class="{ 'group-toggle-btn--active': allBrowserGroupsExpanded }"
              :disabled="!hasBrowserGroups || groupToggleBusy"
              :aria-busy="groupToggleBusy ? 'true' : undefined"
              :aria-label="!hasBrowserGroups ? '当前筛选范围没有分组' : (allBrowserGroupsExpanded ? '收起当前范围全部分组' : '展开当前范围全部分组')"
              :title="!hasBrowserGroups ? '当前筛选范围没有分组' : (allBrowserGroupsExpanded ? '收起当前范围全部分组' : '展开当前范围全部分组')"
            >
              {{ groupToggleBusy ? '...' : '组' }}
            </button>
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
                  :item-size="itemSize"
                  :page="currentPage"
                  :search-query="searchQuery"
                  :mod-id="selectedMod"
                  :expanded-groups="expandedGroupKeys"
                  :manifest-url="nativeRuntimeManifestUrl"
                  :enable-animation="true"
                  :selected-item-id="selectedItemId"
                  @item-click="emit('itemClick', $event)"
                  @item-contextmenu="(item, event) => emit('itemContextmenu', item, event)"
                  @group-click="emit('groupClick', $event)"
                  @group-contextmenu="(group, event) => emit('groupContextmenu', group, event)"
                  @viewport-resize="emit('gridViewportResize', $event)"
                  @runtime-projection-update="emit('runtimeProjectionUpdate', $event)"
                />



                <div
                  v-if="showTransitionOverlay"
                  class="pointer-events-none absolute right-3 top-3 z-20 rounded-xl border border-amber-500/20 bg-slate-950/82 px-3 py-2 text-xs text-amber-200/90 shadow-[0_10px_30px_rgba(15,23,42,0.45)] backdrop-blur-md"
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
