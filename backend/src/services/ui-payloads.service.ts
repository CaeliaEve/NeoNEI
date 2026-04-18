import type Database from 'better-sqlite3';
import { getAccelerationDatabaseManager } from '../models/database';
import { notFound } from '../utils/http';

type UiPayloadRow = {
  payload_json: string;
};

export interface UiPayloadsServiceOptions {
  databaseProvider?: () => Database.Database | null;
}

export class UiPayloadsService {
  private readonly databaseProvider: () => Database.Database | null;

  constructor(options: UiPayloadsServiceOptions = {}) {
    this.databaseProvider = options.databaseProvider ?? (() => {
      try {
        return getAccelerationDatabaseManager().getDatabase();
      } catch {
        return null;
      }
    });
  }

  private getDatabase(): Database.Database | null {
    return this.databaseProvider();
  }

  async getByRecipeId(recipeId: string): Promise<Record<string, unknown>> {
    const db = this.getDatabase();
    if (!db) {
      throw notFound(`UI payload not found for recipe: ${recipeId}`);
    }

    const row = db.prepare(`
      SELECT payload_json
      FROM ui_payloads
      WHERE recipe_id = ?
    `).get(recipeId) as UiPayloadRow | undefined;

    if (!row?.payload_json) {
      throw notFound(`UI payload not found for recipe: ${recipeId}`);
    }

    return JSON.parse(row.payload_json) as Record<string, unknown>;
  }
}

let instance: UiPayloadsService | null = null;

export function getUiPayloadsService(): UiPayloadsService {
  if (!instance) {
    instance = new UiPayloadsService();
  }
  return instance;
}
