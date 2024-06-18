import permission from './permission'
import type { App } from 'vue'

export default {
  install(app: App) {
    app.directive('allow', permission)
  },
}
