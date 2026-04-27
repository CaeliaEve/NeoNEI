import fs from 'fs';
import { DatabaseManager } from '../models/database';
import { NeoNeiCompilerService, type CompilerOptions, type CompilerRunResult, type CompilerSourceRoots } from './neonei-compiler.service';
import { PublishPayloadMaterializerService } from './publish-payload-materializer.service';

export interface CompileAccelerationDatabaseOptions {
  targetDbPath: string;
  sourceRoots: CompilerSourceRoots;
  compilerOptions?: CompilerOptions;
}

export interface EnsureAccelerationDatabaseReadyOptions {
  manager: DatabaseManager;
  sourceRoots: CompilerSourceRoots;
  compilerOptions?: CompilerOptions;
}

export interface PromoteCompiledAccelerationDatabaseOptions {
  manager: DatabaseManager;
  compiledDbPath: string;
}

function cleanupSqliteSidecars(basePath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const filePath = `${basePath}${suffix}`;
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

export async function compileAccelerationDatabase(
  options: CompileAccelerationDatabaseOptions,
): Promise<CompilerRunResult> {
  const { targetDbPath, sourceRoots, compilerOptions } = options;
  const tempDbPath = `${targetDbPath}.compile-${process.pid}-${Date.now()}`;
  cleanupSqliteSidecars(tempDbPath);
  if (fs.existsSync(tempDbPath)) {
    fs.rmSync(tempDbPath, { force: true });
  }

  const tempManager = new DatabaseManager(tempDbPath);
  await tempManager.init();

  try {
    const db = tempManager.getDatabase();
    db.pragma('synchronous = OFF');
    db.pragma('temp_store = MEMORY');
    db.pragma('cache_size = -65536');

    const compiler = new NeoNeiCompilerService(tempManager, sourceRoots, compilerOptions);
    const result = await compiler.compile();

    db.pragma('wal_checkpoint(TRUNCATE)');
    db.pragma('optimize');
    tempManager.close();

    cleanupSqliteSidecars(targetDbPath);
    if (fs.existsSync(targetDbPath)) {
      fs.rmSync(targetDbPath, { force: true });
    }
    fs.renameSync(tempDbPath, targetDbPath);
    cleanupSqliteSidecars(tempDbPath);

    return result;
  } catch (error) {
    tempManager.close();
    if (fs.existsSync(tempDbPath)) {
      fs.rmSync(tempDbPath, { force: true });
    }
    cleanupSqliteSidecars(tempDbPath);
    throw error;
  }
}

export async function ensureAccelerationDatabaseReady(
  options: EnsureAccelerationDatabaseReadyOptions,
): Promise<CompilerRunResult | null> {
  const { manager, sourceRoots, compilerOptions } = options;
  await manager.init();
  const compiler = new NeoNeiCompilerService(manager, sourceRoots, compilerOptions);
  if (compiler.isAccelerationStateFresh()) {
    return null;
  }

  const targetDbPath = manager.getDbPath();
  manager.close();
  const result = await compileAccelerationDatabase({
    targetDbPath,
    sourceRoots,
    compilerOptions,
  });
  await manager.init();
  return result;
}

export async function promoteCompiledAccelerationDatabase(
  options: PromoteCompiledAccelerationDatabaseOptions,
): Promise<void> {
  const { manager, compiledDbPath } = options;
  const targetDbPath = manager.getDbPath();
  if (compiledDbPath === targetDbPath) {
    await manager.init();
    return;
  }

  if (!fs.existsSync(compiledDbPath)) {
    throw new Error(`Compiled acceleration database not found: ${compiledDbPath}`);
  }

  manager.close();
  try {
    cleanupSqliteSidecars(targetDbPath);
    if (fs.existsSync(targetDbPath)) {
      fs.rmSync(targetDbPath, { force: true });
    }
    fs.renameSync(compiledDbPath, targetDbPath);
    cleanupSqliteSidecars(compiledDbPath);
  } catch (error) {
    await manager.init();
    throw error;
  }

  await manager.init();
}

export async function ensurePublishPayloadsReady(
  options: EnsureAccelerationDatabaseReadyOptions,
): Promise<boolean> {
  const { manager, sourceRoots, compilerOptions } = options;
  const compiler = new NeoNeiCompilerService(manager, sourceRoots, compilerOptions);
  if (!compiler.isAccelerationStateFresh()) {
    return false;
  }

  const sourceSignature = compiler.getCurrentSourceSignature();
  const materializer = new PublishPayloadMaterializerService({
    databaseManager: manager,
    imageRoot: sourceRoots.imageRoot,
    atlasOutputDir: compilerOptions?.hotPageAtlas?.atlasOutputDir,
    publishHotPayloads: compilerOptions?.publishHotPayloads,
  });

  if (materializer.isFresh(sourceSignature)) {
    return false;
  }

  await materializer.materialize(sourceSignature);
  return true;
}
