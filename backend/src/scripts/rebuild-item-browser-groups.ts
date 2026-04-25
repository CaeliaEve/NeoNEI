import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { ACCELERATION_DB_FILE, SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } from '../config/runtime-paths';
import { DatabaseManager } from '../models/database';
import { buildCollapsibleItemAssignments, type CollapsibleItemCandidate } from '../services/gtnh-collapsible-items.service';
import { compareGtnhBrowserOrder } from '../services/gtnh-browser-order.service';

type SplitRecipeRecord = {
  inputs?: Array<{
    isOreDictionary?: boolean;
    oreDictName?: string | null;
    items?: Array<{
      item?: {
        itemId?: string;
      };
    }>;
  }>;
};

type SplitItemRecord = {
  itemId?: string;
};

function listItemFiles(itemsDir: string): string[] {
  if (!itemsDir || !fs.existsSync(itemsDir)) {
    return [];
  }

  return fs
    .readdirSync(itemsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(itemsDir, entry.name, 'items.json.gz'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort((a, b) => a.localeCompare(b));
}

function listRecipeFiles(recipesDir: string): string[] {
  if (!recipesDir || !fs.existsSync(recipesDir)) {
    return [];
  }

  const files: string[] = [];
  const categoryDirs = fs.readdirSync(recipesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const categoryDir of categoryDirs) {
    const categoryPath = path.join(recipesDir, categoryDir.name);
    const modDirs = fs.readdirSync(categoryPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const modDir of modDirs) {
      const filePath = path.join(categoryPath, modDir.name, 'recipes.json.gz');
      if (fs.existsSync(filePath)) {
        files.push(filePath);
      }
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function readRecipeArray(filePath: string): SplitRecipeRecord[] {
  const buffer = fs.readFileSync(filePath);
  return JSON.parse(zlib.gunzipSync(buffer).toString('utf8')) as SplitRecipeRecord[];
}

function readItemArray(filePath: string): SplitItemRecord[] {
  const buffer = fs.readFileSync(filePath);
  return JSON.parse(zlib.gunzipSync(buffer).toString('utf8')) as SplitItemRecord[];
}

async function run(): Promise<void> {
  const manager = new DatabaseManager(ACCELERATION_DB_FILE);
  await manager.init();
  const db = manager.getDatabase();
  const sourceOrderMap = new Map<string, number>();

  let sourceOrder = 0;
  for (const filePath of listItemFiles(SPLIT_ITEMS_DIR)) {
    for (const item of readItemArray(filePath)) {
      const itemId = `${item.itemId ?? ''}`.trim();
      if (!itemId || sourceOrderMap.has(itemId)) continue;
      sourceOrderMap.set(itemId, sourceOrder);
      sourceOrder += 1;
    }
  }

  const oreMap = new Map<string, Set<string>>();
  for (const filePath of listRecipeFiles(SPLIT_RECIPES_DIR)) {
    for (const recipe of readRecipeArray(filePath)) {
      for (const slot of recipe.inputs ?? []) {
        const oreDictName = `${slot.oreDictName ?? ''}`.trim();
        if (!slot.isOreDictionary || !oreDictName) continue;
        for (const stack of slot.items ?? []) {
          const itemId = `${stack.item?.itemId ?? ''}`.trim();
          if (!itemId) continue;
          const current = oreMap.get(itemId) ?? new Set<string>();
          current.add(oreDictName);
          oreMap.set(itemId, current);
        }
      }
    }
  }

  const candidates = db.prepare(`
    SELECT item_id, mod_id, internal_name, localized_name, damage, tooltip
    FROM items_core
  `).all() as Array<{
    item_id: string;
    mod_id: string;
    internal_name: string;
    localized_name: string;
    damage: number;
    tooltip: string | null;
  }>;

  candidates.sort((left, right) =>
    compareGtnhBrowserOrder(
      {
        itemId: left.item_id,
        modId: left.mod_id,
        internalName: left.internal_name,
        localizedName: left.localized_name,
        damage: Number(left.damage ?? 0),
        tooltip: left.tooltip,
        sourceOrder: sourceOrderMap.get(left.item_id) ?? null,
      },
      {
        itemId: right.item_id,
        modId: right.mod_id,
        internalName: right.internal_name,
        localizedName: right.localized_name,
        damage: Number(right.damage ?? 0),
        tooltip: right.tooltip,
        sourceOrder: sourceOrderMap.get(right.item_id) ?? null,
      },
    ),
  );

  const assignments = buildCollapsibleItemAssignments(
    candidates.map(
      (row): CollapsibleItemCandidate => ({
        itemId: row.item_id,
        modId: row.mod_id,
        internalName: row.internal_name,
        localizedName: row.localized_name,
        damage: Number(row.damage ?? 0),
        oreDictionaryNames: Array.from(oreMap.get(row.item_id) ?? []),
      }),
    ),
  );

  const insert = db.prepare(`
    INSERT OR REPLACE INTO item_browser_groups (
      item_id, group_key, group_label, group_size, group_sort_order, updated_at
    ) VALUES (
      @item_id, @group_key, @group_label, @group_size, @group_sort_order, CURRENT_TIMESTAMP
    )
  `);

  const updateState = db.prepare(`
    INSERT INTO compiler_state (state_key, state_value, updated_at)
    VALUES (@state_key, @state_value, CURRENT_TIMESTAMP)
    ON CONFLICT(state_key) DO UPDATE SET
      state_value = excluded.state_value,
      updated_at = CURRENT_TIMESTAMP
  `);

  const tx = db.transaction(() => {
    db.exec('DELETE FROM item_browser_groups');
    for (const assignment of assignments.values()) {
      insert.run({
        item_id: assignment.itemId,
        group_key: assignment.groupKey,
        group_label: assignment.groupLabel,
        group_size: assignment.groupSize,
        group_sort_order: assignment.groupSortOrder,
      });
    }
    updateState.run({
      state_key: 'item_browser_groups_count',
      state_value: String(assignments.size),
    });
  });

  tx();
  db.pragma('wal_checkpoint(TRUNCATE)');
  manager.close();

  console.log(JSON.stringify({
    ok: true,
    assignments: assignments.size,
    groupedItems: Array.from(assignments.values()).filter((entry) => entry.groupKey).length,
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
