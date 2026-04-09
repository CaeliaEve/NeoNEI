import { getDatabaseManager } from '../models/database';
import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';

/**
 * Create recipe summary index from the large recipes JSON
 * Summary includes: recipe_id, recipe_type, input_item_ids, output_item_ids
 * Full recipe data stays in JSON file for on-demand loading
 */

interface RecipeSummary {
  id: string;
  recipeType: string;
  inputItemIds: string[];
  outputItemIds: string[];
}

export class CreateRecipeSummaryService {
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
      } else if (typeof obj === 'object') {
        const record = obj as Record<string, unknown>;
        if (typeof record.itemId === 'string') {
          itemIds.push(record.itemId);
        }
        if (Array.isArray(record.items)) {
          record.items.forEach(extractFrom);
        }
        // Extract from 2D arrays
        if (Array.isArray(record.itemInputs2D)) {
          record.itemInputs2D.forEach(extractFrom);
        }
        if (Array.isArray(record.itemOutputs2D)) {
          record.itemOutputs2D.forEach(extractFrom);
        }
        Object.values(record).forEach(extractFrom);
      }
    };

    extractFrom(data);
    return [...new Set(itemIds)]; // Remove duplicates
  }

  async createSummaries(filePath: string): Promise<void> {
    console.log('📦 Creating recipe summaries...');
    console.log(`  File: ${filePath}\n`);

    return new Promise((resolve, reject) => {
      // Read file in chunks to avoid memory issues
      const readStream = fs.createReadStream(filePath, { encoding: 'utf8' });
      let buffer = '';
      let braceCount = 0;
      let arrayDepth = 0;
      let inRecipes = false;
      let currentKey = '';
      let inString = false;
      let escapeNext = false;
      let objectStart = -1;
      let totalCount = 0;
      let batchCount = 0;
      const batchSize = 1000;
      const summaries: RecipeSummary[] = [];

      readStream.on('data', (chunk: string | Buffer) => {
        buffer += chunk.toString();

        for (let i = 0; i < buffer.length; i++) {
          const char = buffer[i];

          // Handle strings
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

          // Track structure
          if (char === '{') {
            if (braceCount === 0 && inRecipes && arrayDepth === 1 && currentKey !== 'recipeTypeData') {
              // Start of a recipe object
              objectStart = i;
            }
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0 && objectStart >= 0) {
              // End of a recipe object
              const recipeJson = buffer.substring(objectStart, i + 1);

              try {
                const recipe = JSON.parse(recipeJson);

                if (recipe.id && recipe.recipeType) {
                  const summary: RecipeSummary = {
                    id: recipe.id,
                    recipeType: recipe.recipeType,
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
                  totalCount++;

                  if (summaries.length >= batchSize) {
                    readStream.pause();
                    this.insertBatch(summaries)
                      .then(() => {
                        batchCount += summaries.length;
                        if (batchCount % 10000 === 0) {
                          console.log(`  ✅ Processed ${batchCount} recipes...`);
                        }
                        summaries.length = 0;
                        readStream.resume();
                      })
                      .catch((error) => {
                        reject(error);
                      });
                  }
                }
              } catch (e) {
                // Skip invalid JSON
              }

              objectStart = -1;
            }
          } else if (char === '[') {
            arrayDepth++;
          } else if (char === ']') {
            arrayDepth--;
          } else if (char === ':' && braceCount === 1 && arrayDepth === 0) {
            // Check for "recipes" key
            if (buffer.substring(Math.max(0, i - 100), i).includes('"recipes"')) {
              inRecipes = true;
            }
          }
        }

        // Keep buffer manageable
        buffer = buffer.substring(Math.max(0, objectStart >= 0 ? objectStart : buffer.length - 100000));
        if (objectStart >= 0) {
          objectStart = 0;
        }
      });

      readStream.on('end', async () => {
        // Insert remaining batch
        if (summaries.length > 0) {
          try {
            await this.insertBatch(summaries);
            batchCount += summaries.length;
          } catch (error) {
            reject(error);
            return;
          }
        }

        console.log(`\n✅ Total summaries created: ${totalCount}`);
        console.log('✅ Recipe summaries saved to database');
        resolve();
      });

      readStream.on('error', (error: Error) => {
        console.error('❌ Read error:', error);
        reject(error);
      });
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
