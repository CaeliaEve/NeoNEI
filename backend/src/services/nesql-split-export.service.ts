import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } from '../config/runtime-paths';

type JsonObject = Record<string, unknown>;
type RecipeCacheFileEntry = { relativePath: string; size: number; mtimeMs: number };
type RecipeIndexCachePayload = {
  version: 3;
  root: string;
  files: RecipeCacheFileEntry[];
  recipeLocations: Record<string, string>;
  producedByIndex: Record<string, string[]>;
  usedInIndex: Record<string, string[]>;
  machineIndex: Record<string, string[]>;
  fluids: Record<string, JsonObject>;
};

function readMaybeGzipJson(filePath: string): JsonObject | JsonObject[] | null {
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  const text = filePath.endsWith('.gz')
    ? zlib.gunzipSync(buffer).toString('utf-8')
    : buffer.toString('utf-8');
  return JSON.parse(text) as JsonObject | JsonObject[];
}

function writeGzipJson(filePath: string, payload: unknown): void {
  const content = Buffer.from(JSON.stringify(payload));
  fs.writeFileSync(filePath, zlib.gzipSync(content));
}

class NesqlSplitExportService {
  private itemsIndex = new Map<string, JsonObject>();
  private itemsList: JsonObject[] = [];
  private fluidIndex = new Map<string, JsonObject>();
  private fluidList: JsonObject[] = [];
  private loadedItemMods = new Set<string>();
  private itemMods = new Map<string, JsonObject[]>();
  private itemsSorted = true;
  private recipeLocations = new Map<string, string>();
  private producedByIndex = new Map<string, string[]>();
  private usedInIndex = new Map<string, string[]>();
  private machineIndex = new Map<string, string[]>();
  private recipeFiles: string[] = [];
  private recipeFileCache = new Map<string, JsonObject[]>();
  private recipeById = new Map<string, JsonObject>();
  private loadedItems = false;
  private loadedRecipes = false;

  hasSplitItems(): boolean {
    return Boolean(SPLIT_ITEMS_DIR) && fs.existsSync(SPLIT_ITEMS_DIR);
  }

  hasSplitRecipes(): boolean {
    return Boolean(SPLIT_RECIPES_DIR) && fs.existsSync(SPLIT_RECIPES_DIR);
  }

  private getItemModFilePath(modId: string): string {
    return path.join(SPLIT_ITEMS_DIR, modId, 'items.json.gz');
  }

