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

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')
