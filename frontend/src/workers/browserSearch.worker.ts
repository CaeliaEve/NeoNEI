import type { BrowserSearchPackEntry } from "../services/api";

type SearchPackPayload = {
  version: number;
  total: number;
  items: BrowserSearchPackEntry[];
};

type InitMessage = {
  type: "init";
  payload: SearchPackPayload;
};

type AppendMessage = {
  type: "append";
  payload: SearchPackPayload;
};

type QueryMessage = {
  type: "query";
  id: number;
  payload: {
    query: string;
    modId?: string;
    page: number;
    pageSize: number;
  };
};

type RequestMessage = InitMessage | AppendMessage | QueryMessage;

type QueryResult = {
  id: number;
  total: number;
  totalPages: number;
  page: number;
  itemIds: string[];
};

let searchPack: BrowserSearchPackEntry[] = [];

function mergeEntries(base: BrowserSearchPackEntry[], incoming: BrowserSearchPackEntry[]): BrowserSearchPackEntry[] {
  if (base.length === 0) return [...incoming];
  if (incoming.length === 0) return [...base];

  const seen = new Set(base.map((entry) => entry.itemId));
  const merged = [...base];
  for (const entry of incoming) {
    if (seen.has(entry.itemId)) continue;
    seen.add(entry.itemId);
    merged.push(entry);
  }
  return merged;
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function rankEntry(entry: BrowserSearchPackEntry, normalized: string): number | null {
  if (!normalized) return null;

  const aliases = entry.aliases || "";
  if (entry.normalizedLocalizedName === normalized) return 0;
  if (entry.pinyinFull === normalized) return 1;
  if (entry.pinyinAcronym === normalized) return 2;
  if (aliases === normalized) return 3;
  if (entry.normalizedInternalName === normalized) return 4;
  if (entry.normalizedItemId === normalized) return 5;
  if (entry.normalizedSearchTerms === normalized) return 6;

  if (entry.normalizedLocalizedName.startsWith(normalized)) return 10;
  if (entry.pinyinFull.startsWith(normalized)) return 11;
  if (entry.pinyinAcronym.startsWith(normalized)) return 12;
  if (aliases.startsWith(normalized)) return 13;
  if (entry.normalizedInternalName.startsWith(normalized)) return 14;
  if (entry.normalizedSearchTerms.startsWith(normalized)) return 15;
  if (entry.normalizedItemId.startsWith(normalized)) return 16;

  if (entry.normalizedLocalizedName.includes(normalized)) return 20;
  if (entry.pinyinFull.includes(normalized)) return 21;
  if (entry.pinyinAcronym.includes(normalized)) return 22;
  if (aliases.includes(normalized)) return 23;
  if (entry.normalizedInternalName.includes(normalized)) return 24;
  if (entry.normalizedSearchTerms.includes(normalized)) return 25;
  if (entry.normalizedItemId.includes(normalized)) return 26;

  return null;
}

function queryPack(message: QueryMessage): QueryResult {
  const normalized = normalizeKeyword(message.payload.query);
  const normalizedModId = `${message.payload.modId ?? ""}`.trim();
  const pageSize = Math.min(Math.max(1, Math.floor(message.payload.pageSize || 50)), 500);

  const ranked = searchPack
    .filter((entry) => !normalizedModId || normalizedModId === "all" || entry.modId === normalizedModId)
    .map((entry, sourceIndex) => ({
      entry,
      sourceIndex,
      rank: rankEntry(entry, normalized),
    }))
    .filter((entry): entry is { entry: BrowserSearchPackEntry; sourceIndex: number; rank: number } => entry.rank !== null)
    .sort((left, right) =>
      left.rank - right.rank
      || left.entry.searchRank - right.entry.searchRank
      || right.entry.popularityScore - left.entry.popularityScore
      || left.sourceIndex - right.sourceIndex,
    );

  const total = ranked.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(message.payload.page || 1)), totalPages);
  const offset = (page - 1) * pageSize;
  const itemIds = ranked.slice(offset, offset + pageSize).map((entry) => entry.entry.itemId);

  return {
    id: message.id,
    total,
    totalPages,
    page,
    itemIds,
  };
}

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    searchPack = message.payload.items || [];
    return;
  }

  if (message.type === "append") {
    searchPack = mergeEntries(searchPack, message.payload.items || []);
    return;
  }

  if (message.type === "query") {
    const result = queryPack(message);
    self.postMessage(result);
  }
};
