import { computed, type Ref } from 'vue';
import type { Item } from '../services/api';
import { usePreferences } from '../state/preferences.ts';

export function useFavorites(catalog: Ref<string>) {
  const { preferences, storageError, bookmark } = usePreferences();
  const items = computed<Item[]>(() => preferences.bookmarks
    .filter(row => row.catalog === catalog.value)
    .map(row => ({ itemId: row.id, localizedName: row.name, internalName: '', modId: '' })));
  const ids = computed(() => new Set(items.value.map(item => item.itemId)));

  function toggle(item: Item): void {
    if (!/^[a-f0-9]{64}$/.test(catalog.value) || !/^(item|fluid)_[a-f0-9]{64}$/.test(item.itemId)) return;
    bookmark(catalog.value, { id: item.itemId, kind: item.itemId.startsWith('fluid_') ? 'fluid' : 'item', name: item.localizedName });
  }

  return { items, ids, storageError, toggle };
}
