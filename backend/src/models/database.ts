import Database from 'better-sqlite3';
import * as fs from 'fs';
import { ACCELERATION_DB_FILE, DB_FILE } from '../config/runtime-paths';

type TableInfoRow = {
  name: string;
};

type TableListRow = {
  name: string;
};

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = DB_FILE) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    // Load or create database with better-sqlite3
    // better-sqlite3 doesn't have memory limitations like sql.js WASM
    const dbExists = fs.existsSync(this.dbPath);

    this.db = new Database(this.dbPath);

    if (dbExists) {
      console.log('✅ Database loaded from', this.dbPath);
      await this.migrateDatabase();
    } else {
      await this.createSchema();
      console.log('✅ New database created at', this.dbPath);
    }

    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');

    console.log('✅ Database ready');
  }

  private async createSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Create mods table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mods (
        mod_id TEXT PRIMARY KEY,
        mod_name TEXT NOT NULL,
        item_count INTEGER DEFAULT 0
      )
    `);

    // Create items table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS items (
        item_id TEXT PRIMARY KEY,
        mod_id TEXT NOT NULL,
        internal_name TEXT NOT NULL,
        localized_name TEXT,
        unlocalized_name TEXT,
        damage INTEGER DEFAULT 0,
        max_stack_size INTEGER DEFAULT 64,
        max_damage INTEGER DEFAULT 0,
        imageFileName TEXT,
        tooltip TEXT,
        searchTerms TEXT,
        toolClasses TEXT,
        FOREIGN KEY (mod_id) REFERENCES mods(mod_id)
      )
    `);

    // Create recipes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recipes (
        recipe_id TEXT PRIMARY KEY,
        recipe_type TEXT NOT NULL,
        inputs TEXT NOT NULL,
        outputs TEXT NOT NULL,
        additional_data TEXT,
        recipe_type_data TEXT
      )
    `);

    // Create recipe_summaries table for lightweight index
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recipe_summaries (
        recipe_id TEXT PRIMARY KEY,
        recipe_type TEXT NOT NULL,
        input_item_ids TEXT NOT NULL,
        output_item_ids TEXT NOT NULL
      )
    `);

    // Create item_recipe_index table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS item_recipe_index (
        item_id TEXT PRIMARY KEY,
        used_in_recipes TEXT,
        produced_by_recipes TEXT,
        FOREIGN KEY (item_id) REFERENCES items(item_id)
      )
    `);

    // Create pattern_groups table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_groups (
        group_id TEXT PRIMARY KEY,
        group_name TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create patterns table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        pattern_id TEXT PRIMARY KEY,
        group_id TEXT,
        recipe_id TEXT NOT NULL,
        pattern_name TEXT NOT NULL,
        output_item_id TEXT,
        priority INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        crafting INTEGER DEFAULT 1,
        substitute INTEGER DEFAULT 0,
        be_substitute INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES pattern_groups(group_id) ON DELETE SET NULL,
        FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id),
        FOREIGN KEY (output_item_id) REFERENCES items(item_id)
      )
    `);

    // Create recipe_item_inputs table for 2D input array structure.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recipe_item_inputs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id TEXT NOT NULL,
        slot_index INTEGER NOT NULL,
        item_id TEXT NOT NULL,
        probability REAL DEFAULT 1.0,
        FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(item_id)
      )
    `);

    // Create recipe_item_outputs table with probability support.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recipe_item_outputs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        stack_size INTEGER DEFAULT 1,
        probability REAL DEFAULT 1.0,
        FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(item_id)
      )
    `);

    // Create recipe_metadata table for GregTech and other mod-specific metadata.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recipe_metadata (
        recipe_id TEXT PRIMARY KEY,
        voltage_tier TEXT,
        voltage INTEGER DEFAULT 0,
        amperage INTEGER DEFAULT 0,
        duration INTEGER DEFAULT 0,
        heat INTEGER,
        eu_to_start INTEGER,
        special_items TEXT,
        additional_info TEXT,
        FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better query performance
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_mod_id ON items(mod_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_localized_name ON items(localized_name)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_search ON items(localized_name, internal_name)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_localized_name_nocase ON items(localized_name COLLATE NOCASE)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_internal_name_nocase ON items(internal_name COLLATE NOCASE)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_item_id_nocase ON items(item_id COLLATE NOCASE)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipes_type ON recipes(recipe_type)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_summaries_type ON recipe_summaries(recipe_type)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_summaries_inputs ON recipe_summaries(input_item_ids)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_summaries_outputs ON recipe_summaries(output_item_ids)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_item_index_used ON item_recipe_index(used_in_recipes)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_item_index_produced ON item_recipe_index(produced_by_recipes)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_patterns_group_id ON patterns(group_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_patterns_recipe_id ON patterns(recipe_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_patterns_output_item_id ON patterns(output_item_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_patterns_enabled ON patterns(enabled)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_patterns_priority ON patterns(priority)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_damage ON items(item_id, damage)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_internal_name ON items(internal_name)');

    // Indexes for the new recipe detail tables.
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_inputs_recipe_id ON recipe_item_inputs(recipe_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_inputs_item_id ON recipe_item_inputs(item_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_outputs_recipe_id ON recipe_item_outputs(recipe_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_outputs_item_id ON recipe_item_outputs(item_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_metadata_voltage_tier ON recipe_metadata(voltage_tier)');
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_recipes_machine_type ON recipes(json_extract(additional_data, '$.machineInfo.machineType'))");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_recipes_machine_voltage ON recipes(json_extract(additional_data, '$.machineInfo.machineType'), json_extract(additional_data, '$.machineInfo.parsedVoltageTier'))");

    this.createAccelerationSchema();

    console.log('✅ Database schema created');
  }

  private createAccelerationSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS compiler_state (
        state_key TEXT PRIMARY KEY,
        state_value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS items_core (
        item_id TEXT PRIMARY KEY,
        mod_id TEXT NOT NULL,
        internal_name TEXT NOT NULL,
        localized_name TEXT,
        unlocalized_name TEXT,
        damage INTEGER DEFAULT 0,
        image_file_name TEXT,
        render_asset_ref TEXT,
        preferred_image_url TEXT,
        tooltip TEXT,
        search_terms TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS items_search (
        item_id TEXT PRIMARY KEY,
        localized_name_norm TEXT,
        internal_name_norm TEXT,
        item_id_norm TEXT,
        search_terms_norm TEXT,
        pinyin_full TEXT,
        pinyin_acronym TEXT,
        aliases TEXT,
        popularity_score REAL DEFAULT 0,
        family_score REAL DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items_core(item_id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recipes_core (
        recipe_id TEXT PRIMARY KEY,
        recipe_type TEXT NOT NULL,
        family TEXT,
        machine_type TEXT,
        voltage_tier TEXT,
        source_mod TEXT,
        input_count INTEGER DEFAULT 0,
        output_count INTEGER DEFAULT 0,
        bootstrap_key TEXT,
        payload TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recipe_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        recipe_id TEXT NOT NULL,
        slot_index INTEGER DEFAULT 0,
        weight REAL DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recipe_bootstrap (
        item_id TEXT PRIMARY KEY,
        produced_by_payload TEXT,
        used_in_payload TEXT,
        summary_payload TEXT,
        signature TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recipe_machine_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id TEXT NOT NULL,
        machine_key TEXT NOT NULL,
        family TEXT,
        voltage_tier TEXT,
        recipe_ids_blob TEXT,
        recipe_count INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assets_manifest (
        asset_id TEXT PRIMARY KEY,
        asset_type TEXT NOT NULL,
        mod_id TEXT,
        path TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        hash TEXT,
        atlas_id TEXT,
        frame_count INTEGER DEFAULT 1,
        first_frame_path TEXT,
        metadata_json TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hot_items (
        item_id TEXT PRIMARY KEY,
        popularity_score REAL DEFAULT 0,
        home_rank INTEGER,
        search_rank INTEGER,
        recipe_rank INTEGER,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items_core(item_id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recipe_summary_compact (
        item_id TEXT PRIMARY KEY,
        summary_payload TEXT NOT NULL,
        signature TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_core_mod_id ON items_core(mod_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_core_localized_name ON items_core(localized_name)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_search_localized_name_norm ON items_search(localized_name_norm)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_search_internal_name_norm ON items_search(internal_name_norm)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_search_pinyin_full ON items_search(pinyin_full)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_items_search_pinyin_acronym ON items_search(pinyin_acronym)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipes_core_family ON recipes_core(family)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipes_core_machine_type ON recipes_core(machine_type)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_edges_item_relation ON recipe_edges(item_id, relation_type)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_edges_recipe_id ON recipe_edges(recipe_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_machine_groups_item_id ON recipe_machine_groups(item_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_assets_manifest_type_mod ON assets_manifest(asset_type, mod_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_hot_items_home_rank ON hot_items(home_rank)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_summary_compact_signature ON recipe_summary_compact(signature)');
  }

  private async migrateDatabase(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Check if recipe_type_data column exists
      const columns = this.db.pragma(`table_info(recipes)`) as TableInfoRow[];
      const hasRecipeTypeData = columns.some((col) => col.name === 'recipe_type_data');

      if (!hasRecipeTypeData) {
        console.log('🔄 Migrating database: Adding recipe_type_data column...');
        this.db.exec('ALTER TABLE recipes ADD COLUMN recipe_type_data TEXT');
        console.log('✅ Database migration completed');
      }

      const patternColumns = this.db.pragma(`table_info(patterns)`) as TableInfoRow[];
      const hasBeSubstitute = patternColumns.some((col) => col.name === 'be_substitute');
      if (!hasBeSubstitute) {
        console.log('Migrating database: Adding be_substitute column...');
        this.db.exec('ALTER TABLE patterns ADD COLUMN be_substitute INTEGER DEFAULT 0');
      }

      // Check whether new tables exist, and create missing tables.
      const tables = this.db.pragma(`table_list`) as TableListRow[];
      const tableNames = tables.map((t) => t.name);

      // Create recipe_item_inputs table if missing
      if (!tableNames.includes('recipe_item_inputs')) {
        console.log('🔄 Migrating database: Adding recipe_item_inputs table...');
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS recipe_item_inputs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id TEXT NOT NULL,
            slot_index INTEGER NOT NULL,
            item_id TEXT NOT NULL,
            probability REAL DEFAULT 1.0,
            FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES items(item_id)
          )
        `);
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_inputs_recipe_id ON recipe_item_inputs(recipe_id)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_inputs_item_id ON recipe_item_inputs(item_id)');
        console.log('✅ recipe_item_inputs table created');
      }

      // Create recipe_item_outputs table if missing
      if (!tableNames.includes('recipe_item_outputs')) {
        console.log('🔄 Migrating database: Adding recipe_item_outputs table...');
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS recipe_item_outputs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            stack_size INTEGER DEFAULT 1,
            probability REAL DEFAULT 1.0,
            FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES items(item_id)
          )
        `);
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_outputs_recipe_id ON recipe_item_outputs(recipe_id)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_outputs_item_id ON recipe_item_outputs(item_id)');
        console.log('✅ recipe_item_outputs table created');
      }

      // Create recipe_metadata table if missing
      if (!tableNames.includes('recipe_metadata')) {
        console.log('🔄 Migrating database: Adding recipe_metadata table...');
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS recipe_metadata (
            recipe_id TEXT PRIMARY KEY,
            voltage_tier TEXT,
            voltage INTEGER DEFAULT 0,
            amperage INTEGER DEFAULT 0,
            duration INTEGER DEFAULT 0,
            heat INTEGER,
            eu_to_start INTEGER,
            special_items TEXT,
            additional_info TEXT,
            FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE
          )
        `);
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_metadata_voltage_tier ON recipe_metadata(voltage_tier)');
        console.log('✅ recipe_metadata table created');
      }

      // Ensure expression indexes exist for machine-based indexed recipe queries.
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_recipes_machine_type ON recipes(json_extract(additional_data, '$.machineInfo.machineType'))");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_recipes_machine_voltage ON recipes(json_extract(additional_data, '$.machineInfo.machineType'), json_extract(additional_data, '$.machineInfo.parsedVoltageTier'))");
      this.createAccelerationSchema();

      const recipesCoreColumns = this.db.pragma(`table_info(recipes_core)`) as TableInfoRow[];
      const hasRecipesCorePayload = recipesCoreColumns.some((col) => col.name === 'payload');
      if (!hasRecipesCorePayload) {
        this.db.exec('ALTER TABLE recipes_core ADD COLUMN payload TEXT');
      }

      const assetsManifestColumns = this.db.pragma(`table_info(assets_manifest)`) as TableInfoRow[];
      const hasAssetsMetadataJson = assetsManifestColumns.some((col) => col.name === 'metadata_json');
      if (!hasAssetsMetadataJson) {
        this.db.exec('ALTER TABLE assets_manifest ADD COLUMN metadata_json TEXT');
      }

      if (!tableNames.includes('recipe_summary_compact')) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS recipe_summary_compact (
            item_id TEXT PRIMARY KEY,
            summary_payload TEXT NOT NULL,
            signature TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_summary_compact_signature ON recipe_summary_compact(signature)');
      }

    } catch (error) {
      console.error('❌ Database migration failed:', error);
    }
  }

  save(): void {
    // better-sqlite3 automatically saves, but we keep this method for compatibility
    // No-op - better-sqlite3 writes to disk automatically
  }

  getDatabase(): Database.Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  close(): void {
    if (this.db) {
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // ignore checkpoint failures during shutdown
      }
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
let dbManager: DatabaseManager | null = null;
let accelerationDbManager: DatabaseManager | null = null;

export function getDatabaseManager(): DatabaseManager {
  if (!dbManager) {
    dbManager = new DatabaseManager();
  }
  return dbManager;
}

export function getAccelerationDatabaseManager(): DatabaseManager {
  if (!accelerationDbManager) {
    accelerationDbManager = new DatabaseManager(ACCELERATION_DB_FILE);
  }
  return accelerationDbManager;
}
