<script setup lang="ts">
import {t} from '../i18n/index.ts';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { QuestPage, QuestSearch } from '../catalog/quests.ts';
import { Records } from '../catalog/client.ts';
import { useCatalog } from '../state/catalog.ts';
import { useRequest } from '../state/request.ts';
import { usePreferences } from '../state/preferences.ts';
import { itemLocation } from '../router/workspace.ts';
import QuestRule from '../components/QuestRule.vue';
import Pager from '../components/Pager.vue';
import GameText from '../components/GameText.vue';
import ItemLink from '../components/ItemLink.vue';
const route = useRoute(), router = useRouter();
const { catalog, opening, error: openError, open } = useCatalog(computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : ''));
const { preferences } = usePreferences();
const field = (key: string) => typeof route.query[key] === 'string' ? route.query[key] as string : '';
const search = computed<QuestSearch>(() => ({ query: field('query'), quest: field('quest'), item: field('item'),
  offset: /^(0|[1-9][0-9]*)$/.test(field('offset')) ? Number(field('offset')) : 0, limit: 4 }));
const query = ref(search.value.query), taskOpen = ref(new Set<string>()), rewardOpen = ref(new Set<string>());
const { value: page, error, loading, run, clear } = useRequest<QuestPage>();
const records = computed(() => page.value ? new Records(page.value.related) : null);
const names: Record<string, string> = { retrieval: '物品提交/检测', crafting: '制作记录', fluid: '流体提交/检测',
  meeting: '发现实体', hunt: '击杀实体', interactItem: '物品与方块交互', interactEntity: '实体交互',
  checkbox: '手动确认', location: '地点', xp: '经验', blockBreak: '破坏方块', scoreboard: '记分板',
  item: '物品奖励', choice: '选择奖励', command: '命令奖励', questCompletion: '任务完成奖励' };
