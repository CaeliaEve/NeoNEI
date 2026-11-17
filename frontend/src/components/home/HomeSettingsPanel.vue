<script setup lang="ts">
import { t, language } from "../../i18n/index.ts";
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PersonalBackup from './PersonalBackup.vue';
import type { Catalog } from '../../catalog/client.ts';
import { usePreferences } from '../../state/preferences.ts';
import { available, saved } from '../../offline/client.ts';
import { snapshotQuery } from '../../router/workspace.ts';
const props = defineProps<{
  modelValue: boolean; itemSize: number; panelResizeEnabled: boolean;
  settingsSaveStatus: string; settingsSaveError: string;
  atlasResidentStatus: string;
  catalog: Catalog | null; catalogOpening: boolean; catalogError: string; historyCount: number;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean]; 'update:itemSize': [value: number]; 'update:panelResizeEnabled': [value: boolean];
  'save-settings': []; 'clear-history': []; 'retry-catalog': [];
}>();
const { preferences, storageError } = usePreferences();
const route = useRoute(), dialog = ref<HTMLElement | null>(null);
const localItemSize = computed({ get: () => props.itemSize, set: value => emit('update:itemSize', value) });
const localStatus = ref(t("未检查")), localError = ref('');
const query = computed(() => snapshotQuery(route.query));
let previousFocus: HTMLElement | null = null;
let generation = 0;
function close() { emit('update:modelValue', false); }
async function inspect() {
  const request = ++generation;
  localError.value = '';
  try {
    if (!available()) { localStatus.value = t("浏览器不支持离线存储"); return; }
    const copies = await saved();
    if (request !== generation) return;
    const copy = copies.find(row => row.id === props.catalog?.manifest.id);
    localStatus.value = copy?.state === 'ready' ? t("完整离线副本已就绪") : copy ? t("离线副本尚未完整保存") : t("尚未保存完整离线副本");
  } catch (error) { if (request === generation) localError.value = error instanceof Error ? error.message : String(error); }
}
function keydown(event: KeyboardEvent) {
  if (!props.modelValue) return;
  if (event.key === 'Escape') { event.preventDefault(); close(); }
  if (event.key !== 'Tab') return;
  const targets = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),summary,[tabindex="0"]') ?? [])].filter(node => node.getClientRects().length);
  const first = targets[0], last = targets[targets.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
watch(language,()=>{if(props.modelValue)void inspect();});
watch(() => props.modelValue, async open => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick(); dialog.value?.focus(); document.addEventListener('keydown', keydown); void inspect();
  } else { generation++; document.removeEventListener('keydown', keydown); previousFocus?.focus(); }
});
onBeforeUnmount(() => { generation++; document.removeEventListener('keydown', keydown); });
</script>
<template>
  <button type="button" class="workspace-settings-toggle" data-native-benchmark="settings-toggle" :aria-label="t('打开设置中心')" @click="emit('update:modelValue', true)"> {{ t("设置") }} </button>
  <Teleport to="body">
    <div v-if="modelValue" class="settings-modal" data-native-benchmark="settings-overlay" @click.self="close">
      <section ref="dialog" class="gear-menu settings-panel" role="dialog" aria-modal="true" :aria-label="t('NeoNEI 设置中心')" tabindex="-1">
        <header><h2> {{ t("设置") }} </h2><button type="button" data-native-benchmark="settings-close" :aria-label="t('关闭设置中心')" @click="close"> {{ t("关闭") }} </button></header>
        <section class="settings-section"><h3> {{ t("显示与操作") }} </h3>
          <label> {{ t("网格图标大小") }} <span>{{ localItemSize }} px</span><input v-model.number="localItemSize" type="range" min="24" max="128" step="4" :aria-label="t('网格图标大小')" /></label>
          <button type="button" @click="emit('save-settings')"> {{ t("保存图标大小") }} </button>
          <label><input v-model="preferences.animate" type="checkbox" /> {{ t("播放物品动画") }} </label>
          <label><input type="checkbox" :checked="panelResizeEnabled" @change="emit('update:panelResizeEnabled', ($event.target as HTMLInputElement).checked)" /> {{ t("调整面板大小") }} </label>
          <p class="subtle"> {{ t("开启后可拖动浏览区左边框和历史区上边框；关闭时保留面板大小。") }} </p>
          <p v-if="settingsSaveError || storageError" role="alert">{{ settingsSaveError || storageError }}</p>
          <p v-else-if="settingsSaveStatus" role="status">{{ settingsSaveStatus }}</p>
        </section>
        <section class="settings-section"><h3> {{ t("数据与离线") }} </h3>
          <p v-if="catalogOpening" role="status"> {{ t("正在读取当前数据集…") }} </p>
          <p v-else-if="catalogError" role="alert">{{ catalogError }} <button type="button" @click="emit('retry-catalog')"> {{ t("重试") }} </button></p>
          <p v-else-if="catalog">{{ catalog.offline ? t("正在使用离线副本") : t("当前数据已就绪") }} · {{ catalog.manifest.counts.items.toLocaleString() }} {{ t("项物品 ·") }} {{ catalog.manifest.counts.fluids.toLocaleString() }} {{ t("项流体") }} </p>
          <p>{{ localStatus }}</p><p v-if="localError" role="alert">{{ localError }}</p>
          <RouterLink :to="{ name: 'offline', query }" @click="close"> {{ t("管理离线资料与保存完整副本") }} </RouterLink>
          <details v-if="catalog"><summary> {{ t("数据详情") }} </summary><p class="dataset-id">{{ catalog.manifest.id }}</p><p> {{ t("格式") }} {{ catalog.manifest.revision }} · {{ catalog.manifest.files.length }} {{ t("个文件 ·") }} {{ catalog.manifest.scope === 'selection' ? t("选定范围") : t("完整范围") }}</p></details>
        </section>
        <section class="settings-section"><h3> {{ t("个人数据") }} </h3>
          <p>{{ historyCount }} {{ t("项浏览历史") }} <button type="button" @click="emit('clear-history')"> {{ t("清空浏览历史") }} </button></p>
          <PersonalBackup :item-size="itemSize" @update:item-size="emit('update:itemSize', $event)" />
        </section>
        <details class="settings-section"><summary> {{ t("高级维护") }} </summary><p>{{ atlasResidentStatus || t("当前使用 Catalog 图集") }}</p>
          <p> {{ t("浏览图集按需读取，缓存自动限制内存。") }} </p>
          <button type="button" @click="inspect"> {{ t("检查离线副本状态") }} </button>
        </details>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.workspace-settings-toggle { display: none; }
.settings-modal { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; background: #0009; padding: 16px; }
.settings-panel { width: min(640px, 100%); max-height: 90vh; overflow: auto; background: #101722; color: #dce8f6; padding: 20px; border: 1px solid #34485b; border-radius: 8px; box-sizing: border-box; }
header { display: flex; justify-content: space-between; align-items: center; } h2 { font-size: 18px; } h3 { font-size: 14px; margin-bottom: 10px; }
.settings-section { padding-block: 16px; border-bottom: 1px solid #223041; font-size: 12px; }
label { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block: 8px; } input[type=range] { width: 100%; accent-color: #8fd8ff; }
button { padding: 5px 9px; border: 1px solid #34485b; border-radius: 4px; cursor: pointer; margin: 4px 6px 4px 0; }
button:hover, a { color: #8fd8ff; } button:disabled { opacity: .5; cursor: default; }
summary { cursor: pointer; } .subtle { color: #a0b0c2; } .dataset-id { overflow-wrap: anywhere; font-family: monospace; }
p[role=alert] { color: #fda4af; } a { display: inline-block; padding-block: 6px; }
</style>
