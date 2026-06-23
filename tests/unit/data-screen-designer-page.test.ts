/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import DataScreenDesigner from '@/components/data-screen/designer/index.vue'
import { createEnterpriseDataScreenSchema } from '@/components/data-screen/schema'
import type {
  DataScreenDefinition,
  DataScreenRealtimeData,
} from '@/api/data-screen'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  fetchDataScreenRealtimeData: vi.fn(),
  fetchDataScreens: vi.fn(),
  publishDataScreen: vi.fn(),
  saveDataScreen: vi.fn(),
}))

vi.mock('@/api/data-screen', () => ({
  fetchDataScreenRealtimeData: apiMocks.fetchDataScreenRealtimeData,
  fetchDataScreens: apiMocks.fetchDataScreens,
  publishDataScreen: apiMocks.publishDataScreen,
  saveDataScreen: apiMocks.saveDataScreen,
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
      h(
        'div',
        { 'data-testid': 'data-screen-chart' },
        JSON.stringify(props.option)
      )
  },
})

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  setup(_, { slots, attrs }) {
    return () => h('button', attrs, slots.default?.())
  },
})

const mountDesigner = () =>
  mount(DataScreenDesigner, {
    global: {
      stubs: {
        'SChart': SChartStub,
        'a-button': ButtonStub,
        'a-divider': true,
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

const createDefinition = (): DataScreenDefinition => ({
  id: 'enterprise-ops-screen',
  name: '企业运营大屏',
  schema: createEnterpriseDataScreenSchema(),
  status: 'draft',
  version: 1,
  createdAt: '2026-06-23 00:00:00',
  updatedAt: '2026-06-23 00:00:00',
})

const realtimeData: DataScreenRealtimeData = {
  metrics: [
    {
      key: 'gmv',
      label: '今日成交额',
      value: 986000,
      unit: '元',
      trend: 12.5,
    },
  ],
  trend: [
    {
      time: '09:00',
      value: 120,
    },
  ],
  distribution: [
    {
      name: '华东',
      value: 45,
    },
  ],
  ranking: [
    {
      name: '上海分部',
      value: 320,
    },
  ],
  table: [
    {
      id: 'order-1',
      name: '企业客户 A',
      amount: 120000,
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

describe('DataScreenDesigner page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchDataScreens.mockResolvedValue({
      list: [createDefinition()],
      total: 1,
    })
    apiMocks.fetchDataScreenRealtimeData.mockResolvedValue(realtimeData)
    apiMocks.saveDataScreen.mockResolvedValue({
      id: 'enterprise-ops-screen',
      status: 'draft',
      version: 2,
    })
    apiMocks.publishDataScreen.mockResolvedValue({
      id: 'enterprise-ops-screen',
      status: 'published',
      version: 2,
    })
  })

  it('loads the 1920x1080 screen and renders realtime widgets', async () => {
    const wrapper = mountDesigner()
    await flushPromises()
    await flushPromises()

    expect(apiMocks.fetchDataScreens).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
    })
    expect(apiMocks.fetchDataScreenRealtimeData).toHaveBeenCalledWith({
      screenId: 'enterprise-ops-screen',
      dataSourceKey: 'realtime',
      scenario: 'realtime',
    })
    expect(
      wrapper.find('[data-testid="data-screen-canvas"]').attributes()
    ).toMatchObject({
      'data-width': '1920',
      'data-height': '1080',
    })
    expect(wrapper.text()).toContain('企业运营大屏')
    expect(wrapper.text()).toContain('今日成交额')
    expect(wrapper.text()).toContain('华东')
    expect(wrapper.text()).toContain('华南库存低于阈值')
    expect(wrapper.findAll('[data-testid="data-screen-chart"]')).toHaveLength(3)
  })

  it('switches scenarios, fullscreen preview and persists schema actions', async () => {
    const wrapper = mountDesigner()
    await flushPromises()
    await flushPromises()

    await wrapper
      .find('[data-testid="data-screen-scenario-alert"]')
      .trigger('click')
    await wrapper
      .find('[data-testid="data-screen-fullscreen"]')
      .trigger('click')
    await wrapper.find('[data-testid="data-screen-save"]').trigger('click')
    await wrapper.find('[data-testid="data-screen-publish"]').trigger('click')

    expect(apiMocks.fetchDataScreenRealtimeData).toHaveBeenLastCalledWith({
      screenId: 'enterprise-ops-screen',
      dataSourceKey: 'realtime',
      scenario: 'alert',
    })
    expect(
      wrapper.find('[data-testid="data-screen-designer"]').classes()
    ).toContain('is-fullscreen')
    expect(apiMocks.saveDataScreen).toHaveBeenCalledWith(
      'enterprise-ops-screen',
      expect.objectContaining({
        width: 1920,
        height: 1080,
      })
    )
    expect(apiMocks.publishDataScreen).toHaveBeenCalledWith(
      'enterprise-ops-screen',
      expect.objectContaining({
        theme: expect.objectContaining({
          mode: 'dark',
        }),
      })
    )
  })

  it('keeps invalid loaded screen schemas recoverable in the page error state', async () => {
    apiMocks.fetchDataScreens.mockResolvedValueOnce({
      list: [
        {
          ...createDefinition(),
          schema: {
            ...createEnterpriseDataScreenSchema(),
            width: 1280,
          },
        },
      ],
      total: 1,
    })

    const wrapper = mountDesigner()
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('[data-testid="data-screen-designer"]').exists()).toBe(
      true
    )
    expect(wrapper.text()).toContain('非法大屏 schema')
  })

  it('keeps publish failures recoverable in the page error state', async () => {
    apiMocks.publishDataScreen.mockRejectedValueOnce(new Error('发布失败'))
    const wrapper = mountDesigner()
    await flushPromises()
    await flushPromises()

    await wrapper.find('[data-testid="data-screen-publish"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('发布失败')
  })
})
