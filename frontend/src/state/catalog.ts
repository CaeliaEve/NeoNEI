import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Catalog } from '../catalog/client.ts';

/** A page owns one snapshot and cancels every request and texture when it changes. */
export function useCatalog(snapshot: Readonly<Ref<string>>) {
  const route = useRoute(), router = useRouter();
  const catalog = shallowRef<Catalog | null>(null), opening = ref(false), error = ref(''), offline = ref(false);
  let controller: AbortController | null = null;
  let unsubscribe: (() => void) | null = null;
  async function open(id = snapshot.value): Promise<void> {
    controller?.abort(); unsubscribe?.(); catalog.value?.close();
    const request = new AbortController(); controller = request;
    catalog.value = null; opening.value = true; error.value = ''; offline.value = false;
    try {
      const session = await Catalog.open(id, { signal: request.signal, offline: route.query.offline === '1' });
      if (request.signal.aborted) { session.close(); return; }
      const source = (): void => {
        if (catalog.value !== session || request.signal.aborted) return;
        offline.value = session.offline;
        if (session.offline && (route.query.offline !== '1' || route.query.catalog !== session.manifest.id)) {
          void router.replace({ query: { ...route.query, catalog: session.manifest.id, offline: '1' } });
        }
      };
      session.addEventListener('source', source);
      unsubscribe = () => session.removeEventListener('source', source);
      catalog.value = session;
      source();
    } catch (failure) {
      if (!request.signal.aborted) error.value = failure instanceof Error ? failure.message : '数据集加载失败';
    } finally { if (!request.signal.aborted) opening.value = false; }
  }
  watch([snapshot, () => route.query.offline], ([id, mode]) => {
    if (!catalog.value || !id || id !== catalog.value.manifest.id || (mode === '1') !== catalog.value.offline) void open(id);
  }, { immediate: true });
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('neonei.catalog');
  if (channel) channel.onmessage = event => {
    if (event.data?.kind === 'removed' && catalog.value?.offline && event.data.catalog === catalog.value.manifest.id) void open();
  };
  onScopeDispose(() => { controller?.abort(); unsubscribe?.(); catalog.value?.close(); channel?.close(); });
  return { catalog, opening, error, offline, open };
}
