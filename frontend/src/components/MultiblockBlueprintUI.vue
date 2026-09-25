<script setup lang="ts">
import { computed } from 'vue';
import type { Recipe, MultiblockBlueprint } from '../services/api';
import MultiblockVoxelViewer from './MultiblockVoxelViewer.vue';

interface Props {
  recipe: Recipe;
}

const props = defineProps<Props>();

const blueprint = computed<MultiblockBlueprint | null>(() => {
  const meta =
    (props.recipe.additionalData as Record<string, unknown> | undefined) ||
    (props.recipe.metadata as Record<string, unknown> | undefined) ||
    {};
  const bp = meta.multiblockBlueprint as MultiblockBlueprint | undefined;
  return bp ?? null;
});
</script>

<template>
  <div class="multiblock-ui">
    <div class="head">
      <div class="title">NEI 多方块蓝图</div>
      <div class="subtitle">{{ blueprint?.controllerLocalizedName || recipe.outputs?.[0]?.localizedName || '未知控制器' }}</div>
    </div>

    <MultiblockVoxelViewer
      v-if="blueprint?.voxelBlueprint"
      :blueprint="blueprint.voxelBlueprint"
      :height="350"
    />
    <div v-else class="empty">
      该配方没有可用的 3D 结构数据。
    </div>
  </div>
</template>

<style scoped>
.multiblock-ui {
  width: min(100%, 980px);
  border: 1px solid rgba(0, 224, 255, 0.2);
  border-radius: 14px;
  padding: 14px;
  background: linear-gradient(160deg, rgba(4, 10, 22, 0.86), rgba(7, 20, 38, 0.82));
}

.head {
  margin-bottom: 10px;
}

.title {
  color: #dff8ff;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.subtitle {
  margin-top: 2px;
  color: rgba(205, 242, 255, 0.82);
  font-size: 12px;
}

.empty {
  padding: 28px 14px;
  text-align: center;
  color: rgba(229, 244, 255, 0.76);
  border: 1px dashed rgba(102, 220, 255, 0.35);
  border-radius: 10px;
}
</style>

