import Mock from 'mockjs'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { getUserId, isAuthed } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import { mockEffectivePermissions } from '../authorization-state'
import { mockUsers } from '../seed'

const setupPermissionMock = () => {
  setupMock({
    setup() {
      Mock.mock(new RegExp('/api/permission/codes'), () => {
        if (!isAuthed()) {
          return failedResponseWrap(null, '未登录', 50008)
        }

        const user = mockUsers.find((item) => item.id === getUserId())
        if (!user) return failedResponseWrap(null, '未登录', 50008)
        try {
          return responseWrap(
            mockEffectivePermissions(
              user.id,
              tenantScope.snapshot().tenantId || user.tenantId
            )
          )
        } catch {
          return failedResponseWrap(null, '租户不可访问', 403)
        }
      })
    },
  })
}

export default setupPermissionMock
