/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FormDesigner from '@/components/form-designer/index.vue'

const apiMocks = vi.hoisted(() => ({
  createFormSchema: vi.fn(),
  getFormSchemaDetail: vi.fn(),
  publishFormSchema: vi.fn(),
  saveFormSchema: vi.fn(),
  submitFormRuntime: vi.fn(),
}))

vi.mock('@/api/form-schema', () => ({
  createFormSchema: apiMocks.createFormSchema,
  getFormSchemaDetail: apiMocks.getFormSchemaDetail,
  publishFormSchema: apiMocks.publishFormSchema,
  saveFormSchema: apiMocks.saveFormSchema,
  submitFormRuntime: apiMocks.submitFormRuntime,
}))

vi.mock('@vueuse/core', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')

  return {
    useClipboard: () => ({
      copy: vi.fn(),
      copied: vue.ref(false),
    }),
  }
})

vi.mock('@/components/form-runtime', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  const FormRendererStub = vue.defineComponent({
    name: 'FormRenderer',
    props: {
      ast: {
        type: Object,
        required: true,
      },
    },
    setup(props, { expose }) {
      expose({
        getValues: () => ({
          customerName: 'Alice',
        }),
        validate: () => Promise.resolve(true),
      })

      return () =>
        vue.h('div', {
          'data-testid': 'designer-preview-renderer',
          'data-widget-count': String(
            (props.ast as { widgetsConfig?: unknown[] }).widgetsConfig
              ?.length || 0
          ),
        })
    },
  })

  return {
    FormRenderer: FormRendererStub,
    default: FormRendererStub,
  }
})

const SlotStub = defineComponent({
  name: 'SlotStub',
  setup(_, { slots }) {
    return () => h('div', {}, slots.default?.())
  },
})

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})

const ModalStub = defineComponent({
  name: 'ModalStub',
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { slots }) {
    return () =>
      props.visible
        ? h('section', { 'data-testid': 'designer-modal' }, [
            slots.title?.(),
            slots.default?.(),
            slots.footer?.(),
          ])
        : null
  },
})

const mountDesigner = () =>
  mount(FormDesigner, {
    global: {
      stubs: {
        'Draggable': SlotStub,
        'a-button': ButtonStub,
        'a-divider': true,
        'a-layout': SlotStub,
        'a-layout-content': SlotStub,
        'a-layout-sider': SlotStub,
        'a-modal': ModalStub,
        'a-scrollbar': SlotStub,
        'a-space': SlotStub,
        'a-textarea': true,
        'config-panel-form': true,
        'config-panel-widget': true,
        'data-src-editor': true,
        'widget-form': true,
      },
    },
  })

describe('FormDesigner preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.getFormSchemaDetail.mockResolvedValue({
      id: 'form-customer-registration',
      schema: {
        version: 1,
        formConfig: {
          size: 'medium',
          layout: 'vertical',
          labelAlign: 'right',
        },
        dataSources: [],
        widgetsConfig: [],
      },
    })
    apiMocks.submitFormRuntime.mockResolvedValue({
      id: 'submit-1',
      status: 'submitted',
    })
  })

  it('renders preview with the shared runtime renderer and submits to mock runtime api', async () => {
    const wrapper = mountDesigner()
    await Promise.resolve()
    await nextTick()

    expect(
      wrapper.find('[data-testid="designer-preview-renderer"]').exists()
    ).toBe(false)

    await wrapper.find('[data-testid="form-designer-preview"]').trigger('click')
    await nextTick()

    expect(
      wrapper.find('[data-testid="designer-preview-renderer"]').exists()
    ).toBe(true)

    await wrapper
      .find('[data-testid="form-designer-preview-submit"]')
      .trigger('click')
    await Promise.resolve()

    expect(apiMocks.submitFormRuntime).toHaveBeenCalledWith(
      'form-customer-registration',
      {
        customerName: 'Alice',
      }
    )
  })
})
