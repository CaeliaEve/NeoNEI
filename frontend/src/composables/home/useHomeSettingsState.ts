import { computed, ref, type Ref } from "vue";
import type { Router } from "vue-router";
import {
  inspectGlobalBrowserAtlasResidentState,
  warmAllGlobalBrowserAtlases,
} from "../../services/globalBrowserAtlas";

export function useHomeSettingsState(itemSize: Ref<number>, router: Router) {
  const showGearMenu = ref(false);
  const atlasResidentRunning = ref(false);
  const atlasResidentProgressCurrent = ref(0);
  const atlasResidentProgressTotal = ref(0);
  const atlasResidentItemCount = ref(0);
  const atlasResidentStatus = ref("Atlas 将在主页打开后自动后台驻留");
  const atlasResidentError = ref<string | null>(null);

  const atlasResidentPercent = computed(() => {
    if (atlasResidentProgressTotal.value <= 0) return 0;
    return Math.min(100, Math.round((atlasResidentProgressCurrent.value / atlasResidentProgressTotal.value) * 100));
  });

  const openRuntimeHealth = () => {
    showGearMenu.value = false;
    void router.push({ name: "runtime-health" });
  };

  const refreshAtlasResidentState = async () => {
    const state = await inspectGlobalBrowserAtlasResidentState().catch(() => null);
    if (!state) {
      atlasResidentStatus.value = "Atlas 状态读取失败";
      return;
    }
    atlasResidentItemCount.value = state.itemCount;
    atlasResidentProgressCurrent.value = state.loadedAtlasFileCount;
    atlasResidentProgressTotal.value = state.atlasFileCount;
    if (!state.available) {
      atlasResidentStatus.value = "当前导出未包含浏览区 Atlas 索引";
    } else if (state.atlasFileCount > 0 && state.loadedAtlasFileCount >= state.atlasFileCount) {
      atlasResidentStatus.value = "Atlas 已就绪，翻页将直接走常驻纹理快路径";
    } else {
      atlasResidentStatus.value = `Atlas 后台驻留中 ${state.loadedAtlasFileCount}/${state.atlasFileCount}`;
    }
  };

  const warmResidentAtlas = async () => {
    if (atlasResidentRunning.value) return;
    atlasResidentRunning.value = true;
    atlasResidentError.value = null;
    atlasResidentStatus.value = "正在后台驻留浏览区 Atlas";
    try {
      const ok = await warmAllGlobalBrowserAtlases((processed, total) => {
        atlasResidentProgressCurrent.value = processed;
        atlasResidentProgressTotal.value = total;
        atlasResidentStatus.value = total > 0
          ? `Atlas 后台驻留中 ${processed}/${total}`
          : "正在读取 Atlas 索引";
      });
      await refreshAtlasResidentState();
      if (!ok) {
        atlasResidentStatus.value = "Atlas 索引不可用，请检查 NESQL++ 导出";
      }
    } catch (error) {
      atlasResidentError.value = error instanceof Error ? error.message : String(error);
      atlasResidentStatus.value = "Atlas 驻留失败";
    } finally {
      atlasResidentRunning.value = false;
    }
  };

  const saveSettings = () => {
    localStorage.setItem("itemSize", itemSize.value.toString());
  };

  return {
    showGearMenu,
    atlasResidentRunning,
    atlasResidentProgressCurrent,
    atlasResidentProgressTotal,
    atlasResidentItemCount,
    atlasResidentStatus,
    atlasResidentError,
    atlasResidentPercent,
    openRuntimeHealth,
    refreshAtlasResidentState,
    warmResidentAtlas,
    saveSettings,
  };
}
