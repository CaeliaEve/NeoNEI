<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TopicKind } from '@elysium/contracts';
import { Records, type Catalog, type Topics } from '../catalog/client.ts';
import { plain } from '../catalog/format.ts';
import { useRequest } from '../state/request.ts';
import { usePreferences } from '../state/preferences.ts';
import GameText from './GameText.vue';
import Icon from './Icon.vue';
import Pager from './Pager.vue';

const props = defineProps<{ catalog: Catalog; kind: TopicKind; selected: string; item: string }>();
const emit = defineEmits<{ select: [id: string]; all: [] }>();
const { preferences } = usePreferences();
const labels = { material: ['材料资料', 'MATERIALS'], circuit: ['电路系列', 'CIRCUITS'], bee: ['蜜蜂资料', 'BEES'], tree: ['树木资料', 'TREES'], structure: ['多方块结构', 'STRUCTURES'], aspect: ['要素资料', 'ASPECTS'], research: ['研究资料', 'RESEARCH'] } as const;
const label = computed(() => labels[props.kind]);
const query = ref(''), offset = ref(0);
const { value: topics, error, loading, run, cancel, clear } = useRequest<Topics>();
const icons = computed(() => topics.value ? new Records(topics.value.related) : null);
function load(): void {
  void run(signal => props.catalog.topics({ kind: props.kind, item: props.item, query: query.value, offset: offset.value, limit: 20 }, signal));
}
watch([() => props.catalog, () => props.kind, () => props.item], () => { query.value = ''; offset.value = 0; clear(); });
watch(query, () => { offset.value = 0; });
watch([() => props.catalog, () => props.kind, () => props.item, query, offset], (_value, _old, cleanup) => {
  cancel();
  const timer = setTimeout(load, query.value ? 140 : 0);
  cleanup(() => clearTimeout(timer));
}, { immediate: true });
</script>

<template>
  <section class="panel topic-browser">
    <header class="panel-heading"><div><span class="eyebrow">{{ label[1] }}</span><h1>{{ label[0] }}</h1></div>
      <span v-if="topics" class="subtle">{{ topics.total.toLocaleString('zh-CN') }} 条</span></header>
    <label class="search-field"><span aria-hidden="true">⌕</span><input v-model="query" type="search" :aria-label="'搜索' + label[0]" placeholder="名称、拼音或注册键…" maxlength="256" /></label>
    <div v-if="item" class="group-filter"><span>与选定物品有关</span><button type="button" @click="emit('all')">显示全部 ×</button></div>
    <p v-if="error" class="inline-error" role="alert">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-else-if="!topics" class="grid-loading" role="status">正在读取索引…</p>
    <template v-else>
      <div v-if="topics.rows.length && icons" class="topic-list" :class="{ busy: loading }" :aria-busy="loading">
        <button v-for="topic in topics.rows" :key="topic.id" type="button" :class="{ active: topic.id === selected }" :aria-label="'查看 ' + plain(topic.name)" @click="emit('select', topic.id)">
          <Icon v-if="topic.icon || topic.image" :atlas="catalog.atlas" :texture="icons.picture(topic)" :width="28" :height="28" :animate="preferences.animate" :label="plain(topic.name)" />
          <span v-else class="topic-mark" aria-hidden="true">◇</span><GameText :text="topic.name" /></button>
      </div>
      <div v-else class="state-panel empty"><h2>没有匹配的资料</h2><p>可以更换关键词或查看全部条目。</p></div>
      <Pager :total="topics.total" :offset="topics.offset" :limit="topics.limit" :busy="loading" label="资料" @change="offset = $event" />
    </template>
  </section>
</template>
