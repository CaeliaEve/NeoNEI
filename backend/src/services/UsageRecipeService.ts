/**
 * Usage Recipe Derivation Service
 * 从Crafting配方自动逆推Usage配方
 *
 * 原理：
 * - Crafting: 如何制作物品A (需要物品B, C, D)
 * - Usage: 物品B可以用在哪里 (用于制作A)
 *
 * 本服务在启动时或数据导入后运行，构建Usage索引
 */

import fs from 'fs';
import path from 'path';

interface Recipe {
  id: string;
  recipeType: 'crafting' | 'usage';
  outputs: ItemStackDTO[];
  inputs: ItemGroupDTO[];
}

interface ItemStackDTO {
  item: {
    itemId: string;
    modId: string;
    localizedName: string;
    imageFileName?: string;
  };
  stackSize: number;
  probability: number;
}

interface ItemGroupDTO {
  slotIndex: number;
  items: ItemStackDTO[];
}

export class UsageRecipeService {
  private recipesPath: string;
  private usageIndex: Map<string, Set<string>> = new Map();

  constructor(recipesPath: string) {
    this.recipesPath = recipesPath;
  }

  /**
   * 从所有crafting配方构建usage索引
   * @returns usage索引: {itemId: Set<recipeId>}
   */
  public async buildUsageIndex(): Promise<void> {
    console.log('=== 开始构建Usage配方索引 ===');

    const craftingDir = path.join(this.recipesPath, 'crafting');
    if (!fs.existsSync(craftingDir)) {
      console.error('Crafting目录不存在:', craftingDir);
      return;
    }

    // 遍历所有mod的crafting配方
    const modDirs = fs.readdirSync(craftingDir);
    let totalProcessed = 0;
    let totalRecipes = 0;

    for (const modId of modDirs) {
      const modPath = path.join(craftingDir, modId);
      if (!fs.statSync(modPath).isDirectory()) continue;

      // 读取该mod的recipes.json（优先使用压缩版）
      const jsonPath = path.join(modPath, 'recipes.json');
      const gzPath = jsonPath + '.gz';

      if (!fs.existsSync(jsonPath) && !fs.existsSync(gzPath)) {
        console.warn(`  跳过 ${modId}: 未找到recipes.json`);
        continue;
      }

      try {
        // 读取配方数据
        const recipes: Recipe[] = await this.loadRecipes(jsonPath, gzPath);
        totalRecipes += recipes.length;

        // 处理每个配方
        for (const recipe of recipes) {
          if (recipe.recipeType !== 'crafting') continue;

          // 遍历配方的所有输入物品
          for (const inputGroup of recipe.inputs) {
            for (const itemStack of inputGroup.items) {
              const itemId = itemStack.item.itemId;

              // 添加到usage索引：该物品可以用在这个配方中
              if (!this.usageIndex.has(itemId)) {
                this.usageIndex.set(itemId, new Set());
              }
              this.usageIndex.get(itemId)!.add(recipe.id);
            }
          }
        }

        totalProcessed++;
        console.log(`  ✓ ${modId}: ${recipes.length} 个配方`);
      } catch (error) {
        console.error(`  ✗ ${modId} 处理失败:`, error);
      }
    }

    console.log(`\n=== Usage索引构建完成 ===`);
    console.log(`处理mod数: ${totalProcessed}`);
    console.log(`处理配方数: ${totalRecipes}`);
    console.log(`涉及物品数: ${this.usageIndex.size}`);
  }

  /**
   * 获取某个物品的所有usage配方
   * @param itemId 物品ID
   * @returns 该物品可以用在的配方ID列表
   */
  public getUsageRecipes(itemId: string): string[] {
    const recipeIds = this.usageIndex.get(itemId);
    return recipeIds ? Array.from(recipeIds) : [];
  }

  /**
   * 获取完整的usage配方数据（包含配方详情）
   * @param itemId 物品ID
   * @returns 该物品的所有usage配方详情
   */
  public async getUsageRecipeDetails(itemId: string): Promise<Recipe[]> {
    const recipeIds = this.getUsageRecipes(itemId);
    if (recipeIds.length === 0) return [];

    // 从所有mod的crafting配方中查找
    const craftingDir = path.join(this.recipesPath, 'crafting');
    const modDirs = fs.readdirSync(craftingDir);
    const result: Recipe[] = [];

    for (const modId of modDirs) {
      const modPath = path.join(craftingDir, modId);
      if (!fs.statSync(modPath).isDirectory()) continue;

      const jsonPath = path.join(modPath, 'recipes.json');
      const gzPath = jsonPath + '.gz';

      if (!fs.existsSync(jsonPath) && !fs.existsSync(gzPath)) continue;

      try {
        const recipes: Recipe[] = await this.loadRecipes(jsonPath, gzPath);
        for (const recipe of recipes) {
          if (recipeIds.includes(recipe.id)) {
            // 标记为usage配方
            result.push({
              ...recipe,
              recipeType: 'usage'
            });
          }
        }
      } catch (error) {
        console.error(`读取 ${modId} 配方失败:`, error);
      }
    }

    return result;
  }

  /**
   * 加载配方数据（支持GZIP压缩）
   */
  private async loadRecipes(jsonPath: string, gzPath: string): Promise<Recipe[]> {
    // 优先使用压缩版
    if (fs.existsSync(gzPath)) {
      const zlib = await import('zlib');
      const compressed = fs.readFileSync(gzPath);
      const decompressed = zlib.gunzipSync(compressed);
      return JSON.parse(decompressed.toString('utf-8'));
    }

    // 否则使用普通JSON
    if (fs.existsSync(jsonPath)) {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(content);
    }

    return [];
  }

  /**
   * 导出usage索引到文件（可选，用于缓存）
   */
  public exportUsageIndex(outputPath: string): void {
    const indexObj: Record<string, string[]> = {};
    for (const [itemId, recipeIds] of this.usageIndex.entries()) {
      indexObj[itemId] = Array.from(recipeIds);
    }

    fs.writeFileSync(outputPath, JSON.stringify(indexObj, null, 2));
    console.log(`Usage索引已导出到: ${outputPath}`);
  }

  /**
   * 从文件导入usage索引（可选，用于加速启动）
   */
  public importUsageIndex(inputPath: string): void {
    if (!fs.existsSync(inputPath)) {
      console.log('Usage索引文件不存在，需要重新构建');
      return;
    }

    const content = fs.readFileSync(inputPath, 'utf-8');
    const indexObj = JSON.parse(content);

    this.usageIndex.clear();
    for (const [itemId, recipeIds] of Object.entries(indexObj)) {
      this.usageIndex.set(itemId, new Set(recipeIds as string[]));
    }

    console.log(`Usage索引已导入: ${this.usageIndex.size} 个物品`);
  }
}

/**
 * 使用示例：
 *
 * const service = new UsageRecipeService('/app/data/recipes');
 *
 * // 方式1：启动时构建索引
 * await service.buildUsageIndex();
 *
 * // 方式2：从缓存导入（更快）
 * service.importUsageIndex('/app/data/usage_index.json');
 *
 * // 查询某个物品的usage配方
 * const usageRecipes = await service.getUsageRecipeDetails('itemId123');
 * console.log(`该物品可以用在 ${usageRecipes.length} 个配方中`);
 */
