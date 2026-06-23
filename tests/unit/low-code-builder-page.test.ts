/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import LowCodeBuilder from '@/components/low-code/builder/index.vue'
import { createQueryTablePageSchema } from '@/components/low-code/schema'
import type {
  LowCodeDataSourcePreviewResult,
  LowCodePageRecord,
} from '@/api/low-code'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  createLowCodePage: vi.fn(),
  fetchLowCodePages: vi.fn(),
  previewLowCodeDataSource: vi.fn(),
  publishLowCodePage: vi.fn(),
  rollbackLowCodePage: vi.fn(),
  saveLowCodePage: vi.fn(),
}))

vi.mock('@/api/low-code', () => ({
  createLowCodePage: apiMocks.createLowCodePage,
  fetchLowCodePages: apiMocks.fetchLowCodePages,
  previewLowCodeDataSource: apiMocks.previewLowCodeDataSource,
  publishLowCodePage: apiMocks.publishLowCodePage,
  rollbackLowCodePage: apiMocks.rollbackLowCodePage,
  saveLowCodePage: apiMocks.saveLowCodePage,
}))

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  setup(_, { slots, attrs }) {
    return () => h('button', attrs, slots.default?.())
  },
})

const ProTableStub = defineComponent({
  name: 'ProTable',
  setup() {
    return () => h('div', { 'data-testid': 'low-code-pro-table' }, 'ProTable')
  },
})

const ProFormStub = defineComponent({
  name: 'ProForm',
  setup() {
    return () => h('form', { 'data-testid': 'low-code-pro-form' }, 'ProForm')
  },
})

const mountBuilder = () =>
  mount(LowCodeBuilder, {
    global: {
      stubs: {
        'ProForm': ProFormStub,
        'ProTable': ProTableStub,
        'a-button': ButtonStub,
        'a-divider': true,
        'a-input': defineComponent({
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
                  emit(
                    'update:modelValue',
                    (event.target as HTMLInputElement).value
                  ),
              })
          },
        }),
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

const createPageRecord = (): LowCodePageRecord => ({
  id: 'low-code-customer-query',
  name: '客户查询页面',
  schema: createQueryTablePageSchema(),
  status: 'draft',
  version: 1,
  createdAt: '2026-06-23 00:00:00',
  updatedAt: '2026-06-23 00:00:00',
})

const previewResult: LowCodeDataSourcePreviewResult = {
  columns: ['name', 'status', 'owner'],
  list: [
    {
      id: 'customer-1',
      name: '上海客户',
      status: 'active',
      owner: 'Alice',
    },
  ],
  total: 1,
}

describe('LowCodeBuilder page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchLowCodePages.mockResolvedValue({
      list: [createPageRecord()],
      total: 1,
    })
    apiMocks.previewLowCodeDataSource.mockResolvedValue(previewResult)
    apiMocks.saveLowCodePage.mockResolvedValue({
      id: 'low-code-customer-query',
      status: 'draft',
      version: 2,
    })
    apiMocks.publishLowCodePage.mockResolvedValue({
      id: 'low-code-customer-query',
      status: 'published',
      version: 2,
    })
    apiMocks.rollbackLowCodePage.mockResolvedValue({
      id: 'low-code-customer-query',
      status: 'rolled-back',
      version: 1,
    })
  })

  it('loads a Mock-backed query table page and renders permission-aware actions', async () => {
    const wrapper = mountBuilder()
    await flushPromises()
    await flushPromises()

    expect(apiMocks.fetchLowCodePages).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
    })
    expect(apiMocks.previewLowCodeDataSource).toHaveBeenCalledWith({
      pageId: 'low-code-customer-query',
      dataSourceKey: 'customers',
      params: {},
    })
    expect(wrapper.find('[data-testid="low-code-builder"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('客户查询页面')
    expect(wrapper.text()).toContain('low-code:customer-query:view')
    expect(wrapper.find('[data-testid="low-code-pro-table"]').exists()).toBe(
      true
    )
    expect(wrapper.text()).toContain('上海客户')
    expect(wrapper.find('[data-testid="low-code-action-query"]').exists()).toBe(
      true
    )
    expect(
      wrapper.find('[data-testid="low-code-action-refreshBlock"]').exists()
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="low-code-material-ProForm"]').exists()
    ).toBe(true)
  })

  it('adds material and persists save, publish and rollback actions', async () => {
    const wrapper = mountBuilder()
    await flushPromises()
    await flushPromises()

    await wrapper
      .find('[data-testid="low-code-material-StatCard"]')
      .trigger('click')
    await wrapper.find('[data-testid="low-code-save"]').trigger('click')
    await wrapper.find('[data-testid="low-code-publish"]').trigger('click')
    await wrapper.find('[data-testid="low-code-rollback"]').trigger('click')

    expect(apiMocks.saveLowCodePage).toHaveBeenCalledWith(
      'low-code-customer-query',
      expect.objectContaining({
        materials: expect.arrayContaining([
          expect.objectContaining({
            type: 'StatCard',
            permissionCode: 'low-code:customer-query:block',
          }),
        ]),
      })
    )
    expect(apiMocks.publishLowCodePage).toHaveBeenCalledWith(
      'low-code-customer-query',
      expect.objectContaining({
        permissionCode: 'low-code:customer-query:view',
      })
    )
    expect(apiMocks.rollbackLowCodePage).toHaveBeenCalledWith(
      'low-code-customer-query',
      1
    )
  })

  it('keeps invalid loaded schemas recoverable in the page error state', async () => {
    apiMocks.fetchLowCodePages.mockResolvedValueOnce({
      list: [
        {
          ...createPageRecord(),
          schema: {
            title: '非法页面',
            dataSources: [],
            materials: [
              {
                id: 'bad',
                type: 'BadMaterial',
                name: '坏物料',
                props: {},
              },
            ],
          },
        },
      ],
      total: 1,
    })

    const wrapper = mountBuilder()
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('[data-testid="low-code-builder"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('非法低代码页面 schema')
  })

  it('keeps publish failures recoverable in the page error state', async () => {
    apiMocks.publishLowCodePage.mockRejectedValueOnce(new Error('发布失败'))
    const wrapper = mountBuilder()
    await flushPromises()
    await flushPromises()

    await wrapper.find('[data-testid="low-code-publish"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('发布失败')
  })
})
