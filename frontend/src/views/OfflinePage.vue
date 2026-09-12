<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { Manifest } from '@elysium/contracts';
import { formats } from '@elysium/contracts';
import { checkManifest, limits } from '@neonei/catalog/source';
import { request } from '../catalog/transport.ts';
import { available, saved, save, remove, type Progress, type Saved } from '../offline/client.ts';
import { prepare } from '../offline/shell.ts';
import { useRequest } from '../state/request.ts';
import SiteHeader from '../components/SiteHeader.vue';

const route = useRoute();
const supported = available();
const snapshot = computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : '');
const { value: remote, loading: reading, error: remoteError, run: read } = useRequest<Manifest>();
const { value: copies, loading: listing, error: listError, run: list } = useRequest<Saved[]>();
const { error: actionError, loading: working, run: act, cancel } = useRequest<unknown>();
const progress = ref<Progress | null>(null), active = ref(''), phase = ref(''), message = ref('');
const quota = ref<StorageEstimate | null>(null), persistent = ref(false);
let operation = 0;
const selected = computed(() => copies.value?.find(row => row.id === remote.value?.id));
const total = computed(() => remote.value?.files.reduce((sum, file) => sum + file.bytes, 0) ?? 0);

function size(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
  return (bytes / 1024 ** unit).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' ' + ['B', 'KiB', 'MiB', 'GiB'][unit];
}
function refresh(): void {
  if (supported) void list(signal => saved(signal));
}
function load(): void {
  void read(async signal => {
    const id = snapshot.value;
    if (id && !/^[a-f0-9]{64}$/.test(id)) throw new Error('数据集链接无效');
    return checkManifest(await request('/api/catalog' + (id ? '/' + id : ''), signal, limits.manifest), id);
  });
}
async function storage(): Promise<void> {
  if (!navigator.storage) return;
  try { quota.value = await navigator.storage.estimate(); persistent.value = await navigator.storage.persisted(); }
  catch { /* Storage estimates are optional; file transactions report actual failures. */ }
}
async function download(id: string): Promise<void> {
  const sequence = ++operation;
  active.value = id; progress.value = null; message.value = ''; phase.value = '正在保存离线页面…';
  await act(async signal => {
    if (navigator.storage?.persist) {
      try { persistent.value = await navigator.storage.persist(); } catch { /* Optional persistence request. */ }
    }
    signal.throwIfAborted();
    await prepare(signal);
    phase.value = '正在下载并校验资料…';
    const result = await save(id, signal, value => { progress.value = value; });
    if (!signal.aborted) message.value = '完整副本已保存，可以断网浏览与搜索。';
    return result;
  });
  if (sequence !== operation) return;
  active.value = ''; phase.value = ''; refresh(); void storage();
}
function pause(): void {
  cancel(); message.value = '下载已暂停，已保存的文件可以继续使用。';
}
async function discard(id: string): Promise<void> {
  const sequence = ++operation;
  active.value = id; message.value = ''; phase.value = '正在移除本地副本…';
  await act(signal => remove(id, signal));
  if (sequence !== operation) return;
  active.value = ''; phase.value = ''; refresh(); void storage();
}
watch(snapshot, load, { immediate: true });
refresh(); void storage();
const channel = supported && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('neonei.catalog') : null;
if (channel) channel.onmessage = refresh;
window.addEventListener('online', load);
onScopeDispose(() => { channel?.close(); window.removeEventListener('online', load); });
</script>

