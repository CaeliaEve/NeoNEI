import fs from 'fs';
import { NESQL_BROWSER_LAYOUT_INDEX_FILE } from '../config/runtime-paths';

export interface BrowserLayoutIndexItem {
  itemId: string;
  browserOrder?: number;
  groupKey?: string | null;
  groupLabel?: string | null;
  groupSize?: number;
  groupSortOrder?: number;
  representativeItemId?: string | null;
  expandedOrder?: number;
}

export interface BrowserLayoutDefaultEntry {
  entryOrder?: number;
  entryKind: 'item' | 'group-collapsed';
  itemId: string;
  groupKey?: string | null;
  groupLabel?: string | null;
  groupSize?: number;
}

export interface BrowserLayoutIndex {
  schemaVersion?: string;
  generatedAt?: number;
  itemCount?: number;
  groupCount?: number;
  defaultEntryCount?: number;
  items?: BrowserLayoutIndexItem[];
  defaultEntries?: BrowserLayoutDefaultEntry[];
}

class BrowserLayoutIndexService {
  getIndex(): BrowserLayoutIndex | null {
    if (!NESQL_BROWSER_LAYOUT_INDEX_FILE || !fs.existsSync(NESQL_BROWSER_LAYOUT_INDEX_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(NESQL_BROWSER_LAYOUT_INDEX_FILE, 'utf8');
    return JSON.parse(raw) as BrowserLayoutIndex;
  }
}

let instance: BrowserLayoutIndexService | null = null;

export function getBrowserLayoutIndexService(): BrowserLayoutIndexService {
  if (!instance) {
    instance = new BrowserLayoutIndexService();
  }
  return instance;
}
