import { getDatabaseManager } from '../models/database';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import {
  buildOcPatternEntry,
  buildOcPatternExportDocument,
  type OcPatternExportDocument,
} from './pattern-export.service';

export interface PatternGroup {
  groupId: string;
  groupName: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pattern {
  patternId: string;
  groupId: string | null;
  recipeId: string;
  patternName: string;
  outputItemId: string | null;
  priority: number;
  enabled: number;
  crafting: number;
  substitute: number;
  beSubstitute: number;
  createdAt: string;
  updatedAt: string;
}

export interface PatternWithDetails extends Pattern {
  recipe: {
    recipeId: string;
    recipeType: string;
    inputs: unknown;
    outputs: unknown;
  } | null;
  outputItem: {
    itemId: string;
    modId: string;
    internalName: string;
    localizedName: string;
    imageFileName: string | null;
  } | null;
}

export interface PatternGroupWithPatterns extends PatternGroup {
  patterns: PatternWithDetails[];
  patternCount: number;
}

type PatternGroupDbRow = {
  groupId: string;
  groupName: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

type PatternDbRow = {
  patternId: string;
  groupId: string | null;
  recipeId: string;
  patternName: string;
  outputItemId: string | null;
  priority: number;
  enabled: number;
  crafting: number;
  substitute: number;
  beSubstitute: number;
  createdAt: string;
  updatedAt: string;
};

type RecipeDetailDbRow = {
  recipeId: string;
  recipeType: string;
  inputs: string;
  outputs: string;
};

type ItemDetailDbRow = {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  imageFileName: string | null;
};

export class PatternsService {
  private db: Database.Database;

  constructor() {
    const dbManager = getDatabaseManager();
    this.db = dbManager.getDatabase();
  }

  async getPatternGroups(): Promise<PatternGroup[]> {
    const rows = this.db.prepare(`
      SELECT
        group_id as groupId,
        group_name as groupName,
        description,
        created_at as createdAt,
        updated_at as updatedAt
      FROM pattern_groups
      ORDER BY updated_at DESC
    `).all() as PatternGroupDbRow[];

    return rows.map((row) => ({
      groupId: row.groupId,
      groupName: row.groupName,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async getPatternGroup(groupId: string): Promise<PatternGroup | null> {
    const row = this.db.prepare(`
      SELECT
        group_id as groupId,
        group_name as groupName,
        description,
        created_at as createdAt,
        updated_at as updatedAt
      FROM pattern_groups
      WHERE group_id = ?
    `).get(groupId) as PatternGroupDbRow | undefined;

    if (!row) return null;

    return {
      groupId: row.groupId,
      groupName: row.groupName,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async createPatternGroup(groupName: string, description?: string): Promise<PatternGroup> {
    const groupId = uuidv4();
    const now = new Date().toISOString();
    const descriptionValue = description ?? '';

    this.db.prepare(`
      INSERT INTO pattern_groups (group_id, group_name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(groupId, groupName, descriptionValue, now, now);

    getDatabaseManager().save();

    return {
      groupId,
      groupName,
      description: description || null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updatePatternGroup(groupId: string, groupName: string, description?: string): Promise<void> {
    const now = new Date().toISOString();
    const descriptionValue = description ?? '';

    this.db.prepare(`
      UPDATE pattern_groups
      SET group_name = ?,
          description = ?,
          updated_at = ?
      WHERE group_id = ?
    `).run(groupName, descriptionValue, now, groupId);

    getDatabaseManager().save();
  }

  async deletePatternGroup(groupId: string): Promise<void> {
    this.db.prepare('DELETE FROM patterns WHERE group_id = ?').run(groupId);
    this.db.prepare('DELETE FROM pattern_groups WHERE group_id = ?').run(groupId);

    getDatabaseManager().save();
  }

  async getPatternGroupWithPatterns(groupId: string): Promise<PatternGroupWithPatterns | null> {
    const group = await this.getPatternGroup(groupId);
    if (!group) return null;

    const patternRows = this.db.prepare(`
      SELECT
        pattern_id as patternId,
        group_id as groupId,
        recipe_id as recipeId,
        pattern_name as patternName,
        output_item_id as outputItemId,
        priority,
        enabled,
        crafting,
        substitute,
        be_substitute as beSubstitute,
        created_at as createdAt,
        updated_at as updatedAt
      FROM patterns
      WHERE group_id = ?
      ORDER BY priority DESC, created_at ASC
    `).all(groupId) as PatternDbRow[];

    const recipeStmt = this.db.prepare(`
      SELECT
        recipe_id as recipeId,
        recipe_type as recipeType,
        inputs,
        outputs
      FROM recipes
      WHERE recipe_id = ?
    `);

    const itemStmt = this.db.prepare(`
      SELECT
        item_id as itemId,
        mod_id as modId,
        internal_name as internalName,
        localized_name as localizedName,
        imageFileName
      FROM items
      WHERE item_id = ?
    `);

    const patterns: PatternWithDetails[] = patternRows.map((row) => {
      const pattern: PatternWithDetails = {
        patternId: row.patternId,
        groupId: row.groupId,
        recipeId: row.recipeId,
        patternName: row.patternName,
        outputItemId: row.outputItemId,
        priority: row.priority,
        enabled: row.enabled,
        crafting: row.crafting,
        substitute: row.substitute,
        beSubstitute: row.beSubstitute,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        recipe: null,
        outputItem: null,
      };

      if (pattern.recipeId) {
        const recipeRow = recipeStmt.get(pattern.recipeId) as RecipeDetailDbRow | undefined;
        if (recipeRow) {
          pattern.recipe = {
            recipeId: recipeRow.recipeId,
            recipeType: recipeRow.recipeType,
            inputs: JSON.parse(recipeRow.inputs || '[]'),
            outputs: JSON.parse(recipeRow.outputs || '[]'),
          };
        }
      }

      if (pattern.outputItemId) {
        const itemRow = itemStmt.get(pattern.outputItemId) as ItemDetailDbRow | undefined;
        if (itemRow) {
          pattern.outputItem = {
            itemId: itemRow.itemId,
            modId: itemRow.modId,
            internalName: itemRow.internalName,
            localizedName: itemRow.localizedName,
            imageFileName: itemRow.imageFileName,
          };
        }
      }

      return pattern;
    });

    return {
      ...group,
      patterns,
      patternCount: patterns.length,
    };
  }

  async createPattern(
    groupId: string | null,
    recipeId: string,
    patternName: string,
    outputItemId: string | null,
      options: {
      crafting?: number;
      substitute?: number;
      beSubstitute?: number;
      priority?: number;
    } = {}
  ): Promise<Pattern> {
    const patternId = uuidv4();
    const now = new Date().toISOString();
    const { crafting = 1, substitute = 0, beSubstitute = 0, priority = 0 } = options;

    this.db.prepare(`
        INSERT INTO patterns (
          pattern_id, group_id, recipe_id, pattern_name, output_item_id,
          priority, enabled, crafting, substitute, be_substitute, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
      patternId,
      groupId,
      recipeId,
      patternName,
      outputItemId,
      priority,
      1,
      crafting,
      substitute,
      beSubstitute,
      now,
      now,
    );

    getDatabaseManager().save();

    return {
      patternId,
      groupId,
      recipeId,
      patternName,
      outputItemId,
      priority,
      enabled: 1,
      crafting,
      substitute,
      beSubstitute,
      createdAt: now,
      updatedAt: now,
    };
  }

  async deletePattern(patternId: string): Promise<void> {
    this.db.prepare('DELETE FROM patterns WHERE pattern_id = ?').run(patternId);
    getDatabaseManager().save();
  }

  async updatePattern(
    patternId: string,
    updates: {
      patternName?: string;
      priority?: number;
      enabled?: number;
      crafting?: number;
      substitute?: number;
      beSubstitute?: number;
    }
  ): Promise<void> {
    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const values: Array<string | number> = [];

    if (updates.patternName !== undefined) {
      setClauses.push('pattern_name = ?');
      values.push(updates.patternName);
    }
    if (updates.priority !== undefined) {
      setClauses.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.enabled !== undefined) {
      setClauses.push('enabled = ?');
      values.push(updates.enabled);
    }
    if (updates.crafting !== undefined) {
      setClauses.push('crafting = ?');
      values.push(updates.crafting);
    }
    if (updates.substitute !== undefined) {
      setClauses.push('substitute = ?');
      values.push(updates.substitute);
    }
    if (updates.beSubstitute !== undefined) {
      setClauses.push('be_substitute = ?');
      values.push(updates.beSubstitute);
    }

    setClauses.push('updated_at = ?');
    values.push(now);
    values.push(patternId);

    this.db.prepare(`
      UPDATE patterns
      SET ${setClauses.join(', ')}
      WHERE pattern_id = ?
    `).run(...values);

    getDatabaseManager().save();
  }

  async exportPatternGroup(groupId: string): Promise<OcPatternExportDocument> {
    const groupWithPatterns = await this.getPatternGroupWithPatterns(groupId);

    if (!groupWithPatterns) {
      throw new Error('Pattern group not found');
    }

    const enabledPatterns = groupWithPatterns.patterns.filter((pattern) => pattern.enabled === 1);

    const ocAePatterns = enabledPatterns
      .map((pattern) => {
        if (!pattern.recipe) {
          return null;
        }
        return buildOcPatternEntry({
          patternId: pattern.patternId,
          patternName: pattern.patternName,
          beSubstitute: pattern.beSubstitute === 1,
          crafting: pattern.crafting,
          substitute: pattern.substitute,
          recipeId: pattern.recipeId,
          inputs: pattern.recipe.inputs,
          outputs: pattern.recipe.outputs,
        });
      })
      .filter((pattern): pattern is {
        crafting: boolean;
        substitute: boolean;
        beSubstitute: boolean;
        patternId: string;
        crafterUUID: string;
        author: string;
        inputs: Array<{ id: string; meta: number; count: number; nbt: string | null }>;
        outputs: Array<{ id: string; meta: number; count: number; nbt: string | null }>;
      } => pattern !== null);

    return buildOcPatternExportDocument(ocAePatterns);
  }

}
