import { getDatabaseManager } from '../models/database';
import * as fs from 'fs';
import type Database from 'better-sqlite3';

/**
 * Improved recipe summary creator using chunk-based processing.
 */

interface RecipeSummary {
  id: string;
  recipeType: string;
  inputItemIds: string[];
  outputItemIds: string[];
}

export class CreateSummariesV2Service {
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
    console.log('Creating recipe summaries (improved version)...');
    console.log(`  File: ${filePath}\n`);

    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 });
      let buffer = '';
      let inRecipes = false;
      let totalCount = 0;
      let processedCount = 0;
      const batchSize = 1000;
      const summaries: RecipeSummary[] = [];

      const recipeStartRegex = /"id"\s*:\s*"r~[^"]+"/g;

      readStream.on('data', (chunk: string | Buffer) => {
        buffer += chunk.toString();

        if (!inRecipes && buffer.includes('"recipes"')) {
          const recipesIndex = buffer.indexOf('"recipes"');
          if (recipesIndex >= 0 && buffer.indexOf('{', recipesIndex) < recipesIndex + 200) {
            inRecipes = true;
            console.log('  Found recipes section, processing...');
          }
        }

        if (inRecipes) {
          const matches = [...buffer.matchAll(recipeStartRegex)];

          for (const match of matches) {
            const recipeId = match[0].match(/"r~[^"]+"/)?.[0];
            if (!recipeId || typeof match.index !== 'number') continue;

            const objStart = buffer.lastIndexOf('{', match.index);
            if (objStart < 0) continue;

            let braceCount = 0;
            let objEnd = -1;
            for (let i = objStart; i < buffer.length; i++) {
              if (buffer[i] === '{') braceCount++;
              else if (buffer[i] === '}') {
                braceCount--;
                if (braceCount === 0) {
                  objEnd = i;
                  break;
                }
              }
            }

            if (objEnd < 0) continue;

            try {
              const recipeJson = buffer.substring(objStart, objEnd + 1);
              const recipe = JSON.parse(recipeJson) as Record<string, unknown>;

              if (typeof recipe.id === 'string' && typeof recipe.recipeType === 'string') {
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
                processedCount++;

                if (summaries.length >= batchSize) {
                  readStream.pause();
                  this.insertBatch(summaries)
                    .then(() => {
                      if (processedCount % 10000 === 0) {
                        console.log(`  Processed ${processedCount} recipes...`);
                      }
                      summaries.length = 0;
                      readStream.resume();
                    })
                    .catch((error: unknown) => {
                      reject(error);
                    });
                }
              }

              buffer = buffer.substring(objEnd + 1);
            } catch {
              // Invalid JSON, skip.
            }
          }
        }

        if (buffer.length > 5000000) {
          buffer = buffer.substring(buffer.length - 5000000);
        }
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

      readStream.on('error', (error: Error) => {
        console.error('Read error:', error);
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
