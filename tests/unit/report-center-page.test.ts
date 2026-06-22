/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import ReportCenter from '@/components/report-center/index.vue'
import type {
  ReportDataResult,
  ReportExportTask,
  ReportRecord,
} from '@/api/report'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  createReportExportTask: vi.fn(),
  fetchReportData: vi.fn(),
  fetchReportExportTasks: vi.fn(),
  fetchReports: vi.fn(),
  getReportDetail: vi.fn(),
}))

vi.mock('@/api/report', () => ({
  createReportExportTask: apiMocks.createReportExportTask,
  fetchReportData: apiMocks.fetchReportData,
  fetchReportExportTasks: apiMocks.fetchReportExportTasks,
  fetchReports: apiMocks.fetchReports,
  getReportDetail: apiMocks.getReportDetail,
}))

const SChartStub = defineComponent({
  name: 'SChart',
  props: {
    option: {
      type: Object,
      default: () => ({}),
    },
  },
  setup(props) {
    return () =>
      h('div', { 'data-testid': 'report-chart' }, JSON.stringify(props.option))
  },
})

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  setup(_, { slots, attrs }) {
    return () => h('button', attrs, slots.default?.())
  },
})

const InputStub = defineComponent({
  name: 'InputStub',
  props: {
    modelValue: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, attrs }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
  },
})

const mountReportCenter = () =>
  mount(ReportCenter, {
    global: {
      stubs: {
        'SChart': SChartStub,
        'a-button': ButtonStub,
        'a-divider': true,
        'a-input': InputStub,
        'a-layout': {
          template: '<div><slot /></div>',
        },
        'a-layout-content': {
          template: '<main><slot /></main>',
        },
        'a-layout-sider': {
          template: '<aside><slot /></aside>',
        },
        'a-scrollbar': {
          template: '<div><slot /></div>',
        },
        'a-space': {
          template: '<div><slot /></div>',
        },
      },
    },
  })

const reports: ReportRecord[] = [
  {
    id: 'sales-trend',
    name: '销售趋势报表',
    type: 'trend',
    permissionCode: 'report:sales-trend:view',
    fields: [
      {
        key: 'amount',
        label: '销售额',
        permissionCode: 'report:sales-trend:amount',
      },
    ],
    createdAt: '2026-06-23 00:00:00',
    updatedAt: '2026-06-23 00:00:00',
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
    ],
    createdAt: '2026-06-23 00:00:00',
    updatedAt: '2026-06-23 00:00:00',
  },
]

const detailData: ReportDataResult = {
  type: 'detail',
  columns: reports[1].fields,
  rows: [
    {
      customer: 'Aheart 科技',
      amount: 120000,
    },
  ],
  trend: [
    {
      time: '2026-06-01',
      value: 120,
    },
  ],
  distribution: [
    {
      name: '官网',
      value: 45,
    },
  ],
  total: 1,
}

const exportTasks: ReportExportTask[] = [
  {
    id: 'export-created',
    reportId: 'order-detail',
    reportName: '订单明细报表',
    status: 'created',
    params: {},
    createdAt: '2026-06-23 00:00:00',
  },
  {
    id: 'export-completed',
    reportId: 'order-detail',
    reportName: '订单明细报表',
    status: 'completed',
    params: {},
    createdAt: '2026-06-23 00:00:00',
    downloadUrl: '/mock/report.xlsx',
  },
]

describe('ReportCenter page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchReports.mockResolvedValue({
      list: reports,
      total: reports.length,
    })
    apiMocks.getReportDetail.mockResolvedValue(reports[1])
    apiMocks.fetchReportData.mockResolvedValue(detailData)
    apiMocks.fetchReportExportTasks.mockResolvedValue({
      list: exportTasks,
      total: exportTasks.length,
    })
    apiMocks.createReportExportTask.mockResolvedValue({
      id: 'export-running',
      reportId: 'order-detail',
      reportName: '订单明细报表',
      status: 'in-progress',
      params: { keyword: 'Aheart' },
      createdAt: '2026-06-23 00:00:00',
    })
  })

  it('loads reports, query conditions, charts, detail table and permissions', async () => {
    const wrapper = mountReportCenter()
    await flushPromises()
    await flushPromises()

    expect(apiMocks.fetchReports).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
    })
    expect(apiMocks.fetchReportData).toHaveBeenCalledWith('sales-trend', {
      keyword: '',
      dateRange: [],
    })
    expect(wrapper.find('[data-testid="report-center"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('销售趋势报表')
    expect(wrapper.text()).toContain('report:sales-trend:view')
    expect(
      wrapper.findAll('[data-testid="report-chart"]').length
    ).toBeGreaterThan(0)

    await wrapper
      .find('[data-testid="report-select-order-detail"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.getReportDetail).toHaveBeenCalledWith('order-detail')
    expect(wrapper.text()).toContain('report:order-detail:customer')
    expect(wrapper.text()).toContain('Aheart 科技')
  })

  it('queries reports and creates Mock export tasks', async () => {
    const wrapper = mountReportCenter()
    await flushPromises()
    await flushPromises()

    await wrapper.find('[data-testid="report-keyword"]').setValue('Aheart')
    await wrapper.find('[data-testid="report-query"]').trigger('click')
    await wrapper.find('[data-testid="report-export"]').trigger('click')
    await flushPromises()

    expect(apiMocks.fetchReportData).toHaveBeenLastCalledWith('sales-trend', {
      keyword: 'Aheart',
      dateRange: [],
    })
    expect(apiMocks.createReportExportTask).toHaveBeenCalledWith({
      reportId: 'sales-trend',
      params: {
        keyword: 'Aheart',
        dateRange: [],
      },
      scenario: 'in-progress',
    })
    expect(wrapper.text()).toContain('in-progress')
    expect(wrapper.text()).toContain('completed')
  })
})
