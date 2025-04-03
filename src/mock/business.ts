import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { responseWrap, failedResponseWrap } from '@/utils/mock'
import { isAuthed } from '@/utils/auth'
import type { GroupedBusinessEntry } from '@/api/business'
import { MockParams } from './types'

const data = Mock.mock({
  'list|55': [
    {
      'serialNo|4': /[A-Z][a-z][0-9]/,
      'name|1': [
        '龙头企业',
        '金融类企业',
        '女性托育补贴',
        '青年人才贷',
        '外籍专家补贴',
        '博士后人员安家费',
        '院士工作站扶持',
      ],
      'category|1': [
        '建立人才贡献奖励制度',
        '搭建高层次创新平台',
        '鼓励引进高层次人才',
        '其他',
      ],
      'status|1': [0, 1, 2],
      'time': '@datetime',
      'updatedTime': '@datetime',
    },
  ],
})

setupMock({
  setup() {
    Mock.mock(new RegExp('/api/business/groups'), () => {
      if (isAuthed()) {
        return responseWrap<GroupedBusinessEntry[]>([
          {
            name: '建立人才贡献奖励制度',
            items: [
              {
                id: 1,
                name: '龙头企业',
                active: true,
                startTime: '2022-08-01',
                endTime: '2022-12-01',
              },
              {
                id: 2,
                name: '重点企业',
                active: true,
                startTime: '2022-08-01',
                endTime: '2022-11-01',
              },
              {
                id: 3,
                name: '金融类企业',
                active: true,
              },
            ],
          },
          {
            name: '搭建高层次创新平台',
            items: [
              {
                id: 4,
                name: '博士后工作站扶持',
                active: false,
                startTime: '2022-09-01',
                endTime: '2023-09-01',
              },
              { id: 5, name: '博士后人员安家费', active: false },
              { id: 6, name: '院士工作站扶持', active: false },
              { id: 7, name: '院士工作站扶持', active: true },
            ],
          },
          {
            name: '鼓励引进高层次人才',
            items: [
              {
                id: 7,
                name: '外籍专家补贴',
                active: true,
              },
            ],
          },
        ])
      }
      return failedResponseWrap(null, '未登录', 50000)
    })

    Mock.mock(new RegExp('/api/business/records'), (params: MockParams) => {
      if (isAuthed()) {
        const { current = 1, pageSize = 20 } = qs.parseUrl(params.url).query
        const p = current as number
        const ps = pageSize as number
        console.log(data)
        return responseWrap({
          list: data.list.slice((p - 1) * ps, p * ps),
          total: 55,
        })
      }
      return failedResponseWrap(null, '未登录', 50000)
    })
  },
})
