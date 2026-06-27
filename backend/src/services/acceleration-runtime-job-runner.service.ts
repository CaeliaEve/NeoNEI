import path from 'path';
import { spawn } from 'child_process';
import { logger } from '../utils/logger';

export type BackgroundCompileSummary = {
  ok: true;
  stage: string;
  itemsImported: number;
  recipesImported: number;
  hotAtlasesGenerated: number;
  signature: string;
};

export type BackgroundPublishSummary = {
  ok: true;
  materialized: boolean;
};

function pipeChildOutput(prefix: string, chunk: Buffer, onStructuredLine?: (line: string) => void): void {
  const text = chunk.toString('utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (onStructuredLine) {
      onStructuredLine(line);
    }
    logger.info(`${prefix} ${line}`);
  }
}

function runBackgroundNodeJob<T extends { ok: true }>(
  label: string,
  resultPrefix: string,
  inlineCode: string,
  extraEnv?: NodeJS.ProcessEnv,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let result: T | null = null;
    let stderrBuffer = '';
    const child = spawn(process.execPath, [...process.execArgv, '-e', inlineCode], {
      cwd: path.resolve(__dirname, '..', '..'),
      env: {
        ...process.env,
        ...extraEnv,
        NEONEI_BACKEND_MODULE_ROOT: path.resolve(__dirname, '..'),
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk: Buffer) => {
      pipeChildOutput('[ACCEL_CHILD]', chunk, (line) => {
        if (!line.startsWith(resultPrefix)) {
          return;
        }
        try {
          result = JSON.parse(line.slice(resultPrefix.length).trim()) as T;
        } catch (error) {
          reject(error);
        }
      });
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8');
      pipeChildOutput('[ACCEL_CHILD_ERR]', chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && result) {
        resolve(result);
        return;
      }
      reject(
        new Error(
          `Background job failed (${label}) with code ${code ?? 'unknown'}${stderrBuffer ? `: ${stderrBuffer.trim()}` : ''}`,
        ),
      );
    });
  });
}

export function compileAccelerationSnapshotInChild(candidateDbPath: string): Promise<BackgroundCompileSummary> {
  const inlineCode = `
const path = require('path');
const moduleRoot = process.env.NEONEI_BACKEND_MODULE_ROOT;
function requireFromBackendRoot(modulePath) {
  if (!moduleRoot) throw new Error('NEONEI_BACKEND_MODULE_ROOT is required');
  return require(path.join(moduleRoot, modulePath));
}
const { compileAccelerationDatabase } = requireFromBackendRoot('services/acceleration-db-pipeline.service');
const { IMAGES_PATH, NESQL_CANONICAL_DIR, SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } = requireFromBackendRoot('config/runtime-paths');
compileAccelerationDatabase({
  targetDbPath: process.env.ACCELERATION_DB_FILE,
  sourceRoots: {
    itemsDir: SPLIT_ITEMS_DIR,
    recipesDir: SPLIT_RECIPES_DIR,
    canonicalDir: NESQL_CANONICAL_DIR,
    imageRoot: IMAGES_PATH,
  },
}).then((result) => {
  console.log('ACCEL_COMPILE_RESULT ' + JSON.stringify({
    ok: true,
    stage: 'stage-4',
    itemsImported: result.itemsImported,
    recipesImported: result.recipesImported,
    hotAtlasesGenerated: result.hotAtlasesGenerated,
    signature: result.signature,
  }));
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
  return runBackgroundNodeJob<BackgroundCompileSummary>('compile-acceleration-db', 'ACCEL_COMPILE_RESULT', inlineCode, {
    ACCELERATION_DB_FILE: candidateDbPath,
  });
}

export function materializePublishPayloadsInChild(): Promise<BackgroundPublishSummary> {
  const inlineCode = `
const path = require('path');
const moduleRoot = process.env.NEONEI_BACKEND_MODULE_ROOT;
function requireFromBackendRoot(modulePath) {
  if (!moduleRoot) throw new Error('NEONEI_BACKEND_MODULE_ROOT is required');
  return require(path.join(moduleRoot, modulePath));
}
const { IMAGES_PATH, NESQL_CANONICAL_DIR, SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } = requireFromBackendRoot('config/runtime-paths');
const { getAccelerationDatabaseManager } = requireFromBackendRoot('models/database');
const { ensurePublishPayloadsReady } = requireFromBackendRoot('services/acceleration-db-pipeline.service');
(async () => {
  const manager = getAccelerationDatabaseManager();
  await manager.init();
  try {
    const materialized = await ensurePublishPayloadsReady({
      manager,
      sourceRoots: {
        itemsDir: SPLIT_ITEMS_DIR,
        recipesDir: SPLIT_RECIPES_DIR,
        canonicalDir: NESQL_CANONICAL_DIR,
        imageRoot: IMAGES_PATH,
      },
    });
    console.log('PUBLISH_PAYLOAD_RESULT ' + JSON.stringify({ ok: true, materialized }));
  } finally {
    manager.close();
  }
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
  return runBackgroundNodeJob<BackgroundPublishSummary>(
    'materialize-publish-payloads',
    'PUBLISH_PAYLOAD_RESULT',
    inlineCode,
  );
}

