import Mock from 'mockjs'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import {
  clearAuth,
  getRole,
  getUserId,
  isAuthed,
  setRole,
  setToken,
  setUserId,
} from '@/services/auth'
import { mockUsers } from '../seed'
import type { MockParams } from '../types'

export const findCurrentMockUser = () =>
  mockUsers.find((item) => item.id === getUserId()) ||
  mockUsers.find((item) => item.role === getRole()) ||
  mockUsers[0]

const setupAuthMock = () => {
  setupMock({
    setup() {
      Mock.mock(new RegExp('/api/user/login'), (params: MockParams) => {
        const { username, password } = JSON.parse(params.body)
        if (!username) {
          return failedResponseWrap(null, '请填写用户名', 50000)
        }
        if (!password) {
          return failedResponseWrap(null, '请填写密码', 50000)
        }

        const user = mockUsers.find(
          (item) => item.username === username && item.password === password
        )

        if (!user) {
          return failedResponseWrap(null, '用户名或密码错误', 50000)
        }

        setRole(user.role)
        setUserId(user.id)
        const token = /^\d+$/.test(user.id)
          ? `${user.role}12345`
          : `mock-${user.id}`
        setToken(token)

        return responseWrap({
          token,
        })
      })

      Mock.mock(new RegExp('/api/user/info'), () => {
        if (!isAuthed()) {
          return failedResponseWrap(null, '未登录', 50008)
        }

        const user = findCurrentMockUser()

        return responseWrap({
          id: user.id,
          tenantId: user.tenantId,
          name: user.name,
          avatar: user.avatar,
          email: user.email,
          job: user.job,
          dept: user.dept,
          role: user.role,
          permissions: user.permissions,
        })
      })

      Mock.mock(new RegExp('/api/user/logout'), () => {
        if (!isAuthed()) {
          return failedResponseWrap(null, '未登录', 50008)
        }

        clearAuth()
        return responseWrap({})
      })
    },
  })
}

export default setupAuthMock
