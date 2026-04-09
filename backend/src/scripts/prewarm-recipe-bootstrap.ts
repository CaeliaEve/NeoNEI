import { getRecipeBootstrapService } from '../services/recipe-bootstrap.service';
import { logger } from '../utils/logger';

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const parsedLimit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
  const limit = Number.isFinite(parsedLimit) && parsedLimit! > 0 ? parsedLimit : undefined;

  const startedAt = Date.now();
  const result = await getRecipeBootstrapService().prewarmBootstrapCache({ limit });
  logger.info('[RECIPE_BOOTSTRAP_PREWARM] completed', {
    warmed: result.warmed,
    skipped: result.skipped,
    durationMs: Date.now() - startedAt,
    limit: limit ?? null,
  });
}

main().catch((error) => {
  logger.error('[RECIPE_BOOTSTRAP_PREWARM] failed', error);
  process.exit(1);
});
