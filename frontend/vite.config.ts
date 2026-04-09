import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:3002'
  const normalizeBaseUrl = (value: string) => {
    if (!value) return ''
    if (value === '/') return ''
    return value.replace(/\/+$/, '')
  }
  const backendBaseUrl = normalizeBaseUrl(
    env.VITE_BACKEND_BASE_URL || (mode === 'development' ? devProxyTarget : '/api')
  )
  const apiBaseUrl = normalizeBaseUrl(env.VITE_API_BASE_URL || '/api')

  const forbidLegacyImports = {
    name: 'forbid-legacy-imports',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (!importer || !importer.includes('/src/')) return null
      if (!source.includes('components/legacy')) return null
      throw new Error(
        `[legacy-import-guard] Legacy imports are forbidden in production code: "${source}" from "${importer}"`
      )
    }
  }

  return {
    plugins: [vue(), forbidLegacyImports],
    define: {
      __BACKEND_BASE_URL__: JSON.stringify(backendBaseUrl),
      __API_BASE_URL__: JSON.stringify(apiBaseUrl),
    },
    server: {
      proxy: {
        // In development, map /api/images/* to backend /images/*.
        '/api/images': {
          target: devProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/images/, '/images'),
        },
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
        },
        '/images': {
          target: devProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('vue') || id.includes('vue-router') || id.includes('pinia')) {
              return 'vendor-vue'
            }
            if (id.includes('axios') || id.includes('pinyin-pro')) {
              return 'vendor-utils'
            }
            return 'vendor'
          }
        }
      }
    }
  }
})
