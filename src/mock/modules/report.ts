import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  CreateReportExportTaskPayload,
  ReportDataQuery,
  ReportDataResult,
  ReportExportStatus,
  ReportExportTask,
  ReportExportTaskResult,
  ReportPageResult,
  ReportRecord,
  ReportType,
} from '@/api/report'
import type { MockParams } from '../types'

const getNow = () => '2026-06-23 00:00:00'

const reportsSeed = (): ReportRecord[] => [
  {
    id: 'sales-trend',
    name: '销售趋势报表',
    type: 'trend',
    permissionCode: 'report:sales-trend:view',
    fields: [
      {
        key: 'time',
        label: '日期',
        permissionCode: 'report:sales-trend:time',
      },
      {
        key: 'amount',
        label: '销售额',
        permissionCode: 'report:sales-trend:amount',
      },
    ],
    description: '按日期查看销售额趋势。',
    createdAt: getNow(),
    updatedAt: getNow(),
  },
  {
    id: 'channel-distribution',
    name: '渠道分布报表',
    type: 'distribution',
    permissionCode: 'report:channel-distribution:view',
    fields: [
      {
        key: 'channel',
        label: '渠道',
        permissionCode: 'report:channel-distribution:channel',
      },
      {
        key: 'value',
        label: '占比',
        permissionCode: 'report:channel-distribution:value',
      },
    ],
    description: '按渠道查看线索和成交占比。',
    createdAt: getNow(),
    updatedAt: getNow(),
  },
  {
    id: 'order-detail',
    name: '订单明细报表',
    type: 'detail',
    permissionCode: 'report:order-detail:view',
    fields: [
      {
        key: 'customer',
        label: '客户',
        permissionCode: 'report:order-detail:customer',
      },
      {
        key: 'amount',
        label: '金额',
        permissionCode: 'report:order-detail:amount',
      },
      {
        key: 'owner',
        label: '负责人',
        permissionCode: 'report:order-detail:owner',
      },
      {
        key: 'status',
        label: '状态',
        permissionCode: 'report:order-detail:status',
      },
    ],
    description: '查看订单明细、负责人和成交状态。',
    createdAt: getNow(),
    updatedAt: getNow(),
  },
]

const trendData = [
  { time: '2026-06-01', value: 120 },
  { time: '2026-06-08', value: 168 },
  { time: '2026-06-15', value: 226 },
  { time: '2026-06-22', value: 298 },
]

const distributionData = [
  { name: '官网', value: 45 },
  { name: '渠道伙伴', value: 28 },
  { name: '线下活动', value: 18 },
  { name: '老客推荐', value: 9 },
]

