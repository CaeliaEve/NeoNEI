<script setup lang="ts">
import { t, language } from "../i18n/index.ts";
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { snapshotQuery, topicGroups } from '../router/workspace.ts';
import LanguageSelect from './LanguageSelect.vue';
const props = withDefaults(defineProps<{ catalog?: string; offline?: boolean }>(), { catalog: '', offline: false });
const emit = defineEmits<{ settings: [] }>();
const route = useRoute(), topicsMenu = ref<HTMLDetailsElement | null>(null);
const query = computed(() => ({ ...snapshotQuery(route.query), ...(props.catalog ? { catalog: props.catalog } : {}), ...(props.offline ? { offline: '1' } : {}) }));
</script>
<template>
  <header class="workspace-header">
    <RouterLink :to="{ name: 'home', query }" class="workspace-brand" :aria-label="t('NeoNEI 首页')">NeoNEI</RouterLink>
    <nav class="workspace-navigation" :aria-label="t('工作区')">
      <RouterLink :to="{ name: 'home', query }"> {{ t("物品与配方") }} </RouterLink>
      <details ref="topicsMenu" class="workspace-topics">
        <summary> {{ t("主题资料") }} </summary>
        <div class="workspace-topics-menu">
          <section v-for="group in topicGroups" :key="group.label"><h2>{{ t(group.label) }}</h2>
            <RouterLink v-for="topic in group.routes" :key="topic.name" :to="{ name: topic.name, query }"
              @click="topicsMenu && (topicsMenu.open = false)">{{ t(topic.label) }}</RouterLink></section>
        </div>
      </details>
      <button type="button" @click="emit('settings')"> {{ t("设置") }} </button>
    </nav>
    <LanguageSelect />
    <span v-if="catalog" class="workspace-source">{{ offline ? t("离线副本") : t("数据已就绪") }}</span>
  </header>
</template>
<style scoped>
.workspace-header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: #dce8f6; flex-wrap: wrap; }
.workspace-brand { font-weight: 600; color: #a8cee7; }
.workspace-navigation { display: flex; align-items: center; gap: 14px; }
.workspace-navigation a, button, summary { cursor: pointer; padding: 3px 0; font-size: 12px; }
a:hover, button:hover, summary:hover { color: #8fd8ff; }
.workspace-source { font-size: 10px; color: #8ba4bc; margin-left: auto; }
.workspace-topics { position: relative; }
.workspace-topics-menu { position: absolute; z-index: 100; top: 28px; left: -100px; width: min(480px, 86vw); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 16px; background: #101722; border: 1px solid #34485b; border-radius: 6px; box-shadow: 0 12px 28px #0008; }
.workspace-topics-menu h2 { color: #8fd8ff; font-size: 12px; margin-bottom: 5px; }
.workspace-topics-menu a { display: block; }
@media (max-width: 600px) { .workspace-source { display: none; } .workspace-header { gap: 8px; padding: 8px; } .workspace-navigation { gap: 10px; } }
</style>
