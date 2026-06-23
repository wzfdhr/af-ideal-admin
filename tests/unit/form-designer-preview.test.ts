/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import FormDesigner from '@/components/form-designer/index.vue'

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
    setup(props) {
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
  it('renders preview with the shared runtime renderer', async () => {
    const wrapper = mountDesigner()

    expect(
      wrapper.find('[data-testid="designer-preview-renderer"]').exists()
    ).toBe(false)

    await wrapper.find('[data-testid="form-designer-preview"]').trigger('click')
    await nextTick()

    expect(
      wrapper.find('[data-testid="designer-preview-renderer"]').exists()
    ).toBe(true)
  })
})
