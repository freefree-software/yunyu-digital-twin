import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useDashboardStore } from '@/stores/dashboard'
import './styles/tokens.scss'
import './styles/global.scss'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  // 先加载园区数据，避免面板在首屏出现空数据闪烁
  await useDashboardStore(pinia).load()

  app.mount('#app')
}

bootstrap()
