import fs from 'fs';
import path from 'path';
import { LOG_DIR } from '../config/runtime-paths';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE !== '0';

function timestamp(): string {
  return new Date().toISOString();
}

function dayStamp(): string {
  return timestamp().slice(0, 10);
}

function logFilePath(level: LogLevel): string {
  const day = dayStamp();
  return path.join(LOG_DIR, `${day}-${level.toLowerCase()}.log`);
}

function ensureLogDir(): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // ignore directory creation failures and keep console logging
  }
}

function stringifyMeta(meta: unknown): string {
  if (meta === undefined) return '';
  if (typeof meta === 'string') return ` ${meta}`;
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  const line = `[${timestamp()}] [${level}] ${message}${stringifyMeta(meta)}\n`;

  if (LOG_TO_CONSOLE) {
    if (level === 'ERROR') {
      console.error(line.trimEnd());
    } else if (level === 'WARN') {
      console.warn(line.trimEnd());
    } else {
      console.log(line.trimEnd());
    }
  }

  ensureLogDir();
  const file = logFilePath(level);
  void fs.promises.appendFile(file, line, 'utf8').catch(() => {
    // avoid crashing request path due to log I/O failure
  });
}

export const logger = {
  info(message: string, meta?: unknown): void {
    write('INFO', message, meta);
  },
  warn(message: string, meta?: unknown): void {
    write('WARN', message, meta);
  },
  error(message: string, meta?: unknown): void {
    write('ERROR', message, meta);
  },
};
