<script setup lang="ts">
import { computed } from 'vue';
const props = withDefaults(defineProps<{ total: number; offset: number; limit: number; busy?: boolean; label?: string }>(), { busy: false, label: '结果' });
const emit = defineEmits<{ change: [offset: number] }>();
const pages = computed(() => Math.ceil(props.total / props.limit));
</script>

<template>
  <nav class="pager" :aria-label="label + '分页'">
    <span>{{ total.toLocaleString('zh-CN') }} 项</span>
    <div><button type="button" :disabled="busy || offset === 0" :aria-label="label + '上一页'" @click="emit('change', Math.max(0, offset - limit))">←</button>
      <span aria-live="polite">{{ pages ? Math.floor(offset / limit) + 1 : 0 }} / {{ pages }}</span>
      <button type="button" :disabled="busy || offset + limit >= total" :aria-label="label + '下一页'" @click="emit('change', offset + limit)">→</button></div>
  </nav>
</template>
