import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pinyin } from 'pinyin-pro';
import { DatabaseManager } from '../models/database';
import { DATA_DIR } from '../config/runtime-paths';
import { ItemsService } from './items.service';
import { PageAtlasService } from './page-atlas.service';
import { getMachineIconItem } from './machine-icon-mapping.service';
import { transformRecipeMetadata } from './recipe-metadata';

export interface CompilerSourceRoots {
  itemsDir: string;
  recipesDir: string;
  canonicalDir: string;
  imageRoot: string;
}

export interface CompilerRunResult {
  signature: string;
  itemsImported: number;
  recipesImported: number;
  hotAtlasesGenerated: number;
}

export interface CompilerOptions {
  hotPageAtlas?: {
    enabled?: boolean;
    pages?: number;
    pageSize?: number;
    slotSizes?: number[];
    atlasOutputDir?: string;
  };
}

type NormalizedCompilerOptions = {
  hotPageAtlas: {
    enabled: boolean;
    pages: number;
    pageSize: number;
    slotSizes: number[];
    atlasOutputDir: string;
  };
  bootstrap: {
    hotItemLimit: number;
    inlineSeedLimit: number;
  };
};

const MATERIAL_BASE_SUFFIX_RULES: Array<{ suffix: string; weight: number }> = [
  { suffix: '锭', weight: 120 },
  { suffix: '粒', weight: 100 },
  { suffix: '珍珠', weight: 95 },
  { suffix: '钻石', weight: 95 },
  { suffix: '宝石', weight: 90 },
];

type SplitItemRecord = {
  itemId?: string;
  modId?: string;
  internalName?: string;
  localizedName?: string;
  unlocalizedName?: string;
  damage?: number;
  imageFileName?: string | null;
  renderAssetRef?: string | null;
  preferredImageUrl?: string | null;
  tooltip?: string | null;
  searchTerms?: string | null;
};

type SplitRecipeRecord = {
  id?: string;
  recipeType?: string;
  inputs?: Array<{
    slotIndex?: number;
    items?: Array<{
      item?: {
        itemId?: string;
        modId?: string;
        internalName?: string;
        localizedName?: string;
        imageFileName?: string | null;
        renderAssetRef?: string | null;
        damage?: number;
        tooltip?: string | null;
      };
      stackSize?: number;
      probability?: number;
    }>;
    isOreDictionary?: boolean;
    oreDictName?: string | null;
  }>;
  outputs?: Array<{
    item?: {
      itemId?: string;
      modId?: string;
      internalName?: string;
      localizedName?: string;
      imageFileName?: string | null;
      renderAssetRef?: string | null;
      damage?: number;
      tooltip?: string | null;
    };
    stackSize?: number;
    probability?: number;
  }>;
  fluidInputs?: Array<{
    slotIndex?: number;
    fluids?: Array<{
      fluid?: {
        fluidId?: string;
        modId?: string;
        internalName?: string;
        localizedName?: string;
        renderAssetRef?: string | null;
        temperature?: number;
      };
      amount?: number;
      probability?: number;
    }>;
  }>;
  fluidOutputs?: Array<{
    fluid?: {
      fluidId?: string;
      modId?: string;
      internalName?: string;
      localizedName?: string;
      renderAssetRef?: string | null;
      temperature?: number;
    };
    amount?: number;
    probability?: number;
  }>;
  machineInfo?: {
    machineId?: string;
    machineType?: string;
    category?: string;
    iconInfo?: string;
    shapeless?: boolean;
    parsedVoltageTier?: string | null;
    parsedVoltage?: number | null;
  };
  metadata?: Record<string, unknown> | null;
  additionalData?: Record<string, unknown> | null;
  recipeTypeData?: Record<string, unknown> | null;
};

type UiPayloadRecord = {
  payloadId: string;
  recipeId: string;
  familyKey: string;
  payloadJson: string;
};

type MaterializedItemRecord = {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef: string | null;
  damage: number;
  imageFileName: string | null;
  tooltip: string | null;
};

type MaterializedRecipePayload = Record<string, unknown>;

function readGzipJsonArray(filePath: string): SplitItemRecord[] {
  if (!fs.existsSync(filePath)) return [];
  const buffer = fs.readFileSync(filePath);
  return JSON.parse(zlib.gunzipSync(buffer).toString('utf8')) as SplitItemRecord[];
}

function readGzipRecipeArray(filePath: string): SplitRecipeRecord[] {
  if (!fs.existsSync(filePath)) return [];
  const buffer = fs.readFileSync(filePath);
  return JSON.parse(zlib.gunzipSync(buffer).toString('utf8')) as SplitRecipeRecord[];
}

function normalizeLooseText(value: string | null | undefined): string {
  return `${value ?? ''}`.trim().toLowerCase();
}

function normalizeCompactText(value: string | null | undefined): string {
  return normalizeLooseText(value).replace(/\s+/g, '');
}

function buildPinyinFields(localizedName: string): { pinyinFull: string; pinyinAcronym: string } {
  const syllables = pinyin(localizedName, {
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
    v: false,
  })
    .map((part) => normalizeCompactText(part))
    .filter(Boolean);

  return {
    pinyinFull: syllables.join(''),
    pinyinAcronym: syllables.map((part) => part[0]).join(''),
  };
}

