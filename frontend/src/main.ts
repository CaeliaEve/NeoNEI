import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import './assets/index.css'
import './styles/cyberpunk.css'  // Keep for base styles
import './styles/design-system.css'
import './styles/ui-overrides.css'  // Minimal color overrides
import './styles/animations.css'  // Rich animation system
import './styles/enhanced-components.css'  // Enhanced component animations
import App from './App.vue'
import router from './router'

const RELOAD_GUARD_KEY = 'neonei:chunk-reload-guard'

function isChunkLoadFailure(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : ''
  return /Failed to fetch dynamically imported module|Importing a module script failed|Failed to fetch module/i.test(message)
}

function recoverFromChunkLoad(reason: string): void {
  if (typeof window === 'undefined') {
    return
  }

  const signature = `${reason}:${window.location.href}`
  try {
    if (window.sessionStorage.getItem(RELOAD_GUARD_KEY) === signature) {
      return
    }
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, signature)
  } catch {
    // ignore storage failures and still attempt a reload
  }

  window.location.reload()
}

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    const viteEvent = event as Event & { payload?: unknown; preventDefault: () => void }
    viteEvent.preventDefault()
    recoverFromChunkLoad('vite-preload-error')
  })
}

router.onError((error) => {
  if (!isChunkLoadFailure(error)) {
    console.error(error)
    return
  }
  recoverFromChunkLoad('router-chunk-load')
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')

void router.isReady().finally(() => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.removeItem(RELOAD_GUARD_KEY)
  } catch {
    // ignore storage failures
  }
})
