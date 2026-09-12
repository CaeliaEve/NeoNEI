import { reactive, ref, watch } from 'vue';
import type { Entry } from '@elysium/contracts';

export interface Saved { catalog: string; id: string; kind: 'item' | 'fluid'; name: string }
interface Preferences { size: number; limit: number; scale: number; animate: boolean; collapsed: boolean; bookmarks: Saved[]; history: Saved[] }
const key = 'neonei.preferences';

function saved(value: unknown): value is Saved {
  if (!value || typeof value !== 'object') return false;
  const row = value as Saved;
  return typeof row.catalog === 'string' && /^[a-f0-9]{64}$/.test(row.catalog) && typeof row.id === 'string'
    && /^(item|fluid)_[a-f0-9]{64}$/.test(row.id) && (row.kind === 'item' || row.kind === 'fluid')
    && typeof row.name === 'string' && row.name.length <= 4096;
}

export function usePreferences() {
  const preferences = reactive<Preferences>({ size: 48, limit: 96, scale: 2, animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    collapsed: true, bookmarks: [], history: [] });
  const storageError = ref('');
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const value = JSON.parse(raw) as Partial<Preferences>;
      if (typeof value.size === 'number' && [36, 48, 64].includes(value.size)) preferences.size = value.size;
      if (typeof value.limit === 'number' && [48, 96, 192].includes(value.limit)) preferences.limit = value.limit;
      if (typeof value.scale === 'number' && [1, 2, 3].includes(value.scale)) preferences.scale = value.scale;
      if (typeof value.animate === 'boolean') preferences.animate = value.animate;
      if (typeof value.collapsed === 'boolean') preferences.collapsed = value.collapsed;
      if (Array.isArray(value.bookmarks)) preferences.bookmarks = value.bookmarks.filter(saved).slice(0, 500);
      if (Array.isArray(value.history)) preferences.history = value.history.filter(saved).slice(0, 40);
    }
  } catch { storageError.value = '无法读取本机设置，本次使用默认设置。'; }
  watch(preferences, value => {
    try { localStorage.setItem(key, JSON.stringify(value)); storageError.value = ''; }
    catch { storageError.value = '无法保存本机设置；当前页面仍可继续使用。'; }
  }, { deep: true });
  function remember(catalog: string, entry: Entry): void {
    preferences.history = [{ catalog, id: entry.id, kind: entry.kind, name: entry.name },
      ...preferences.history.filter(row => row.id !== entry.id || row.catalog !== catalog)].slice(0, 40);
  }
  function bookmark(catalog: string, entry: Entry): void {
    const exists = preferences.bookmarks.some(row => row.id === entry.id && row.catalog === catalog);
    if (exists) preferences.bookmarks = preferences.bookmarks.filter(row => row.id !== entry.id || row.catalog !== catalog);
    else if (preferences.bookmarks.length < 500) preferences.bookmarks.push({ catalog, id: entry.id, kind: entry.kind, name: entry.name });
    else storageError.value = '书签最多保存 500 项，请先移除不需要的书签。';
  }
  return { preferences, storageError, remember, bookmark };
}
