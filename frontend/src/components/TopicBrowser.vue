<script setup lang="ts">
import {t,language} from "../i18n/index.ts";
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
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
const route = useRoute();
const labels = { ore: '矿辞资料', material: '材料资料', circuit: '电路系列', bee: '蜜蜂资料', tree: '树木资料', butterfly: '蝴蝶资料', flower: '花卉资料', structure: '多方块结构', aspect: '要素资料', research: '研究资料' } as const;
const label = computed(() => t(labels[props.kind]));
const legacy = computed(() => typeof route.query.legacy === 'string' ? route.query.legacy : '');
const query = ref(props.selected ? '' : legacy.value), offset = ref(0);
const { value: topics, error, loading, run, cancel, clear } = useRequest<Topics>();
const icons = computed(() => topics.value ? new Records(topics.value.related) : null);
function load(): void {
  void run(signal => props.catalog.topics({ kind: props.kind, item: props.item, query: query.value, offset: offset.value, limit: 20 }, signal));
}
watch([() => props.catalog, () => props.kind, () => props.item], () => { query.value = props.selected ? '' : legacy.value; offset.value = 0; clear(); });
watch(topics, value => {
  if (props.selected || !legacy.value || value?.total !== 1) return;
  const row = value.rows[0];
  if (row && (row.id === legacy.value || row.terms.split(/\s+/).includes(legacy.value.toLocaleLowerCase('en-US')))) emit('select', row.id);
});
watch(query, () => { offset.value = 0; });
watch([() => props.catalog, () => props.kind, () => props.item, query, offset], (_value, _old, cleanup) => {
  cancel();
  const timer = setTimeout(load, query.value ? 140 : 0);
  cleanup(() => clearTimeout(timer));
}, { immediate: true });
</script>

<template>
  <section class="panel topic-browser">
    <header class="panel-heading"><div><span class="eyebrow">{{t('资料')}}</span><h1>{{ label }}</h1></div>
      <span v-if="topics" class="subtle">{{t("{0} 条", topics.total.toLocaleString(language))}}</span></header>
    <label class="search-field"><span aria-hidden="true">⌕</span><input v-model="query" type="search" :aria-label="t('搜索{0}',label)" :placeholder="t('名称、拼音或注册键…')" maxlength="256" /></label>
    <p v-if="legacy && !selected" class="group-filter">{{t("旧链接选择：{0}。请选择匹配资料。", legacy)}}</p>
    <div v-if="item" class="group-filter"><span>{{t("与选定物品有关")}}</span><button type="button" @click="emit('all')">{{t("显示全部 ×")}}</button></div>
    <p v-if="error" class="inline-error" role="alert">{{ error }} <button type="button" @click="load">{{t("重试")}}</button></p>
    <p v-else-if="!topics" class="grid-loading" role="status">{{t("正在读取索引…")}}</p>
    <template v-else>
      <div v-if="topics.rows.length && icons" class="topic-list" :class="{ busy: loading }" :aria-busy="loading">
        <button v-for="topic in topics.rows" :key="topic.id" type="button" :class="{ active: topic.id === selected }" :aria-label="t('查看 ') + plain(topic.name)" @click="emit('select', topic.id)">
          <Icon v-if="topic.icon || topic.image" :atlas="catalog.atlas" :texture="icons.picture(topic)" :width="28" :height="28" :animate="preferences.animate" :label="plain(topic.name)" />
          <span v-else class="topic-mark" aria-hidden="true">◇</span><GameText :text="topic.name" /></button>
      </div>
      <div v-else class="state-panel empty"><h2>{{t("没有匹配的资料")}}</h2><p>{{t("可以更换关键词或查看全部条目。")}}</p></div>
      <Pager :total="topics.total" :offset="topics.offset" :limit="topics.limit" :busy="loading" :label="t('资料')" @change="offset = $event" />
    </template>
  </section>
</template>
