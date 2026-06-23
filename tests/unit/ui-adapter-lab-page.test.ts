/* eslint-disable vue/one-component-per-file, vue/require-prop-types */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UiAdapterLabPage from '@/views/examples/ui-adapter-lab/index.vue'
import type {
  UiAdapterLabItem,
  UiAdapterLabPageResult,
} from '@/api/ui-adapter-lab'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  createUiAdapterLabItem: vi.fn(),
  fetchUiAdapterLabItems: vi.fn(),
  simulateUiAdapterLabError: vi.fn(),
  updateUiAdapterLabItem: vi.fn(),
}))

vi.mock('@/api/ui-adapter-lab', () => ({
  createUiAdapterLabItem: apiMocks.createUiAdapterLabItem,
  fetchUiAdapterLabItems: apiMocks.fetchUiAdapterLabItems,
  simulateUiAdapterLabError: apiMocks.simulateUiAdapterLabError,
  updateUiAdapterLabItem: apiMocks.updateUiAdapterLabItem,
}))

vi.mock('@/components/permission-button.vue', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'PermissionButton',
      emits: ['click'],
      setup(_, { attrs, emit, slots }) {
        return () =>
          h(
            'button',
            {
              ...attrs,
              onClick: () => emit('click'),
            },
            slots.default?.()
          )
      },
    }),
  }
})

vi.mock('@/components/pro-ui', async () => {
  const { defineComponent, h } = await import('vue')

  const Button = defineComponent({
    name: 'MockButton',
    setup(_, { attrs, slots }) {
      return () => h('button', attrs, slots.default?.())
    },
  })
  const Form = defineComponent({
    name: 'MockForm',
    setup(_, { slots }) {
      return () => h('form', slots.default?.())
    },
  })
  const FormItem = defineComponent({
    name: 'MockFormItem',
    setup(_, { slots }) {
      return () => h('label', slots.default?.())
    },
  })
  const Input = defineComponent({
    name: 'MockInput',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          ...attrs,
          value: props.modelValue,
          onInput: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLInputElement).value),
        })
    },
  })
  const Select = Input
  const Modal = defineComponent({
    name: 'MockModal',
    props: { visible: Boolean },
    setup(props, { attrs, slots }) {
      return () =>
        props.visible
          ? h('section', attrs, slots.default?.())
          : h('section', { style: 'display: none' })
    },
  })
  const Drawer = Modal
  const Table = defineComponent({
    name: 'MockTable',
    props: ['data'],
    setup(props) {
      return () =>
        h(
          'div',
          (props.data || []).map((item: UiAdapterLabItem) =>
            h('span', { key: item.id }, item.name)
          )
        )
    },
  })

  return {
    adminUi: {
      name: 'arco',
      Button,
      Table,
      Form,
      FormItem,
      Input,
      Select,
      RadioGroup: Form,
      Radio: Input,
      Modal,
      Drawer,
      Message: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
      },
    },
    aheartCandidateStatus: {
      name: 'aheart',
      status: 'blocked',
      evidence: {
        maturityMatrix: 'docs/architecture/aheart-ui-maturity-matrix.md',
      },
    },
  }
})

const item: UiAdapterLabItem = {
  id: 'lab-table',
  name: 'Aheart Table',
  component: 'Table',
  adapter: 'aheart',
  status: 'blocked',
  owner: 'UI Platform',
  updatedAt: '2026-06-23 11:00:00',
  description: '表格候选适配验证',
}

const pageResult: UiAdapterLabPageResult = {
  list: [item],
  total: 1,
}

describe('UiAdapterLabPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchUiAdapterLabItems.mockResolvedValue(pageResult)
    apiMocks.createUiAdapterLabItem.mockResolvedValue({
      success: true,
      record: item,
    })
    apiMocks.updateUiAdapterLabItem.mockResolvedValue({
      success: true,
      record: item,
    })
    apiMocks.simulateUiAdapterLabError.mockResolvedValue({
      success: false,
      reason: 'Mock adapter service unavailable',
      traceId: 'mock-ui-adapter-lab-500',
    })
  })

  it('loads adapter lab data and shows current adapter governance', async () => {
    const wrapper = mount(UiAdapterLabPage, {
      global: {
        stubs: {
          's-navs': true,
        },
      },
    })
    await flushPromises()
    await flushPromises()

    expect(apiMocks.fetchUiAdapterLabItems).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      keyword: '',
      status: '',
    })
    expect(wrapper.find('[data-testid="ui-adapter-lab"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('arco')
    expect(wrapper.text()).toContain('blocked')
    expect(wrapper.text()).toContain('Aheart Table')
    ;[
      '组件覆盖矩阵',
      'Button',
      'Table',
      'Form',
      'Upload',
      'Tabs',
      'Modal',
      'Drawer',
      'A11y',
      '国际化',
      'Mock 场景覆盖',
      '权限态',
      '错误态',
      '空态',
    ].forEach((text) => {
      expect(wrapper.text()).toContain(text)
    })
  })

  it('covers empty, error and create interactions through mock APIs', async () => {
    const wrapper = mount(UiAdapterLabPage, {
      global: {
        stubs: {
          's-navs': true,
        },
      },
    })
    await flushPromises()

    await wrapper.find('[data-testid="ui-adapter-lab-empty"]').trigger('click')
    await flushPromises()

    expect(apiMocks.fetchUiAdapterLabItems).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      keyword: 'no-such-component',
      status: '',
    })

    await wrapper.find('[data-testid="ui-adapter-lab-error"]').trigger('click')
    await flushPromises()

    expect(apiMocks.simulateUiAdapterLabError).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Mock adapter service unavailable')

    await wrapper.find('[data-testid="ui-adapter-lab-create"]').trigger('click')
    await wrapper
      .find('[data-testid="ui-adapter-lab-submit-editor"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.createUiAdapterLabItem).toHaveBeenCalledWith({
      name: 'Aheart Button',
      component: 'Button',
      status: 'blocked',
      description: 'Mock-backed adapter validation item',
    })
  })
})
