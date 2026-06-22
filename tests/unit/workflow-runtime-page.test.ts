/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import WorkflowRuntime from '@/components/workflow-runtime/index.vue'
import { createInitialWorkflowSchema } from '@/components/workflow-designer/use-workflow-designer'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  approveWorkflowTask: vi.fn(),
  fetchWorkflowDefinitions: vi.fn(),
  fetchWorkflowDone: vi.fn(),
  fetchWorkflowHistory: vi.fn(),
  fetchWorkflowTodos: vi.fn(),
  rejectWorkflowTask: vi.fn(),
  startWorkflowInstance: vi.fn(),
  transferWorkflowTask: vi.fn(),
  withdrawWorkflowInstance: vi.fn(),
}))

vi.mock('@/api/workflow', () => ({
  approveWorkflowTask: apiMocks.approveWorkflowTask,
  fetchWorkflowDefinitions: apiMocks.fetchWorkflowDefinitions,
  fetchWorkflowDone: apiMocks.fetchWorkflowDone,
  fetchWorkflowHistory: apiMocks.fetchWorkflowHistory,
  fetchWorkflowTodos: apiMocks.fetchWorkflowTodos,
  rejectWorkflowTask: apiMocks.rejectWorkflowTask,
  startWorkflowInstance: apiMocks.startWorkflowInstance,
  transferWorkflowTask: apiMocks.transferWorkflowTask,
  withdrawWorkflowInstance: apiMocks.withdrawWorkflowInstance,
}))

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  setup(_, { slots, attrs }) {
    return () => h('button', attrs, slots.default?.())
  },
})

const mountRuntime = () =>
  mount(WorkflowRuntime, {
    global: {
      stubs: {
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
        'a-select': defineComponent({
          name: 'SelectStub',
          props: {
            modelValue: {
              type: String,
              default: '',
            },
          },
          emits: ['update:modelValue'],
          setup(props, { emit, slots, attrs }) {
            return () =>
              h(
                'select',
                {
                  ...attrs,
                  value: props.modelValue,
                  onChange: (event: Event) =>
                    emit(
                      'update:modelValue',
                      (event.target as HTMLSelectElement).value
                    ),
                },
                slots.default?.()
              )
          },
        }),
        'a-option': defineComponent({
          name: 'OptionStub',
          props: {
            value: {
              type: String,
              default: '',
            },
          },
          setup(props, { slots }) {
            return () => h('option', { value: props.value }, slots.default?.())
          },
        }),
        'a-space': {
          template: '<div><slot /></div>',
        },
      },
    },
  })

describe('WorkflowRuntime page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchWorkflowDefinitions.mockResolvedValue({
      list: [
        {
          id: 'workflow-leave-approval',
          name: '请假审批',
          schema: createInitialWorkflowSchema(),
          status: 'published',
          version: 1,
          createdAt: '2026-06-22 00:00:00',
          updatedAt: '2026-06-22 00:00:00',
        },
      ],
      total: 1,
    })
    apiMocks.fetchWorkflowTodos.mockResolvedValue({
      list: [
        {
          id: 'task-1',
          instanceId: 'instance-1',
          workflowId: 'workflow-leave-approval',
          workflowName: '请假审批',
          nodeId: 'approval',
          nodeName: '部门审批',
          assignee: '1',
          status: 'pending',
          businessKey: 'leave-1',
          createdAt: '2026-06-22 00:00:00',
          updatedAt: '2026-06-22 00:00:00',
        },
      ],
      total: 1,
    })
    apiMocks.fetchWorkflowDone.mockResolvedValue({
      list: [],
      total: 0,
    })
    apiMocks.fetchWorkflowHistory.mockResolvedValue([])
  })

  it('loads workflow definitions and renders todos', async () => {
    const wrapper = mountRuntime()
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('请假审批')
    expect(wrapper.text()).toContain('部门审批')
    expect(
      wrapper.find('[data-testid="workflow-runtime-start"]').exists()
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="workflow-runtime-approve"]').exists()
    ).toBe(true)
  })

  it('starts and approves workflow instances from the page', async () => {
    apiMocks.startWorkflowInstance.mockResolvedValue({
      id: 'instance-1',
      workflowId: 'workflow-leave-approval',
      workflowName: '请假审批',
      status: 'running',
      starterId: '1',
      values: {},
      createdAt: '2026-06-22 00:00:00',
      updatedAt: '2026-06-22 00:00:00',
    })
    apiMocks.approveWorkflowTask.mockResolvedValue({
      id: 'task-1',
      status: 'approved',
    })

    const wrapper = mountRuntime()
    await flushPromises()
    await flushPromises()

    await wrapper
      .find('[data-testid="workflow-runtime-start"]')
      .trigger('click')
    expect(apiMocks.startWorkflowInstance).toHaveBeenCalled()

    await wrapper
      .find('[data-testid="workflow-runtime-approve"]')
      .trigger('click')
    expect(apiMocks.approveWorkflowTask).toHaveBeenCalledWith('task-1', {
      comment: '同意',
    })
  })
})
