import { getAutowarmPolicy } from '../config/autowarm-policy';
import { getRecipeBootstrapService } from './recipe-bootstrap.service';
import { logger } from '../utils/logger';

export function scheduleStartupAutowarm(): void {
  const autowarmPolicy = getAutowarmPolicy();
  if (autowarmPolicy.recipeBootstrap.enabled) {
    setTimeout(() => {
      void getRecipeBootstrapService()
        .prewarmBootstrapCache({ limit: autowarmPolicy.recipeBootstrap.limit })
        .then((result) => {
          logger.info('[RECIPE_BOOTSTRAP_AUTOWARM] completed', {
            warmed: result.warmed,
            skipped: result.skipped,
            limit: autowarmPolicy.recipeBootstrap.limit,
          });
        })
        .catch((error) => {
          logger.warn('[RECIPE_BOOTSTRAP_AUTOWARM] failed', error);
        });
    }, 500);
  }

  if (autowarmPolicy.recipeShard.enabled) {
    setTimeout(() => {
      void getRecipeBootstrapService()
        .prewarmShardCache({ limit: autowarmPolicy.recipeShard.limit })
        .then((result) => {
          logger.info('[RECIPE_SHARD_AUTOWARM] completed', {
            warmed: result.warmed,
            skipped: result.skipped,
            limit: autowarmPolicy.recipeShard.limit,
          });
        })
        .catch((error) => {
          logger.warn('[RECIPE_SHARD_AUTOWARM] failed', error);
        });
    }, 1800);
  }
}
