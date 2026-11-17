import { ref, watch, type Ref } from 'vue';
import { isHomeItemSize } from '../../state/personal-backup.ts';
import {t} from '../../i18n/index.ts';

export function useHomeSettingsState(itemSize: Ref<number>) {
  const showGearMenu = ref(false), settingsSaveStatus = ref(''), settingsSaveError = ref('');
  watch(itemSize, () => { settingsSaveStatus.value = ''; settingsSaveError.value = ''; });
  function saveSettings() {
    settingsSaveStatus.value = ''; settingsSaveError.value = '';
    try {
      if (!isHomeItemSize(itemSize.value)) throw new Error('Invalid size');
      localStorage.setItem('itemSize', String(itemSize.value));
      settingsSaveStatus.value = t('图标大小已保存');
    } catch { settingsSaveError.value = t('无法保存图标大小，请检查本地存储空间或浏览器权限。'); }
  }
  return { showGearMenu, settingsSaveStatus, settingsSaveError, saveSettings };
}
