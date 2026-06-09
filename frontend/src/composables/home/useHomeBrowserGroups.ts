import { computed, ref, type Ref } from "vue";
import type { BrowserGridEntry, BrowserVariantGroup, Item } from "../../services/api";

export function useHomeBrowserGroups(options: {
  browserGridEntries: Ref<BrowserGridEntry[]>;
  expandedGroupFacetFilters: Ref<Record<string, string>>;
  setExpandedGroups: (groups: string[]) => void;
  setExpandedGroupFacetFilter: (groupKey: string, value: string) => void;
  openUsageRecipes: (item: Item) => void;
}) {
  const expandedBrowserGroups = ref<Set<string>>(new Set());
  const nativeRuntimeGroups = ref<Map<string, BrowserVariantGroup>>(new Map());

  const toggleBrowserGroup = (groupKey: string) => {
    const next = new Set(expandedBrowserGroups.value);
    if (next.has(groupKey)) {
      next.delete(groupKey);
    } else {
      next.add(groupKey);
    }
    expandedBrowserGroups.value = next;
    options.setExpandedGroups(Array.from(next));
  };

  const expandedGroupFilterPanels = computed<BrowserVariantGroup[]>(() => {
    const seen = new Set<string>();
    const entryGroups = options.browserGridEntries.value
      .filter((entry) => entry.kind === "group-header")
      .map((entry) => (entry as { kind: "group-header"; group: BrowserVariantGroup }).group);
    const nativeGroups = Array.from(nativeRuntimeGroups.value.values())
      .filter((group) => expandedBrowserGroups.value.has(group.key));
    return [...nativeGroups, ...entryGroups]
      .filter((group) => {
        const key = `${group.key ?? ""}`.trim();
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  });

  const hasExpandedGroupFacetFilters = computed(() =>
    Object.keys(options.expandedGroupFacetFilters.value ?? {}).length > 0,
  );

  const handleExpandedGroupFacetInput = (groupKey: string, event: Event) => {
    options.setExpandedGroupFacetFilter(groupKey, (event.target as HTMLInputElement | null)?.value ?? "");
  };

  const handleBrowserGroupClick = (group: BrowserVariantGroup) => {
    if (!group.expandable) {
      return;
    }
    nativeRuntimeGroups.value = new Map(nativeRuntimeGroups.value).set(group.key, group);
    toggleBrowserGroup(group.key);
  };

  const handleBrowserGroupContextMenu = (group: BrowserVariantGroup, event?: MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    options.openUsageRecipes(group.representative);
  };

  return {
    expandedBrowserGroups,
    expandedGroupFilterPanels,
    hasExpandedGroupFacetFilters,
    handleExpandedGroupFacetInput,
    handleBrowserGroupClick,
    handleBrowserGroupContextMenu,
  };
}
