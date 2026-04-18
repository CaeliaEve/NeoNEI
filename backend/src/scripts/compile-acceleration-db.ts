import { getAccelerationDatabaseManager } from '../models/database';
import {
  IMAGES_PATH,
  NESQL_CANONICAL_DIR,
  SPLIT_ITEMS_DIR,
  SPLIT_RECIPES_DIR,
} from '../config/runtime-paths';
import { NeoNeiCompilerService } from '../services/neonei-compiler.service';

async function run(): Promise<void> {
  const manager = getAccelerationDatabaseManager();
  await manager.init();

  const compiler = new NeoNeiCompilerService(manager, {
    itemsDir: SPLIT_ITEMS_DIR,
    recipesDir: SPLIT_RECIPES_DIR,
    canonicalDir: NESQL_CANONICAL_DIR,
    imageRoot: IMAGES_PATH,
  });

  const result = await compiler.compile();
  console.log(
    JSON.stringify(
      {
        ok: true,
        stage: 'stage-4',
        itemsImported: result.itemsImported,
        recipesImported: result.recipesImported,
        hotAtlasesGenerated: result.hotAtlasesGenerated,
        signature: result.signature,
      },
      null,
      2,
    ),
  );

  manager.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
