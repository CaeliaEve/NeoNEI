import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  testDir: resolve(__dirname),
  testMatch: ['gatec-final.spec.ts'],
  timeout: 180000,
  use: {
    headless: true,
    viewport: { width: 1600, height: 900 },
    ignoreHTTPSErrors: true,
  },
});
