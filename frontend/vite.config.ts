import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { offline } from './plugins/offline.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:3002';
  return {
    publicDir: false,
    plugins: [vue(), offline(fileURLToPath(new URL('.', import.meta.url)))],
    resolve: { dedupe: ['@elysium/contracts'] },
    server: { host: '127.0.0.1', proxy: { '/api': { target }, '/assets': { target } } },
    build: { assetsDir: 'web' },
    worker: { format: 'es' },
  };
});
