import { getDatabaseManager } from '../models/database';
import * as fs from 'fs';
import type Database from 'better-sqlite3';

interface RecipeSummary {
  id: string;
  recipeType: string;
  inputItemIds: string[];
  outputItemIds: string[];
}

export class CreateSummariesOptimizedService {
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
        for (const item of record.items) {
          if (item && typeof item === 'object') {
            const itemRecord = item as Record<string, unknown>;
            if (typeof itemRecord.itemId === 'string') {
              itemIds.push(itemRecord.itemId);
            }
          }
        }
      }
      if (Array.isArray(record.itemInputs2D)) {
        for (const row of record.itemInputs2D) {
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            if (!cell || typeof cell !== 'object') continue;
            const cellRecord = cell as Record<string, unknown>;
            if (!Array.isArray(cellRecord.items)) continue;
            for (const item of cellRecord.items) {
              if (item && typeof item === 'object') {
                const itemRecord = item as Record<string, unknown>;
                if (typeof itemRecord.itemId === 'string') {
                  itemIds.push(itemRecord.itemId);
                }
              }
            }
          }
        }
      }
      if (Array.isArray(record.itemOutputs2D)) {
        for (const row of record.itemOutputs2D) {
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            if (!cell || typeof cell !== 'object') continue;
            const cellRecord = cell as Record<string, unknown>;
            const outputItem = cellRecord.item;
            if (outputItem && typeof outputItem === 'object') {
              const outputRecord = outputItem as Record<string, unknown>;
              if (typeof outputRecord.itemId === 'string') {
                itemIds.push(outputRecord.itemId);
              }
            }
          }
        }
      }
      Object.values(record).forEach(extractFrom);
    };

    extractFrom(data);
    return [...new Set(itemIds)];
  }

  async createSummaries(filePath: string): Promise<void> {
    console.log('Creating recipe summaries (optimized streaming)...');
    console.log(`  File: ${filePath}\n`);

    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 });
      let buffer = '';
      let foundRecipes = false;
      let currentRecipeType = '';
      let braceCount = 0;
      let arrayDepth = 0;
      let inRecipeObject = false;
      let recipeStart = -1;
      let totalCount = 0;
      const summaries: RecipeSummary[] = [];

      readStream.on('data', (chunk: string | Buffer) => {
        buffer += chunk.toString();

        if (!foundRecipes) {
          const recipesMatch = buffer.match(/"recipes"\s*:/);
          if (recipesMatch && typeof recipesMatch.index === 'number' && buffer.indexOf('{', recipesMatch.index) >= 0) {
            foundRecipes = true;
            const recipesStart = buffer.indexOf('{', recipesMatch.index);
            buffer = buffer.substring(recipesStart + 1);
            console.log('  Found recipes section, processing...\n');
          }
          if (buffer.length > 10000) buffer = buffer.substring(buffer.length - 10000);
          return;
        }

        for (let i = 0; i < buffer.length; i++) {
          const char = buffer[i];

          if (char === '{') {
            if (
              braceCount === 0 &&
              arrayDepth === 1 &&
              currentRecipeType &&
              currentRecipeType !== 'tooltip' &&
              currentRecipeType !== 'recipeTypeData'
            ) {
              recipeStart = i;
              inRecipeObject = true;
            }
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0 && inRecipeObject && recipeStart >= 0) {
              const recipeJson = buffer.substring(recipeStart, i + 1);

              try {
                const recipe = JSON.parse(recipeJson) as Record<string, unknown>;
                if (typeof recipe.id === 'string') {
                  summaries.push({
                    id: recipe.id,
                    recipeType: currentRecipeType,
                    inputItemIds: this.extractItemIds({
                      itemInputs2D: recipe.itemInputs2D,
                      itemInputs: recipe.itemInputs
                    }),
                    outputItemIds: this.extractItemIds({
                      itemOutputs2D: recipe.itemOutputs2D,
                      itemOutputs: recipe.itemOutputs
                    })
                  });
                  totalCount++;

                  if (summaries.length >= 5000) {
                    readStream.pause();
                    this.insertBatch(summaries)
                      .then(() => {
                        console.log(`  Processed ${totalCount} recipes...`);
                        summaries.length = 0;
                        readStream.resume();
                      })
                      .catch((err: unknown) => reject(err));
                  }
                }
              } catch {
                // Skip invalid JSON.
              }

              recipeStart = -1;
              inRecipeObject = false;
            }
          } else if (char === '[') {
            arrayDepth++;
          } else if (char === ']') {
            arrayDepth--;
            if (arrayDepth === 0) {
              currentRecipeType = '';
            }
          } else if (char === '"' && braceCount === 0 && arrayDepth === 0) {
            const keyMatch = buffer.substring(i).match(/^"([^"]+)"\s*:\s*\[/);
            if (keyMatch) {
              currentRecipeType = keyMatch[1];
              i += keyMatch[0].length - 2;
            }
          }
        }

        const keepStart = recipeStart >= 0 ? recipeStart : Math.max(0, buffer.length - 500000);
        buffer = buffer.substring(keepStart);
        if (recipeStart >= 0) recipeStart = 0;
      });

      readStream.on('end', async () => {
        if (summaries.length > 0) {
          try {
            await this.insertBatch(summaries);
          } catch (error) {
            reject(error);
            return;
          }
        }

        console.log(`\nTotal summaries created: ${totalCount}`);
        console.log('Recipe summaries saved to database');
        resolve();
      });

      readStream.on('error', reject);
    });
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