<template>
  <div class="catalog-page">
    <SiteHeader :catalog="snapshot" :offline="route.query.offline === '1'" />
    <main class="offline-page">
      <header class="offline-heading"><span class="eyebrow">OFFLINE LIBRARY</span><h1>离线资料库</h1>
        <p>保存一份完整资料，在断网时搜索物品、翻阅配方，查看纹理与多方块结构。</p></header>
      <p v-if="!supported" class="notice" role="alert">此浏览器无法保存离线资料。请通过 HTTPS 或 localhost 使用支持本地存储的浏览器。</p>
      <section class="panel offline-section" aria-label="可下载资料">
        <header class="panel-heading"><h2>{{ snapshot ? '选定资料' : '当前发布' }}</h2><div class="offline-actions">
          <RouterLink v-if="snapshot" :to="{ name: 'offline' }">查看当前发布</RouterLink><button type="button" :disabled="reading || working" @click="load">刷新</button></div></header>
        <p v-if="reading" role="status">正在读取可下载资料…</p>
        <p v-else-if="remoteError" class="inline-error" role="alert">{{ remoteError }}。已保存的副本仍可从下方打开。</p>
        <template v-else-if="remote">
          <code class="offline-id">{{ remote.id }}</code>
          <p>{{ ((remote.counts.items ?? 0) + (remote.counts.fluids ?? 0)).toLocaleString('zh-CN') }} 个物品与流体 · {{ (remote.counts.recipes ?? 0).toLocaleString('zh-CN') }} 个配方 · {{ size(total) }}</p>
          <p v-if="remote.scope === 'selection'" class="notice">这份资料来自选定范围的导出；离线副本包含其中的全部文件。</p>
          <div class="offline-actions"><button type="button" :disabled="!supported || working || selected?.state === 'ready'" @click="download(remote.id)">{{ selected?.state === 'ready' ? '已完整保存' : selected ? '继续下载' : '保存完整资料' }}</button></div>
        </template>
      </section>

      <section v-if="working" class="panel offline-progress" aria-label="保存进度" aria-live="polite">
        <p>{{ phase }} <code>{{ active.slice(0, 12) }}</code></p>
        <template v-if="progress"><progress :value="progress.bytes" :max="progress.totalBytes || 1" aria-label="下载进度" />
          <p>{{ size(progress.bytes) }} / {{ size(progress.totalBytes) }} · {{ progress.files }} / {{ progress.totalFiles }} 个文件</p></template>
        <button v-if="phase !== '正在移除本地副本…'" type="button" @click="pause">暂停下载</button>
      </section>
      <p v-if="message" class="offline-message" role="status">{{ message }}</p>
      <p v-if="actionError" class="notice" role="alert">{{ actionError }}。已下载的文件保留，可稍后继续。</p>

      <section class="offline-copies" aria-label="本地资料">
        <header class="offline-list-heading"><h2>本地副本</h2><span>{{ copies?.length ?? 0 }} / 4</span></header>
        <p v-if="listError" class="notice" role="alert">{{ listError }} <button type="button" @click="refresh">重试</button></p>
        <p v-else-if="listing && !copies" role="status">正在读取本地副本…</p>
        <p v-else-if="!copies?.length" class="offline-empty">尚未保存资料。完成下载后，无需预先访问每个页面。</p>
        <article v-for="row in copies" :key="row.id" class="panel offline-copy" :data-state="row.state" :aria-label="'资料 ' + row.id.slice(0, 12)">
          <header><strong>{{ row.revision !== formats.catalog.revision ? '格式已更新，需要下载新的资料' : row.state === 'ready' ? '可离线浏览' : '尚未完成' }}</strong><span>{{ size(row.bytes) }} / {{ size(row.totalBytes) }}</span></header>
          <code class="offline-id">{{ row.id }}</code>
          <p>{{ row.items.toLocaleString('zh-CN') }} 个物品 · {{ row.recipes.toLocaleString('zh-CN') }} 个配方 · {{ row.files }} / {{ row.totalFiles }} 个文件</p>
          <p v-if="row.saved">保存于 {{ new Date(row.saved).toLocaleString('zh-CN') }}</p>
          <div class="offline-actions">
            <RouterLink v-if="row.state === 'ready' && row.revision === formats.catalog.revision" class="offline-open" :to="{ name: 'home', query: { catalog: row.id, offline: '1' } }">离线打开</RouterLink>
            <button v-if="row.revision === formats.catalog.revision" type="button" :disabled="working" @click="download(row.id)">{{ row.state === 'ready' ? '校验与修复' : '继续下载' }}</button>
            <button type="button" class="quiet" :disabled="working" @click="discard(row.id)">移除副本</button>
          </div>
        </article>
      </section>
      <footer class="offline-storage"><p>副本保存在当前浏览器。{{ persistent ? '已启用持久存储。' : '浏览器清理网站数据后，需要重新下载。' }}</p>
        <p v-if="quota?.quota !== undefined && quota.usage !== undefined">此网站已用 {{ size(quota.usage) }}，浏览器配额 {{ size(quota.quota) }}。下载时还需预留校验空间。</p></footer>
    </main>
  </div>
</template>