function update(patch: Record<string, string | number | undefined>) {
  void router.push({ name: 'quests', query: { ...route.query, offset: undefined, ...patch } });
}
function select(id: string, direction: 'recipes' | 'uses') { void router.push(itemLocation(id, route.query, direction === 'uses' ? 'usedIn' : 'producedBy')); }
function toggle(set: Set<string>, key: string, event: Event) {
  if ((event.target as HTMLDetailsElement).open) set.add(key); else set.delete(key);
}
watch([catalog, search], () => {
  clear(); query.value = search.value.query; taskOpen.value.clear(); rewardOpen.value.clear();
  if (catalog.value) void run(signal => catalog.value!.quests(search.value, signal));
}, { immediate: true });
</script>
<template>
  <main class="catalog-page quests-page">
    <h1>{{t("任务资料")}}</h1>
    <p class="quest-scope">{{t("这里保留本次原生玩家可见的任务声明。任务要求、可选提交和奖励分别展示；不读取或提交玩家进度。")}}</p>
    <form class="quests-search" @submit.prevent="update({query:query.trim(),quest:undefined})">
      <input v-model="query" type="search" :aria-label="t('查找任务')" :placeholder="t('任务名称、说明或 UUID')">
      <button type="submit">{{t("搜索")}}</button><button type="button" @click="update({query:undefined,quest:undefined,item:undefined})">{{t("清空筛选")}}</button>
    </form>
    <p v-if="opening || loading" role="status">{{t("正在读取任务声明…")}}</p>
    <p v-if="openError || error" role="alert">{{openError || error}}<button @click="open()">{{t("重新读取")}}</button></p>
    <template v-if="page && records && catalog">
      <template v-if="page.definition">
        <p>{{t("原生登记 {0} 个任务，本次可见 {1} 个；当前筛选 {2} 个。", page.definition.data.registered, page.definition.data.counts.quests, page.total)}}</p>
        <p class="quest-world-policy">{{t("世界策略：{0} · {1} · {2} · {3}", page.definition.data.settings.noRewards?t("奖励禁用"):t("奖励启用"), page.definition.data.settings.viewMode?t("资料模式"):t("普通模式"), page.definition.data.settings.partyEnable?t("队伍启用"):t("队伍禁用"), page.definition.data.settings.fullySyncQuests?t("完整同步"):t("原生可见范围同步"))}}</p>
        <p>{{t("编辑模式：{0} · 极限模式：{1} · 原生默认/最大生命次数：{2} / {3}（不包含玩家当前生命记录）。", page.definition.data.settings.editMode?t("是"):t("否"), page.definition.data.settings.hardcore?t("是"):t("否"), page.definition.data.settings.livesDefault, page.definition.data.settings.livesMax)}}</p>
      </template>
      <p v-else>{{t("当前数据集没有原生任务资料。")}}</p>
      <article v-for="row in page.rows" :key="row.id" class="quest-entry" :data-uuid="row.data.questUuid">
        <h2><GameText :text="row.data.name.value" /></h2>
        <ItemLink v-if="row.data.icon?.base.examples[0]" :target="{kind:'item',id:row.data.icon.base.examples[0]}" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
        <p class="quest-description"><GameText :text="row.data.description.value" /></p>
        <p class="quest-identity"><button @click="update({quest:row.data.questUuid,query:undefined})">{{row.data.questUuid}}</button> {{t("· 原生可见策略")}} {{row.data.visibility}}</p>
        <section class="quest-prerequisites" v-if="row.data.prerequisites.length"><h3>{{t("前置任务 · 逻辑 {0}", row.data.policy.questLogic)}}</h3>
          <p v-for="target in row.data.prerequisites" :key="target.questUuid">
            <button v-if="target.state==='visible'" @click="update({quest:target.questUuid,query:undefined})">{{target.questUuid}}</button><span v-else>{{target.questUuid}}</span>
            · {{target.type}} · {{target.state==='visible'?t("本次可见"):target.state==='hidden'?t("已登记但本次隐藏"):t("原生目标缺失")}}
          </p>
        </section>
        <section class="quest-tasks"><h3>{{t("任务要求（{0}）· 逻辑 {1}", row.data.tasks.length, row.data.policy.taskLogic)}}</h3>
          <details v-for="entry in row.data.tasks" :key="entry.nativeId" class="quest-task" @toggle="toggle(taskOpen,row.id+':'+entry.nativeId,$event)">
            <summary>{{t(names[entry.rule.type]!)}} · #{{entry.nativeId}}<span v-if="entry.rule.type==='retrieval' && entry.rule.optional">{{t("· 可选提交")}}</span></summary>
            <QuestRule v-if="taskOpen.has(row.id+':'+entry.nativeId)" :rule="entry.rule" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
          </details>
        </section>
        <section class="quest-rewards"><h3>{{t("奖励（{0}）", row.data.rewards.length)}}</h3>
          <details v-for="entry in row.data.rewards" :key="entry.nativeId" class="quest-reward" @toggle="toggle(rewardOpen,row.id+':'+entry.nativeId,$event)">
            <summary>{{t(names[entry.rule.type]!)}} · #{{entry.nativeId}}<span v-if="entry.rule.type==='choice'">{{t("· 选择一项")}}</span></summary>
            <QuestRule v-if="rewardOpen.has(row.id+':'+entry.nativeId)" :rule="entry.rule" reward :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
          </details>
        </section>
        <details class="quest-policy"><summary>{{t("完成、重复与共享规则")}}</summary>
          <dl><dt>{{t("重复间隔")}}</dt><dd>{{row.data.policy.repeatTicks}} tick · {{row.data.policy.repeatRelative?t("相对时间"):t("原生时间规则")}}</dd>
            <dt>{{t("主线任务")}}</dt><dd>{{row.data.policy.main?t("是"):t("否")}}</dd>
            <dt>{{t("全局任务 / 全局共享")}}</dt><dd>{{row.data.policy.global?t("是"):t("否")}} / {{row.data.policy.globalShare?t("是"):t("否")}}</dd>
            <dt>{{t("自动领奖")}}</dt><dd>{{row.data.policy.autoClaim?t("是"):t("否")}}</dd><dt>{{t("锁定进度")}}</dt><dd>{{row.data.policy.lockedProgress?t("是"):t("否")}}</dd>
            <dt>{{t("同步执行")}}</dt><dd>{{row.data.policy.simultaneous?t("是"):t("否")}}</dd><dt>{{t("静默任务")}}</dt><dd>{{row.data.policy.silent?t("是"):t("否")}}</dd></dl>
        </details>
      </article>
      <p v-if="page.definition && !page.rows.length">{{t("没有符合筛选条件的可见任务。")}}</p>
      <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('任务资料')" @change="update({offset:$event})" />
    </template>
  </main>
</template>
<style scoped>
.quests-page{margin:1rem;max-width:1100px;width:auto;min-height:0;padding:1.2rem}.quests-page p{line-height:1.65;overflow-wrap:anywhere}.quests-search{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0}.quests-search input{flex:1;min-width:200px}.quest-entry{padding:1rem;margin-top:1rem;border:1px solid var(--border,#334155);border-radius:.6rem;background:var(--surface,#101b2b)}.quest-entry h2{font-size:1.2rem}.quest-entry h3{margin:1rem 0 .5rem;font-size:1rem}.quest-description{white-space:pre-wrap}.quest-identity{font-size:.8rem}.quest-identity button{overflow-wrap:anywhere;text-align:left}.quest-task,.quest-reward{margin:.5rem 0;border:1px solid var(--border,#334155);border-radius:.3rem}.quest-task>summary,.quest-reward>summary{padding:.5rem}.quest-policy{margin-top:1rem}.quest-policy dl{display:grid;grid-template-columns:minmax(9em,auto) 1fr;gap:.4rem 1rem}.quest-policy dd{margin:0}
</style>
