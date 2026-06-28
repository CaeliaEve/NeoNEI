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

export type BackgroundExternalRuntimeSummary = {
  ok: true;
  stage: 'external-runtime';
  runtimeId: string | null;
  runtimeManifestSchema: string | null;
  promotedFiles: number;
  reportPath: string;
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
const { getAccelerationCompilerSourceRoots } = requireFromBackendRoot('services/acceleration-runtime-compiler-probe.service');
compileAccelerationDatabase({
  targetDbPath: process.env.ACCELERATION_DB_FILE,
  sourceRoots: getAccelerationCompilerSourceRoots(),
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

export function compileExternalRuntimeArtifactInChild(): Promise<BackgroundExternalRuntimeSummary> {
  const inlineCode = `
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const moduleRoot = process.env.NEONEI_BACKEND_MODULE_ROOT;
function requireFromBackendRoot(modulePath) {
  if (!moduleRoot) throw new Error('NEONEI_BACKEND_MODULE_ROOT is required');
  return require(path.join(moduleRoot, modulePath));
}
const { ElysiumCompilerClient } = requireFromBackendRoot('compiler-client/elysium-compiler-client');
const { promoteExternalRuntimeArtifact } = requireFromBackendRoot('services/external-runtime-artifact-promotion.service');
const { getExternalRuntimeRawExportRoot } = requireFromBackendRoot('services/acceleration-runtime-compiler-authority.service');

function hashDirectory(rootDir) {
  const hash = crypto.createHash('sha256');
  const stack = [''];
  while (stack.length > 0) {
    const relativeDir = stack.pop();
    const absoluteDir = path.join(rootDir, relativeDir);
    for (const name of fs.readdirSync(absoluteDir).sort()) {
      const relativePath = path.join(relativeDir, name).split(path.sep).join('/');
      const absolutePath = path.join(rootDir, relativePath);
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        stack.push(relativePath);
        continue;
      }
      if (!stat.isFile()) continue;
      hash.update(relativePath);
      hash.update(String(stat.size));
      hash.update(String(Math.floor(stat.mtimeMs)));
    }
  }
  return hash.digest('hex');
}

(async () => {
  const input = getExternalRuntimeRawExportRoot();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-external-runtime-'));
  const output = path.join(workDir, 'compiled');
  const validateReport = path.join(workDir, 'validate-report.json');
  const compileReport = path.join(workDir, 'compile-report.json');
  try {
    const compiler = new ElysiumCompilerClient();
    await compiler.validate({ input, report: validateReport, output });
    await compiler.compile({ input, output, report: compileReport, scope: 'native-ui', strict: true });
    const promotion = promoteExternalRuntimeArtifact({ artifactRoot: output });
    console.log('EXTERNAL_RUNTIME_RESULT ' + JSON.stringify({
      ok: true,
      stage: 'external-runtime',
      runtimeId: promotion.runtimeId,
      runtimeManifestSchema: promotion.runtimeManifestSchema,
      promotedFiles: promotion.copiedFiles.length,
      reportPath: promotion.reportPath,
      signature: hashDirectory(output),
    }));
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
  return runBackgroundNodeJob<BackgroundExternalRuntimeSummary>(
    'compile-external-runtime-artifact',
    'EXTERNAL_RUNTIME_RESULT',
    inlineCode,
  );
}

export function materializePublishPayloadsInChild(): Promise<BackgroundPublishSummary> {
  const inlineCode = `
const path = require('path');
const moduleRoot = process.env.NEONEI_BACKEND_MODULE_ROOT;
function requireFromBackendRoot(modulePath) {
  if (!moduleRoot) throw new Error('NEONEI_BACKEND_MODULE_ROOT is required');
  return require(path.join(moduleRoot, modulePath));
}
const { getAccelerationCompilerSourceRoots } = requireFromBackendRoot('services/acceleration-runtime-compiler-probe.service');
const { getAccelerationDatabaseManager } = requireFromBackendRoot('models/database');
const { ensurePublishPayloadsReady } = requireFromBackendRoot('services/acceleration-db-pipeline.service');
(async () => {
  const manager = getAccelerationDatabaseManager();
  await manager.init();
  try {
    const materialized = await ensurePublishPayloadsReady({
      manager,
      sourceRoots: getAccelerationCompilerSourceRoots(),
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

