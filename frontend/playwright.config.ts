import { defineConfig } from '@playwright/test';
if (!process.env.NEONEI_TEST_URL) throw new Error('Use npm run e2e to start the application and browser checks together');
export default defineConfig({
  testDir: './test',
  testMatch: '*.spec.ts',
  workers: 1,
  reporter: 'list',
  use: { baseURL: process.env.NEONEI_TEST_URL, viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
