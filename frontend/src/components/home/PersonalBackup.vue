<script setup lang="ts">
import { t, language } from "../../i18n/index.ts";
import { computed, ref } from 'vue';
import { usePreferences } from '../../state/preferences.ts';
import { MAX_BACKUP_BYTES, mergePersonalBookmarks, parsePersonalBackup, serializePersonalBackup, type PersonalBackup } from '../../state/personal-backup.ts';

const props = defineProps<{ itemSize: number }>();
const emit = defineEmits<{ 'update:itemSize': [value: number] }>();
const { preferences, applyPersonalBackup } = usePreferences();
const fileInput = ref<HTMLInputElement | null>(null);
const pending = ref<PersonalBackup | null>(null);
const filename = ref('');
const reading = ref(false);
const restoreSettings = ref(true);
const mergeBookmarks = ref(true);
const error = ref('');
const status = ref('');
let readRevision = 0;
const preview = computed(() => {
  if (!pending.value) return null;
  try {
    const merged = mergeBookmarks.value ? mergePersonalBookmarks(preferences.bookmarks, pending.value.bookmarks) : preferences.bookmarks;
    return { added: merged.length - preferences.bookmarks.length, total: merged.length, error: '' };
  } catch (cause) {
    return { added: 0, total: preferences.bookmarks.length, error: message(cause) };
  }
});
const catalogCount = computed(() => new Set(pending.value?.bookmarks.map(row => row.catalog)).size);
function message(cause: unknown): string { return cause instanceof Error ? cause.message : t("操作失败，请重试。"); }

function download() {
  error.value = '';
  status.value = '';
  let url = '';
  try {
    const json = serializePersonalBackup({ ...preferences, itemSize: props.itemSize }, preferences.bookmarks);
    url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `neonei-personal-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    status.value = t("已生成备份：{0} 项收藏与当前设置。", preferences.bookmarks.length);
  } catch (cause) { error.value = message(cause); }
  finally { if (url) window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
async function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  const revision = ++readRevision;
  pending.value = null;
  error.value = '';
  status.value = '';
  filename.value = file.name;
  reading.value = true;
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error(t("备份文件大小超过 8 MB，无法导入。"));
    const text = await file.text();
    if (revision !== readRevision) return;
    pending.value = parsePersonalBackup(text);
    restoreSettings.value = true;
    mergeBookmarks.value = true;
  } catch (cause) { if (revision === readRevision) error.value = message(cause); }
  finally { if (revision === readRevision) reading.value = false; }
}
function cancel() {
  ++readRevision;
  pending.value = null;
  reading.value = false;
  error.value = '';
  status.value = '';
}
function apply() {
  if (!pending.value || preview.value?.error) return;
  error.value = '';
  status.value = '';
  try {
    const added = preview.value?.added ?? 0;
    applyPersonalBackup(pending.value, { settings: restoreSettings.value, bookmarks: mergeBookmarks.value });
    if (restoreSettings.value) emit('update:itemSize', pending.value.settings.itemSize);
    status.value = t("已应用{0}；{1}。", restoreSettings.value ? t("并保存设置") : '', mergeBookmarks.value ? t("新增 {0} 项收藏，原收藏已保留", added) : t("原收藏已保留"));
    pending.value = null;
  } catch (cause) { error.value = message(cause); }
}
</script>

<template>
  <div class="personal-backup min-w-0" :aria-label="t('收藏与设置备份')">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2.5">
          <span class="font-mono text-[9px] text-cyan-400/70 border border-cyan-400/20 px-1.5 py-0.5 rounded">06</span>
          <h3 class="text-sm font-medium text-slate-200"> {{ t("收藏与设置备份") }} </h3>
        </div>
        <p class="text-xs text-slate-400 mt-1"> {{ t("本地 JSON ·") }} {{ preferences.bookmarks.length }} {{ t("/500 项收藏 · 不含浏览历史与目录数据") }} </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="backup-button" @click="download"> {{ t("导出 JSON") }} </button>
        <button type="button" class="backup-button" @click="fileInput?.click()"> {{ t("选择备份文件") }} </button>
        <input ref="fileInput" type="file" class="sr-only" accept="application/json,.json" :aria-label="t('选择 JSON 备份')" @change="chooseFile" />
      </div>
    </div>
    <p v-if="reading" role="status" class="mt-3 text-xs text-slate-300"> {{ t("正在校验文件…") }} </p>
    <div v-if="pending && preview" class="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-950/10 p-3 text-xs text-slate-300" :aria-label="t('备份导入预览')">
      <p class="break-all text-slate-100"> {{ t("导入预览 ·") }} {{ filename }}</p>
      <p class="mt-1 leading-relaxed"> {{ t("文件包含") }} {{ pending.bookmarks.length }} {{ t("项收藏，来自") }} {{ catalogCount }} {{ t("个目录；按目录分别保存。") }} </p>
      <div class="my-3 flex flex-wrap gap-x-5 gap-y-2">
        <label class="flex items-center gap-2"><input v-model="mergeBookmarks" type="checkbox" class="accent-cyan-400" /> {{ t("合并收藏（保留现有条目）") }} </label>
        <label class="flex items-center gap-2"><input v-model="restoreSettings" type="checkbox" class="accent-cyan-400" /> {{ t("恢复设置") }} </label>
      </div>
      <p v-if="mergeBookmarks && !preview.error" class="leading-relaxed"> {{ t("将新增") }} {{ preview.added }} {{ t("项，合并后共") }} {{ preview.total }} {{ t("/500 项；重复条目保留现有名称。") }} </p>
      <p v-if="restoreSettings" class="mt-1 leading-relaxed"> {{ t("主页图标") }} {{ itemSize }} → {{ pending.settings.itemSize }} {{ t("px；目录图标") }} {{ pending.settings.size }} {{ t("px，每页") }} {{ pending.settings.limit }} {{ t("项，配方缩放") }} {{ pending.settings.scale }} {{ t("×；物品动画") }} {{ pending.settings.animate ? t("开启") : t("关闭") }} {{ t("，分组") }} {{ pending.settings.collapsed ? t("折叠") : t("展开") }}。</p>
      <p v-if="preview.error" role="alert" class="mt-2 text-rose-300">{{ preview.error }}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="backup-button backup-button--primary" :disabled="!!preview.error || (!restoreSettings && !mergeBookmarks)" @click="apply"> {{ t("应用导入") }} </button>
        <button type="button" class="backup-button" @click="cancel"> {{ t("取消") }} </button>
      </div>
    </div>
    <p v-if="error" role="alert" class="mt-3 text-xs leading-relaxed text-rose-300">{{ error }}</p>
    <p v-else-if="status" role="status" class="mt-3 text-xs leading-relaxed text-emerald-300">{{ status }}</p>
  </div>
</template>

<style scoped>
.backup-button { border: 1px solid rgb(148 163 184 / .2); border-radius: 8px; padding: 7px 12px; background: rgb(255 255 255 / .03); color: #cbd5e1; font-size: 12px; }
.backup-button:hover { border-color: rgb(34 211 238 / .5); color: #fff; }
.backup-button:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
.backup-button--primary { background: #cbd5e1; color: #0f172a; }
.backup-button--primary:hover { background: #a5f3fc; color: #0f172a; }
.backup-button:disabled { opacity: .4; cursor: not-allowed; }
</style>
