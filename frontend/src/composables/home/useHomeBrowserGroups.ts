import { computed, ref, watch, type Ref } from "vue";
import { api, type BrowserGridEntry, type BrowserVariantGroup, type Item } from "../../services/api";

type BrowserGroupGridEntry = Exclude<BrowserGridEntry, { kind: "item" }>;

const isBrowserGroupEntry = (entry: BrowserGridEntry): entry is BrowserGroupGridEntry => {
  return entry.kind === "group-collapsed" || entry.kind === "group-header";
};

const collectGroupsFromEntries = (entries: BrowserGridEntry[]): BrowserVariantGroup[] => {
  const seen = new Set<string>();
  const groups: BrowserVariantGroup[] = [];
  for (const entry of entries) {
    if (!isBrowserGroupEntry(entry)) {
      continue;
    }
    const key = `${entry.group.key ?? ""}`.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    groups.push(entry.group);
  }
  return groups;
};

export function useHomeBrowserGroups(options: {
  browserGridEntries: Ref<BrowserGridEntry[]>;
  expandedGroupKeys: Ref<string[]>;
  expandedGroupFacetFilters: Ref<Record<string, string>>;
  searchQuery: Ref<string>;
  selectedMod: Ref<string>;
  includeHiddenItems?: Ref<boolean>;
  setExpandedGroups: (groups: string[]) => void;
  setExpandedGroupFacetFilter: (groupKey: string, value: string) => void;
  openUsageRecipes: (item: Item) => void;
}) {
  const expandedBrowserGroups = ref<Set<string>>(new Set(options.expandedGroupKeys.value));
  const nativeRuntimeGroups = ref<Map<string, BrowserVariantGroup>>(new Map());
  const knownBrowserGroups = ref<Map<string, BrowserVariantGroup>>(new Map());
  const loadedGroupCatalogScopeKey = ref<string | null>(null);
  const groupToggleBusy = ref(false);

  const currentGroupScopeKey = computed(() => {
    const search = `${options.searchQuery.value ?? ""}`.trim();
    const modId = options.selectedMod.value === "all" ? "" : `${options.selectedMod.value ?? ""}`;
    const includeHidden = Boolean(options.includeHiddenItems?.value);
    return JSON.stringify({ search, modId, includeHidden });
  });

  const rememberGroups = (groups: BrowserVariantGroup[]) => {
    if (groups.length === 0) {
      return;
    }
    const next = new Map(knownBrowserGroups.value);
    for (const group of groups) {
      const key = `${group.key ?? ""}`.trim();
      if (key) {
        next.set(key, group);
      }
    }
    knownBrowserGroups.value = next;
  };

  const replaceKnownGroups = (groups: BrowserVariantGroup[]) => {
    const next = new Map<string, BrowserVariantGroup>();
    for (const group of groups) {
      const key = `${group.key ?? ""}`.trim();
      if (key) {
        next.set(key, group);
      }
    }
    knownBrowserGroups.value = next;
  };

  watch(
    () => options.expandedGroupKeys.value,
    (keys) => {
      expandedBrowserGroups.value = new Set(keys);
    },
    { deep: true }
  );

  watch(
    options.browserGridEntries,
    (entries) => {
      rememberGroups(collectGroupsFromEntries(entries));
    },
    { immediate: true }
  );

  watch(currentGroupScopeKey, () => {
    knownBrowserGroups.value = new Map();
    nativeRuntimeGroups.value = new Map();
    loadedGroupCatalogScopeKey.value = null;
  });

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

  const loadAllGroupsForCurrentScope = async (): Promise<{
    scopeKey: string;
    groups: BrowserVariantGroup[];
  }> => {
    const scopeKey = currentGroupScopeKey.value;
    const search = `${options.searchQuery.value ?? ""}`.trim();
    const modId = options.selectedMod.value === "all" ? undefined : options.selectedMod.value;
    const includeHidden = Boolean(options.includeHiddenItems?.value);
    const catalog = search
      ? await api.getBrowserSearchCatalog({ search, modId, includeHidden })
      : await api.getBrowserDefaultCatalog({ modId, includeHidden });
    const groups = collectGroupsFromEntries(catalog.data);
    return { scopeKey, groups };
  };

  const toggleAllGroups = async () => {
    if (groupToggleBusy.value) {
      return;
    }
    groupToggleBusy.value = true;
    try {
      const { scopeKey, groups } = await loadAllGroupsForCurrentScope();
      if (scopeKey !== currentGroupScopeKey.value) {
        return;
      }
      replaceKnownGroups(groups);
      loadedGroupCatalogScopeKey.value = scopeKey;
      if (groups.length === 0) {
        return;
      }

      const allExpanded = groups.every((group) => expandedBrowserGroups.value.has(group.key));
      if (allExpanded) {
        const groupKeys = new Set(groups.map((group) => group.key));
        const nextNativeGroups = new Map(nativeRuntimeGroups.value);
        groupKeys.forEach((key) => nextNativeGroups.delete(key));
        const nextGroupKeys = Array.from(expandedBrowserGroups.value).filter((key) => !groupKeys.has(key));
        nativeRuntimeGroups.value = nextNativeGroups;
        expandedBrowserGroups.value = new Set(nextGroupKeys);
        options.setExpandedGroups(nextGroupKeys);
        return;
      }

      const nextNativeGroups = new Map<string, BrowserVariantGroup>();
      const nextGroupKeys: string[] = [];
      for (const group of groups) {
        const key = `${group.key ?? ""}`.trim();
        if (!key) {
          continue;
        }
        nextGroupKeys.push(key);
        nextNativeGroups.set(key, group);
      }

      nativeRuntimeGroups.value = nextNativeGroups;
      expandedBrowserGroups.value = new Set(nextGroupKeys);
      options.setExpandedGroups(nextGroupKeys);
    } finally {
      groupToggleBusy.value = false;
    }
  };

  const expandedGroupFilterPanels = computed<BrowserVariantGroup[]>(() => {
    const seen = new Set<string>();
    const entryGroups = options.browserGridEntries.value
      .filter(isBrowserGroupEntry)
      .filter((entry) => entry.kind === "group-header")
      .map((entry) => entry.group);
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

  const hasBrowserGroups = computed(() => {
    if (knownBrowserGroups.value.size > 0 || collectGroupsFromEntries(options.browserGridEntries.value).length > 0) {
      return true;
    }
    return loadedGroupCatalogScopeKey.value !== currentGroupScopeKey.value;
  });

  const allBrowserGroupsExpanded = computed(() => {
    const knownKeys = Array.from(knownBrowserGroups.value.keys());
    if (loadedGroupCatalogScopeKey.value !== currentGroupScopeKey.value || knownKeys.length === 0) {
      return false;
    }
    const expandedSet = expandedBrowserGroups.value;
    return knownKeys.every((key) => expandedSet.has(key));
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
    rememberGroups([group]);
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
    hasBrowserGroups,
    allBrowserGroupsExpanded,
    groupToggleBusy,
    expandedGroupFilterPanels,
    hasExpandedGroupFacetFilters,
    handleExpandedGroupFacetInput,
    handleBrowserGroupClick,
    handleBrowserGroupContextMenu,
    toggleAllGroups,
  };
}
