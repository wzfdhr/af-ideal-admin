import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import {
  createEnterpriseDataScreenSchema,
  validateDataScreenSchema,
} from '@/components/data-screen/schema'
import type {
  DataScreenDefinition,
  DataScreenListResult,
  DataScreenRealtimeData,
  DataScreenScenario,
  DataScreenStatus,
} from '@/api/data-screen'
import type { MockParams } from '../types'

interface SaveDataScreenInput {
  schema: unknown
}

const getNow = () => '2026-06-23 00:00:00'

const realtimeData: DataScreenRealtimeData = {
  metrics: [
    {
      key: 'gmv',
      label: '今日成交额',
      value: 986000,
      unit: '元',
      trend: 12.5,
    },
    {
      key: 'orders',
      label: '实时订单',
      value: 1286,
      unit: '单',
      trend: 8.2,
    },
    {
      key: 'conversion',
      label: '转化率',
      value: 23.6,
      unit: '%',
      trend: -1.4,
    },
  ],
  trend: [
    { time: '09:00', value: 120 },
    { time: '10:00', value: 180 },
    { time: '11:00', value: 260 },
    { time: '12:00', value: 310 },
    { time: '13:00', value: 420 },
  ],
  distribution: [
    { name: '华东', value: 45 },
    { name: '华南', value: 26 },
    { name: '华北', value: 18 },
    { name: '西南', value: 11 },
  ],
  ranking: [
    { name: '上海分部', value: 320 },
    { name: '深圳分部', value: 276 },
    { name: '北京分部', value: 238 },
    { name: '成都分部', value: 166 },
  ],
  table: [
    {
      id: 'order-1',
      name: '企业客户 A',
      amount: 120000,
      status: '已成交',
    },
    {
      id: 'order-2',
      name: '企业客户 B',
      amount: 86000,
      status: '跟进中',
    },
    {
      id: 'order-3',
      name: '企业客户 C',
      amount: 68000,
      status: '已成交',
    },
  ],
  alerts: [
    {
      id: 'alert-1',
      level: 'warning',
      message: '华南库存低于阈值',
    },
  ],
}

const emptyData: DataScreenRealtimeData = {
  metrics: [],
  trend: [],
  distribution: [],
  ranking: [],
  table: [],
  alerts: [],
}

const alertData: DataScreenRealtimeData = {
  ...realtimeData,
  alerts: [
    {
      id: 'alert-critical',
      level: 'critical',
      message: '支付成功率低于 95%，请立即处理',
    },
    ...realtimeData.alerts,
  ],
}

const seedScreens = (): DataScreenDefinition[] => [
  {
    id: 'enterprise-ops-screen',
    name: '企业运营大屏',
    schema: createEnterpriseDataScreenSchema(),
    status: 'published',
    version: 1,
    createdAt: getNow(),
    updatedAt: getNow(),
    publishedAt: getNow(),
  },
]

const parseBody = <T>(body: string): Partial<T> => {
  try {
    return JSON.parse(body || '{}') as Partial<T>
  } catch {
    return {}
  }
}

const getPathParts = (url: string) =>
  url
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))

const getLastPathPart = (url: string) => {
  const parts = getPathParts(url)
  return parts[parts.length - 1] || ''
}

const getActionTargetId = (url: string) => {
  const parts = getPathParts(url)
  return parts[parts.length - 2] || ''
}

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const toQueryText = (value: unknown) => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : ''
  }

  return typeof value === 'string' ? value : ''
}

const getStatusText = (status?: string): DataScreenStatus | '' =>
  status === 'draft' || status === 'published' ? status : ''

const paginate = <T>(
  list: T[],
  current = 1,
  pageSize = 10
): { list: T[]; total: number } => ({
  list: list.slice((current - 1) * pageSize, current * pageSize),
  total: list.length,
})

export const getDataScreenMockRealtimeData = (
  dataSourceKey: string,
  scenario: DataScreenScenario = 'realtime'
): DataScreenRealtimeData => {
  if (dataSourceKey !== 'realtime') {
    throw new Error('大屏数据源不存在')
  }

  if (scenario === 'failure') {
    throw new Error('大屏实时数据获取失败')
  }

  if (scenario === 'empty') {
    return emptyData
  }

  if (scenario === 'alert') {
    return alertData
  }

  return realtimeData
}

