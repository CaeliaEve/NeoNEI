import {
  ACCELERATION_DB_FILE,
  IMAGES_PATH,
  NESQL_CANONICAL_DIR,
  SPLIT_ITEMS_DIR,
  SPLIT_RECIPES_DIR,
} from '../config/runtime-paths';
import { compileAccelerationDatabase } from '../services/acceleration-db-pipeline.service';

async function run(): Promise<void> {
  const result = await compileAccelerationDatabase({
    targetDbPath: ACCELERATION_DB_FILE,
    sourceRoots: {
      itemsDir: SPLIT_ITEMS_DIR,
      recipesDir: SPLIT_RECIPES_DIR,
      canonicalDir: NESQL_CANONICAL_DIR,
      imageRoot: IMAGES_PATH,
    },
  });
  console.log(
    `ACCEL_COMPILE_RESULT ${JSON.stringify({
      ok: true,
      stage: 'stage-4',
      itemsImported: result.itemsImported,
      recipesImported: result.recipesImported,
      hotAtlasesGenerated: result.hotAtlasesGenerated,
      signature: result.signature,
    })}`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
