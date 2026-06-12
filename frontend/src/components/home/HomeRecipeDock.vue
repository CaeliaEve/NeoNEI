<script setup lang="ts">
import { defineAsyncComponent, type StyleValue } from "vue";
import type { Recipe } from "../../services/api";
import type { MachineCategory } from "../../composables/recipe-browser/helpers";

const MachineTypeIcons = defineAsyncComponent(() => import("../MachineTypeIcons.vue"));
const RecipeDisplayRouter = defineAsyncComponent(() => import("../RecipeDisplayRouter.vue"));

defineProps<{
  visible: boolean;
  needsWideStage: boolean;
  dockStyle: StyleValue;
  machineCategories: MachineCategory[];
  selectedMachineIndex: number;
  currentCategory: MachineCategory | null | undefined;
  totalRecipePages: number;
  recipeModalPage: number;
  recipeStageIsStateView: boolean;
  recipeModalLoading: boolean;
  recipeModalError: string;
  isRecipeModalFurnaceCanvas: boolean;
  currentPageRecipes: Recipe[];
  recipeModalScaleToFit: boolean;
}>();

const emit = defineEmits<{
  "update:selectedMachineIndex": [value: number];
  selectMachine: [index: number];
  prevRecipePage: [];
  nextRecipePage: [];
  recipeWheel: [event: WheelEvent];
  contextmenu: [event: MouseEvent];
  retry: [];
  close: [];
  itemClick: [itemId: string, options?: { tab?: "usedIn" | "producedBy" }];
}>();
</script>

<template>
  <div
    v-if="visible"
    :class="['recipe-preview-panel recipe-preview-shell absolute flex flex-col overflow-visible rounded-xl shadow-lg', { 'wide-stage': needsWideStage }]"
    :style="dockStyle"
  >
    <div class="flex-1 flex flex-col p-2 gap-2 min-h-0 overflow-visible">
      <MachineTypeIcons
        :categories="machineCategories"
        :model-value="selectedMachineIndex"
        @update:model-value="emit('update:selectedMachineIndex', $event)"
        @select="emit('selectMachine', $event)"
      />

      <div class="recipe-machine-banner rounded">
        <!-- Title on Left -->
        <span
          class="recipe-machine-banner__title text-xs font-medium tracking-wide text-slate-200"
        >
          {{ currentCategory?.name || "未知分类" }}
        </span>

        <!-- Pager Capsule on Right -->
        <div v-if="totalRecipePages > 1" class="recipe-machine-pager flex items-center px-1.5 py-0.5 select-none">
          <!-- Prev button -->
          <button
            @click="emit('prevRecipePage')"
            :disabled="totalRecipePages <= 1"
            class="recipe-machine-banner__nav recipe-machine-banner__nav--prev rounded-full"
            title="上一页"
            aria-label="上一页"
          >
            <svg class="w-3 h-3 stroke-current" viewBox="0 0 24 24" fill="none" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <!-- Page text (鏄熷井涔嬪厜鎺掔増) -->
          <span class="font-mono text-[9px] tracking-wider leading-none flex items-center mx-1">
            <span class="recipe-num-current text-white font-medium">{{ String(recipeModalPage + 1).padStart(2, '0') }}</span>
            <span class="recipe-divider mx-1.5">/</span>
            <span class="recipe-num-total">{{ String(totalRecipePages).padStart(2, '0') }}</span>
          </span>

          <!-- Next button -->
          <button
            @click="emit('nextRecipePage')"
            :disabled="totalRecipePages <= 1"
            class="recipe-machine-banner__nav recipe-machine-banner__nav--next rounded-full"
            title="下一页"
            aria-label="下一页"
          >
            <svg class="w-3 h-3 stroke-current" viewBox="0 0 24 24" fill="none" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div
        :class="[
          'recipe-display-shell rounded flex-1 flex items-center justify-center recipe-display-container p-2 min-h-0',
          {
            'recipe-display-container--state': recipeStageIsStateView,
            'recipe-display-container--homepage': !recipeStageIsStateView,
          }
        ]"
        @wheel="emit('recipeWheel', $event)"
        @contextmenu="emit('contextmenu', $event)"
      >
        <div
          :class="[
            'recipe-stage-slot',
            {
              'recipe-stage-slot--state': recipeStageIsStateView,
              'recipe-stage-slot--homepage': !recipeStageIsStateView,
            },
          ]"
        >
          <div v-if="recipeModalLoading" class="state-panel stage-state-panel">
            <p class="state-title">正在加载配方...</p>
            <p class="state-subtitle">请稍候，系统正在准备该物品的配方索引。</p>
          </div>
          <div v-else-if="recipeModalError" class="state-panel stage-state-panel state-panel-error">
            <p class="state-title">{{ recipeModalError }}</p>
            <p class="state-subtitle">你可以立即重试，或切换到其他物品后再查询。</p>
            <div class="state-actions">
              <button class="mini-pager-btn" @click="emit('retry')">重试</button>
              <button class="mini-pager-btn" @click="emit('close')">关闭面板</button>
            </div>
          </div>
          <div
            v-else-if="isRecipeModalFurnaceCanvas && currentPageRecipes.length > 0"
            class="modal-stacked-furnace-recipes homepage-recipe-scale-shell"
          >
            <RecipeDisplayRouter
              v-for="recipe in currentPageRecipes"
              :key="recipe.recipeId"
              :recipe="recipe"
              @item-click="emit('itemClick', $event)"
              :scale-to-fit="recipeModalScaleToFit"
              :prefer-detailed-crafting="false"
            />
          </div>
          <div
            v-else-if="currentPageRecipes.length > 0"
            class="homepage-recipe-scale-shell"
          >
            <RecipeDisplayRouter
              :recipe="currentPageRecipes[0]"
              @item-click="emit('itemClick', $event)"
              :scale-to-fit="recipeModalScaleToFit"
              :prefer-detailed-crafting="false"
            />
          </div>
          <div v-else class="state-panel stage-state-panel">
            <p class="state-title">暂无可显示配方</p>
            <p class="state-subtitle">请尝试右键查看“用途配方”，或切换其他物品。</p>
            <div class="state-actions">
              <button class="mini-pager-btn" @click="emit('retry')">重新加载</button>
              <button class="mini-pager-btn" @click="emit('close')">关闭面板</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
