import { effectScope, reactive, ref, watch } from 'vue';
import type { Entry } from '@elysium/contracts';
import { mergePersonalBookmarks, validatePersonalBackup, type BackupSelection, type PersonalBackup } from './personal-backup.ts';

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

function createPreferences() {
  const preferences = reactive<Preferences>({ size: 48, limit: 96, scale: 2, animate: typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches,
    collapsed: true, bookmarks: [], history: [] });
  const storageError = ref('');
  let persistedValue = '';
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
  persistedValue = JSON.stringify(preferences);
  // Settings belong to the application, so persistence survives the first consumer's unmount.
  effectScope(true).run(() => watch(preferences, value => {
    const next = JSON.stringify(value);
    if (next === persistedValue && !storageError.value) return;
    try { localStorage.setItem(key, next); persistedValue = next; storageError.value = ''; }
    catch { storageError.value = '无法保存本机设置；当前页面仍可继续使用。'; }
  }, { deep: true }));
  function applyPersonalBackup(input: PersonalBackup, selection: BackupSelection = { settings: true, bookmarks: true }): void {
    const backup = validatePersonalBackup(input);
    if (!selection.settings && !selection.bookmarks) throw new Error('请至少选择恢复设置或合并收藏。');
    const next: Preferences = { ...preferences,
      bookmarks: selection.bookmarks ? mergePersonalBookmarks(preferences.bookmarks, backup.bookmarks) : preferences.bookmarks };
    if (selection.settings) {
      const { size, limit, scale, animate, collapsed } = backup.settings;
      Object.assign(next, { size, limit, scale, animate, collapsed });
    }
    const serialized = JSON.stringify(next);
    let previousSize: string | null = null;
    let sizeWritten = false;
    try {
      if (selection.settings) {
        previousSize = localStorage.getItem('itemSize');
        localStorage.setItem('itemSize', String(backup.settings.itemSize));
        sizeWritten = true;
      }
      localStorage.setItem(key, serialized);
    } catch {
      let restored = true;
      if (sizeWritten) {
        try {
          if (previousSize === null) localStorage.removeItem('itemSize');
          else localStorage.setItem('itemSize', previousSize);
        } catch { restored = false; }
      }
      storageError.value = restored
        ? '无法保存备份；导入未应用，请检查本地存储空间或浏览器权限。'
        : '无法保存备份，且旧图标大小恢复失败；请重新保存图标大小后重试。收藏未改动。';
      throw new Error(storageError.value);
    }
    // The queued persistence watcher must not write again after this confirmed commit.
    persistedValue = serialized;
    Object.assign(preferences, next);
    storageError.value = '';
  }
  function remember(catalog: string, entry: Entry): void {
    preferences.history = [{ catalog, id: entry.id, kind: entry.kind, name: entry.name },
      ...preferences.history.filter(row => row.id !== entry.id || row.catalog !== catalog)].slice(0, 40);
  }
  function bookmark(catalog: string, entry: Pick<Entry, 'id' | 'kind' | 'name'>): void {
    const exists = preferences.bookmarks.some(row => row.id === entry.id && row.catalog === catalog);
    if (exists) preferences.bookmarks = preferences.bookmarks.filter(row => row.id !== entry.id || row.catalog !== catalog);
    else if (preferences.bookmarks.length < 500) preferences.bookmarks.push({ catalog, id: entry.id, kind: entry.kind, name: entry.name });
    else storageError.value = '书签最多保存 500 项，请先移除不需要的书签。';
  }
  return { preferences, storageError, remember, bookmark, applyPersonalBackup };
}

let sharedPreferences: ReturnType<typeof createPreferences> | undefined;
export function usePreferences() {
  return sharedPreferences ??= createPreferences();
}