function deriveAliasesAndPopularity(localizedName: string): { aliases: string | null; popularityScore: number } {
  const normalizedName = `${localizedName ?? ''}`.trim();
  for (const rule of MATERIAL_BASE_SUFFIX_RULES) {
    if (normalizedName.endsWith(rule.suffix) && normalizedName.length > rule.suffix.length) {
      const baseName = normalizedName.slice(0, -rule.suffix.length);
      const pinyinFields = buildPinyinFields(baseName);
      const aliases = [baseName, pinyinFields.pinyinFull, pinyinFields.pinyinAcronym]
        .map((value) => `${value ?? ''}`.trim())
        .filter(Boolean)
        .join(' ');
      return {
        aliases: aliases || null,
        popularityScore: rule.weight,
      };
    }
  }

  return {
    aliases: null,
    popularityScore: 0,
  };
}

function toPublicImageUrl(imageFileName: string | null | undefined): string | null {
  if (!imageFileName) return null;
  const normalized = imageFileName
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^images\/item\//, '')
    .replace(/^api\/images\/item\//, '');
  if (!normalized) return null;
  return `/images/item/${normalized.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

function listModItemFiles(itemsDir: string): string[] {
  if (!fs.existsSync(itemsDir)) return [];
  return fs
    .readdirSync(itemsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(itemsDir, entry.name, 'items.json.gz'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort((a, b) => a.localeCompare(b));
}

function listRecipeFiles(recipesDir: string): string[] {
  if (!fs.existsSync(recipesDir)) return [];
  const result: string[] = [];
  const categoryDirs = fs.readdirSync(recipesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const categoryDir of categoryDirs) {
    const categoryPath = path.join(recipesDir, categoryDir.name);
    const modDirs = fs.readdirSync(categoryPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const modDir of modDirs) {
      const filePath = path.join(categoryPath, modDir.name, 'recipes.json.gz');
      if (fs.existsSync(filePath)) {
        result.push(filePath);
      }
    }
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function extractInputItemIds(recipe: SplitRecipeRecord): string[] {
  const result = new Set<string>();
  for (const slot of recipe.inputs ?? []) {
    for (const stack of slot.items ?? []) {
      const itemId = stack.item?.itemId;
      if (itemId?.trim()) {
        result.add(itemId.trim());
      }
    }
  }
  return Array.from(result);
}

function extractOutputItemIds(recipe: SplitRecipeRecord): string[] {
  const result = new Set<string>();
  for (const stack of recipe.outputs ?? []) {
    const itemId = stack.item?.itemId;
    if (itemId?.trim()) {
      result.add(itemId.trim());
    }
  }
  return Array.from(result);
}

function detectUiFamilyKey(recipe: SplitRecipeRecord): string | null {
  const machineType = `${recipe.machineInfo?.machineType ?? ''}`.trim().toLowerCase();
  const recipeType = `${recipe.recipeType ?? ''}`.trim().toLowerCase();
  const combined = `${machineType} ${recipeType}`;

  if (combined.includes('terra plate') || combined.includes('泰拉凝聚板')) return 'botania_terra_plate';
  if (combined.includes('rune altar') || combined.includes('符文祭坛')) return 'botania_rune_altar';
  if (combined.includes('mana pool') || combined.includes('魔力池')) return 'botania_mana_pool';
  if (combined.includes('infusion') || combined.includes('奥术注魔')) return 'thaumcraft_infusion';
  if (combined.includes('blood altar') || combined.includes('血祭坛') || combined.includes('血之祭坛')) return 'blood_magic_altar';
  return null;
}

function buildUiPayload(recipe: SplitRecipeRecord, familyKey: string): UiPayloadRecord {
  const inputIds = extractInputItemIds(recipe);
  const outputIds = extractOutputItemIds(recipe);
  const payload = {
    recipeId: `${recipe.id ?? ''}`.trim(),
    familyKey,
    machineType: `${recipe.machineInfo?.machineType ?? ''}`.trim(),
    recipeType: `${recipe.recipeType ?? ''}`.trim(),
    inputItemIds: inputIds,
    outputItemIds: outputIds,
    slotCount: {
      input: inputIds.length,
      output: outputIds.length,
    },
    presentation: {
      surface: familyKey.includes('botania') ? 'nature_ritual' : 'ritual',
      density: outputIds.length + inputIds.length > 8 ? 'wide' : 'default',
    },
  };

  return {
    payloadId: `ui~${payload.recipeId}`,
    recipeId: payload.recipeId,
    familyKey,
    payloadJson: JSON.stringify(payload),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function compactJsonValue(value: unknown, depth = 0): unknown {
  if (value == null) return null;
  if (depth > 5) return undefined;
  if (typeof value === 'string') {
    return value.length <= 512 ? value : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => compactJsonValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (!isPlainObject(value)) {
    return undefined;
  }

  const compacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalized = compactJsonValue(entry, depth + 1);
    if (normalized !== undefined) {
      compacted[key] = normalized;
    }
  }
  return compacted;
}

function compactObject(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  const compacted = compactJsonValue(value, 0);
  if (!isPlainObject(compacted) || Object.keys(compacted).length === 0) {
    return null;
  }
  return compacted;
}

function toMaterializedItemRecord(record: SplitItemRecord): MaterializedItemRecord | null {
  const itemId = String(record.itemId ?? '').trim();
  if (!itemId) return null;
  return {
    itemId,
    modId: String(record.modId ?? ''),
    internalName: String(record.internalName ?? ''),
    localizedName: String(record.localizedName ?? ''),
    renderAssetRef: typeof record.renderAssetRef === 'string' ? record.renderAssetRef : null,
    damage: Number(record.damage ?? 0),
    imageFileName: typeof record.imageFileName === 'string' ? record.imageFileName : null,
    tooltip: typeof record.tooltip === 'string' ? record.tooltip : null,
  };
}

function buildMaterializedItem(
  entry: {
    itemId?: string;
    modId?: string;
    internalName?: string;
    localizedName?: string;
    imageFileName?: string | null;
    renderAssetRef?: string | null;
    damage?: number;
    tooltip?: string | null;
  } | undefined,
  itemRecords: Map<string, MaterializedItemRecord>,
): Record<string, unknown> {
  const itemId = `${entry?.itemId ?? ''}`.trim();
  const fallback = itemId ? itemRecords.get(itemId) : null;
  return {
    itemId,
    modId: `${entry?.modId ?? fallback?.modId ?? ''}`.trim(),
    internalName: `${entry?.internalName ?? fallback?.internalName ?? ''}`.trim(),
    localizedName: `${entry?.localizedName ?? fallback?.localizedName ?? ''}`.trim(),
    renderAssetRef:
      typeof entry?.renderAssetRef === 'string' ? entry.renderAssetRef : fallback?.renderAssetRef ?? null,
    damage: Number(entry?.damage ?? fallback?.damage ?? 0),
    stackSize: 1,
    maxStackSize: 64,
    maxDamage: 0,
    nbt: null,
    imageFileName:
      typeof entry?.imageFileName === 'string' ? entry.imageFileName : fallback?.imageFileName ?? null,
    tooltip: typeof entry?.tooltip === 'string' ? entry.tooltip : fallback?.tooltip ?? null,
  };
}

function buildMaterializedRecipe(
  recipe: SplitRecipeRecord,
  family: string,
  itemRecords: Map<string, MaterializedItemRecord>,
): MaterializedRecipePayload {
  const machineType = `${recipe.machineInfo?.machineType ?? ''}`.trim();
  const machineIcon = machineType ? getMachineIconItem(machineType) : null;
  const compactMetadata = compactObject(recipe.metadata ?? null);
  const transformedMetadata = transformRecipeMetadata(compactMetadata, (entry) =>
    buildMaterializedItem((entry as { itemId?: string } | undefined) ?? undefined, itemRecords) as never,
  );

  return {
    id: `${recipe.id ?? ''}`.trim(),
    recipeType: `${recipe.recipeType ?? family}`.trim(),
    outputs: (recipe.outputs ?? []).map((stack) => ({
      item: buildMaterializedItem(stack.item, itemRecords),
      stackSize: Number(stack.stackSize ?? 1),
      probability: Number(stack.probability ?? 1),
    })),
    inputs: (recipe.inputs ?? []).map((group) => ({
      slotIndex: Number(group.slotIndex ?? 0),
      items: (group.items ?? []).map((stack) => ({
        item: buildMaterializedItem(stack.item, itemRecords),
        stackSize: Number(stack.stackSize ?? 1),
        probability: Number(stack.probability ?? 1),
      })),
      isOreDictionary: Boolean(group.isOreDictionary),
      oreDictName: typeof group.oreDictName === 'string' ? group.oreDictName : null,
    })),
    fluidInputs: (recipe.fluidInputs ?? []).map((group) => ({
      slotIndex: Number(group.slotIndex ?? 0),
      fluids: (group.fluids ?? []).map((stack) => ({
        fluid: {
          fluidId: `${stack.fluid?.fluidId ?? ''}`.trim(),
          modId: `${stack.fluid?.modId ?? ''}`.trim(),
          internalName: `${stack.fluid?.internalName ?? ''}`.trim(),
          localizedName: `${stack.fluid?.localizedName ?? ''}`.trim(),
          renderAssetRef: typeof stack.fluid?.renderAssetRef === 'string' ? stack.fluid.renderAssetRef : null,
          temperature: Number(stack.fluid?.temperature ?? 0),
        },
        amount: Number(stack.amount ?? 0),
        probability: Number(stack.probability ?? 1),
      })),
    })),
    fluidOutputs: (recipe.fluidOutputs ?? []).map((stack) => ({
      fluid: {
        fluidId: `${stack.fluid?.fluidId ?? ''}`.trim(),
        modId: `${stack.fluid?.modId ?? ''}`.trim(),
        internalName: `${stack.fluid?.internalName ?? ''}`.trim(),
        localizedName: `${stack.fluid?.localizedName ?? ''}`.trim(),
        renderAssetRef: typeof stack.fluid?.renderAssetRef === 'string' ? stack.fluid.renderAssetRef : null,
        temperature: Number(stack.fluid?.temperature ?? 0),
      },
      amount: Number(stack.amount ?? 0),
      probability: Number(stack.probability ?? 1),
    })),
    machineInfo: recipe.machineInfo
      ? {
          machineId: `${recipe.machineInfo.machineId ?? ''}`.trim(),
          category: `${recipe.machineInfo.category ?? ''}`.trim(),
          machineType,
          iconInfo: `${recipe.machineInfo.iconInfo ?? ''}`.trim(),
          shapeless: Boolean(recipe.machineInfo.shapeless),
          parsedVoltageTier: recipe.machineInfo.parsedVoltageTier ?? null,
          parsedVoltage: recipe.machineInfo.parsedVoltage ?? null,
          machineIcon: machineIcon ?? undefined,
        }
      : null,
    metadata: transformedMetadata,
    additionalData: compactObject(recipe.additionalData ?? null),
    recipeTypeData: compactObject(recipe.recipeTypeData ?? null),
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export class NeoNeiCompilerService {
  private options: NormalizedCompilerOptions;
  private readonly bootstrapChunkSize = 500;
  private logStage(message: string, meta?: Record<string, unknown>): void {
    if (meta && Object.keys(meta).length > 0) {
      console.log(`[ACCEL_COMPILE] ${message} ${JSON.stringify(meta)}`);
      return;
    }
    console.log(`[ACCEL_COMPILE] ${message}`);
  }
  constructor(
    private readonly databaseManager: DatabaseManager,
    private readonly sourceRoots: CompilerSourceRoots,
    options: CompilerOptions = {},
  ) {
    this.options = {
      hotPageAtlas: {
        enabled: options.hotPageAtlas?.enabled ?? true,
        pages: options.hotPageAtlas?.pages ?? 2,
        pageSize: options.hotPageAtlas?.pageSize ?? 120,
        slotSizes: options.hotPageAtlas?.slotSizes ?? [45],
        atlasOutputDir: options.hotPageAtlas?.atlasOutputDir ?? path.join(DATA_DIR, 'page-atlas-cache'),
      },
      bootstrap: {
        hotItemLimit: 5000,
        inlineSeedLimit: 2,
      },
    };
  }

  private buildSignature(itemFiles: string[]): string {
    const hash = crypto.createHash('sha1');
    hash.update(JSON.stringify(this.sourceRoots));
    for (const filePath of itemFiles) {
      const stat = fs.statSync(filePath);
      hash.update(`${filePath}:${stat.size}:${stat.mtimeMs}`);
    }
    return hash.digest('hex');
  }

  private getItemFiles(): string[] {
    return listModItemFiles(this.sourceRoots.itemsDir);
  }

  private getRecipeFiles(): string[] {
    return listRecipeFiles(this.sourceRoots.recipesDir);
  }

  getCurrentSourceSignature(): string {
    return this.buildSignature([...this.getItemFiles(), ...this.getRecipeFiles()]);
  }

  isAccelerationStateFresh(): boolean {
    const db = this.databaseManager.getDatabase();
    const stateRow = db
      .prepare('SELECT state_value FROM compiler_state WHERE state_key = ?')
      .get('source_signature') as { state_value?: string } | undefined;
    if (!stateRow?.state_value) return false;
    return stateRow.state_value === this.getCurrentSourceSignature();
  }

  async ensureCompiled(): Promise<CompilerRunResult | null> {
    if (this.isAccelerationStateFresh()) {
      return null;
    }
    return this.compile();
  }

  async compile(): Promise<CompilerRunResult> {
    const db = this.databaseManager.getDatabase();
    const itemFiles = this.getItemFiles();
    const recipeFiles = this.getRecipeFiles();
    const signature = this.buildSignature([...itemFiles, ...recipeFiles]);
    this.logStage('compile-start', {
      itemFiles: itemFiles.length,
      recipeFiles: recipeFiles.length,
      signature,
    });

    const insertItemCore = db.prepare(`
      INSERT OR REPLACE INTO items_core (
        item_id, mod_id, internal_name, localized_name, unlocalized_name, damage,
        image_file_name, render_asset_ref, preferred_image_url, tooltip, search_terms, updated_at
      ) VALUES (
        @item_id, @mod_id, @internal_name, @localized_name, @unlocalized_name, @damage,
        @image_file_name, @render_asset_ref, @preferred_image_url, @tooltip, @search_terms, CURRENT_TIMESTAMP
      )
    `);

    const insertItemSearch = db.prepare(`
      INSERT OR REPLACE INTO items_search (
        item_id, localized_name_norm, internal_name_norm, item_id_norm, search_terms_norm,
        pinyin_full, pinyin_acronym, aliases, popularity_score, family_score, updated_at
      ) VALUES (
        @item_id, @localized_name_norm, @internal_name_norm, @item_id_norm, @search_terms_norm,
        @pinyin_full, @pinyin_acronym, @aliases, @popularity_score, @family_score, CURRENT_TIMESTAMP
      )
    `);

    const upsertState = db.prepare(`
      INSERT INTO compiler_state (state_key, state_value, updated_at)
      VALUES (@state_key, @state_value, CURRENT_TIMESTAMP)
      ON CONFLICT(state_key) DO UPDATE SET
        state_value = excluded.state_value,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertRecipeCore = db.prepare(`
      INSERT OR REPLACE INTO recipes_core (
        recipe_id, recipe_type, family, machine_type, voltage_tier, source_mod,
        input_count, output_count, bootstrap_key, payload, updated_at
      ) VALUES (
        @recipe_id, @recipe_type, @family, @machine_type, @voltage_tier, @source_mod,
        @input_count, @output_count, @bootstrap_key, @payload, CURRENT_TIMESTAMP
      )
    `);

    const insertRecipeEdge = db.prepare(`
      INSERT INTO recipe_edges (
        item_id, relation_type, recipe_id, slot_index, weight, updated_at
      ) VALUES (
        @item_id, @relation_type, @recipe_id, @slot_index, @weight, CURRENT_TIMESTAMP
      )
    `);

    const insertMachineGroup = db.prepare(`
      INSERT INTO recipe_machine_groups (
        item_id, machine_key, family, voltage_tier, recipe_ids_blob, recipe_count, updated_at
      ) VALUES (
        @item_id, @machine_key, @family, @voltage_tier, @recipe_ids_blob, @recipe_count, CURRENT_TIMESTAMP
      )
    `);

    const insertBootstrap = db.prepare(`
      INSERT OR REPLACE INTO recipe_bootstrap (
        item_id, produced_by_ids, used_in_ids, produced_by_payload, used_in_payload, summary_payload, signature, updated_at
      ) VALUES (
        @item_id, @produced_by_ids, @used_in_ids, @produced_by_payload, @used_in_payload, @summary_payload, @signature, CURRENT_TIMESTAMP
      )
    `);

    const insertSummaryCompact = db.prepare(`
      INSERT OR REPLACE INTO recipe_summary_compact (
        item_id, summary_payload, signature, updated_at
      ) VALUES (
        @item_id, @summary_payload, @signature, CURRENT_TIMESTAMP
      )
    `);

    const insertUiPayload = db.prepare(`
      INSERT OR REPLACE INTO ui_payloads (
        payload_id, recipe_id, family_key, payload_json, signature, updated_at
      ) VALUES (
        @payload_id, @recipe_id, @family_key, @payload_json, @signature, CURRENT_TIMESTAMP
      )
    `);

    const insertHotItem = db.prepare(`
      INSERT OR REPLACE INTO hot_items (
        item_id, popularity_score, home_rank, search_rank, recipe_rank, updated_at
      ) VALUES (
        @item_id, @popularity_score, @home_rank, @search_rank, @recipe_rank, CURRENT_TIMESTAMP
      )
    `);

    let itemsImported = 0;
    let recipesImported = 0;
    let recipesCorePayloadBytes = 0;
    let recipeBootstrapPayloadBytes = 0;
    let recipeSummaryCompactBytes = 0;
    let uiPayloadBytes = 0;
    const itemRecords = new Map<string, MaterializedItemRecord>();
    const producedByMap = new Map<string, MaterializedRecipePayload[]>();
    const usedInMap = new Map<string, MaterializedRecipePayload[]>();
    const machineGroupsMap = new Map<string, Map<string, { family: string; voltageTier: string | null; recipeIds: string[] }>>();
    let allBootstrapItemIds: string[] = [];
    let hotBootstrapItemIds: string[] = [];

    const resetTransaction = db.transaction(() => {
      db.exec('DELETE FROM items_core');
      db.exec('DELETE FROM items_search');
      db.exec('DELETE FROM recipes_core');
      db.exec('DELETE FROM recipe_edges');
      db.exec('DELETE FROM recipe_machine_groups');
      db.exec('DELETE FROM recipe_bootstrap');
      db.exec('DELETE FROM recipe_summary_compact');
      db.exec('DELETE FROM ui_payloads');
      db.exec('DELETE FROM hot_items');
      db.exec("DELETE FROM assets_manifest WHERE asset_type = 'page_atlas'");
    });

    const itemsTransaction = db.transaction(() => {
      for (const filePath of itemFiles) {
        const records = readGzipJsonArray(filePath);
        for (const record of records) {
          const itemId = String(record.itemId ?? '').trim();
          if (!itemId) continue;

          const localizedName = String(record.localizedName ?? '');
          const internalName = String(record.internalName ?? '');
          const pinyinFields = buildPinyinFields(localizedName);
          const aliasMetadata = deriveAliasesAndPopularity(localizedName);

          insertItemCore.run({
            item_id: itemId,
            mod_id: String(record.modId ?? ''),
            internal_name: internalName,
            localized_name: localizedName,
            unlocalized_name: String(record.unlocalizedName ?? ''),
            damage: Number(record.damage ?? 0),
            image_file_name: record.imageFileName ?? null,
            render_asset_ref: record.renderAssetRef ?? null,
            preferred_image_url: record.preferredImageUrl ?? toPublicImageUrl(record.imageFileName ?? null),
            tooltip: record.tooltip ?? null,
            search_terms: record.searchTerms ?? null,
          });

          insertItemSearch.run({
            item_id: itemId,
            localized_name_norm: normalizeLooseText(localizedName),
            internal_name_norm: normalizeCompactText(internalName),
            item_id_norm: normalizeCompactText(itemId),
            search_terms_norm: normalizeLooseText(record.searchTerms ?? ''),
            pinyin_full: pinyinFields.pinyinFull,
            pinyin_acronym: pinyinFields.pinyinAcronym,
            aliases: aliasMetadata.aliases,
            popularity_score: aliasMetadata.popularityScore,
            family_score: 0,
          });

          const materializedItem = toMaterializedItemRecord(record);
          if (materializedItem) {
            itemRecords.set(materializedItem.itemId, materializedItem);
          }

          itemsImported += 1;
        }
      }
    });

    const recipesTransaction = db.transaction((filePath: string) => {
      const records = readGzipRecipeArray(filePath);
      const sourceMod = path.basename(path.dirname(filePath));
      const family = path.basename(path.dirname(path.dirname(filePath)));

      for (const recipe of records) {
        const recipeId = `${recipe.id ?? ''}`.trim();
        if (!recipeId) continue;

        const inputIds = extractInputItemIds(recipe);
        const outputIds = extractOutputItemIds(recipe);
        const machineType = `${recipe.machineInfo?.machineType ?? ''}`.trim() || null;
        const voltageTier = recipe.machineInfo?.parsedVoltageTier ?? null;
        const uiFamilyKey = detectUiFamilyKey(recipe);
        const materializedRecipe = buildMaterializedRecipe(recipe, family, itemRecords);
        const materializedRecipeJson = JSON.stringify(materializedRecipe);
        recipesCorePayloadBytes += Buffer.byteLength(materializedRecipeJson, 'utf8');

        insertRecipeCore.run({
          recipe_id: recipeId,
          recipe_type: recipe.recipeType ?? family,
          family,
          machine_type: machineType,
          voltage_tier: voltageTier,
          source_mod: sourceMod,
          input_count: inputIds.length,
          output_count: outputIds.length,
          bootstrap_key: outputIds[0] ?? inputIds[0] ?? recipeId,
          payload: materializedRecipeJson,
        });

        inputIds.forEach((itemId, index) => {
          insertRecipeEdge.run({
            item_id: itemId,
            relation_type: 'used_in',
            recipe_id: recipeId,
            slot_index: index,
            weight: 0,
          });
          const list = usedInMap.get(itemId) ?? [];
          list.push(materializedRecipe);
          usedInMap.set(itemId, list);
        });

        outputIds.forEach((itemId, index) => {
          insertRecipeEdge.run({
            item_id: itemId,
            relation_type: 'produced_by',
            recipe_id: recipeId,
            slot_index: index,
            weight: 0,
          });
          const list = producedByMap.get(itemId) ?? [];
          list.push(materializedRecipe);
          producedByMap.set(itemId, list);

          if (machineType) {
            const machineKey = `${machineType}::${voltageTier ?? ''}`;
            const itemMachineGroups = machineGroupsMap.get(itemId) ?? new Map<string, { family: string; voltageTier: string | null; recipeIds: string[] }>();
            const group = itemMachineGroups.get(machineKey) ?? {
              family,
              voltageTier,
              recipeIds: [],
            };
            group.recipeIds.push(recipeId);
            itemMachineGroups.set(machineKey, group);
            machineGroupsMap.set(itemId, itemMachineGroups);
          }
        });

        if (uiFamilyKey) {
          const uiPayload = buildUiPayload(recipe, uiFamilyKey);
          uiPayloadBytes += Buffer.byteLength(uiPayload.payloadJson, 'utf8');
          insertUiPayload.run({
            payload_id: uiPayload.payloadId,
            recipe_id: uiPayload.recipeId,
            family_key: uiPayload.familyKey,
            payload_json: uiPayload.payloadJson,
            signature,
          });
        }

        recipesImported += 1;
      }
    });

    const machineGroupsTransaction = db.transaction(() => {
      for (const [itemId, groups] of machineGroupsMap.entries()) {
        for (const [machineKey, group] of groups.entries()) {
          insertMachineGroup.run({
            item_id: itemId,
            machine_key: machineKey,
            family: group.family,
            voltage_tier: group.voltageTier,
            recipe_ids_blob: JSON.stringify(group.recipeIds),
            recipe_count: group.recipeIds.length,
          });
        }
      }
    });

    const hotItemsTransaction = db.transaction(() => {
      const selectHomeOrder = db.prepare(`
        SELECT item_id
        FROM items_core
        ORDER BY localized_name COLLATE NOCASE ASC
        LIMIT 2000
      `);
      const selectPopularity = db.prepare(`
        SELECT popularity_score
        FROM items_search
        WHERE item_id = ?
      `);

      const homeRows = selectHomeOrder.all() as Array<{ item_id: string }>;
      const homeRankMap = new Map<string, number>();
      homeRows.forEach((row, index) => {
        homeRankMap.set(row.item_id, index + 1);
      });

      const hotScores = new Map<string, { score: number; recipeRank: number }>();
      const allBootstrapItemIds = new Set<string>([
        ...Array.from(producedByMap.keys()),
        ...Array.from(usedInMap.keys()),
      ]);

      for (const itemId of allBootstrapItemIds) {
        const produced = producedByMap.get(itemId)?.length ?? 0;
        const used = usedInMap.get(itemId)?.length ?? 0;
        const machineCount = machineGroupsMap.get(itemId)?.size ?? 0;
        const popularityRow = selectPopularity.get(itemId) as { popularity_score?: number } | undefined;
        const popularity = Number(popularityRow?.popularity_score ?? 0);
        const score = produced * 5 + used * 3 + machineCount * 7 + popularity;
        hotScores.set(itemId, {
          score,
          recipeRank: produced + used,
        });
      }

      const sorted = Array.from(hotScores.entries())
        .sort((a, b) => b[1].score - a[1].score || b[1].recipeRank - a[1].recipeRank || a[0].localeCompare(b[0]));

      sorted.forEach(([itemId, meta], index) => {
        insertHotItem.run({
          item_id: itemId,
          popularity_score: meta.score,
          home_rank: homeRankMap.get(itemId) ?? null,
          search_rank: index + 1,
          recipe_rank: meta.recipeRank,
        });
      });
    });

    const bootstrapTransaction = db.transaction((bootstrapItemIds: string[], writeFullBootstrap: boolean) => {
      const selectItemCore = db.prepare(`
        SELECT
          item_id,
          mod_id,
          internal_name,
          localized_name,
          unlocalized_name,
          damage,
          image_file_name,
          render_asset_ref,
          preferred_image_url,
          tooltip,
          search_terms
        FROM items_core
        WHERE item_id = ?
      `);

      for (const itemId of bootstrapItemIds) {
        const itemRow = selectItemCore.get(itemId) as Record<string, unknown> | undefined;
        if (!itemRow) continue;

        const itemPayload = {
          itemId: String(itemRow.item_id ?? ''),
          modId: String(itemRow.mod_id ?? ''),
          internalName: String(itemRow.internal_name ?? ''),
          localizedName: String(itemRow.localized_name ?? ''),
          renderAssetRef: typeof itemRow.render_asset_ref === 'string' ? itemRow.render_asset_ref : null,
          preferredImageUrl: typeof itemRow.preferred_image_url === 'string' ? itemRow.preferred_image_url : null,
          unlocalizedName: String(itemRow.unlocalized_name ?? ''),
          damage: Number(itemRow.damage ?? 0),
          maxStackSize: 64,
          maxDamage: 0,
          imageFileName: typeof itemRow.image_file_name === 'string' ? itemRow.image_file_name : null,
          tooltip: typeof itemRow.tooltip === 'string' ? itemRow.tooltip : null,
          searchTerms: typeof itemRow.search_terms === 'string' ? itemRow.search_terms : null,
          toolClasses: null,
        };

        const indexedCrafting = (producedByMap.get(itemId) ?? []) as unknown as object[];
        const indexedUsage = (usedInMap.get(itemId) ?? []) as unknown as object[];
        const producedByRecipeIds = indexedCrafting
          .map((recipe) => String((recipe as { id?: string }).id ?? ''))
          .filter(Boolean);
        const usedInRecipeIds = indexedUsage
          .map((recipe) => String((recipe as { id?: string }).id ?? ''))
          .filter(Boolean);
        const inlineProducedBy = indexedCrafting.slice(0, this.options.bootstrap.inlineSeedLimit);
        const inlineUsedIn = indexedUsage.slice(0, this.options.bootstrap.inlineSeedLimit);
        const payload = {
          item: itemPayload,
          recipeIndex: {
            usedInRecipes: usedInRecipeIds,
            producedByRecipes: producedByRecipeIds,
          },
          seedRecipeIds: {
            producedBy: producedByRecipeIds.slice(0, this.options.bootstrap.inlineSeedLimit),
            usedIn: usedInRecipeIds.slice(0, this.options.bootstrap.inlineSeedLimit),
          },
          indexedSummary: {
            itemId,
            itemName: itemPayload.localizedName,
            counts: {
              producedBy: indexedCrafting.length,
              usedIn: indexedUsage.length,
              machineGroups: (machineGroupsMap.get(itemId)?.size ?? 0),
            },
            machineGroups: Array.from(machineGroupsMap.get(itemId)?.entries() ?? []).map(([machineKey, group]) => ({
              machineType: machineKey.split('::')[0],
              category: group.family,
              voltageTier: group.voltageTier,
              voltage: null,
              recipeCount: group.recipeIds.length,
            })),
          },
        };

        insertSummaryCompact.run({
          item_id: itemId,
          summary_payload: JSON.stringify(payload.indexedSummary),
          signature,
        });
        recipeSummaryCompactBytes += Buffer.byteLength(JSON.stringify(payload.indexedSummary), 'utf8');

        if (writeFullBootstrap) {
          const producedByIds = JSON.stringify(producedByRecipeIds);
          const usedInIds = JSON.stringify(usedInRecipeIds);
          const producedByPayload = JSON.stringify(inlineProducedBy);
          const usedInPayload = JSON.stringify(inlineUsedIn);
          const summaryPayload = JSON.stringify(payload);
          recipeBootstrapPayloadBytes +=
            Buffer.byteLength(producedByIds, 'utf8') +
            Buffer.byteLength(usedInIds, 'utf8') +
            Buffer.byteLength(producedByPayload, 'utf8') +
            Buffer.byteLength(usedInPayload, 'utf8') +
            Buffer.byteLength(summaryPayload, 'utf8');
          insertBootstrap.run({
            item_id: itemId,
            produced_by_ids: producedByIds,
            used_in_ids: usedInIds,
            produced_by_payload: producedByPayload,
            used_in_payload: usedInPayload,
            summary_payload: summaryPayload,
            signature,
          });
        }
      }
    });

    const stateTransaction = db.transaction(() => {
      upsertState.run({ state_key: 'source_signature', state_value: signature });
      upsertState.run({ state_key: 'items_dir', state_value: this.sourceRoots.itemsDir });
      upsertState.run({ state_key: 'recipes_dir', state_value: this.sourceRoots.recipesDir });
      upsertState.run({ state_key: 'canonical_dir', state_value: this.sourceRoots.canonicalDir });
      upsertState.run({ state_key: 'image_root', state_value: this.sourceRoots.imageRoot });
      upsertState.run({ state_key: 'items_core_count', state_value: String(itemsImported) });
      upsertState.run({ state_key: 'recipes_core_count', state_value: String(recipesImported) });
      upsertState.run({ state_key: 'recipe_edges_count', state_value: String(Array.from(producedByMap.values()).reduce((sum, recipes) => sum + recipes.length, 0) + Array.from(usedInMap.values()).reduce((sum, recipes) => sum + recipes.length, 0)) });
      upsertState.run({ state_key: 'recipe_bootstrap_count', state_value: String(hotBootstrapItemIds.length) });
      upsertState.run({ state_key: 'recipe_summary_compact_count', state_value: String(allBootstrapItemIds.length) });
      upsertState.run({ state_key: 'recipe_machine_groups_count', state_value: String(Array.from(machineGroupsMap.values()).reduce((sum, groups) => sum + groups.size, 0)) });
      upsertState.run({ state_key: 'hot_items_count', state_value: String(allBootstrapItemIds.length) });
      upsertState.run({ state_key: 'recipes_core_payload_bytes', state_value: String(recipesCorePayloadBytes) });
      upsertState.run({ state_key: 'recipe_bootstrap_payload_bytes', state_value: String(recipeBootstrapPayloadBytes) });
      upsertState.run({ state_key: 'recipe_summary_compact_bytes', state_value: String(recipeSummaryCompactBytes) });
      upsertState.run({ state_key: 'ui_payload_bytes', state_value: String(uiPayloadBytes) });
      upsertState.run({
        state_key: 'ui_payloads_count',
        state_value: String((db.prepare('SELECT COUNT(*) AS c FROM ui_payloads').get() as { c: number }).c),
      });
    });

    resetTransaction();
    this.logStage('reset-done');
    db.pragma('wal_checkpoint(PASSIVE)');
    itemsTransaction();
    this.logStage('items-done', { itemsImported });
    db.pragma('wal_checkpoint(PASSIVE)');
    for (const filePath of recipeFiles) {
      recipesTransaction(filePath);
      db.pragma('wal_checkpoint(PASSIVE)');
    }
    this.logStage('recipes-done', { recipesImported });
    machineGroupsTransaction();
    this.logStage('machine-groups-done', { machineGroupItems: machineGroupsMap.size });
    db.pragma('wal_checkpoint(PASSIVE)');
    hotItemsTransaction();
    this.logStage('hot-items-done');
    db.pragma('wal_checkpoint(PASSIVE)');
    allBootstrapItemIds = Array.from(new Set<string>([
      ...Array.from(producedByMap.keys()),
      ...Array.from(usedInMap.keys()),
    ]));
    const hotBootstrapRows = db.prepare(`
      SELECT item_id
      FROM hot_items
      ORDER BY popularity_score DESC, search_rank ASC
      LIMIT ?
    `).all(this.options.bootstrap.hotItemLimit) as Array<{ item_id: string }>;
    hotBootstrapItemIds = hotBootstrapRows.map((row) => row.item_id);
    const hotBootstrapSet = new Set(hotBootstrapItemIds);
    const coldBootstrapItemIds = allBootstrapItemIds.filter((itemId) => !hotBootstrapSet.has(itemId));
    for (const itemIdChunk of chunkArray(hotBootstrapItemIds, this.bootstrapChunkSize)) {
      bootstrapTransaction(itemIdChunk, true);
      db.pragma('wal_checkpoint(PASSIVE)');
    }
    for (const itemIdChunk of chunkArray(coldBootstrapItemIds, this.bootstrapChunkSize)) {
      bootstrapTransaction(itemIdChunk, false);
      db.pragma('wal_checkpoint(PASSIVE)');
    }
    this.logStage('bootstrap-done', {
      hotBootstrap: hotBootstrapItemIds.length,
      coldBootstrap: coldBootstrapItemIds.length,
    });
    stateTransaction();
    this.logStage('state-done');
    db.pragma('wal_checkpoint(PASSIVE)');

    let hotAtlasesGenerated = 0;
    const hotPageAtlas = this.options.hotPageAtlas;
    if (hotPageAtlas.enabled) {
      const itemsService = new ItemsService({
        databaseManager: this.databaseManager,
        splitExportFallback: false,
      });
      const pageAtlasService = new PageAtlasService({
        databaseManager: this.databaseManager,
        itemsService,
        imageRoot: this.sourceRoots.imageRoot,
        atlasDir: hotPageAtlas.atlasOutputDir,
      });

      for (const slotSize of hotPageAtlas.slotSizes) {
        for (let page = 1; page <= hotPageAtlas.pages; page += 1) {
          // eslint-disable-next-line no-await-in-loop
          const result = await itemsService.getItems({ page, pageSize: hotPageAtlas.pageSize });
          if (!result.data.length) break;
          // eslint-disable-next-line no-await-in-loop
          const atlas = await pageAtlasService.buildAtlas(result.data, slotSize);
          if (atlas) {
            hotAtlasesGenerated += 1;
          }
        }
      }
    }

    this.logStage('hot-atlas-done', { hotAtlasesGenerated });
    const finalStateTransaction = db.transaction(() => {
      upsertState.run({ state_key: 'page_atlas_assets_count', state_value: String(hotAtlasesGenerated) });
    });
    finalStateTransaction();
    db.pragma('wal_checkpoint(PASSIVE)');

    return {
      signature,
      itemsImported,
      recipesImported,
      hotAtlasesGenerated,
    };
  }
}
