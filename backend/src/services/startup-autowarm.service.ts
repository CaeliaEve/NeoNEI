import { getAutowarmPolicy } from '../config/autowarm-policy';
import {
  projectEnabledAutowarmStartupTasks,
  type AutowarmTaskKey,
} from '../config/autowarm-policy-abi';
import { logger } from '../utils/logger';
import { getRecipeBootstrapService } from './recipe-bootstrap.service';

type AutowarmResult = Readonly<{
  warmed: number;
  skipped: number;
}>;

type AutowarmPrewarmHandler = (limit: number) => Promise<AutowarmResult>;

const AUTOWARM_PREWARM_HANDLERS: Readonly<Record<AutowarmTaskKey, AutowarmPrewarmHandler>> = Object.freeze({
  recipeBootstrap: (limit) => getRecipeBootstrapService().prewarmBootstrapCache({ limit }),
  recipeShard: (limit) => getRecipeBootstrapService().prewarmShardCache({ limit }),
});

export function scheduleStartupAutowarm(): void {
  for (const task of projectEnabledAutowarmStartupTasks(getAutowarmPolicy())) {
    setTimeout(() => {
      void AUTOWARM_PREWARM_HANDLERS[task.key](task.limit)
        .then((result) => {
          logger.info(task.completedLogMessage, {
            warmed: result.warmed,
            skipped: result.skipped,
            limit: task.limit,
          });
        })
        .catch((error) => {
          logger.warn(task.failedLogMessage, error);
        });
    }, task.delayMs);
  }
}
