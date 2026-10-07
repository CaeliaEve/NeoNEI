import type { Saved } from './preferences.ts';

export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
export const MAX_BOOKMARKS = 500;
export interface PersonalSettings {
  itemSize: number;
  size: number;
  limit: number;
  scale: number;
  animate: boolean;
  collapsed: boolean;
}
export interface PersonalBackup {
  format: 'neonei.personal-backup';
  version: 1;
  settings: PersonalSettings;
  bookmarks: Saved[];
}
export interface BackupSelection { settings: boolean; bookmarks: boolean }

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
export function isHomeItemSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 24 && value <= 128;
}
function isBookmark(value: unknown): value is Saved {
  return object(value) && exactKeys(value, ['catalog', 'id', 'kind', 'name'])
    && typeof value.catalog === 'string' && /^[a-f0-9]{64}$/.test(value.catalog)
    && (value.kind === 'item' || value.kind === 'fluid')
    && typeof value.id === 'string' && new RegExp(`^${value.kind}_[a-f0-9]{64}$`).test(value.id)
    && typeof value.name === 'string' && value.name.length <= 4096;
}
function validate(value: unknown): PersonalBackup {
  if (!object(value) || !exactKeys(value, ['format', 'version', 'settings', 'bookmarks'])) {
    throw new Error('备份结构不正确，请选择 NeoNEI 导出的 JSON 文件。');
  }
  if (value.format !== 'neonei.personal-backup' || value.version !== 1) {
    throw new Error('备份格式或版本不受支持（仅支持 NeoNEI 个人备份 v1）。');
  }
  const settings = value.settings;
  if (!object(settings) || !exactKeys(settings, ['itemSize', 'size', 'limit', 'scale', 'animate', 'collapsed'])
    || !isHomeItemSize(settings.itemSize) || ![36, 48, 64].includes(settings.size as number)
    || ![48, 96, 192].includes(settings.limit as number) || ![1, 2, 3].includes(settings.scale as number)
    || typeof settings.animate !== 'boolean' || typeof settings.collapsed !== 'boolean') {
    throw new Error('备份中的设置取值不正确，未更改当前设置。');
  }
  if (!Array.isArray(value.bookmarks) || value.bookmarks.length > MAX_BOOKMARKS) {
    throw new Error('备份收藏必须是列表，最多 500 项。');
  }
  if (!value.bookmarks.every(isBookmark)) {
    throw new Error('备份中的收藏标识、类型或名称不正确，未导入任何收藏。');
  }
  return value as unknown as PersonalBackup;
}
export function parsePersonalBackup(text: string): PersonalBackup {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('备份文件大小超过 8 MB，无法导入。');
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('无法读取 JSON，请选择完整的 NeoNEI 备份文件。'); }
  return validate(value);
}
export function serializePersonalBackup(settings: PersonalSettings, bookmarks: readonly Saved[]): string {
  const value = validate({ format: 'neonei.personal-backup', version: 1,
    settings: { itemSize: settings.itemSize, size: settings.size, limit: settings.limit, scale: settings.scale,
      animate: settings.animate, collapsed: settings.collapsed },
    bookmarks: bookmarks.map(({ catalog, id, kind, name }) => ({ catalog, id, kind, name })) });
  const text = JSON.stringify(value, null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('备份大小超过 8 MB，无法导出。');
  return text;
}
export function mergePersonalBookmarks(current: readonly Saved[], incoming: readonly Saved[]): Saved[] {
  const seen = new Set<string>();
  const result: Saved[] = [];
  for (const row of [...current, ...incoming]) {
    const key = `${row.catalog}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...row });
  }
  if (result.length > MAX_BOOKMARKS) throw new Error('合并后收藏超过 500 项。请先减少收藏，或仅恢复设置。');
  return result;
}

export function validatePersonalBackup(value: unknown): PersonalBackup {
  return validate(value);
}
