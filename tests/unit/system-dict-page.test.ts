/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick, onMounted, ref } from 'vue'
import DictSystemPage from '@/views/system/dictSystem/index.vue'
import type { ProTableFetchParams } from '@/components/pro-table/types'
import type { PropType } from 'vue'

const apiMocks = vi.hoisted(() => ({
  fetchSystemDictionaries: vi.fn(),
  getSystemDictionaryDetail: vi.fn(),
  createSystemDictionary: vi.fn(),
  updateSystemDictionary: vi.fn(),
  deleteSystemDictionary: vi.fn(),
}))

const dictionaryMocks = vi.hoisted(() => ({
  getOptions: vi.fn(),
  getLabel: vi.fn(),
}))

const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@/api/system/dictionary', () => ({
  SYSTEM_DICT_PERMISSIONS: {
    list: 'system:dict:list',
    create: 'system:dict:create',
    update: 'system:dict:update',
    delete: 'system:dict:delete',
    detail: 'system:dict:detail',
  },
  fetchSystemDictionaries: apiMocks.fetchSystemDictionaries,
  getSystemDictionaryDetail: apiMocks.getSystemDictionaryDetail,
  createSystemDictionary: apiMocks.createSystemDictionary,
  updateSystemDictionary: apiMocks.updateSystemDictionary,
  deleteSystemDictionary: apiMocks.deleteSystemDictionary,
}))

vi.mock('@/services/dictionary', () => ({
  dictionaryService: {
    getOptions: dictionaryMocks.getOptions,
    getLabel: dictionaryMocks.getLabel,
  },
}))

vi.mock('@/components/pro-ui', async () => {
  const vue = await import('vue')

  return {
    adminUi: {
      Message: messageMocks,
      Modal: vue.defineComponent({
        name: 'MockAdminUiModal',
        emits: ['before-ok'],
        setup(_, { slots, attrs, emit }) {
          const testId = String(attrs['data-testid'] || 'modal')
          return () =>
            vue.h('section', attrs, [
              slots.default?.(),
              vue.h(
                'button',
                {
                  'data-testid': `${testId}-ok`,
                  'onClick': () => emit('before-ok'),
                },
                'ok'
              ),
            ])
        },
      }),
    },
  }
})

vi.mock('@/components/pro-table/index.vue', () => ({
  default: defineComponent({
    name: 'MockProTable',
    props: {
      columns: {
        type: Array as PropType<
          Array<{
            title?: string
            render?: (context: { record: Record<string, unknown> }) => unknown
          }>
        >,
        default: () => [],
      },
      fetchData: {
        type: Function as PropType<
          (params: ProTableFetchParams) => Promise<{
            list: Record<string, unknown>[]
            total: number
          }>
        >,
        required: true,
      },
      rowKey: {
        type: String,
        required: true,
      },
    },
    setup(props, { expose }) {
      const rows = ref<Record<string, unknown>[]>([])
      const load = async (filters: Record<string, unknown> = {}) => {
        const result = await props.fetchData({
          current: 1,
          pageSize: 10,
          filters,
        })
        rows.value = result.list
      }

      expose({
        reset: load,
        reload: () => load(),
        refresh: () => load(),
        setFilters: load,
      })

      onMounted(() => {
        load()
      })

      return () =>
        h('div', { 'data-testid': 'pro-table' }, [
          h('span', { 'data-testid': 'row-count' }, String(rows.value.length)),
          ...rows.value.flatMap((record) =>
            props.columns.flatMap((column) =>
              column.render ? [column.render({ record })] : []
            )
          ),
        ])
    },
  }),
}))

vi.mock('@/components/pro-form/index.vue', () => ({
  default: defineComponent({
    name: 'MockProForm',
    props: {
      modelValue: {
        type: Object as PropType<Record<string, unknown>>,
        default: () => ({}),
      },
      schema: {
        type: Array,
        default: () => [],
      },
      hideActions: {
        type: Boolean,
        default: false,
      },
      submitter: {
        type: Function as PropType<
          (values: Record<string, unknown>) => void | Promise<void>
        >,
        default: undefined,
      },
    },
    emits: ['submit', 'reset', 'update:modelValue'],
    setup(props, { emit, expose }) {
      const submitValues = {
        dictName: '状态',
        dictType: 'sys_status',
        dictStatus: 'enabled',
      }
      const submit = async () => {
        const values = props.hideActions ? props.modelValue : submitValues
        await props.submitter?.(values)
        emit('submit', values)
        return true
      }
      const reset = () => emit('reset', {})

      expose({
        submit,
        reset,
        validate: async () => true,
        getValues: () => props.modelValue,
        setValues: (values: Record<string, unknown>) =>
          emit('update:modelValue', values),
      })

      return () =>
        h('div', { 'data-testid': 'pro-form' }, [
          props.hideActions
            ? null
            : h(
                'button',
                {
                  'data-testid': 'query-submit',
                  'onClick': submit,
                },
                'search'
              ),
        ])
    },
  }),
}))

