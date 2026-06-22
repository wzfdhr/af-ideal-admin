import { createApp } from 'vue'
import Arco from '@arco-design/web-vue'
import ArcoIcon from '@arco-design/web-vue/es/icon'
// import ECharts from 'vue-echarts'
import App from '@/App.vue'
import router from '@/router'
import store from '@/store'
import directives from '@/directives'
import i18n from '@/locale'
import { installObservability } from '@/plugins/observability'
import useUserStore from '@/store/modules/user'

import './mock'
import './api/request'

import '@/styles/tailwindcss.scss'
import '@arco-design/web-vue/dist/arco.css'
import '@/styles/index.scss'

import SIcon from '@/components/s-icon.vue'
import SNavs from '@/components/s-navs.vue'
import pkg from '../package.json'
import 'echarts'

const app = createApp(App)
// app.component('Chart', ECharts)

app.use(Arco)
app.use(router)
app.use(store)
app.use(ArcoIcon)
app.use(i18n)

app.use(directives)

installObservability(app, {
  router,
  getUser: () => {
    const userStore = useUserStore()
    return {
      name: userStore.name,
      role: userStore.role,
    }
  },
  getVersion: () => pkg.version,
})

app.component('SIcon', SIcon)
app.component('SNavs', SNavs)

app.mount('#app')
