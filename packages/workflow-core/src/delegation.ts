import { DomainError } from '@af-admin/contracts'
import { hasPermission } from './workflow'

export const assertDelegation = (owned: string[], granted: string[]) => {
  if (granted.some((code) => code === '*' || !hasPermission(owned, code)))
    throw new DomainError(
      403,
      'PRIVILEGE_BOUNDS',
      '不能管理或授予超出自身授权的权限'
    )
}
export default assertDelegation
