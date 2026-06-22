import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveWorkflowTask,
  createWorkflowDefinition,
  disableWorkflowDefinition,
  fetchWorkflowDefinitions,
  fetchWorkflowDone,
  fetchWorkflowHistory,
  fetchWorkflowTodos,
  getWorkflowDefinition,
  publishWorkflowDefinition,
  rejectWorkflowTask,
  saveWorkflowDefinition,
  startWorkflowInstance,
  transferWorkflowTask,
  withdrawWorkflowInstance,
} from '@/api/workflow'
import { migrateWorkflowSchema } from '@/components/workflow-designer/schema'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('workflow api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches workflow definitions and details', async () => {
    requestMock.get
      .mockResolvedValueOnce({ data: { list: [], total: 0 } })
      .mockResolvedValueOnce({
        data: {
          id: 'wf-1',
          name: '请假审批',
        },
      })

    await expect(
      fetchWorkflowDefinitions({
        current: 1,
        pageSize: 20,
        keyword: '请假',
      })
    ).resolves.toEqual({ list: [], total: 0 })
    expect(requestMock.get).toHaveBeenCalledWith('/workflows', {
      params: {
        current: 1,
        pageSize: 20,
        keyword: '请假',
      },
    })

    await expect(getWorkflowDefinition('wf-1')).resolves.toEqual({
      id: 'wf-1',
      name: '请假审批',
    })
    expect(requestMock.get).toHaveBeenLastCalledWith('/workflows/wf-1')
  })

  it('creates and saves workflow definitions with versioned schema', async () => {
    const schema = migrateWorkflowSchema({
      nodes: [
        { id: 'start', type: 'start', name: '开始' },
        { id: 'end', type: 'end', name: '结束' },
      ],
      edges: [{ source: 'start', target: 'end' }],
    })
    requestMock.post.mockResolvedValueOnce({
      data: {
        id: 'wf-2',
        status: 'draft',
        schema,
      },
    })
    requestMock.put.mockResolvedValueOnce({
      data: {
        id: 'wf-2',
        status: 'draft',
        schema,
      },
    })

    await expect(
      createWorkflowDefinition({
        name: '新流程',
        schema,
      })
    ).resolves.toEqual({
      id: 'wf-2',
      status: 'draft',
      schema,
    })
    expect(requestMock.post).toHaveBeenCalledWith('/workflows', {
      name: '新流程',
      schema,
    })

    await expect(saveWorkflowDefinition('wf-2', schema)).resolves.toEqual({
      id: 'wf-2',
      status: 'draft',
      schema,
    })
    expect(requestMock.put).toHaveBeenCalledWith('/workflows/wf-2', {
      schema,
    })
  })

  it('validates workflow schema before publishing', async () => {
    await expect(
      publishWorkflowDefinition('wf-1', {
        nodes: [{ id: 'approval', type: 'approval', name: '审批' }],
        edges: [],
      })
    ).rejects.toThrow('非法流程 schema')

    expect(requestMock.post).not.toHaveBeenCalled()
  })

  it('publishes and disables workflow definitions', async () => {
    const schema = migrateWorkflowSchema({
      nodes: [
        { id: 'start', type: 'start', name: '开始' },
        { id: 'end', type: 'end', name: '结束' },
      ],
      edges: [{ source: 'start', target: 'end' }],
    })
    requestMock.post
      .mockResolvedValueOnce({
        data: {
          id: 'wf-1',
          status: 'published',
          version: 3,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'wf-1',
          status: 'disabled',
        },
      })

    await expect(publishWorkflowDefinition('wf-1', schema)).resolves.toEqual({
      id: 'wf-1',
      status: 'published',
      version: 3,
    })
    expect(requestMock.post).toHaveBeenCalledWith('/workflows/wf-1/publish', {
      schema,
    })

    await expect(disableWorkflowDefinition('wf-1')).resolves.toEqual({
      id: 'wf-1',
      status: 'disabled',
    })
    expect(requestMock.post).toHaveBeenLastCalledWith('/workflows/wf-1/disable')
  })

  it('starts and moves workflow instances through task actions', async () => {
    requestMock.post
      .mockResolvedValueOnce({
        data: {
          id: 'inst-1',
          status: 'running',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'task-1',
          status: 'approved',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'task-2',
          status: 'rejected',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'task-3',
          assignee: 'u-2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'inst-1',
          status: 'withdrawn',
        },
      })

    await expect(
      startWorkflowInstance('wf-1', {
        formId: 'form-leave',
        businessKey: 'leave-1',
        values: {
          days: 2,
        },
      })
    ).resolves.toEqual({
      id: 'inst-1',
      status: 'running',
    })
    expect(requestMock.post).toHaveBeenCalledWith('/workflow-instances', {
      workflowId: 'wf-1',
      formId: 'form-leave',
      businessKey: 'leave-1',
      values: {
        days: 2,
      },
    })

    await expect(
      approveWorkflowTask('task-1', { comment: '同意' })
    ).resolves.toEqual({
      id: 'task-1',
      status: 'approved',
    })
    expect(requestMock.post).toHaveBeenLastCalledWith(
      '/workflow-tasks/task-1/approve',
      {
        comment: '同意',
      }
    )

    await expect(
      rejectWorkflowTask('task-2', { comment: '资料不完整' })
    ).resolves.toEqual({
      id: 'task-2',
      status: 'rejected',
    })
    expect(requestMock.post).toHaveBeenLastCalledWith(
      '/workflow-tasks/task-2/reject',
      {
        comment: '资料不完整',
      }
    )

    await expect(
      transferWorkflowTask('task-3', {
        targetUserId: 'u-2',
        comment: '转交',
      })
    ).resolves.toEqual({
      id: 'task-3',
      assignee: 'u-2',
    })
    expect(requestMock.post).toHaveBeenLastCalledWith(
      '/workflow-tasks/task-3/transfer',
      {
        targetUserId: 'u-2',
        comment: '转交',
      }
    )

    await expect(
      withdrawWorkflowInstance('inst-1', { comment: '撤回修改' })
    ).resolves.toEqual({
      id: 'inst-1',
      status: 'withdrawn',
    })
    expect(requestMock.post).toHaveBeenLastCalledWith(
      '/workflow-instances/inst-1/withdraw',
      {
        comment: '撤回修改',
      }
    )
  })

  it('fetches workflow todo, done and history data', async () => {
    requestMock.get
      .mockResolvedValueOnce({ data: { list: [], total: 0 } })
      .mockResolvedValueOnce({ data: { list: [], total: 0 } })
      .mockResolvedValueOnce({ data: [] })

    await expect(
      fetchWorkflowTodos({ current: 1, pageSize: 10 })
    ).resolves.toEqual({
      list: [],
      total: 0,
    })
    expect(requestMock.get).toHaveBeenCalledWith('/workflow-todos', {
      params: {
        current: 1,
        pageSize: 10,
      },
    })

    await expect(
      fetchWorkflowDone({ current: 1, pageSize: 10 })
    ).resolves.toEqual({
      list: [],
      total: 0,
    })
    expect(requestMock.get).toHaveBeenLastCalledWith('/workflow-done', {
      params: {
        current: 1,
        pageSize: 10,
      },
    })

    await expect(fetchWorkflowHistory('inst-1')).resolves.toEqual([])
    expect(requestMock.get).toHaveBeenLastCalledWith(
      '/workflow-instances/inst-1/history'
    )
  })
})
