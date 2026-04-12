import { ref, watch, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
import {
  buildRecipeRouteQuery,
  parseNonNegativeInt,
  parseRecipeQuery,
  resolveRecipeTab,
  serializeRecipeQuery,
  type RecipeTab,
  type RecipeQuerySnapshot,
} from '../domain/recipeQuery';

type RouteSyncState = {
  itemId: string;
  tab: RecipeTab;
  machineIndex: number;
  pageIndex: number;
  searchQuery: string;
  recipeId: string | null;
};

type UseRecipeRouteSyncOptions = {
  route: RouteLocationNormalizedLoaded;
  router: Router;
  itemId: Ref<string | undefined>;
  currentTab: Ref<RecipeTab>;
  setCurrentTab: (tab: RecipeTab) => void;
  recipeSearchQuery: Ref<string>;
  selectedMachineIndex: Ref<number>;
  currentPage: Ref<number>;
  currentRecipeId: Ref<string | null>;
  machineCategoryCount: Ref<number>;
  machineCategoryNames?: Ref<string[]>;
  totalPages: Ref<number>;
  currentCategoryPageCount: Ref<number>;
  selectRecipeById: (recipeId: string) => boolean;
  clearSearchOnMissingQuery?: boolean;
  onAfterStateSync?: (state: RouteSyncState) => void | Promise<void>;
};

export function useRecipeRouteSync(options: UseRecipeRouteSyncOptions): void {
  const pendingRecipeIdFromQuery = ref<string | null>(null);
  const pendingMachineIndexFromQuery = ref<number | null>(null);
  const pendingMachineNameFromQuery = ref<string | null>(null);
  const pendingPageFromQuery = ref<number | null>(null);
  const applyingSnapshot = ref(false);
  const lastAppliedRouteSnapshot = ref('');
  const lastWrittenSnapshot = ref('');
  const skipNextRouteApply = ref(false);

  const applyRouteSnapshot = () => {
    const snapshot = parseRecipeQuery(options.route.query);
    const resolvedTab = resolveRecipeTab(snapshot);

    if (resolvedTab === 'usedIn' || resolvedTab === 'producedBy') {
      options.setCurrentTab(resolvedTab);
    }

    const routeQ = snapshot.q;
    if (typeof routeQ === 'string') {
      if (routeQ !== options.recipeSearchQuery.value) {
        options.recipeSearchQuery.value = routeQ;
      }
    } else if (options.clearSearchOnMissingQuery && options.recipeSearchQuery.value) {
      options.recipeSearchQuery.value = '';
    }

    pendingMachineIndexFromQuery.value = parseNonNegativeInt(snapshot.machine, 0);
    pendingMachineNameFromQuery.value = snapshot.machineName || null;
    pendingPageFromQuery.value = parseNonNegativeInt(snapshot.page, 0);
    pendingRecipeIdFromQuery.value = snapshot.recipeId || null;
  };

  watch(
    () => [options.itemId.value, options.route.query] as const,
    () => {
      const routeSnapshot = parseRecipeQuery(options.route.query);
      const routeSignature = serializeRecipeQuery(routeSnapshot);
      if (routeSignature === lastAppliedRouteSnapshot.value) return;
      if (skipNextRouteApply.value && routeSignature === lastWrittenSnapshot.value) {
        skipNextRouteApply.value = false;
        lastAppliedRouteSnapshot.value = routeSignature;
        return;
      }

      applyingSnapshot.value = true;
      applyRouteSnapshot();
      applyingSnapshot.value = false;

      lastAppliedRouteSnapshot.value = routeSignature;
    },
    { immediate: true },
  );

  watch(
    () =>
      [
        options.itemId.value,
        options.currentTab.value,
        options.selectedMachineIndex.value,
        options.currentPage.value,
        options.recipeSearchQuery.value,
        options.currentRecipeId.value,
      ] as const,
    async (
      [currentItemId, tab, machineIndex, pageIndex, searchQ, recipeId]:
      readonly [string | undefined, RecipeTab, number, number, string, string | null],
    ) => {
      if (!currentItemId || applyingSnapshot.value) return;
      if (
        pendingMachineIndexFromQuery.value !== null
        || pendingMachineNameFromQuery.value !== null
        || pendingPageFromQuery.value !== null
        || pendingRecipeIdFromQuery.value !== null
      ) {
        return;
      }

      const currentSnapshot = parseRecipeQuery(options.route.query);
      const routeTab = resolveRecipeTab(currentSnapshot);
      const routeMachine = parseNonNegativeInt(currentSnapshot.machine, 0);
      const routePage = parseNonNegativeInt(currentSnapshot.page, 0);
      const navigationChanged =
        routeTab !== tab || routeMachine !== machineIndex || routePage !== pageIndex;
      const nextSnapshot: RecipeQuerySnapshot = {
        tab,
        mode: tab === 'usedIn' ? 'u' : 'r',
        machine: String(machineIndex),
        machineName: undefined,
        page: String(pageIndex),
        q: searchQ || undefined,
        recipeId: navigationChanged ? undefined : recipeId || undefined,
      };

      const currentSignature = serializeRecipeQuery(currentSnapshot);
      const nextSignature = serializeRecipeQuery(nextSnapshot);

      if (nextSignature !== currentSignature && nextSignature !== lastWrittenSnapshot.value) {
        const latestUiSnapshot: RecipeQuerySnapshot = {
          tab: options.currentTab.value,
          mode: options.currentTab.value === 'usedIn' ? 'u' : 'r',
          machine: String(options.selectedMachineIndex.value),
          machineName: undefined,
          page: String(options.currentPage.value),
          q: options.recipeSearchQuery.value || undefined,
          recipeId: options.currentRecipeId.value || undefined,
        };
        const latestUiSignature = serializeRecipeQuery(latestUiSnapshot);
        if (latestUiSignature !== nextSignature) {
          return;
        }

        lastWrittenSnapshot.value = nextSignature;
        const nextQuery = buildRecipeRouteQuery(options.route.query, nextSnapshot);
        skipNextRouteApply.value = true;
        await options.router.replace({ query: nextQuery });
        lastAppliedRouteSnapshot.value = nextSignature;
      }

      if (options.onAfterStateSync) {
        await options.onAfterStateSync({
          itemId: currentItemId,
          tab,
          machineIndex,
          pageIndex,
          searchQuery: searchQ,
          recipeId,
        });
      }
    },
    { immediate: true },
  );

  watch(
    () => [pendingMachineIndexFromQuery.value, options.machineCategoryCount.value] as const,
    ([pendingMachineIndex, categoryCount]) => {
      if (pendingMachineNameFromQuery.value !== null) return;
      if (pendingMachineIndex === null) return;
      if (categoryCount <= 0) return;
      const safeMachineIndex = Math.min(Math.max(0, pendingMachineIndex), categoryCount - 1);
      options.selectedMachineIndex.value = safeMachineIndex;
      pendingMachineIndexFromQuery.value = null;
    },
    { immediate: true },
  );

  watch(
    () => [pendingMachineNameFromQuery.value, options.machineCategoryNames?.value.join('|') ?? ''] as const,
    ([pendingMachineName]) => {
      if (!pendingMachineName) return;
      const names = options.machineCategoryNames?.value ?? [];
      if (names.length <= 0) return;
      const normalized = pendingMachineName.trim().toLowerCase();
      const index = names.findIndex((name) => name.trim().toLowerCase() === normalized);
      if (index >= 0) {
        options.selectedMachineIndex.value = index;
        pendingMachineIndexFromQuery.value = null;
        pendingMachineNameFromQuery.value = null;
      }
    },
    { immediate: true },
  );

  watch(
    () => [pendingPageFromQuery.value, options.totalPages.value] as const,
    ([pendingPage, pageCount]) => {
      if (pendingPage === null) return;
      if (pageCount <= 0) return;
      const safePage = Math.min(Math.max(0, pendingPage), pageCount - 1);
      options.currentPage.value = safePage;
      pendingPageFromQuery.value = null;
    },
    { immediate: true },
  );

  watch(
    () => [pendingRecipeIdFromQuery.value, options.currentCategoryPageCount.value] as const,
    ([pendingRecipeId]) => {
      if (!pendingRecipeId) return;
      const applied = options.selectRecipeById(pendingRecipeId);
      if (applied) {
        pendingRecipeIdFromQuery.value = null;
      }
    },
    { immediate: true },
  );
}
