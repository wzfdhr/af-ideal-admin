import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import { mockBusinessGroups, mockBusinessRecords } from '../seed'
import type { MockParams } from '../types'

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const setupBusinessMock = () => {
  setupMock({
    setup() {
      Mock.mock(new RegExp('/api/business/groups'), () => {
        if (!isAuthed()) {
          return failedResponseWrap(null, '未登录', 50008)
        }

        return responseWrap(mockBusinessGroups)
      })

      Mock.mock(new RegExp('/api/business/records'), (params: MockParams) => {
        if (!isAuthed()) {
          return failedResponseWrap(null, '未登录', 50008)
        }

        const { current = 1, pageSize = 20 } = qs.parseUrl(params.url).query
        const page = toPositiveNumber(current, 1)
        const size = toPositiveNumber(pageSize, 20)

        return responseWrap({
          list: mockBusinessRecords.slice((page - 1) * size, page * size),
          total: mockBusinessRecords.length,
        })
      })
    },
  })
}

export default setupBusinessMock
