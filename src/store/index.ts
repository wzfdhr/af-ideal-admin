import { createPinia } from 'pinia'
// import all store modules
import useUserStore from './modules/user'
import useMenuStore from './modules/menu'
import stateManagement from './modules/state'

const pinia = createPinia()

export { useUserStore, useMenuStore, stateManagement }
export default pinia
