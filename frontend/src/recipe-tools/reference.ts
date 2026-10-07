import { computed, shallowReactive, watch } from 'vue';
import type { Catalog, Detail } from '../catalog/client.ts';
import { useRequest } from '../state/request.ts';

// Remember IDs only. Closed tools hold neither recipe records nor drawing resources.
const references = shallowReactive(new Map<string, string>());

export function useRecipeReference(catalog: () => Catalog, current: () => Detail, enabled: () => boolean) {
  const request = useRequest<Detail>();
  const id = computed(() => references.get(catalog().manifest.id) ?? '');
  function reload(): void {
    request.clear();
    if (enabled() && id.value && id.value !== current().recipe.id) {
      const active = catalog(), recipeId = id.value;
      void request.run(signal => active.recipe(recipeId, signal));
    }
  }
  watch([catalog, id, () => current().recipe.id, enabled], reload, { immediate: true });
  const detail = computed(() => !enabled() || !id.value ? null : id.value === current().recipe.id ? current() : request.value.value);
  return {
    id, detail, loading: request.loading, error: request.error, reload,
    remember: () => references.set(catalog().manifest.id, current().recipe.id),
    forget: () => references.delete(catalog().manifest.id),
  };
}
