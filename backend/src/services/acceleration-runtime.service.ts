import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { IMAGES_PATH, NESQL_CANONICAL_DIR, SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } from '../config/runtime-paths';
import { getAccelerationDatabaseManager } from '../models/database';
import { promoteCompiledAccelerationDatabase } from './acceleration-db-pipeline.service';
import { NeoNeiCompilerService, type CompilerSourceRoots } from './neonei-compiler.service';
import { logger } from '../utils/logger';
import { verifyElysiumCompilerBoundary } from '../compiler-client/elysium-compiler-client';
export {
  accelerationRuntime,
  createAccelerationRuntimeMiddleware,
  setAccelerationRuntimePhase,
  type AccelerationRuntimePhase,
  type AccelerationRuntimeState,
} from './acceleration-runtime-state.service';
import {
  setAccelerationRuntimeBlocking,
  setAccelerationRuntimePhase,
  waitForAccelerationApiIdle,
} from './acceleration-runtime-state.service';

type BackgroundCompileSummary = {
  ok: true;
  stage: string;
  itemsImported: number;
  recipesImported: number;
  hotAtlasesGenerated: number;
  signature: string;
};

type BackgroundPublishSummary = {
  ok: true;
  materialized: boolean;
};

export const ACCELERATION_SOURCE_ROOTS: CompilerSourceRoots = {
  itemsDir: SPLIT_ITEMS_DIR,
  recipesDir: SPLIT_RECIPES_DIR,
  canonicalDir: NESQL_CANONICAL_DIR,
  imageRoot: IMAGES_PATH,
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

function compileAccelerationSnapshotInChild(candidateDbPath: string): Promise<BackgroundCompileSummary> {
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

function materializePublishPayloadsInChild(): Promise<BackgroundPublishSummary> {
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

export async function reconcileAccelerationRuntime(
  accelerationDbManager: ReturnType<typeof getAccelerationDatabaseManager>,
  options?: { publishMaterializeOnStart?: boolean },
): Promise<void> {
  const compilerHandshake = await verifyElysiumCompilerBoundary();
  logger.info('[ACCELERATION_DB] external compiler boundary verified', {
    compiler: compilerHandshake.compiler,
    exportAbiVersion: compilerHandshake.metadata?.exportAbiVersion,
    packAbiVersion: compilerHandshake.metadata?.packAbiVersion,
    runtimeAbiVersion: compilerHandshake.metadata?.runtimeAbiVersion,
  });
  const compiler = new NeoNeiCompilerService(accelerationDbManager, ACCELERATION_SOURCE_ROOTS);
  const candidateDbPath = `${accelerationDbManager.getDbPath()}.next`;

  if (!compiler.isAccelerationStateFresh()) {
    setAccelerationRuntimePhase('stale', 'Acceleration snapshot is stale; compiling next snapshot in background.', {
      stale: true,
      lastError: null,
    });
    logger.info('[ACCELERATION_DB] stale; runtime will stay online while compiling next snapshot');
    if (fs.existsSync(candidateDbPath)) {
      fs.rmSync(candidateDbPath, { force: true });
    }

    setAccelerationRuntimePhase('compiling', 'Compiling next acceleration snapshot in background.', {
      stale: true,
    });
    const compileResult = await compileAccelerationSnapshotInChild(candidateDbPath);

    setAccelerationRuntimePhase('promoting', 'Promoting freshly compiled acceleration snapshot.', {
      stale: true,
      lastCompiledSignature: compileResult.signature,
    });
    setAccelerationRuntimeBlocking(true);
    try {
      await waitForAccelerationApiIdle();
      await promoteCompiledAccelerationDatabase({
        manager: accelerationDbManager,
        compiledDbPath: candidateDbPath,
      });
    } finally {
      setAccelerationRuntimeBlocking(false);
    }

    setAccelerationRuntimePhase('ready', 'Acceleration snapshot refreshed.', {
      stale: false,
      lastCompiledSignature: compileResult.signature,
      lastError: null,
    });
    logger.info('[ACCELERATION_DB] promoted background snapshot', {
      itemsImported: compileResult.itemsImported,
      recipesImported: compileResult.recipesImported,
      signature: compileResult.signature,
    });
    setAccelerationRuntimePhase('ready', 'Acceleration runtime ready.', {
      stale: false,
      lastError: null,
    });
    return;
  }

  if (!options?.publishMaterializeOnStart) {
    logger.info(
      '[PUBLISH_PAYLOADS] startup materialization skipped; set NEONEI_PUBLISH_MATERIALIZE_ON_START=1 to refresh publish bundles on boot',
    );
    setAccelerationRuntimePhase('ready', 'Acceleration runtime ready.', {
      stale: false,
      lastError: null,
    });
    return;
  }

  setAccelerationRuntimePhase('materializing', 'Refreshing publish hot payloads.', {
    stale: false,
    lastError: null,
  });
  const publishPayloadsResult = await materializePublishPayloadsInChild();
  logger.info(
    publishPayloadsResult.materialized
      ? '[PUBLISH_PAYLOADS] materialized in background'
      : '[PUBLISH_PAYLOADS] already fresh',
  );
  setAccelerationRuntimePhase('ready', 'Acceleration runtime ready.', {
    stale: false,
    lastError: null,
  });
}
