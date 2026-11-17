import {errorMessage} from '../i18n/errors.ts';
import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Catalog } from '../catalog/client.ts';
import { catalogSession } from './catalog-session.ts';
import {uiLanguage} from '../i18n/index.ts';

/** Pages borrow the workspace snapshot and cancel only their own requests. */
export function useCatalog(snapshot: Readonly<Ref<string>>) {
  const route = useRoute(), router = useRouter();
  const catalog = shallowRef<Catalog | null>(null), opening = ref(false), error = ref(''), offline = ref(false);
  let controller: AbortController | null = null;
  let unsubscribe: (() => void) | null = null;
  async function open(id = snapshot.value): Promise<void> {
    controller?.abort(); unsubscribe?.();
    const request = new AbortController(); controller = request;
    catalog.value = null; opening.value = true; error.value = ''; offline.value = false;
    try {
      const session = await catalogSession.open(id, route.query.offline === '1', request.signal, typeof route.query.lang==='string'?route.query.lang:'');
      if (request.signal.aborted) return;
      const source = (): void => {
        if (catalog.value !== session || request.signal.aborted) return;
        offline.value = session.offline;
        if (route.query.catalog !== session.manifest.id || (session.offline && route.query.offline !== '1')) {
          void router.replace({ query: { ...route.query, catalog: session.manifest.id, ...(session.locale?{lang:session.locale}:{}), ...(session.offline ? { offline: '1' } : {}) } });
        }
      };
      session.addEventListener('source', source);
      unsubscribe = () => session.removeEventListener('source', source);
      catalog.value = session;
      source();
    } catch (failure) {
      if (!request.signal.aborted) error.value = errorMessage(failure,'数据集加载失败');
    } finally { if (!request.signal.aborted) opening.value = false; }
  }
  watch([snapshot, () => route.query.offline,()=>route.query.lang], ([id, mode]) => {
    if (!catalog.value || !id || id !== catalog.value.manifest.id || (mode === '1') !== catalog.value.offline || (uiLanguage(route.query.lang)&&uiLanguage(route.query.lang)!==catalog.value.locale)) void open(id);
  }, { immediate: true });
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('neonei.catalog');
  if (channel) channel.onmessage = event => {
    if (event.data?.kind === 'removed' && catalog.value?.offline && event.data.catalog === catalog.value.manifest.id) { catalogSession.invalidate(event.data.catalog); void open(); }
  };
  onScopeDispose(() => { controller?.abort(); unsubscribe?.(); channel?.close(); });
  return { catalog, opening, error, offline, open };
}
