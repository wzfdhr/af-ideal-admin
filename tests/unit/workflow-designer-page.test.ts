/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import WorkflowDesigner from '@/components/workflow-designer/index.vue'

const apiMocks = vi.hoisted(() => ({
  createWorkflowDefinition: vi.fn(),
  disableWorkflowDefinition: vi.fn(),
  publishWorkflowDefinition: vi.fn(),
  saveWorkflowDefinition: vi.fn(),
}))

vi.mock('@/api/workflow', () => ({
  createWorkflowDefinition: apiMocks.createWorkflowDefinition,
  disableWorkflowDefinition: apiMocks.disableWorkflowDefinition,
  publishWorkflowDefinition: apiMocks.publishWorkflowDefinition,
  saveWorkflowDefinition: apiMocks.saveWorkflowDefinition,
}))

vi.mock('@/components/workflow-designer/workflow-canvas.vue', () => ({
  default: defineComponent({
    name: 'MockWorkflowCanvas',
    props: {
      schema: {
        type: Object,
        required: true,
      },
      selectedNodeId: {
        type: String,
        default: '',
      },
    },
    emits: ['select-node', 'canvas-drop'],
    setup(props, { emit }) {
      return () =>
        h(
          'button',
          {
            'data-testid': 'workflow-canvas',
            'onClick': () => emit('select-node', props.selectedNodeId),
          },
          'canvas'
        )
    },
  }),
}))

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  props: {
    loading: {
      type: Boolean,
      default: false,
    },
  },
  setup(_, { slots, attrs }) {
    return () => h('button', attrs, slots.default?.())
  },
})

const mountDesigner = () =>
  mount(WorkflowDesigner, {
    global: {
      stubs: {
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
        'a-textarea': defineComponent({
          name: 'TextareaStub',
          props: {
            modelValue: {
              type: String,
              default: '',
            },
          },
          emits: ['update:modelValue'],
          setup(props, { emit, attrs }) {
            return () =>
              h('textarea', {
                ...attrs,
                value: props.modelValue,
                onInput: (event: Event) =>
                  emit(
                    'update:modelValue',
                    (event.target as HTMLTextAreaElement).value
                  ),
              })
          },
        }),
      },
    },
  })

describe('WorkflowDesigner page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders node palette, canvas and property panel', async () => {
    const wrapper = mountDesigner()

    expect(wrapper.find('[data-testid="workflow-canvas"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="workflow-palette-approval"]').exists()
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="workflow-property-panel"]').exists()
    ).toBe(true)

    await wrapper
      .find('[data-testid="workflow-palette-approval"]')
      .trigger('click')

    expect(wrapper.text()).toContain('审批')
    expect(wrapper.find('[data-testid="workflow-node-name"]').exists()).toBe(
      true
    )
  })

  it('saves the edited workflow through the API actions', async () => {
    apiMocks.saveWorkflowDefinition.mockResolvedValueOnce({
      id: 'workflow-leave-approval',
    })
    const wrapper = mountDesigner()

    await wrapper
      .find('[data-testid="workflow-palette-approval"]')
      .trigger('click')
    await wrapper
      .find('[data-testid="workflow-node-name"]')
      .setValue('主管审批')
    await wrapper.find('[data-testid="workflow-save"]').trigger('click')

    expect(apiMocks.saveWorkflowDefinition).toHaveBeenCalledWith(
      'workflow-leave-approval',
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            name: '主管审批',
            type: 'approval',
          }),
        ]),
      })
    )
  })
})
