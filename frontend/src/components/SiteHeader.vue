<script setup lang="ts">
import { computed } from 'vue';
const props = withDefaults(defineProps<{ catalog?: string; offline?: boolean }>(), { catalog: '', offline: false });
const query = computed(() => props.catalog ? { catalog: props.catalog, ...(props.offline ? { offline: '1' } : {}) } : {});
</script>

<template>
  <header class="site-header">
    <RouterLink :to="{ name: 'home', query }" class="brand" aria-label="NeoNEI 首页">
      <span class="brand-mark">N</span><strong>NeoNEI</strong></RouterLink>
    <nav class="site-nav" aria-label="浏览分类">
      <RouterLink :to="{ name: 'home', query }">物品</RouterLink>
      <RouterLink :to="{ name: 'materials', query }">材料</RouterLink>
      <RouterLink :to="{ name: 'circuits', query }">电路</RouterLink>
      <RouterLink :to="{ name: 'bees', query }">蜜蜂</RouterLink>
      <RouterLink :to="{ name: 'trees', query }">树木</RouterLink>
      <RouterLink :to="{ name: 'structures', query }">多方块</RouterLink>
      <RouterLink :to="{ name: 'aspects', query }">魔法</RouterLink>
    </nav>
    <div class="header-actions">
      <RouterLink :to="{ name: 'offline', query }" class="offline-link">离线资料</RouterLink>
      <span v-if="catalog" class="dataset-state" :class="{ offline }"><i />{{ offline ? '离线副本' : '数据已就绪' }}</span><slot />
    </div>
  </header>
</template>
