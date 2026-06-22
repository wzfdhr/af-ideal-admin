import Mock from 'mockjs'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { getRole, isAuthed } from '@/services/auth'
import { mockUsers } from '../seed'

const setupPermissionMock = () => {
  setupMock({
    setup() {
      Mock.mock(new RegExp('/api/permission/codes'), () => {
        if (!isAuthed()) {
          return failedResponseWrap(null, '未登录', 50008)
        }

        const user = mockUsers.find((item) => item.role === getRole())
        return responseWrap(user?.permissions || [])
      })
    },
  })
}

export default setupPermissionMock
