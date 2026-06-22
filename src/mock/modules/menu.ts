import Mock from 'mockjs'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { getRole, isAuthed } from '@/services/auth'
import { mockMenus, type MockRole } from '../seed'

const isMockRole = (role: string | null): role is MockRole =>
  role === 'admin' ||
  role === 'user' ||
  role === 'operator' ||
  role === 'restricted'

const setupMenuMock = () => {
  setupMock({
    setup() {
      Mock.mock('/api/user/menu', () => {
        if (!isAuthed()) {
          return failedResponseWrap(null, '未登录', 50008)
        }

        const role = getRole()
        return responseWrap(isMockRole(role) ? mockMenus[role] : [])
      })
    },
  })
}

export default setupMenuMock
