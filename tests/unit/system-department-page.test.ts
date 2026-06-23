/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick, onMounted, ref } from 'vue'
import DepartmentSystemPage from '@/views/system/departmentSystem/index.vue'
import type { ProTableFetchParams } from '@/components/pro-table/types'
import type { PropType } from 'vue'

const apiMocks = vi.hoisted(() => ({
  fetchSystemDepartments: vi.fn(),
  getSystemDepartmentDetail: vi.fn(),
  createSystemDepartment: vi.fn(),
  updateSystemDepartment: vi.fn(),
  deleteSystemDepartment: vi.fn(),
}))

const dictionaryMocks = vi.hoisted(() => ({
  getOptions: vi.fn(),
}))

const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@/api/system/department', () => ({
  SYSTEM_DEPARTMENT_PERMISSIONS: {
    list: 'system:department:list',
    create: 'system:department:create',
    update: 'system:department:update',
    delete: 'system:department:delete',
    detail: 'system:department:detail',
  },
  fetchSystemDepartments: apiMocks.fetchSystemDepartments,
  getSystemDepartmentDetail: apiMocks.getSystemDepartmentDetail,
  createSystemDepartment: apiMocks.createSystemDepartment,
  updateSystemDepartment: apiMocks.updateSystemDepartment,
  deleteSystemDepartment: apiMocks.deleteSystemDepartment,
}))

vi.mock('@/services/dictionary', () => ({
  dictionaryService: {
    getOptions: dictionaryMocks.getOptions,
  },
}))

vi.mock('@/components/pro-ui', () => ({
  adminUi: {
    Message: messageMocks,
  },
}))

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
        departmentName: '运营',
        status: 'enabled',
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

const ModalStub = defineComponent({
  name: 'ModalStub',
  emits: ['before-ok'],
  setup(_, { slots, attrs, emit }) {
    const testId = String(attrs['data-testid'] || 'modal')
    return () =>
      h('section', attrs, [
        slots.default?.(),
        h(
          'button',
          {
            'data-testid': `${testId}-ok`,
            'onClick': () => emit('before-ok'),
          },
          'ok'
        ),
      ])
  },
})

const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
  await nextTick()
}

const mountPage = () =>
  mount(DepartmentSystemPage, {
    global: {
      stubs: {
        's-navs': true,
        'a-modal': ModalStub,
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
      },
    },
  })

describe('DepartmentSystemPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dictionaryMocks.getOptions.mockResolvedValue([
      { label: '启用', value: 'enabled' },
      { label: '停用', value: 'disabled' },
    ])
    apiMocks.fetchSystemDepartments.mockResolvedValue({
      list: [
        {
          id: '1',
          departmentName: '运营部',
          leader: '运营人员',
          sort: 2,
          status: 'enabled',
          createdAt: '2026-06-01 10:00:00',
          updatedAt: '2026-06-01 10:00:00',
        },
      ],
      total: 1,
    })
    apiMocks.getSystemDepartmentDetail.mockResolvedValue({
      id: '1',
      departmentName: '运营部',
      leader: '运营人员',
      sort: 2,
      status: 'enabled',
      createdAt: '2026-06-01 10:00:00',
      updatedAt: '2026-06-01 10:00:00',
    })
    apiMocks.deleteSystemDepartment.mockResolvedValue(undefined)
  })

  it('loads departments through ProTable fetch contract', async () => {
    mountPage()
    await settle()

    expect(apiMocks.fetchSystemDepartments).toHaveBeenCalledWith({
      current: 1,
      pageSize: 10,
    })
    expect(dictionaryMocks.getOptions).toHaveBeenCalledWith('departmentStatus')
  })

  it('submits query values to table reset filters', async () => {
    const wrapper = mountPage()
    await settle()

    await wrapper.find('[data-testid="query-submit"]').trigger('click')
    await settle()

    expect(apiMocks.fetchSystemDepartments).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 10,
      departmentName: '运营',
      status: 'enabled',
    })
  })

  it('opens detail and editor actions through detail api calls', async () => {
    const wrapper = mountPage()
    await settle()

    await wrapper
      .find('[data-permission="system:department:detail"]')
      .trigger('click')
    await settle()
    expect(apiMocks.getSystemDepartmentDetail).toHaveBeenCalledWith('1')

    await wrapper
      .find('[data-permission="system:department:update"]')
      .trigger('click')
    await settle()
    expect(apiMocks.getSystemDepartmentDetail).toHaveBeenCalledTimes(2)
    expect(apiMocks.getSystemDepartmentDetail).toHaveBeenLastCalledWith('1')
  })

  it('renders permission actions and confirms delete before calling api', async () => {
    const wrapper = mountPage()
    await settle()

    expect(
      wrapper.find('[data-permission="system:department:create"]').exists()
    ).toBe(true)

    await wrapper
      .find('[data-permission="system:department:delete"]')
      .trigger('click')
    expect(apiMocks.deleteSystemDepartment).not.toHaveBeenCalled()

    await wrapper
      .find('[data-testid="department-delete-modal-ok"]')
      .trigger('click')
    await settle()

    expect(apiMocks.deleteSystemDepartment).toHaveBeenCalledWith('1')
    expect(messageMocks.success).toHaveBeenCalledWith('删除成功')
  })
})
