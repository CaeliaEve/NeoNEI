import type {Item} from '../services/api';
import type {Row} from './resident-index';
export function resolveHistory(saved: Pick<Item, 'itemId'>[], rows: Row[]): Item[] {
  const found = new Map(rows.map(row => [row.id, row])), seen = new Set<string>();
  return saved.flatMap(old => {
    const row = found.get(old.itemId);
    if (!row || seen.has(row.id)) return [];
    seen.add(row.id);
    return [{...old, itemId: row.id, localizedName: row.name.replace(/§[0-9a-fk-or]/gi, ''),
      internalName: row.registry, modId: row.registry.split(':')[0]!, residentSprite: row.sprite}];
  });
}
