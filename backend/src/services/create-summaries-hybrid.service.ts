import { getDatabaseManager } from '../models/database';
import * as fs from 'fs';
import type Database from 'better-sqlite3';

/**
 * Hybrid recipe summary creator.
 * Finds recipe type boundaries and processes each type separately.
 */

interface RecipeSummary {
  id: string;
  recipeType: string;
  inputItemIds: string[];
  outputItemIds: string[];
}

export class CreateSummariesHybridService {
  private db: Database.Database;

  constructor() {
    const dbManager = getDatabaseManager();
    this.db = dbManager.getDatabase();
  }

  private extractItemIds(data: unknown): string[] {
    const itemIds: string[] = [];

    const extractFrom = (obj: unknown): void => {
      if (!obj) return;
      if (Array.isArray(obj)) {
        obj.forEach(extractFrom);
        return;
      }
      if (typeof obj !== 'object') return;

      const record = obj as Record<string, unknown>;
      if (typeof record.itemId === 'string') {
        itemIds.push(record.itemId);
      }
      if (Array.isArray(record.items)) {
        record.items.forEach(extractFrom);
      }
      if (Array.isArray(record.itemInputs2D)) {
        record.itemInputs2D.forEach(extractFrom);
      }
      if (Array.isArray(record.itemOutputs2D)) {
        record.itemOutputs2D.forEach(extractFrom);
      }
      Object.values(record).forEach(extractFrom);
    };

    extractFrom(data);
    return [...new Set(itemIds)];
  }

  async createSummaries(filePath: string): Promise<void> {
    console.log('Creating recipe summaries (hybrid approach)...');
    console.log(`  File: ${filePath}\n`);

    const fileContent = fs.readFileSync(filePath, 'utf-8');

    const recipesIndex = fileContent.indexOf('"recipes"');
    if (recipesIndex < 0) {
      throw new Error('Could not find "recipes" key in JSON');
    }

    const recipesStart = fileContent.indexOf('{', recipesIndex);
    console.log('  Found recipes section\n');

    const summaries: RecipeSummary[] = [];
    let processedCount = 0;

    const recipeTypeRegex = /"([^"]+)"\s*:\s*\[/g;
    let match: RegExpExecArray | null;
    const types: Array<{ name: string; start: number }> = [];

    while ((match = recipeTypeRegex.exec(fileContent)) !== null) {
      const typeName = match[1];
      const startPos = match.index;
      if (startPos > recipesStart && startPos < recipesStart + 100000000) {
        types.push({ name: typeName, start: startPos });
      }
    }

    console.log(`  Found ${types.length} recipe types\n`);

    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      const arrayStart = fileContent.indexOf('[', type.start);

      let bracketCount = 0;
      let inString = false;
      let escapeNext = false;
      let arrayEnd = -1;

      for (let j = arrayStart; j < fileContent.length; j++) {
        const char = fileContent[j];

        if (!escapeNext) {
          if (char === '\\' && inString) {
            escapeNext = true;
            continue;
          }
          if (char === '"') {
            inString = !inString;
            continue;
          }
        } else {
          escapeNext = false;
        }

        if (inString) continue;

        if (char === '[') bracketCount++;
        else if (char === ']') {
          bracketCount--;
          if (bracketCount === 0) {
            arrayEnd = j;
            break;
          }
        }
      }

      if (arrayEnd < 0) {
        console.log(`  Skip type with incomplete array: ${type.name}`);
        continue;
      }

      try {
        const arrayJson = fileContent.substring(arrayStart, arrayEnd + 1);
        const recipes = JSON.parse(arrayJson) as Array<Record<string, unknown>>;

        console.log(`  Processing type ${i + 1}/${types.length}: ${type.name} (${recipes.length} recipes)`);

        for (const recipe of recipes) {
          if (typeof recipe.id !== 'string') continue;

          const summary: RecipeSummary = {
            id: recipe.id,
            recipeType: type.name,
            inputItemIds: this.extractItemIds({
              itemInputs2D: recipe.itemInputs2D,
              itemInputs: recipe.itemInputs
            }),
            outputItemIds: this.extractItemIds({
              itemOutputs2D: recipe.itemOutputs2D,
              itemOutputs: recipe.itemOutputs
            })
          };

          summaries.push(summary);
        }

        if (summaries.length >= 5000) {
          await this.insertBatch(summaries);
          processedCount += summaries.length;
          console.log(`    Total processed: ${processedCount} recipes\n`);
          summaries.length = 0;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  Error parsing type ${type.name}: ${message}`);
      }
    }

    if (summaries.length > 0) {
      await this.insertBatch(summaries);
      processedCount += summaries.length;
    }

    console.log(`\nTotal summaries created: ${processedCount}`);
    console.log('Recipe summaries saved to database');
  }

  private async insertBatch(summaries: RecipeSummary[]): Promise<void> {
    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO recipe_summaries (
        recipe_id, recipe_type, input_item_ids, output_item_ids
      ) VALUES (?, ?, ?, ?)
    `);

    const tx = this.db.transaction((rows: RecipeSummary[]) => {
      for (const summary of rows) {
        insertStmt.run(
          summary.id,
          summary.recipeType,
          JSON.stringify(summary.inputItemIds),
          JSON.stringify(summary.outputItemIds)
        );
      }
    });

    tx(summaries);
  }
}
