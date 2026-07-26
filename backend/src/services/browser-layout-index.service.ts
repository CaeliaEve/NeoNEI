import fs from 'fs';
import { CURRENT_RUNTIME_ARTIFACT_PATHS } from './current-runtime-artifact-index-abi';
import {
  resolveCurrentRuntimeDistDataDir,
  resolveDistDataRuntimeFile,
} from './current-runtime-artifact-index.service';

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
    const generationRoot = resolveCurrentRuntimeDistDataDir();
    const filePath = resolveDistDataRuntimeFile(
      CURRENT_RUNTIME_ARTIFACT_PATHS.browserLayoutIndex,
      generationRoot,
    );
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
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