  private listItemModIds(): string[] {
    if (!this.hasSplitItems()) return [];
    return fs
      .readdirSync(SPLIT_ITEMS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  }

  private extractModIdFromItemId(itemId: string): string | null {
    const parts = itemId.split('~');
    return parts.length >= 3 && parts[1] ? parts[1] : null;
  }

  private isFluidEntityId(itemId: string): boolean {
    return itemId.startsWith('f~');
  }

  private compareLocalizedName(left: JsonObject, right: JsonObject): number {
    return String(left.localizedName ?? left.localized_name ?? '').localeCompare(
      String(right.localizedName ?? right.localized_name ?? ''),
    );
  }

  private indexFluidPseudoItem(raw: JsonObject): void {
    const fluidId = typeof raw.itemId === 'string' ? raw.itemId : '';
    if (!fluidId || this.fluidIndex.has(fluidId)) {
      return;
    }
    this.fluidIndex.set(fluidId, raw);
    this.fluidList.push(raw);
  }

  private loadItemModIfNeeded(modId: string): void {
    if (!this.hasSplitItems() || !modId || this.loadedItemMods.has(modId)) return;

    const filePath = this.getItemModFilePath(modId);
    const data = readMaybeGzipJson(filePath);
    if (Array.isArray(data)) {
      const modItems: JsonObject[] = [];
      for (const item of data) {
        const itemId = typeof item.itemId === 'string' ? item.itemId : null;
        if (itemId) {
          this.itemsIndex.set(itemId, item);
          this.itemsList.push(item);
          modItems.push(item);
        }
      }
      this.itemMods.set(modId, modItems);
      this.itemsSorted = false;
    }

    this.loadedItemMods.add(modId);
  }

  private ensureItemsSorted(): void {
    if (this.itemsSorted) return;
    this.itemsList.sort((a, b) => this.compareLocalizedName(a, b));
    this.itemsSorted = true;
  }

  private getRecipeIndexCachePath(): string {
    return path.join(SPLIT_RECIPES_DIR, '.hub-recipe-index-cache.json.gz');
  }

  private createMachineIndexKey(machineType: string, voltageTier?: string | null): string {
    return `${machineType.trim()}::${(voltageTier ?? '').trim()}`;
  }

  private getRecipeFileEntries(): RecipeCacheFileEntry[] {
    this.loadRecipeFilesIfNeeded();
    return this.recipeFiles
      .map((filePath) => {
        const stat = fs.statSync(filePath);
        return {
          relativePath: path.relative(SPLIT_RECIPES_DIR, filePath),
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        };
      })
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  private loadRecipeIndexCache(): boolean {
    if (!this.hasSplitRecipes()) return false;
    const cachePath = this.getRecipeIndexCachePath();
    if (!fs.existsSync(cachePath)) return false;

    try {
      const payload = readMaybeGzipJson(cachePath) as RecipeIndexCachePayload | null;
      if (!payload || payload.version !== 3 || payload.root !== SPLIT_RECIPES_DIR) {
        return false;
      }

      const currentFiles = this.getRecipeFileEntries();
      if (currentFiles.length !== payload.files.length) {
        return false;
      }

      for (let i = 0; i < currentFiles.length; i += 1) {
        const current = currentFiles[i];
        const cached = payload.files[i];
        if (
          current.relativePath !== cached.relativePath ||
          current.size !== cached.size ||
          Math.abs(current.mtimeMs - cached.mtimeMs) > 1
        ) {
          return false;
        }
      }

      this.recipeLocations = new Map(
        Object.entries(payload.recipeLocations).map(([recipeId, relativePath]) => [
          recipeId,
          path.join(SPLIT_RECIPES_DIR, relativePath),
        ])
      );
      this.producedByIndex = new Map(Object.entries(payload.producedByIndex));
      this.usedInIndex = new Map(Object.entries(payload.usedInIndex));
      this.machineIndex = new Map(Object.entries(payload.machineIndex ?? {}));
      this.fluidIndex = new Map(Object.entries(payload.fluids ?? {}));
      this.fluidList = Array.from(this.fluidIndex.values()).sort((a, b) => this.compareLocalizedName(a, b));
      this.loadedRecipes = true;
      return true;
    } catch {
      return false;
    }
  }

  private writeRecipeIndexCache(): void {
    if (!this.hasSplitRecipes()) return;
    try {
      const payload: RecipeIndexCachePayload = {
        version: 3,
        root: SPLIT_RECIPES_DIR,
        files: this.getRecipeFileEntries(),
        recipeLocations: Object.fromEntries(
          Array.from(this.recipeLocations.entries()).map(([recipeId, filePath]) => [
            recipeId,
            path.relative(SPLIT_RECIPES_DIR, filePath),
          ])
        ),
        producedByIndex: Object.fromEntries(this.producedByIndex),
        usedInIndex: Object.fromEntries(this.usedInIndex),
        machineIndex: Object.fromEntries(this.machineIndex),
        fluids: Object.fromEntries(this.fluidIndex),
      };
      writeGzipJson(this.getRecipeIndexCachePath(), payload);
    } catch {
      // Best-effort cache write only.
    }
  }

  private loadRecipeFilesIfNeeded(): void {
    if (this.recipeFiles.length > 0 || !this.hasSplitRecipes()) return;

    const typeDirs = fs
      .readdirSync(SPLIT_RECIPES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());

    for (const typeDir of typeDirs) {
      const root = path.join(SPLIT_RECIPES_DIR, typeDir.name);
      const modFiles = fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(root, entry.name, 'recipes.json.gz'))
        .filter((filePath) => fs.existsSync(filePath));
      this.recipeFiles.push(...modFiles);
    }
  }

  private readRecipeArray(filePath: string): JsonObject[] {
    const cached = this.recipeFileCache.get(filePath);
    if (cached) {
      return cached;
    }

    const data = readMaybeGzipJson(filePath);
    const recipes = Array.isArray(data) ? data : [];
    this.recipeFileCache.set(filePath, recipes);
    for (const recipe of recipes) {
      const recipeId =
        typeof recipe.recipeId === 'string'
          ? recipe.recipeId
          : typeof recipe.id === 'string'
            ? recipe.id
            : null;
      if (recipeId && !this.recipeById.has(recipeId)) {
        this.recipeById.set(recipeId, recipe);
      }
    }
    return recipes;
  }

  loadItemsIfNeeded(): void {
    if (this.loadedItems || !this.hasSplitItems()) return;

    const modDirs = fs
      .readdirSync(SPLIT_ITEMS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const modId of modDirs) {
      this.loadItemModIfNeeded(modId);
    }

    this.ensureItemsSorted();
    this.loadedItems = true;
  }

  loadRecipesIfNeeded(): void {
    if (this.loadedRecipes || !this.hasSplitRecipes()) return;
    if (this.loadRecipeIndexCache()) return;

    this.loadRecipeFilesIfNeeded();

    for (const filePath of this.recipeFiles) {
      for (const recipe of this.readRecipeArray(filePath)) {
        const recipeId =
          typeof recipe.recipeId === 'string'
            ? recipe.recipeId
            : typeof recipe.id === 'string'
              ? recipe.id
              : null;
        if (recipeId) {
          this.indexRecipeRecord(recipeId, recipe, filePath);
        }
      }
    }

    this.fluidList.sort((a, b) => this.compareLocalizedName(a, b));
    this.loadedRecipes = true;
    this.writeRecipeIndexCache();
  }

  private addIndexedRecipeLink(index: Map<string, string[]>, itemId: string, recipeId: string): void {
    if (!itemId) return;
    const existing = index.get(itemId);
    if (!existing) {
      index.set(itemId, [recipeId]);
      return;
    }
    if (!existing.includes(recipeId)) {
      existing.push(recipeId);
    }
  }

  private addMachineRecipeLink(machineType: string, voltageTier: string | null | undefined, recipeId: string): void {
    if (!machineType.trim()) return;

    const aggregateKey = this.createMachineIndexKey(machineType);
    this.addIndexedRecipeLink(this.machineIndex, aggregateKey, recipeId);

    const exactVoltageTier = (voltageTier ?? '').trim();
    if (exactVoltageTier) {
      const tierKey = this.createMachineIndexKey(machineType, exactVoltageTier);
      this.addIndexedRecipeLink(this.machineIndex, tierKey, recipeId);
    }
  }

  private extractItemIdsFromInputs(inputs: unknown): string[] {
    const result = new Set<string>();
    if (!Array.isArray(inputs)) return [];

    for (const slot of inputs) {
      if (Array.isArray(slot)) {
        for (const nestedSlot of slot) {
          const nestedItems = (nestedSlot as { items?: Array<{ itemId?: string }>; item?: { itemId?: string } })?.items;
          if (Array.isArray(nestedItems)) {
            for (const item of nestedItems) {
              if (typeof item?.itemId === 'string' && item.itemId.trim()) {
                result.add(item.itemId.trim());
              }
            }
          }
          const nestedItemId = (nestedSlot as { itemId?: string; item?: { itemId?: string } })?.itemId
            ?? (nestedSlot as { item?: { itemId?: string } })?.item?.itemId;
          if (typeof nestedItemId === 'string' && nestedItemId.trim()) {
            result.add(nestedItemId.trim());
          }
        }
        continue;
      }

      const slotItems = (slot as { items?: Array<{ item?: { itemId?: string }; itemId?: string }> })?.items;
      if (Array.isArray(slotItems)) {
        for (const entry of slotItems) {
          const itemId = entry?.item?.itemId ?? entry?.itemId;
          if (typeof itemId === 'string' && itemId.trim()) {
            result.add(itemId.trim());
          }
        }
      }
    }

    return Array.from(result);
  }

  private extractItemIdsFromOutputs(outputs: unknown): string[] {
    const result = new Set<string>();
    if (!Array.isArray(outputs)) return [];

    for (const slot of outputs) {
      if (Array.isArray(slot)) {
        for (const nestedSlot of slot) {
          const itemId = (nestedSlot as { item?: { itemId?: string }; itemId?: string })?.item?.itemId
            ?? (nestedSlot as { itemId?: string })?.itemId;
          if (typeof itemId === 'string' && itemId.trim()) {
            result.add(itemId.trim());
          }
        }
        continue;
      }

      const itemId = (slot as { item?: { itemId?: string }; itemId?: string })?.item?.itemId
        ?? (slot as { itemId?: string })?.itemId;
      if (typeof itemId === 'string' && itemId.trim()) {
        result.add(itemId.trim());
      }
    }

    return Array.from(result);
  }

  private extractFluidIdsFromInputs(fluidInputs: unknown): string[] {
    const result = new Set<string>();
    if (!Array.isArray(fluidInputs)) return [];

    for (const group of fluidInputs) {
      const fluids = (group as { fluids?: Array<{ fluid?: { fluidId?: string } }> })?.fluids;
      if (!Array.isArray(fluids)) continue;
      for (const entry of fluids) {
        const fluidId = entry?.fluid?.fluidId;
        if (typeof fluidId === 'string' && fluidId.trim()) {
          result.add(fluidId.trim());
        }
      }
    }

    return Array.from(result);
  }

  private extractFluidIdsFromOutputs(fluidOutputs: unknown): string[] {
    const result = new Set<string>();
    if (!Array.isArray(fluidOutputs)) return [];

    for (const group of fluidOutputs) {
      const fluidId = (group as { fluid?: { fluidId?: string } })?.fluid?.fluidId;
      if (typeof fluidId === 'string' && fluidId.trim()) {
        result.add(fluidId.trim());
      }
    }

    return Array.from(result);
  }

  private buildFluidPseudoItem(raw: {
    fluidId?: string;
    modId?: string;
    internalName?: string;
    localizedName?: string;
    renderAssetRef?: string | null;
    temperature?: number;
  }): JsonObject | null {
    const fluidId = typeof raw.fluidId === 'string' ? raw.fluidId.trim() : '';
    if (!fluidId) return null;
    const parts = fluidId.split('~');
    const modId = (typeof raw.modId === 'string' ? raw.modId : parts[1] ?? '').trim();
    const internalName = (typeof raw.internalName === 'string' ? raw.internalName : parts.slice(2).join('~')).trim();
    const localizedName =
      (typeof raw.localizedName === 'string' ? raw.localizedName : '').trim()
      || internalName
      || fluidId;
    return {
      itemId: fluidId,
      modId,
      internalName,
      localizedName,
      unlocalizedName: internalName || fluidId,
      damage: 0,
      imageFileName: null,
      renderAssetRef: typeof raw.renderAssetRef === 'string' ? raw.renderAssetRef : null,
      preferredImageUrl: modId && internalName ? `/images/fluid/${encodeURIComponent(modId)}/${encodeURIComponent(internalName)}.png` : null,
      tooltip:
        typeof raw.temperature === 'number' && Number.isFinite(raw.temperature)
          ? `Temperature: ${Math.round(raw.temperature)} K`
          : null,
      searchTerms: [localizedName, internalName, fluidId, modId, 'fluid', '液体'].filter(Boolean).join(' '),
    };
  }

  private indexRecipeFluidRecords(recipe: JsonObject): void {
    const visit = (fluid: {
      fluidId?: string;
      modId?: string;
      internalName?: string;
      localizedName?: string;
      renderAssetRef?: string | null;
      temperature?: number;
    } | undefined): void => {
      const built = this.buildFluidPseudoItem(fluid ?? {});
      if (built) {
        this.indexFluidPseudoItem(built);
      }
    };

    const fluidInputs = Array.isArray(recipe.fluidInputs) ? recipe.fluidInputs : [];
    for (const group of fluidInputs) {
      const fluids = (group as { fluids?: Array<{ fluid?: JsonObject }> })?.fluids;
      if (!Array.isArray(fluids)) continue;
      for (const entry of fluids) {
        visit((entry?.fluid ?? undefined) as {
          fluidId?: string;
          modId?: string;
          internalName?: string;
          localizedName?: string;
          renderAssetRef?: string | null;
          temperature?: number;
        } | undefined);
      }
    }

    const fluidOutputs = Array.isArray(recipe.fluidOutputs) ? recipe.fluidOutputs : [];
    for (const output of fluidOutputs) {
      visit((output as { fluid?: JsonObject })?.fluid as {
        fluidId?: string;
        modId?: string;
        internalName?: string;
        localizedName?: string;
        renderAssetRef?: string | null;
        temperature?: number;
      } | undefined);
    }
  }

  private indexRecipeItemLinks(recipeId: string, recipe: JsonObject): void {
    const inputIds = [
      ...this.extractItemIdsFromInputs(recipe.inputs),
      ...this.extractFluidIdsFromInputs(recipe.fluidInputs),
    ];
    const outputIds = [
      ...this.extractItemIdsFromOutputs(recipe.outputs),
      ...this.extractFluidIdsFromOutputs(recipe.fluidOutputs),
    ];

    for (const itemId of inputIds) {
      this.addIndexedRecipeLink(this.usedInIndex, itemId, recipeId);
    }
    for (const itemId of outputIds) {
      this.addIndexedRecipeLink(this.producedByIndex, itemId, recipeId);
    }
  }

  private indexRecipeRecord(recipeId: string, recipe: JsonObject, filePath: string): void {
    this.recipeLocations.set(recipeId, filePath);
    this.recipeById.set(recipeId, recipe);
    this.indexRecipeFluidRecords(recipe);
    this.indexRecipeItemLinks(recipeId, recipe);

    const machineInfo = recipe.machineInfo as { machineType?: string; parsedVoltageTier?: string } | undefined;
    const machineType = typeof machineInfo?.machineType === 'string' ? machineInfo.machineType : '';
    const voltageTier = typeof machineInfo?.parsedVoltageTier === 'string' ? machineInfo.parsedVoltageTier : null;
    if (machineType.trim()) {
      this.addMachineRecipeLink(machineType, voltageTier, recipeId);
    }
  }

  getItemById(itemId: string): JsonObject | null {
    if (this.isFluidEntityId(itemId)) {
      this.loadRecipesIfNeeded();
      return this.fluidIndex.get(itemId) ?? null;
    }

    const modId = this.extractModIdFromItemId(itemId);
    if (modId) {
      this.loadItemModIfNeeded(modId);
    } else {
      this.loadItemsIfNeeded();
    }
    return this.itemsIndex.get(itemId) ?? null;
  }

  getItemsByIds(itemIds: string[]): JsonObject[] {
    const needsFluids = itemIds.some((itemId) => this.isFluidEntityId(itemId));
    for (const itemId of itemIds) {
      if (this.isFluidEntityId(itemId)) {
        continue;
      }
      const modId = this.extractModIdFromItemId(itemId);
      if (modId) {
        this.loadItemModIfNeeded(modId);
      }
    }
    if (needsFluids) {
      this.loadRecipesIfNeeded();
    }
    return itemIds
      .map((itemId) => this.itemsIndex.get(itemId) ?? this.fluidIndex.get(itemId))
      .filter((item): item is JsonObject => Boolean(item));
  }

  getAllItems(options?: { includeFluids?: boolean }): JsonObject[] {
    this.loadItemsIfNeeded();
    this.ensureItemsSorted();
    if (!options?.includeFluids) {
      return this.itemsList;
    }

    this.loadRecipesIfNeeded();
    return [...this.itemsList, ...this.fluidList].sort((a, b) => this.compareLocalizedName(a, b));
  }

  getItemsPageFast(page: number, pageSize: number): { items: JsonObject[]; total: number | null } {
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);
    const start = (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    const result: JsonObject[] = [];
    let seen = 0;
    let total = 0;

    for (const modId of this.listItemModIds()) {
      this.loadItemModIfNeeded(modId);
      const modItems = this.itemMods.get(modId) ?? [];
      total += modItems.length;

      for (const item of modItems) {
        if (seen >= start && seen < end) {
          result.push(item);
        }
        seen += 1;
      }
    }

    return { items: result, total };
  }

  getModsFast(): Array<{ modId: string; modName: string; itemCount: number }> {
    this.loadItemsIfNeeded();
    return this.listItemModIds().map((modId) => ({
      modId,
      modName: modId,
      itemCount: this.itemMods.get(modId)?.length ?? 0,
    }));
  }

  getAllItemIds(options?: { includeFluids?: boolean }): string[] {
    return this.getAllItems(options)
      .map((item) => (typeof item.itemId === 'string' ? item.itemId : ''))
      .filter(Boolean);
  }

  getMods(): Array<{ modId: string; modName: string; itemCount: number }> {
    this.loadItemsIfNeeded();
    const counts = new Map<string, number>();
    for (const item of this.itemsList) {
      const modId = String(item.modId ?? item.mod_id ?? '');
      if (!modId) continue;
      counts.set(modId, (counts.get(modId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([modId, itemCount]) => ({ modId, modName: modId, itemCount }))
      .sort((a, b) => a.modName.localeCompare(b.modName));
  }

  getRecipeById(recipeId: string): JsonObject | null {
    this.loadRecipesIfNeeded();
    const cached = this.recipeById.get(recipeId);
    if (cached) {
      return cached;
    }
    const filePath = this.recipeLocations.get(recipeId);
    if (!filePath) return null;
    const recipe = this.readRecipeArray(filePath).find((entry) => {
      const candidateId =
        typeof entry.recipeId === 'string'
          ? entry.recipeId
          : typeof entry.id === 'string'
            ? entry.id
            : null;
      return candidateId === recipeId;
    }) ?? null;
    if (recipe) {
      this.recipeById.set(recipeId, recipe);
    }
    return recipe;
  }

  getRecipesByIds(recipeIds: string[]): JsonObject[] {
    this.loadRecipesIfNeeded();
    const ids = Array.from(new Set(recipeIds));
    const results = new Map<string, JsonObject>();
    const idsByFile = new Map<string, Set<string>>();

    for (const recipeId of ids) {
      const cached = this.recipeById.get(recipeId);
      if (cached) {
        results.set(recipeId, cached);
        continue;
      }
      const filePath = this.recipeLocations.get(recipeId);
      if (!filePath) continue;
      const bucket = idsByFile.get(filePath) ?? new Set<string>();
      bucket.add(recipeId);
      idsByFile.set(filePath, bucket);
    }

    for (const [filePath, wantedIds] of idsByFile.entries()) {
      for (const recipe of this.readRecipeArray(filePath)) {
        const candidateId =
          typeof recipe.recipeId === 'string'
            ? recipe.recipeId
            : typeof recipe.id === 'string'
              ? recipe.id
              : null;
        if (candidateId && wantedIds.has(candidateId)) {
          results.set(candidateId, recipe);
          this.recipeById.set(candidateId, recipe);
        }
      }
    }

    return recipeIds
      .map((recipeId) => results.get(recipeId))
      .filter((recipe): recipe is JsonObject => Boolean(recipe));
  }

  getAllMachineTypes(): string[] {
    this.loadRecipesIfNeeded();
    const machineTypes = new Set<string>();
    for (const key of this.machineIndex.keys()) {
      const [machineType, voltageTier] = key.split('::');
      if (machineType && !voltageTier) {
        machineTypes.add(machineType);
      }
    }
    return Array.from(machineTypes).sort((a, b) => a.localeCompare(b));
  }

  getRecipesByMachine(machineType: string, voltageTier?: string): JsonObject[] {
    this.loadRecipesIfNeeded();
    const normalizedMachineType = machineType.trim();
    const normalizedVoltageTier = voltageTier?.trim();
    const key = this.createMachineIndexKey(normalizedMachineType, normalizedVoltageTier);
    const recipeIds = this.machineIndex.get(key) ?? [];
    return this.getRecipesByIds(recipeIds);
  }

  getProducedByRecipeIds(itemId: string): string[] {
    this.loadRecipesIfNeeded();
    return this.producedByIndex.get(itemId) ?? [];
  }

  getUsedInRecipeIds(itemId: string): string[] {
    this.loadRecipesIfNeeded();
    return this.usedInIndex.get(itemId) ?? [];
  }

  getRecipeLinkCount(itemId: string): number {
    this.loadRecipesIfNeeded();
    return (this.producedByIndex.get(itemId)?.length ?? 0) + (this.usedInIndex.get(itemId)?.length ?? 0);
  }
}

let instance: NesqlSplitExportService | null = null;

export function getNesqlSplitExportService(): NesqlSplitExportService {
  if (!instance) {
    instance = new NesqlSplitExportService();
  }
  return instance;
}