export const createDataScreenMockStore = () => {
  const screens = seedScreens()

  const listScreens = ({
    current = 1,
    pageSize = 10,
    keyword = '',
    status = '',
  }: {
    current?: number
    pageSize?: number
    keyword?: string
    status?: DataScreenStatus | ''
  }): DataScreenListResult => {
    const filtered = screens.filter((item) => {
      const matchedKeyword = keyword ? item.name.includes(keyword) : true
      const matchedStatus = status ? item.status === status : true
      return matchedKeyword && matchedStatus
    })

    return paginate(filtered, current, pageSize)
  }

  const getScreen = (id: string) => {
    const record = screens.find((item) => item.id === id)
    if (!record) {
      throw new Error('大屏定义不存在')
    }

    return record
  }

  const saveScreen = (id: string, { schema }: SaveDataScreenInput) => {
    const index = screens.findIndex((item) => item.id === id)
    if (index < 0) {
      throw new Error('大屏定义不存在')
    }

    const record: DataScreenDefinition = {
      ...screens[index],
      schema: validateDataScreenSchema(schema),
      status: 'draft',
      updatedAt: `${getNow()} saved`,
    }
    screens[index] = record

    return record
  }

  const publishScreen = (id: string, schema: unknown) => {
    const index = screens.findIndex((item) => item.id === id)
    if (index < 0) {
      throw new Error('大屏定义不存在')
    }

    const record: DataScreenDefinition = {
      ...screens[index],
      schema: validateDataScreenSchema(schema),
      status: 'published',
      version: screens[index].version + 1,
      publishedAt: getNow(),
      updatedAt: getNow(),
    }
    screens[index] = record

    return record
  }

  const fetchRealtimeData = (
    dataSourceKey: string,
    scenario: DataScreenScenario = 'realtime'
  ) => getDataScreenMockRealtimeData(dataSourceKey, scenario)

  return {
    fetchRealtimeData,
    getScreen,
    listScreens,
    publishScreen,
    saveScreen,
    screens,
  }
}

const store = createDataScreenMockStore()

const withDataScreenMockError = <T>(handler: () => T) => {
  if (!isAuthed()) {
    return failedResponseWrap(null, '未登录', 50008)
  }

  try {
    return responseWrap(handler())
  } catch (error) {
    return failedResponseWrap(
      null,
      error instanceof Error ? error.message : '大屏 Mock 接口异常'
    )
  }
}

const setupDataScreenMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/data-screens(\\?.*)?$'),
        'get',
        (params: MockParams) =>
          withDataScreenMockError(() => {
            const { query } = qs.parseUrl(params.url)
            return store.listScreens({
              current: toPositiveNumber(query.current, 1),
              pageSize: toPositiveNumber(query.pageSize, 10),
              keyword: toQueryText(query.keyword),
              status: getStatusText(toQueryText(query.status)),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/data-screens/[^/?]+$'),
        'get',
        (params: MockParams) =>
          withDataScreenMockError(() =>
            store.getScreen(getLastPathPart(params.url))
          )
      )

      Mock.mock(
        new RegExp('/api/data-screens/[^/?]+$'),
        'put',
        (params: MockParams) =>
          withDataScreenMockError(() => {
            const body = parseBody<SaveDataScreenInput>(params.body)
            return store.saveScreen(getLastPathPart(params.url), {
              schema: body.schema || {},
            })
          })
      )

      Mock.mock(
        new RegExp('/api/data-screens/[^/?]+/publish$'),
        'post',
        (params: MockParams) =>
          withDataScreenMockError(() => {
            const body = parseBody<SaveDataScreenInput>(params.body)
            return store.publishScreen(
              getActionTargetId(params.url),
              body.schema || {}
            )
          })
      )

      Mock.mock(
        new RegExp('/api/data-screens/realtime$'),
        'post',
        (params: MockParams) =>
          withDataScreenMockError(() => {
            const body = parseBody<{
              dataSourceKey: string
              scenario: DataScreenScenario
            }>(params.body)
            return store.fetchRealtimeData(
              typeof body.dataSourceKey === 'string'
                ? body.dataSourceKey
                : 'realtime',
              body.scenario || 'realtime'
            )
          })
      )
    },
  })
}

export default setupDataScreenMock