const detailRows = [
  {
    customer: 'Aheart 科技',
    amount: 120000,
    owner: '张三',
    status: '已成交',
  },
  {
    customer: 'Ideal 数据',
    amount: 86000,
    owner: '李四',
    status: '跟进中',
  },
  {
    customer: 'Mock 实验室',
    amount: 68000,
    owner: '王五',
    status: '已成交',
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

const getReportIdFromDataUrl = (url: string) => {
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

const getReportType = (type?: string): ReportType | '' =>
  type === 'trend' || type === 'distribution' || type === 'detail' ? type : ''

const getExportStatus = (status?: string): ReportExportStatus =>
  status === 'created' ||
  status === 'in-progress' ||
  status === 'completed' ||
  status === 'failed'
    ? status
    : 'in-progress'

const paginate = <T>(
  list: T[],
  current = 1,
  pageSize = 10
): { list: T[]; total: number } => ({
  list: list.slice((current - 1) * pageSize, current * pageSize),
  total: list.length,
})

const createTaskId = (index: number) => `report-export-${index + 1}`

export const createReportMockStore = () => {
  const reports = reportsSeed()
  let exportTasks: ReportExportTask[] = [
    {
      id: createTaskId(0),
      reportId: 'order-detail',
      reportName: '订单明细报表',
      status: 'created',
      params: {},
      createdAt: getNow(),
    },
    {
      id: createTaskId(1),
      reportId: 'order-detail',
      reportName: '订单明细报表',
      status: 'in-progress',
      params: {},
      createdAt: getNow(),
    },
    {
      id: createTaskId(2),
      reportId: 'order-detail',
      reportName: '订单明细报表',
      status: 'completed',
      params: {},
      createdAt: getNow(),
      finishedAt: getNow(),
      downloadUrl: '/mock/report/order-detail.xlsx',
    },
    {
      id: createTaskId(3),
      reportId: 'order-detail',
      reportName: '订单明细报表',
      status: 'failed',
      params: {},
      createdAt: getNow(),
      finishedAt: getNow(),
      errorMessage: '导出任务失败',
    },
  ]

  const listReports = ({
    current = 1,
    pageSize = 10,
    keyword = '',
    type = '',
  }: {
    current?: number
    pageSize?: number
    keyword?: string
    type?: ReportType | ''
  }): ReportPageResult => {
    const filtered = reports.filter((item) => {
      const matchedKeyword = keyword ? item.name.includes(keyword) : true
      const matchedType = type ? item.type === type : true
      return matchedKeyword && matchedType
    })

    return paginate(filtered, current, pageSize)
  }

  const getReport = (id: string) => {
    const report = reports.find((item) => item.id === id)
    if (!report) {
      throw new Error('报表不存在')
    }
    return report
  }

  const queryReport = (
    id: string,
    params: ReportDataQuery
  ): ReportDataResult => {
    const report = getReport(id)
    const keyword = params.keyword || ''
    const rows = detailRows.filter((row) =>
      keyword
        ? row.customer.includes(keyword) || row.owner.includes(keyword)
        : true
    )

    return {
      type: report.type,
      columns: report.fields,
      rows: report.type === 'detail' ? rows : [],
      trend:
        report.type === 'trend' || report.type === 'detail' ? trendData : [],
      distribution:
        report.type === 'distribution' || report.type === 'detail'
          ? distributionData
          : [],
      total: report.type === 'detail' ? rows.length : trendData.length,
    }
  }

  const createExportTask = ({
    reportId,
    params,
    scenario,
  }: CreateReportExportTaskPayload) => {
    const report = getReport(reportId)
    const status = getExportStatus(scenario)
    const task: ReportExportTask = {
      id: createTaskId(exportTasks.length),
      reportId,
      reportName: report.name,
      status,
      params: params || {},
      createdAt: getNow(),
      finishedAt:
        status === 'completed' || status === 'failed' ? getNow() : undefined,
      downloadUrl:
        status === 'completed' ? `/mock/report/${reportId}.xlsx` : undefined,
      errorMessage: status === 'failed' ? '导出任务失败' : undefined,
    }
    exportTasks = [task, ...exportTasks]
    return task
  }

  const listExportTasks = ({
    reportId = '',
  }: {
    reportId?: string
  }): ReportExportTaskResult => {
    const filtered = exportTasks.filter((task) =>
      reportId ? task.reportId === reportId : true
    )
    return {
      list: filtered,
      total: filtered.length,
    }
  }

  return {
    createExportTask,
    getReport,
    listExportTasks,
    listReports,
    queryReport,
    reports,
  }
}

const store = createReportMockStore()

const withReportMockError = <T>(handler: () => T) => {
  if (!isAuthed()) {
    return failedResponseWrap(null, '未登录', 50008)
  }

  try {
    return responseWrap(handler())
  } catch (error) {
    return failedResponseWrap(
      null,
      error instanceof Error ? error.message : '报表 Mock 接口异常'
    )
  }
}

const setupReportMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/reports(\\?.*)?$'),
        'get',
        (params: MockParams) =>
          withReportMockError(() => {
            const { query } = qs.parseUrl(params.url)
            return store.listReports({
              current: toPositiveNumber(query.current, 1),
              pageSize: toPositiveNumber(query.pageSize, 10),
              keyword: toQueryText(query.keyword),
              type: getReportType(toQueryText(query.type)),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/reports/[^/?]+$'),
        'get',
        (params: MockParams) =>
          withReportMockError(() =>
            store.getReport(getLastPathPart(params.url))
          )
      )

      Mock.mock(
        new RegExp('/api/reports/[^/?]+/data$'),
        'post',
        (params: MockParams) =>
          withReportMockError(() => {
            const body = parseBody<ReportDataQuery>(params.body)
            return store.queryReport(getReportIdFromDataUrl(params.url), {
              keyword: typeof body.keyword === 'string' ? body.keyword : '',
              dateRange: Array.isArray(body.dateRange) ? body.dateRange : [],
            })
          })
      )

      Mock.mock(
        new RegExp('/api/report-export-tasks(\\?.*)?$'),
        'get',
        (params: MockParams) =>
          withReportMockError(() => {
            const { query } = qs.parseUrl(params.url)
            return store.listExportTasks({
              reportId: toQueryText(query.reportId),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/report-export-tasks$'),
        'post',
        (params: MockParams) =>
          withReportMockError(() => {
            const body = parseBody<CreateReportExportTaskPayload>(params.body)
            return store.createExportTask({
              reportId:
                typeof body.reportId === 'string'
                  ? body.reportId
                  : 'order-detail',
              params: body.params || {},
              scenario: body.scenario,
            })
          })
      )
    },
  })
}

export default setupReportMock