vi.mock('@/components/permission-button.vue', () => ({
  default: defineComponent({
    name: 'MockPermissionButton',
    props: {
      permission: {
        type: String,
        default: '',
      },
    },
    setup(props, { slots, attrs }) {
      return () =>
        h(
          'button',
          {
            ...attrs,
            'data-permission': props.permission,
          },
          slots.default?.()
        )
    },
  }),
}))

const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
  await nextTick()
}

const mountPage = () =>
  mount(DictSystemPage, {
    global: {
      stubs: {
        's-navs': true,
        'a-descriptions': defineComponent({
          setup(_, { slots }) {
            return () => h('dl', slots.default?.())
          },
        }),
        'a-descriptions-item': defineComponent({
          setup(_, { slots }) {
            return () => h('dd', slots.default?.())
          },
        }),
        'a-space': defineComponent({
          setup(_, { slots }) {
            return () => h('div', slots.default?.())
          },
        }),
      },
    },
  })

describe('DictSystemPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dictionaryMocks.getOptions.mockResolvedValue([
      { label: '启用', value: 'enabled' },
      { label: '停用', value: 'disabled' },
    ])
    dictionaryMocks.getLabel.mockImplementation((_, value, fallback) =>
      value === 'enabled' ? '启用' : fallback
    )
    apiMocks.fetchSystemDictionaries.mockResolvedValue({
      list: [
        {
          id: '1',
          dictName: '状态',
          dictType: 'sys_status',
          dictStatus: 'enabled',
          description: '系统状态',
          createdAt: '2026-06-01 10:00:00',
          updatedAt: '2026-06-01 10:00:00',
        },
      ],
      total: 1,
    })
    apiMocks.getSystemDictionaryDetail.mockResolvedValue({
      id: '1',
      dictName: '状态',
      dictType: 'sys_status',
      dictStatus: 'enabled',
      description: '系统状态',
      createdAt: '2026-06-01 10:00:00',
      updatedAt: '2026-06-01 10:00:00',
    })
    apiMocks.deleteSystemDictionary.mockResolvedValue(undefined)
  })

  it('loads dictionaries through ProTable fetch contract', async () => {
    mountPage()
    await settle()

    expect(apiMocks.fetchSystemDictionaries).toHaveBeenCalledWith({
      current: 1,
      pageSize: 10,
    })
    expect(dictionaryMocks.getOptions).toHaveBeenCalledWith('dictStatus')
  })

  it('renders table status labels through the shared dictionary label source', async () => {
    const wrapper = mountPage()
    await settle()

    expect(dictionaryMocks.getLabel).toHaveBeenCalledWith(
      'dictStatus',
      'enabled',
      'enabled'
    )
    expect(wrapper.text()).toContain('启用')
  })

  it('submits query values to table reset filters', async () => {
    const wrapper = mountPage()
    await settle()

    await wrapper.find('[data-testid="query-submit"]').trigger('click')
    await settle()

    expect(apiMocks.fetchSystemDictionaries).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 10,
      dictName: '状态',
      dictType: 'sys_status',
      dictStatus: 'enabled',
    })
  })

  it('renders permission actions and confirms delete before calling api', async () => {
    const wrapper = mountPage()
    await settle()

    expect(
      wrapper.find('[data-permission="system:dict:create"]').exists()
    ).toBe(true)

    await wrapper
      .find('[data-permission="system:dict:delete"]')
      .trigger('click')
    expect(apiMocks.deleteSystemDictionary).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="dict-delete-modal-ok"]').trigger('click')
    await settle()

    expect(apiMocks.deleteSystemDictionary).toHaveBeenCalledWith('1')
    expect(messageMocks.success).toHaveBeenCalledWith('删除成功')
  })
})
