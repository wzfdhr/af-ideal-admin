import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkflowRuntime } from '@/components/workflow-runtime/use-workflow-runtime'
import type {
  WorkflowDefinitionRecord,
  WorkflowInstanceRecord,
  WorkflowTaskRecord,
} from '@/api/workflow'
import { createInitialWorkflowSchema } from '@/components/workflow-designer/use-workflow-designer'

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

const definition = (): WorkflowDefinitionRecord => ({
  id: 'workflow-leave-approval',
  name: '请假审批',
  schema: createInitialWorkflowSchema(),
  status: 'published',
  version: 1,
  createdAt: '2026-06-22 00:00:00',
  updatedAt: '2026-06-22 00:00:00',
})

const task = (): WorkflowTaskRecord => ({
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
})

const instance = (): WorkflowInstanceRecord => ({
  id: 'instance-1',
  workflowId: 'workflow-leave-approval',
  workflowName: '请假审批',
  formId: 'form-leave',
  businessKey: 'leave-1',
  status: 'running',
  starterId: '1',
  values: {
    days: 2,
  },
  createdAt: '2026-06-22 00:00:00',
  updatedAt: '2026-06-22 00:00:00',
})

describe('useWorkflowRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchWorkflowDefinitions.mockResolvedValue({
      list: [definition()],
      total: 1,
    })
    apiMocks.fetchWorkflowTodos.mockResolvedValue({
      list: [task()],
      total: 1,
    })
    apiMocks.fetchWorkflowDone.mockResolvedValue({
      list: [],
      total: 0,
    })
    apiMocks.fetchWorkflowHistory.mockResolvedValue([])
  })

  it('loads published definitions, todos and done tasks', async () => {
    const runtime = useWorkflowRuntime()

    await runtime.loadInitialData()

    expect(apiMocks.fetchWorkflowDefinitions).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      status: 'published',
    })
    expect(runtime.selectedWorkflowId.value).toBe('workflow-leave-approval')
    expect(runtime.todos.value).toHaveLength(1)
    expect(runtime.doneTasks.value).toHaveLength(0)
  })

  it('starts a workflow instance and loads its history', async () => {
    const runtime = useWorkflowRuntime()
    apiMocks.startWorkflowInstance.mockResolvedValue(instance())
    apiMocks.fetchWorkflowHistory.mockResolvedValue([
      {
        id: 'history-1',
        instanceId: 'instance-1',
        action: 'start',
        operatorId: '1',
        createdAt: '2026-06-22 00:00:00',
      },
    ])

    await runtime.loadInitialData()
    await runtime.startSelectedWorkflow()

    expect(apiMocks.startWorkflowInstance).toHaveBeenCalledWith(
      'workflow-leave-approval',
      {
        businessKey: 'mock-business-001',
        formId: 'form-leave',
        values: {
          days: 2,
          reason: 'Mock 流程发起',
        },
      }
    )
    expect(runtime.currentInstance.value?.id).toBe('instance-1')
    expect(runtime.history.value.map((item) => item.action)).toEqual(['start'])
    expect(runtime.actionMessage.value).toBe('流程已发起')
  })

  it('approves, rejects, transfers and withdraws workflow tasks', async () => {
    const runtime = useWorkflowRuntime()
    const currentTask = task()
    runtime.currentInstance.value = instance()

    apiMocks.approveWorkflowTask.mockResolvedValue({
      ...currentTask,
      status: 'approved',
    })
    apiMocks.rejectWorkflowTask.mockResolvedValue({
      ...currentTask,
      status: 'rejected',
    })
    apiMocks.transferWorkflowTask.mockResolvedValue({
      ...currentTask,
      assignee: '2',
    })
    apiMocks.withdrawWorkflowInstance.mockResolvedValue({
      ...instance(),
      status: 'withdrawn',
    })

    await runtime.approveTask(currentTask)
    expect(apiMocks.approveWorkflowTask).toHaveBeenCalledWith('task-1', {
      comment: '同意',
    })
    expect(runtime.actionMessage.value).toBe('审批通过')

    await runtime.rejectTask(currentTask)
    expect(apiMocks.rejectWorkflowTask).toHaveBeenCalledWith('task-1', {
      comment: '驳回',
    })
    expect(runtime.actionMessage.value).toBe('已驳回')

    await runtime.transferTask(currentTask, '2')
    expect(apiMocks.transferWorkflowTask).toHaveBeenCalledWith('task-1', {
      targetUserId: '2',
      comment: '转交',
    })
    expect(runtime.actionMessage.value).toBe('已转交')

    await runtime.withdrawCurrentInstance()
    expect(apiMocks.withdrawWorkflowInstance).toHaveBeenCalledWith(
      'instance-1',
      {
        comment: '撤回',
      }
    )
    expect(runtime.currentInstance.value?.status).toBe('withdrawn')
    expect(runtime.actionMessage.value).toBe('流程已撤回')
  })
})
