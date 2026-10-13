import { getActivePinia } from 'pinia'
import useMenuStore from '@/store/modules/menu'
import { hasPermission as granted } from '@af-admin/workflow-core'

export const hasPermission = (permissions: string[], code: string) =>
  (!getActivePinia() ||
    !(useMenuStore().hiddenPermissions || []).includes(code)) &&
  granted(permissions, code)

export default hasPermission
